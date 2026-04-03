import { useState, useEffect, useMemo } from 'react'
import { resolvePool } from '../lib/poolResolver'
import { checkPrereqs } from '../lib/prereqChecker'
import './Dashboard.css'

export default function SlotModal({
  slot,
  courseMap,
  planSlots,
  slots,
  prereqMap,
  onSave,
  onClose
}) {
  const [courses, setCourses]   = useState([])
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    const resolved = resolvePool(slot.class_code, courseMap)
    setCourses(resolved ?? [])
  }, [slot.class_code, courseMap])

  // ── Build the set of satisfied course codes ─────────────────────
  // This is what we compare prerequisites against.
  // Includes: all required (non-pool) slots + all student selections.
  const satisfiedCodes = useMemo(() => {
    const requiredCodes = slots
      .filter(s => !s.is_pool)
      .map(s => s.class_code)

    const selectedCodes = Object.values(planSlots)

    return new Set([...requiredCodes, ...selectedCodes])
  }, [slots, planSlots])

  // ── Build the set of already-taken course codes ──────────────────
  // Prevents the same course appearing in multiple pool slots.
  const takenCodes = useMemo(() => {
    return new Set(Object.values(planSlots))
  }, [planSlots])

  // ── Annotate each course with its availability status ───────────
  const annotatedCourses = useMemo(() => {
    return courses.map(course => {
      if (takenCodes.has(course.code)) {
        return { ...course, status: 'taken' }
      }
      const prereqResult = checkPrereqs(course.code, prereqMap, satisfiedCodes)
      if (!prereqResult.satisfied) {
        return { ...course, status: 'locked', missing: prereqResult.missing }
      }
      return { ...course, status: 'available' }
    })
  }, [courses, takenCodes, prereqMap, satisfiedCodes])

  // ── Filter by search, then sort: available first, locked second,
  //    taken last — so students see their best options immediately
  const filtered = useMemo(() => {
    const searched = annotatedCourses.filter(c =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase())
    )
    const order = { available: 0, locked: 1, taken: 2 }
    return searched.sort((a, b) => order[a.status] - order[b.status])
  }, [annotatedCourses, search])

  async function handleSave() {
    if (!selected || selected.status !== 'available') return
    setSaving(true)
    setError(null)
    await onSave(slot, selected)
    setSaving(false)
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">

        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Select a course</p>
            <h3 className="modal-title">{POOL_LABELS[slot.class_code] ?? slot.class_code}</h3>
            <p className="modal-sub">Semester {slot.semester_number}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-search-wrap">
          <input
            className="modal-search"
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="modal-course-list">
          {filtered.length === 0 ? (
            <p className="modal-empty">No courses match your search.</p>
          ) : (
            filtered.map(course => (
              <button
                key={course.code}
                className={`modal-course-row status-${course.status} ${selected?.code === course.code ? 'selected' : ''}`}
                onClick={() => course.status === 'available' && setSelected(course)}
                disabled={course.status === 'taken'}
              >
                <div className="modal-course-info">
                  <div className="modal-course-top">
                    <span className="modal-course-code">{course.code}</span>
                    {course.status === 'taken' && (
                      <span className="modal-status-badge taken">Already selected</span>
                    )}
                    {course.status === 'locked' && (
                      <span className="modal-status-badge locked">Prereqs needed</span>
                    )}
                  </div>
                  <span className="modal-course-name">{course.name}</span>
                  {course.status === 'locked' && course.missing && (
                    <span className="modal-prereq-hint">
                      Needs: {course.missing.join(', ')}
                    </span>
                  )}
                </div>
                <span className="modal-course-credits">{course.credits} cr</span>
              </button>
            ))
          )}
        </div>

        <div className="modal-footer">
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-footer-btns">
            <button className="onboarding-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="onboarding-btn"
              onClick={handleSave}
              disabled={!selected || selected.status !== 'available' || saving}
            >
              {saving ? 'Saving...' : 'Select course'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

const POOL_LABELS = {
  GEN_ED:             'General Education',
  ENG_LIT:            'English Literature',
  SCIENCE:            'Natural Science',
  COMM_REQ:           'Communications',
  MATH_STATS:         'Statistics',
  CSC_LOWER_ELECTIVE: 'CSC Lower Elective',
  CSC_UPPER_ELECTIVE: 'CSC Upper Elective',
  CSC_ELECTIVE:       'CSC Elective',
  CSC_HPC_ELECTIVE:   'HPC Elective',
  FREE_ELECTIVE:      'Free Elective',
}