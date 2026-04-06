import { useState, useEffect, useMemo } from 'react'
import { resolvePool, resolveScience, resolveFreeElective } from '../lib/poolResolver'
import { checkPrereqs } from '../lib/prereqChecker'
import './Dashboard.css'

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

export default function SlotModal({
  slot,
  courseMap,
  planSlots,
  slots,
  prereqMap,
  onSave,
  onClose,
}) {
  const [courses, setCourses]               = useState([])
  const [freeSections, setFreeSections]     = useState(null)
  const [autoFill, setAutoFill]             = useState(null)
  const [search, setSearch]                 = useState('')
  const [selected, setSelected]             = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState(null)

  // ── Resolve which courses to show based on slot type ──────────────
  useEffect(() => {
    setSelected(null)
    setAutoFill(null)
    setFreeSections(null)

    if (slot.class_code === 'FREE_ELECTIVE') {
      const result = resolveFreeElective(courseMap, slots, planSlots)
      setFreeSections(result)
      setCourses([...result.suggested, ...result.other])
      return
    }

    if (slot.class_code === 'SCIENCE') {
      const result = resolveScience(planSlots, slots, courseMap)
      if (result.mode === 'autofill') {
        setCourses([result.course])
        setSelected(result.course)
        setAutoFill(result.course)
        return
      }
      if (result.mode === 'narrow') {
        setCourses(result.courses)
        return
      }
      setCourses(resolvePool('SCIENCE', courseMap) ?? [])
      return
    }

    setCourses(resolvePool(slot.class_code, courseMap) ?? [])
  }, [slot.id])
  // Depend on slot.id only — stable identity per modal open.
  // courseMap, planSlots, slots are all stable objects by the time
  // the modal opens and don't need to be dependencies here.

  // ── Build satisfied and taken sets ────────────────────────────────
  const satisfiedCodes = useMemo(() => {
    const required = slots.filter(s => !s.is_pool).map(s => s.class_code)
    const selected  = Object.values(planSlots)
    return new Set([...required, ...selected])
  }, [slots, planSlots])

  const takenCodes = useMemo(() => {
    return new Set(Object.values(planSlots))
  }, [planSlots])

  // ── Annotate courses with availability status ──────────────────────
  function annotate(course) {
    if (takenCodes.has(course.code)) {
      return { ...course, status: 'taken' }
    }
    const result = checkPrereqs(course.code, prereqMap, satisfiedCodes)
    if (!result.satisfied) {
      return { ...course, status: 'locked', missing: result.missing }
    }
    return { ...course, status: 'available' }
  }

  // ── Filter + sort for non-free-elective search ─────────────────────
  const filtered = useMemo(() => {
    if (freeSections && search !== '') {
      const q = search.toLowerCase()
      return [...freeSections.suggested, ...freeSections.other]
        .map(annotate)
        .filter(c =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q)
        )
        .sort((a, b) => {
          const order = { available: 0, locked: 1, taken: 2 }
          return order[a.status] - order[b.status]
        })
    }

    const q = search.toLowerCase()
    return courses
      .map(annotate)
      .filter(c =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const order = { available: 0, locked: 1, taken: 2 }
        return order[a.status] - order[b.status]
      })
  }, [courses, search, takenCodes, prereqMap, satisfiedCodes])

  async function handleSave() {
    if (!selected || selected.status === 'locked' || selected.status === 'taken') return
    setSaving(true)
    setError(null)
    await onSave(slot, selected)
    setSaving(false)
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  // ── Render free elective sections ──────────────────────────────────
  function renderFreeSections() {
    const suggested = freeSections.suggested
      .map(annotate)
      .filter(c => !takenCodes.has(c.code))

    const other = freeSections.other
      .map(annotate)

    return (
      <>
        {suggested.length > 0 && (
          <>
            <p className="modal-section-label">Suggested for you</p>
            {suggested.map(course => (
              <CourseRow
                key={course.code}
                course={course}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
          </>
        )}
        <p className="modal-section-label">All courses</p>
        {other.map(course => (
          <CourseRow
            key={course.code}
            course={course}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </>
    )
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">

        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Select a course</p>
            <h3 className="modal-title">
              {POOL_LABELS[slot.class_code] ?? slot.class_code}
            </h3>
            <p className="modal-sub">Semester {slot.semester_number}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {autoFill && (
          <div className="modal-autofill-notice">
            Partner course auto-selected based on your science sequence choice.
          </div>
        )}

        <div className="modal-search-wrap">
          <input
            className="modal-search"
            type="text"
            placeholder="Search by code or name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus={!autoFill}
          />
        </div>

        <div className="modal-course-list">
          {freeSections && search === '' ? (
            renderFreeSections()
          ) : filtered.length === 0 ? (
            <p className="modal-empty">No courses match your search.</p>
          ) : (
            filtered.map(course => (
              <CourseRow
                key={course.code}
                course={course}
                selected={selected}
                onSelect={setSelected}
              />
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
              disabled={!selected || selected.status === 'locked' || selected.status === 'taken' || saving}
            >
              {saving ? 'Saving...' : 'Select course'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── CourseRow ─────────────────────────────────────────────────────────────────

function CourseRow({ course, selected, onSelect }) {
  return (
    <button
      className={`modal-course-row status-${course.status} ${selected?.code === course.code ? 'selected' : ''}`}
      onClick={() => course.status === 'available' && onSelect(course)}
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
  )
}