import { useState, useEffect, useMemo } from 'react'
import { resolvePool, resolveScience, resolveFreeElective, POOL_LABELS } from '../lib/poolResolver'
import { checkPrereqs } from '../lib/prereqChecker'
import './Dashboard.css'

export default function SlotModal({
  slot,
  courseMap,
  planSlots,
  slots,
  prereqMap,
  onSave,
  onRemove,
  onClose,
}) {
  const [courses, setCourses]               = useState([])
  const [freeSections, setFreeSections]     = useState(null)
  const [autoFill, setAutoFill]             = useState(null)
  const [scienceNotice, setScienceNotice]   = useState(null)
  const [search, setSearch]                 = useState('')
  const [selected, setSelected]             = useState(null)
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState(null)

  // ── Resolve which courses to show based on slot type ──────────────
  useEffect(() => {
    setSelected(null)
    setAutoFill(null)
    setFreeSections(null)
    setScienceNotice(null)

    // If the slot already has a selection, we'll restore it at the end
    // of each code path so it shows highlighted when the modal opens.
    const existingCode   = planSlots[slot.id]
    const existingCourse = existingCode ? courseMap[existingCode] : null

    if (slot.class_code === 'FREE_ELECTIVE') {
      const result = resolveFreeElective(courseMap, slots, planSlots)
      setFreeSections(result)
      setCourses([...result.suggested, ...result.other])
      if (existingCourse) setSelected(existingCourse)
      return
    }

    if (slot.class_code === 'SCIENCE') {
      // Step 11: resolve based on what OTHER science slots have chosen, not this
      // slot's own current selection. This ensures the modal only shows courses
      // that are compatible with the sequence already started in the other slot.
      const otherPlanSlots = Object.fromEntries(
        Object.entries(planSlots).filter(([id]) => id !== String(slot.id))
      )
      const result = resolveScience(otherPlanSlots, slots, courseMap)

      if (result.mode === 'autofill') {
        setCourses([result.course])
        setAutoFill(result.course)
        // Only keep the existing selection if it matches the required partner.
        // If the existing code is from a different sequence (conflict), default
        // to the autofill partner so the user sees the correct course highlighted.
        setSelected(existingCourse?.code === result.course.code ? existingCourse : result.course)
        return
      }

      if (result.mode === 'narrow') {
        setCourses(result.courses)
        setScienceNotice('Only courses that complete your Biology sequence are shown.')
        // Only keep the existing selection if it's in the narrowed list
        if (existingCourse && result.courses.some(c => c.code === existingCourse.code)) {
          setSelected(existingCourse)
        }
        return
      }

      setCourses(resolvePool('SCIENCE', courseMap) ?? [])
      if (existingCourse) setSelected(existingCourse)
      return
    }

    setCourses(resolvePool(slot.class_code, courseMap) ?? [])
    if (existingCourse) setSelected(existingCourse)
  }, [slot.id])
  // Depend on slot.id only — stable identity per modal open.
  // courseMap, planSlots, slots are all stable objects by the time
  // the modal opens and don't need to be dependencies here.

  // ── Build satisfied and taken sets ────────────────────────────────
  const satisfiedCodes = useMemo(() => {
    const required       = slots.filter(s => !s.is_pool).map(s => s.class_code)
    const poolSelections = Object.values(planSlots)
    return new Set([...required, ...poolSelections])
  }, [slots, planSlots])

  const takenCodes = useMemo(() => {
    // Exclude this slot's own selection — otherwise re-opening a filled slot
    // would show the current course as "Already selected" and unclickable.
    const currentSlotId = String(slot.id)
    return new Set(
      Object.entries(planSlots)
        .filter(([id]) => id !== currentSlotId)
        .map(([, code]) => code)
    )
  }, [planSlots, slot.id])

  // ── Credit hours accumulated before this semester (positional) ───────
  // Used to determine whether junior/senior standing is met at this slot.
  // Only earlier semesters count — not the semester the slot itself lives in.
  const creditsBefore = useMemo(() => {
    return slots
      .filter(s => s.semester_number < slot.semester_number)
      .reduce((sum, s) => {
        if (s.is_pool) {
          const code = planSlots[s.id]
          if (!code) return sum
          return sum + (courseMap[code]?.credits ?? s.flex_credits ?? 3)
        }
        return sum + (courseMap[s.class_code]?.credits ?? 0)
      }, 0)
  }, [slots, planSlots, courseMap, slot.semester_number])

  // ── Annotate courses with availability status ──────────────────────
  function annotate(course) {
    if (takenCodes.has(course.code)) {
      return { ...course, status: 'taken' }
    }
    // Standing check — must come before prereqs so the message is clear
    if (course.standing_req === 'senior' && creditsBefore < 90) {
      return {
        ...course,
        status: 'locked',
        standingHint: `Requires senior standing: 90+ credit hours planned before this semester (${creditsBefore} hrs so far)`,
      }
    }
    if (course.standing_req === 'junior' && creditsBefore < 60) {
      return {
        ...course,
        status: 'locked',
        standingHint: `Requires junior standing: 60+ credit hours planned before this semester (${creditsBefore} hrs so far)`,
      }
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

        {scienceNotice && !autoFill && (
          <div className="modal-autofill-notice">
            {scienceNotice}
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
            {planSlots[slot.id] && (
              <button
                className="modal-remove-btn"
                onClick={() => onRemove(slot)}
                disabled={saving}
              >
                Remove selection
              </button>
            )}
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
            <span className="modal-status-badge locked">
              {course.standingHint ? 'Standing needed' : 'Prereqs needed'}
            </span>
          )}
        </div>
        <span className="modal-course-name">{course.name}</span>
        {course.status === 'locked' && course.standingHint && (
          <span className="modal-prereq-hint">{course.standingHint}</span>
        )}
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