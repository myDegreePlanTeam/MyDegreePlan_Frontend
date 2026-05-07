import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { escapeIlikeValue } from '../lib/postgrestEscape'
import { isEnrollmentAllowed, getSeasonRestriction } from '../lib/semesterRestrictions'
import './Dashboard.css'

// ── AddCourseModal ─────────────────────────────────────────────────────────────
// Lets the student search the full courses table and add any course to a semester.
// The parent handles the actual insert into student_free_add_slots; this modal
// just surfaces the search and calls onAdd(course) when the student confirms.
//
// Props:
//   semesterNumber  — which semester the course will be added to (display only)
//   takenCodes      — Set<string> of course codes already represented in the plan;
//                     matching rows render greyed and unselectable (BUG-34)
//   onAdd(course)   — called with the selected course object
//   onClose()       — close without action

export default function AddCourseModal({
  semesterNumber,
  takenCodes = new Set(),
  semesterSeason = null,
  onAdd,
  onClose,
}) {
  const [search, setSearch]     = useState('')
  const [results, setResults]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [error, setError]       = useState(null)
  const debounceRef             = useRef(null)

  // ── Query courses table on search change ──────────────────────────
  // Debounce 250 ms so we don't hammer Supabase on every keystroke.
  // ilike on code OR name gives a good combined search experience.
  useEffect(() => {
    clearTimeout(debounceRef.current)

    if (search.trim() === '') {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const q = `%${escapeIlikeValue(search.trim())}%`
      const { data, error: fetchErr } = await supabase
        .from('courses')
        .select('code, name, credits, subject_code')
        .or(`code.ilike."${q}",name.ilike."${q}"`)
        .order('code', { ascending: true })
        .limit(40)

      if (fetchErr) {
        setError('Search failed. Please try again.')
        setLoading(false)
        return
      }

      setResults(data ?? [])
      setLoading(false)
      setError(null)
    }, 250)

    return () => clearTimeout(debounceRef.current)
  }, [search])

  function handleSelect(course) {
    if (takenCodes.has(course.code)) return
    if (!isEnrollmentAllowed(course.code, semesterSeason)) return
    setSelected(prev => prev?.code === course.code ? null : course)
  }

  function handleAdd() {
    if (!selected) return
    onAdd(selected)
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">

        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Add course</p>
            <h3 className="modal-title">Semester {semesterNumber}</h3>
            <p className="modal-sub">Search the full course catalog</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-search-wrap">
          <input
            className="modal-search"
            type="text"
            placeholder="Search by code (e.g. MATH1710) or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="modal-course-list">
          {error && (
            <p className="modal-empty" style={{ color: 'var(--danger)' }}>{error}</p>
          )}

          {!error && search.trim() === '' && (
            <p className="modal-empty">
              Type a course code or name to search.
            </p>
          )}

          {!error && search.trim() !== '' && loading && (
            <p className="modal-empty">Searching...</p>
          )}

          {!error && !loading && search.trim() !== '' && results.length === 0 && (
            <p className="modal-empty">No courses match your search.</p>
          )}

          {!error && !loading && results.map(course => {
            const isTaken       = takenCodes.has(course.code)
            const seasonBlocked = !isEnrollmentAllowed(course.code, semesterSeason)
            const restriction   = seasonBlocked ? getSeasonRestriction(course.code) : null
            const isDisabled    = isTaken || seasonBlocked
            return (
              <button
                key={course.code}
                className={`modal-course-row ${isTaken ? 'status-taken' : ''} ${seasonBlocked ? 'season-blocked' : ''} ${selected?.code === course.code ? 'selected' : ''}`}
                onClick={() => handleSelect(course)}
                disabled={isDisabled}
                title={seasonBlocked ? `${restriction}-only — not available in ${semesterSeason}` : undefined}
              >
                <div className="modal-course-info">
                  <div className="modal-course-top">
                    <span className="modal-course-code">{course.code}</span>
                    <span className="add-course-subject">{course.subject_code}</span>
                    {isTaken && (
                      <span className="modal-status-badge taken">Already in plan</span>
                    )}
                    {seasonBlocked && !isTaken && (
                      <span className="modal-status-badge season-blocked-badge">{restriction}-only</span>
                    )}
                  </div>
                  <span className="modal-course-name">{course.name}</span>
                </div>
                <span className="modal-course-credits">{course.credits} cr</span>
              </button>
            )
          })}
        </div>

        <div className="modal-footer">
          <div className="modal-footer-btns">
            <button className="onboarding-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="onboarding-btn"
              onClick={handleAdd}
              disabled={!selected}
            >
              Add to Semester {semesterNumber}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
