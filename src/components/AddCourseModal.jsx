import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/dataClient'
import { isEnrollmentAllowed, getSeasonRestriction } from '../lib/semesterRestrictions'
import { searchCourses, rowsOfKind } from '../lib/courseSearch'
import { creditRange, formatCredits, isVariableCredit, validateHours } from '../lib/creditHours'
import CourseKindTabs from './CourseKindTabs'
import CreditHoursField from './CreditHoursField'
import './Dashboard.css'

// ── AddCourseModal ─────────────────────────────────────────────────────────────
// Lets the student search the full courses table and add any course to a semester.
// The parent handles the actual insert into student_free_add_slots; this modal
// just surfaces the search and calls onAdd(course, hours) when the student confirms.
//
// The search shows one kind of course at a time (undergraduate by default; graduate
// courses and placeholder codes are their own tabs). A course with a range of credit
// hours asks how many the student will take; hours is undefined for a fixed course.
//
// Props:
//   semesterNumber  — which semester the course will be added to (display only)
//   takenCodes      — Set<string> of course codes already represented in the plan;
//                     matching rows render greyed and unselectable (BUG-34)
//   onAdd(course, hours) — called with the selected course object
//   onClose()       — close without action

export default function AddCourseModal({
  semesterNumber,
  takenCodes = new Set(),
  semesterSeason = null,
  onAdd,
  onClose,
}) {
  const [search, setSearch]     = useState('')
  const [kind, setKind]         = useState('undergraduate')
  const [found, setFound]       = useState({ all: [], counts: null, more: false })
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(null)
  const [hours, setHours]       = useState('')
  const [error, setError]       = useState(null)
  const debounceRef             = useRef(null)

  // ── Query courses table on search change ──────────────────────────
  // Debounce 250 ms so we don't hammer the data layer on every keystroke.
  // ilike on code OR name gives a good combined search experience. One batch covers all
  // three kinds, so switching tabs does not search again.
  useEffect(() => {
    clearTimeout(debounceRef.current)

    if (search.trim() === '') {
      setFound({ all: [], counts: null, more: false })
      setLoading(false)
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const result = await searchCourses(db, search)

      if (result.error) {
        setError('Search failed. Please try again.')
        setLoading(false)
        return
      }

      setFound({ all: result.all, counts: result.counts, more: result.more })
      setLoading(false)
      setError(null)
    }, 250)

    return () => clearTimeout(debounceRef.current)
  }, [search])

  const results = rowsOfKind(found.all, kind)

  function handleSelect(course) {
    if (takenCodes.has(course.code)) return
    if (!isEnrollmentAllowed(course.code, semesterSeason)) return
    if (selected?.code === course.code) {
      setSelected(null)
      return
    }
    setSelected(course)
    setHours(String(creditRange(course).min))
  }

  const variable   = selected ? isVariableCredit(selected) : false
  const hoursError = selected && variable ? validateHours(selected, hours) : null
  const canAdd     = !!selected && !hoursError

  function handleAdd() {
    if (!canAdd) return
    onAdd(selected, variable ? Number(hours) : undefined)
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
          <CourseKindTabs value={kind} onChange={setKind} counts={found.counts} more={found.more} />
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
            <p className="modal-empty">
              No {kind === 'undergraduate' ? 'undergraduate courses' : kind === 'graduate' ? 'graduate courses' : 'placeholder codes'} match your search.
              {found.counts && Object.entries(found.counts).some(([k, n]) => k !== kind && n > 0) && ' Try another tab.'}
            </p>
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
                <span className="modal-course-credits">{formatCredits(course)} cr</span>
              </button>
            )
          })}
        </div>

        <div className="modal-footer">
          {selected && variable && (
            <CreditHoursField course={selected} value={hours} onChange={setHours} idPrefix="add-hours" />
          )}
          <div className="modal-footer-btns">
            <button className="onboarding-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="onboarding-btn"
              onClick={handleAdd}
              disabled={!canAdd}
            >
              Add to Semester {semesterNumber}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
