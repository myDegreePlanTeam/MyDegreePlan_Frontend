import { useState, useEffect, useMemo } from 'react'
import {
  resolvePool, resolveScience, resolveFreeElective,
  POOL_LABELS, formatMissingForDisplay,
  GEN_ED_CATEGORIES, getGenEdStatus,
} from '../lib/poolResolver'
import { checkPrereqs } from '../lib/prereqChecker'
import { creditsBeforeSemester } from '../lib/transferCredits'
import { getPlanCodes, getRemovedCodes, getRemovedPrereqs } from '../lib/removedPrereqs'
import './Dashboard.css'

export default function SlotModal({
  slot,
  courseMap,
  planSlots,
  slots,
  prereqMap,
  coreqMap,
  priorCredits,
  planSemesterOverrides,
  planArchived = {},
  freeAddSlots = [],
  onSave,
  onRemove,
  onClose,
  // embedded: render inside the course side panel — no backdrop or header,
  // the panel supplies those. Filtering and selection logic is identical.
  embedded = false,
  // hideBack: embedded only — the panel already shows a "← Course details" link
  hideBack = false,
}) {
  const [courses, setCourses]               = useState([])
  const [freeSections, setFreeSections]     = useState(null)
  const [autoFill, setAutoFill]             = useState(null)
  const [scienceNotice, setScienceNotice]   = useState(null)
  const [search, setSearch]                 = useState('')
  const [selected, setSelected]             = useState(null)

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
  // Prereqs are "completed codes in prior semesters only" — strictly < targetSem.
  // Coreqs (same-semester enrollment) are handled inside checkPrereqs via
  // isCoreqForCourse. Prior credits are not added here; checkPrereqs enhances
  // the set internally from the priorCredits argument. Archived and unplaced
  // slots have no semester and are skipped (a null semester would otherwise
  // pass as "earlier" than everything).
  const satisfiedCodes = useMemo(() => {
    const targetSem = planSemesterOverrides?.[slot.id] ?? slot.semester_number
    const codes = new Set()
    for (const s of slots) {
      if (planArchived[s.id]) continue
      const sSem = planSemesterOverrides?.[s.id] ?? s.semester_number
      if (sSem == null || !(sSem < targetSem)) continue
      if (s.is_pool) {
        const code = planSlots[s.id]
        if (code) codes.add(code)
      } else {
        codes.add(s.class_code)
      }
    }
    return codes
  }, [slots, planSlots, planArchived, planSemesterOverrides, slot.id, slot.semester_number])

  const takenCodes = useMemo(() => {
    // Exclude this slot's own selection — otherwise re-opening a filled slot
    // would show the current course as "Already selected" and unclickable.
    // Archived slots aren't in the plan ('not_applicable' math courses keep
    // their class_code in planSlots), so their codes stay selectable.
    const currentSlotId = String(slot.id)
    return new Set(
      Object.entries(planSlots)
        .filter(([id]) => id !== currentSlotId && !planArchived[id])
        .map(([, code]) => code)
    )
  }, [planSlots, planArchived, slot.id])

  // ── Credit hours accumulated before this semester (positional) ───────
  // Used to determine whether junior/senior standing is met at this slot.
  // Same computation as DegreePlan's standing warnings (see
  // creditsBeforeSemester): prior credits first, then active slots and
  // free-adds in strictly earlier semesters, unfilled pools at their
  // expected hours.
  const creditsBefore = useMemo(() => {
    const targetSem = planSemesterOverrides?.[slot.id] ?? slot.semester_number
    return creditsBeforeSemester(targetSem, {
      slots, planSlots, planSemesterOverrides, planArchived,
      priorCredits, courses: courseMap, freeAddSlots,
    })
  }, [slots, planSlots, courseMap, priorCredits, planSemesterOverrides, planArchived, freeAddSlots, slot.id, slot.semester_number])

  // ── Courses in the plan at any position, and courses it removed ─────────
  // Used to flag options whose prereq the student's math placement dropped
  // (PHYS2110 / MATH3470 need MATH1920) — see removedPrereqs.js.
  const planCodes = useMemo(
    () => getPlanCodes({ slots, planSlots, planArchived, freeAddSlots, priorCredits }),
    [slots, planSlots, planArchived, freeAddSlots, priorCredits]
  )
  const removedCodes = useMemo(() => getRemovedCodes(slots, planArchived), [slots, planArchived])

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
    const result = checkPrereqs(
      course.code,
      prereqMap,
      satisfiedCodes,
      priorCredits,
      courseMap,
      coreqMap,
    )
    if (!result.satisfied) {
      const removed = getRemovedPrereqs(course.code, prereqMap, planCodes, removedCodes)
      return {
        ...course,
        status: 'locked',
        missing: result.missing,
        removedNote: removed.length > 0 ? removedPrereqNote(course.code, removed, courseMap) : null,
      }
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
  }, [courses, search, takenCodes, prereqMap, satisfiedCodes, priorCredits, courseMap, coreqMap, planCodes, removedCodes])

  function handleSave() {
    if (!selected || selected.status === 'locked' || selected.status === 'taken') return
    onSave(slot, selected)
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  // ── Render GEN_ED sub-category sections ────────────────────────────
  // BUG-43: surface History / Humanities & Arts / Social Science sub-pools.
  // Satisfied sub-pools are greyed and non-clickable (like "Already selected").
  // Sub-category grouping is preserved during search.
  function renderGenEdSections(annotated) {
    const status = getGenEdStatus(planSlots, slots, courseMap, priorCredits)
    const codeToCategory = {}
    for (const [cat, codes] of Object.entries(GEN_ED_CATEGORIES)) {
      for (const code of codes) codeToCategory[code] = cat
    }

    const grouped = { History: [], Humanities: [], Social: [], Other: [] }
    for (const course of annotated) {
      const cat = codeToCategory[course.code] ?? 'Other'
      grouped[cat].push(course)
    }

    const hasSections = ['History', 'Humanities', 'Social'].some(cat => grouped[cat].length > 0)
    if (!hasSections && grouped.Other.length === 0) {
      return <p className="modal-empty">No courses match your search.</p>
    }

    return (
      <>
        {['History', 'Humanities', 'Social'].map(cat => {
          const list = grouped[cat]
          if (list.length === 0) return null
          const catStatus = status.find(s => s.category === cat)
          const satisfied = catStatus?.satisfied
          const wrapClass = ['modal-gen-ed-section', satisfied ? 'modal-section-satisfied' : ''].filter(Boolean).join(' ')
          return (
            <div key={cat} className={wrapClass}>
              <p className="modal-section-label">
                {catStatus?.label ?? cat}
                {catStatus && (
                  <span className="modal-section-credits">
                    {' · '}{catStatus.filled}/{catStatus.required} hrs
                  </span>
                )}
              </p>
              {list.map(course => (
                <CourseRow
                  key={course.code}
                  course={course}
                  selected={selected}
                  onSelect={setSelected}
                  sectionDisabled={satisfied}
                />
              ))}
            </div>
          )
        })}
        {grouped.Other.length > 0 && (
          <div className="modal-gen-ed-section">
            <p className="modal-section-label">Other</p>
            {grouped.Other.map(course => (
              <CourseRow
                key={course.code}
                course={course}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
          </div>
        )}
      </>
    )
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

  const content = (
    <>
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
          ) : slot.class_code === 'GEN_ED' ? (
            renderGenEdSections(filtered)
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
          <div className="modal-footer-btns">
            {planSlots[slot.id] && (
              <button
                className="modal-remove-btn"
                onClick={() => onRemove(slot)}
              >
                Remove selection
              </button>
            )}
            {!(embedded && hideBack) && (
              <button className="onboarding-btn-secondary" onClick={onClose}>
                {embedded ? 'Back' : 'Cancel'}
              </button>
            )}
            <button
              className="onboarding-btn"
              onClick={handleSave}
              disabled={!selected || selected.status === 'locked' || selected.status === 'taken'}
            >
              Select course
            </button>
          </div>
        </div>

    </>
  )

  if (embedded) return <div className="ds-picker">{content}</div>

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">

        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Select a course</p>
            <h3 className="modal-title">
              {POOL_LABELS[slot.class_code] ?? slot.class_code}
            </h3>
            <p className="modal-sub">Semester {planSemesterOverrides?.[slot.id] ?? slot.semester_number}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {content}
      </div>
    </div>
  )
}

// ── CourseRow ─────────────────────────────────────────────────────────────────

function CourseRow({ course, selected, onSelect, sectionDisabled = false }) {
  return (
    <button
      className={`modal-course-row status-${course.status} ${selected?.code === course.code ? 'selected' : ''}`}
      onClick={() => !sectionDisabled && course.status === 'available' && onSelect(course)}
      disabled={course.status === 'taken' || sectionDisabled}
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
            Needs: {formatMissingForDisplay(course.missing)}
          </span>
        )}
        {course.removedNote && (
          <span className="modal-prereq-hint">{course.removedNote}</span>
        )}
      </div>
      <span className="modal-course-credits">{course.credits} cr</span>
    </button>
  )
}

// "MATH1920 (Calculus II) isn't in your plan — your math placement doesn't
// require it. Add it to an earlier semester to take PHYS2110."
function removedPrereqNote(courseCode, removed, courseMap) {
  const names = removed.map(c => (courseMap[c]?.name ? `${c} (${courseMap[c].name})` : c))
  const [verb, pronoun] = removed.length > 1 ? ["aren't", 'them'] : ["isn't", 'it']
  return `${names.join(' and ')} ${verb} in your plan — your math placement doesn't require ${pronoun}. `
    + `Add ${pronoun} to an earlier semester to take ${courseCode}.`
}