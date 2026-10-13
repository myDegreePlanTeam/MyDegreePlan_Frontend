// slotOptions.js
//
// What can go in a requirement slot, and whether each course can go there now. The slot picker (SlotModal) and the
// Requirements tab both read it, so the two cannot disagree about an option. Pure: no database, no React.
//
//   resolveSlotCourses(slot, { courseMap, slots, planSlots })
//       -> { courses, freeSections, autoFill, scienceNotice }
//      the courses a slot offers: its pool, narrowed by the science sequence another slot already started, or (a Free
//      Elective and any open pool) the whole catalog's suggestions in `freeSections`.
//
//   buildOptionContext(slot, inputs, followUpHours)  -> ctx
//   annotateOption(course, ctx)                      -> { ...course, status, ...hints }
//      status: 'available' | 'locked' (standing, prerequisite or a pool's hour limit) | 'taken' (already in the plan)
//
//   listSlotOptions(slot, inputs)  -> { open, options, notice }
//      annotated and ordered (available, locked, taken). `open` is true for a slot that takes any course in the catalog,
//      which has no short list to show.
//
// `inputs` is { courseMap, slots, planSlots, planArchived, planSemesterOverrides, priorCredits, freeAddSlots, prereqMap, coreqMap }.

import {
  resolvePool, resolveScience, resolveFreeElective, POOL_COURSES, limitBrokenByPick,
} from './poolResolver.js'
import { checkPrereqs } from './prereqChecker.js'
import { creditsBeforeSemester } from './transferCredits.js'
import { getPlanCodes, getRemovedCodes, getRemovedPrereqs } from './removedPrereqs.js'

const STATUS_ORDER = { available: 0, locked: 1, taken: 2 }

export function resolveSlotCourses(slot, { courseMap, slots, planSlots }) {
  // Free Elective, or any other open pool (pools.json "open"): the whole catalog
  if (slot.class_code === 'FREE_ELECTIVE' || POOL_COURSES[slot.class_code] === null) {
    const freeSections = resolveFreeElective(courseMap, slots, planSlots)
    return { courses: [...freeSections.suggested, ...freeSections.other], freeSections, autoFill: null, scienceNotice: null }
  }

  if (slot.class_code === 'SCIENCE') {
    // Resolve from what the OTHER science slots chose, not this slot's own pick, so a slot only offers the courses that
    // are compatible with the sequence already started elsewhere.
    const otherPlanSlots = Object.fromEntries(
      Object.entries(planSlots).filter(([id]) => id !== String(slot.id)),
    )
    const result = resolveScience(otherPlanSlots, slots, courseMap)
    if (result.mode === 'autofill') {
      return { courses: [result.course], freeSections: null, autoFill: result.course, scienceNotice: null }
    }
    if (result.mode === 'narrow') {
      return { courses: result.courses, freeSections: null, autoFill: null, scienceNotice: 'Only courses that complete your Biology sequence are shown.' }
    }
    return { courses: resolvePool('SCIENCE', courseMap) ?? [], freeSections: null, autoFill: null, scienceNotice: null }
  }

  return { courses: resolvePool(slot.class_code, courseMap) ?? [], freeSections: null, autoFill: null, scienceNotice: null }
}

// "PHYS2110 isn't in your plan: your math placement doesn't require it. Add it to an earlier semester to take PHYS2110."
function removedPrereqNote(courseCode, removed, courseMap) {
  const names = removed.map(c => (courseMap[c]?.name ? `${c} (${courseMap[c].name})` : c))
  const [verb, pronoun] = removed.length > 1 ? ["aren't", 'them'] : ["isn't", 'it']
  return `${names.join(' and ')} ${verb} in your plan — your math placement doesn't require ${pronoun}. `
    + `Add ${pronoun} to an earlier semester to take ${courseCode}.`
}

/**
 * Everything annotateOption needs about the plan around one slot. `followUpHours` > 0 means the slot is being
 * filled again for the hours a Free Elective's earlier pick left open, so its own pick counts as taken.
 */
