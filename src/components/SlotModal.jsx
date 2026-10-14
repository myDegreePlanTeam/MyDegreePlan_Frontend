import { useState, useEffect, useMemo } from 'react'
import {
  excludeFreeElectiveCodes,
  POOL_LABELS, POOL_COURSES, POOL_NOTES, formatMissingForDisplay,
  GEN_ED_CATEGORIES, getGenEdStatus,
} from '../lib/poolResolver'
import { spaceCourseCodes } from '../lib/courseCodeFormat'
import { getFlightFoundationsStatus, FF_POOL_CATEGORIES } from '../lib/flightFoundations'
import { resolveSlotCourses, buildOptionContext, annotateOption } from '../lib/slotOptions'
import { getPlanCodes } from '../lib/removedPrereqs'
import { formatCredits, isVariableCredit, validateHours } from '../lib/creditHours'
import CreditHoursField from './CreditHoursField'
import './Dashboard.css'
import Dialog, { DialogHead } from './Dialog'
import { formatCourseCode } from '../lib/courseCodeFormat'

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
  // followUpHours: choosing another course for the hours a Free Elective's
  // earlier pick left open. The slot's own pick is then just another taken
  // course, not the selection being edited.
  followUpHours = 0,
}) {
  const [courses, setCourses]               = useState([])
  const [freeSections, setFreeSections]     = useState(null)
  const [autoFill, setAutoFill]             = useState(null)
  const [scienceNotice, setScienceNotice]   = useState(null)
  const [search, setSearch]                 = useState('')
  const [selected, setSelected]             = useState(null)
  // hours: credit hours for a selected course that carries a range; starts at the student's earlier
  // choice (the course map already has it applied) or the minimum
  const [hours, setHours]                   = useState('')

  // ── Resolve which courses to show based on slot type ──────────────
  useEffect(() => {
    setSelected(null)
    setAutoFill(null)
    setFreeSections(null)
    setScienceNotice(null)

    // If the slot already has a selection, we'll restore it at the end
    // of each code path so it shows highlighted when the modal opens.
    const existingCode   = followUpHours > 0 ? null : planSlots[slot.id]
    const existingCourse = existingCode ? courseMap[existingCode] : null

    // What the slot offers (lib/slotOptions.js: the same list the Requirements tab shows)
    const resolved = resolveSlotCourses(slot, { courseMap, slots, planSlots })
    setCourses(resolved.courses)
    setFreeSections(resolved.freeSections)
    setAutoFill(resolved.autoFill)
    setScienceNotice(resolved.scienceNotice)
    if (resolved.autoFill) {
      // Only keep the existing selection if it matches the required partner.
      // If the existing code is from a different sequence (conflict), default
      // to the autofill partner so the user sees the correct course highlighted.
      setSelected(existingCourse?.code === resolved.autoFill.code ? existingCourse : resolved.autoFill)
    } else if (resolved.scienceNotice) {
      // Narrowed to the sequence's partners: keep the existing selection only if it is still in the list.
      if (existingCourse && resolved.courses.some(c => c.code === existingCourse.code)) setSelected(existingCourse)
    } else if (existingCourse) {
      setSelected(existingCourse)
    }
    // Depend on slot.id only — stable identity per modal open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.id])
  // courseMap, planSlots, slots are all stable objects by the time
  // the modal opens and don't need to be dependencies here.

  // ── What is around this slot: courses before it, courses already taken, standing (lib/slotOptions.js) ──
  const optionCtx = useMemo(
    () => buildOptionContext(slot, {
      courseMap, slots, planSlots, planArchived, planSemesterOverrides, priorCredits, freeAddSlots, prereqMap, coreqMap,
    }, followUpHours),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, planSlots, courseMap, priorCredits, planSemesterOverrides, planArchived, freeAddSlots, prereqMap, coreqMap, slot.id, slot.semester_number, followUpHours],
  )

  // ── Courses in the plan at any position, and courses it removed ─────────
  // Used to flag options whose prereq the student's math placement dropped
  // (PHYS2110 / MATH3470 need MATH1920) — see removedPrereqs.js.
  const planCodes = useMemo(
    () => getPlanCodes({ slots, planSlots, planArchived, freeAddSlots, priorCredits }),
    [slots, planSlots, planArchived, freeAddSlots, priorCredits]
  )

  // ── Free elective options: hide anything already in the plan ────────────
  // The slot's own current pick stays so re-opening a filled slot shows it.
  const freeOptions = useMemo(() => {
    if (!freeSections) return null
    const inPlan = new Set(planCodes)
    if (followUpHours === 0) inPlan.delete(planSlots[slot.id])
    return excludeFreeElectiveCodes(freeSections, inPlan)
  }, [freeSections, planCodes, planSlots, slot.id, followUpHours])

  // ── Annotate courses with availability status ──────────────────────
  const annotate = course => annotateOption(course, optionCtx)

  // ── Filter + sort for non-free-elective search ─────────────────────
  const filtered = useMemo(() => {
    if (freeOptions && search !== '') {
      const q = search.toLowerCase()
      return [...freeOptions.suggested, ...freeOptions.other]
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
    // `annotate` is rebuilt every render from the inputs listed here (and `creditsBefore`, fixed while the modal is open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses, freeOptions, search, optionCtx])

  useEffect(() => {
    if (selected) setHours(String(selected.credits))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.code])

  const hoursVariable = selected ? isVariableCredit(selected) : false
  const hoursInvalid  = hoursVariable && validateHours(selected, hours) !== null

  function handleSave() {
    if (!selected || selected.status === 'locked' || selected.status === 'taken' || hoursInvalid) return
    onSave(slot, selected, hoursVariable ? Number(hours) : null)
  }

  // ── Flight Foundations category progress ───────────────────────────
  // FF pool slots each fill one category; show where that category stands
  // (e.g. "Humanities & Cultural Expression · 3/6–9 hrs").
  const ffCategory = useMemo(() => {
    const code = FF_POOL_CATEGORIES[slot.class_code]
    if (!code) return null
    const status = getFlightFoundationsStatus(
      planSlots, priorCredits, slots, courseMap, freeAddSlots, planArchived,
    )
    return status.categories.find(c => c.category === code) ?? null
  }, [slot.class_code, planSlots, priorCredits, slots, courseMap, freeAddSlots, planArchived])

  // ── Render GEN_ED sub-category sections ────────────────────────────
  // BUG-43: surface History / Humanities & Arts / Social Science sub-pools.
  // Satisfied sub-pools are greyed and non-clickable (like "Already selected").
  // Sub-category grouping is preserved during search.
  function renderGenEdSections(annotated) {
    const status = getGenEdStatus(planSlots, slots, courseMap, priorCredits, planArchived)
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
                    {' · '}{catStatus.filled} of {catStatus.required} hours
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
    const suggested = freeOptions.suggested.map(annotate)
    const other     = freeOptions.other.map(annotate)

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
        {followUpHours > 0 && (
          <div className="modal-autofill-notice">
            {followUpHours} credit {followUpHours === 1 ? 'hour' : 'hours'} of your {POOL_LABELS[slot.class_code] ?? slot.class_code} requirement
            {followUpHours === 1 ? ' is' : ' are'} still open. Choose another course to fill them.
          </div>
        )}

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

        {POOL_NOTES[slot.class_code] && (
          <div className="modal-autofill-notice">
            {POOL_NOTES[slot.class_code]}
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
          {ffCategory && (
            <p className="modal-section-label">
              {ffCategory.label}
              <span className="modal-section-credits">
                {' · '}{ffCategory.filled}/{ffCategory.required}
                {ffCategory.max > ffCategory.required ? `–${ffCategory.max}` : ''} hours
              </span>
            </p>
          )}
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
          {selected && hoursVariable && (
            <CreditHoursField course={selected} value={hours} onChange={setHours} idPrefix="slot-hours" />
          )}
          <div className="modal-footer-btns">
            {planSlots[slot.id] && followUpHours === 0 && (
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
              disabled={!selected || selected.status === 'locked' || selected.status === 'taken' || hoursInvalid}
            >
              Select course
            </button>
          </div>
        </div>

    </>
  )

  if (embedded) return <div className="ds-picker">{content}</div>

  return (
    <Dialog labelledBy="slot-modal-title" onClose={onClose} className="ds-modal-picker">
        <DialogHead
          id="slot-modal-title" onClose={onClose}
          kicker={`Semester ${planSemesterOverrides?.[slot.id] ?? slot.semester_number}`}
          title={POOL_LABELS[slot.class_code] ?? slot.class_code}
        >
          Pick a course.
        </DialogHead>
        {content}
    </Dialog>
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
          <span className="modal-course-code">{formatCourseCode(course.code)}</span>
          {course.status === 'taken' && (
            <span className="modal-status-badge taken">Already selected</span>
          )}
          {course.status === 'locked' && (
            <span className="modal-status-badge locked">
              {course.limitHint ? 'Limit reached' : course.standingHint ? 'Standing needed' : 'Prereqs needed'}
            </span>
          )}
        </div>
        <span className="modal-course-name">{course.name}</span>
        {course.status === 'locked' && course.limitHint && (
          <span className="modal-prereq-hint">{course.limitHint}</span>
        )}
        {course.status === 'locked' && course.standingHint && (
          <span className="modal-prereq-hint">{course.standingHint}</span>
        )}
        {course.status === 'locked' && course.missing && (
          <span className="modal-prereq-hint">
            Needs: {spaceCourseCodes(formatMissingForDisplay(course.missing))}
          </span>
        )}
        {course.removedNote && (
          <span className="modal-prereq-hint">{course.removedNote}</span>
        )}
      </div>
      <span className="modal-course-credits">{formatCredits(course)} hours</span>
    </button>
  )
}