export function buildOptionContext(slot, inputs, followUpHours = 0) {
  const { courseMap, slots, planSlots, planArchived = {}, planSemesterOverrides, priorCredits, freeAddSlots = [] } = inputs
  const targetSem = planSemesterOverrides?.[slot.id] ?? slot.semester_number

  // Prerequisites read the courses in strictly earlier semesters. Archived and unplaced slots have no semester and are
  // skipped (a null semester would otherwise pass as "earlier" than everything).
  const satisfiedCodes = new Set()
  for (const s of slots) {
    if (planArchived[s.id]) continue
    const sSem = planSemesterOverrides?.[s.id] ?? s.semester_number
    if (sSem == null || !(sSem < targetSem)) continue
    if (s.is_pool) {
      const code = planSlots[s.id]
      if (code) satisfiedCodes.add(code)
    } else {
      satisfiedCodes.add(s.class_code)
    }
  }

  // Exclude this slot's own selection, or re-opening a filled slot would show its course as "Already selected".
  // Archived slots are not in the plan, so their codes stay selectable.
  const currentSlotId = followUpHours > 0 ? null : String(slot.id)
  const takenCodes = new Set(
    Object.entries(planSlots)
      .filter(([id]) => id !== currentSlotId && !planArchived[id])
      .map(([, code]) => code),
  )

  const creditsBefore = creditsBeforeSemester(targetSem, {
    slots, planSlots, planSemesterOverrides, planArchived, priorCredits, courses: courseMap, freeAddSlots,
  })
  const planCodes = getPlanCodes({ slots, planSlots, planArchived, freeAddSlots, priorCredits })
  const removedCodes = getRemovedCodes(slots, planArchived)

  return { slot, inputs, satisfiedCodes, takenCodes, creditsBefore, planCodes, removedCodes }
}

export function annotateOption(course, ctx) {
  const { slot, inputs, satisfiedCodes, takenCodes, creditsBefore, planCodes, removedCodes } = ctx
  const { courseMap, slots, planSlots, planArchived = {}, priorCredits, prereqMap, coreqMap } = inputs

  if (takenCodes.has(course.code)) return { ...course, status: 'taken' }

  // A pool's own limit ("at most 3 hours of these count as Area of Emphasis"): this pick would go over it
  const limitHint = limitBrokenByPick(slot, course, planSlots, slots, courseMap, planArchived)
  if (limitHint) return { ...course, status: 'locked', limitHint }

  // Standing comes before prerequisites so the message is clear
  if (course.standing_req === 'senior' && creditsBefore < 90) {
    return {
      ...course, status: 'locked',
      standingHint: `Requires senior standing: 90+ credit hours planned before this semester (${creditsBefore} hrs so far)`,
    }
  }
  if (course.standing_req === 'junior' && creditsBefore < 60) {
    return {
      ...course, status: 'locked',
      standingHint: `Requires junior standing: 60+ credit hours planned before this semester (${creditsBefore} hrs so far)`,
    }
  }

  const result = checkPrereqs(course.code, prereqMap, satisfiedCodes, priorCredits, courseMap, coreqMap)
  if (!result.satisfied) {
    const removed = getRemovedPrereqs(course.code, prereqMap, planCodes, removedCodes)
    return {
      ...course, status: 'locked', missing: result.missing,
      removedNote: removed.length > 0 ? removedPrereqNote(course.code, removed, courseMap) : null,
    }
  }
  return { ...course, status: 'available' }
}

export function listSlotOptions(slot, inputs) {
  const resolved = resolveSlotCourses(slot, inputs)
  if (resolved.freeSections) return { open: true, options: [], notice: null }
  const ctx = buildOptionContext(slot, inputs)
  const options = resolved.courses
    .map(course => annotateOption(course, ctx))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.code.localeCompare(b.code))
  return { open: false, options, notice: resolved.scienceNotice }
}
