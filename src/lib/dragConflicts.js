// dragConflicts.js
//
// The prerequisite / corequisite conflicts a move would create, as human-readable reasons. Used by the plan view's drag
// and drop and by the course panel's "Move to term" list; both hold a conflicting move back and let the student move
// anyway. Pure: everything it needs is passed in.

import { POOL_COURSES, REQUIREMENT_POOLS } from './poolResolver'

/**
 * Checks the moved course against the hypothetical new placement: its prereqs must be in earlier semesters, its coreqs in
 * the same or an earlier one, and no course already placed in or before the new semester may lean on it as a prereq.
 *
 * A requirement-pool slot with no course chosen yet stands in provisionally for a requisite its pool offers (CSC3040 with
 * an empty Communications slot), the way the plan's own warnings treat it; each such slot covers one requirement.
 *
 * @returns {string[]}  reasons, or [] when the move is fine
 */
export function getMoveConflicts({
  slotId, newSemester, slots, planSlots, planArchived, planSemesterOverrides,
  freeAddSlots = [], priorCredits = [], prereqMap = {}, coreqMap = {},
}) {
  const slot = slots.find(s => s.id === slotId)
  if (!slot) return []
  const courseCode = slot.is_pool ? planSlots[slotId] : slot.class_code
  if (!courseCode) return []

  const hypothetical = { ...planSemesterOverrides, [slotId]: newSemester }

  // Every placed course under the hypothetical assignment.
  const placed = []
  for (const s of slots) {
    if (planArchived[s.id]) continue
    const sem  = hypothetical[s.id] ?? s.semester_number
    const code = s.is_pool ? planSlots[s.id] : s.class_code
    if (code && sem != null) placed.push({ slotId: s.id, code, sem })
  }
  for (const fa of freeAddSlots) {
    if (fa.semester_number != null)
      placed.push({ slotId: `fa_${fa.id}`, code: fa.course_code, sem: fa.semester_number })
  }

  const priorCodes = new Set(
    priorCredits.filter(pc => pc.satisfies_course_code).map(pc => pc.satisfies_course_code)
  )

  const pending = []
  for (const s of slots) {
    if (planArchived[s.id] || !s.is_pool || planSlots[s.id] || !REQUIREMENT_POOLS.has(s.class_code)) continue
    const sem = hypothetical[s.id] ?? s.semester_number
    if (sem != null) pending.push({ key: s.id, sem, codes: POOL_COURSES[s.class_code] ?? [] })
  }
  const claimFrom = (candidates, claimed) => codes => {
    const found = candidates.find(p => !claimed.has(p.key) && codes.some(c => p.codes.includes(c)))
    if (!found) return false
    claimed.add(found.key)
    return true
  }
  const claimBefore = claimFrom(pending.filter(p => p.sem < newSemester), new Set())         // prerequisites: an earlier semester
  const claimSameOrBefore = claimFrom(pending.filter(p => p.sem <= newSemester), new Set())  // corequisites: the same or an earlier one

  const reasons = []

  // ── Check 1: prereqs of the moved course ──────────────────────────────
  for (const group of Object.values(prereqMap[courseCode] ?? {})) {
    const satByPrior = group.logic === 'OR'
      ? group.codes.some(c => priorCodes.has(c))
      : group.codes.every(c => priorCodes.has(c))
    if (satByPrior) continue

    const satByPlan = group.logic === 'OR'
      ? group.codes.some(c => placed.some(p => p.code === c && p.sem < newSemester))
      : group.codes.every(c => priorCodes.has(c) || placed.some(p => p.code === c && p.sem < newSemester))

    if (!satByPlan) {
      if (group.logic === 'OR' && claimBefore(group.codes)) continue
      const missing = group.codes
        .filter(c => !priorCodes.has(c))
        .filter(c => !placed.some(p => p.code === c && p.sem < newSemester))
        .filter(c => group.logic === 'OR' || !claimBefore([c]))
      if (missing.length > 0) {
        const label = group.logic === 'OR'
          ? `Requires one of: ${missing.join(', ')} in an earlier semester`
          : `Requires ${missing.join(', ')} in an earlier semester`
        if (!reasons.includes(label)) reasons.push(label)
      }
    }
  }

  // ── Check 2: coreqs of the moved course ───────────────────────────────
  for (const group of Object.values(coreqMap[courseCode] ?? {})) {
    const satByPrior = group.logic === 'OR'
      ? group.codes.some(c => priorCodes.has(c))
      : group.codes.every(c => priorCodes.has(c))
    if (satByPrior) continue

    const satByPlan = group.logic === 'OR'
      ? group.codes.some(c => placed.some(p => p.code === c && p.sem <= newSemester))
      : group.codes.every(c => priorCodes.has(c) || placed.some(p => p.code === c && p.sem <= newSemester))

    if (!satByPlan) {
      if (group.logic === 'OR' && claimSameOrBefore(group.codes)) continue
      const missing = group.codes
        .filter(c => !priorCodes.has(c))
        .filter(c => !placed.some(p => p.code === c && p.sem <= newSemester))
        .filter(c => group.logic === 'OR' || !claimSameOrBefore([c]))
      if (missing.length > 0) {
        const label = group.logic === 'OR'
          ? `Requires one of: ${missing.join(', ')} in the same or earlier semester`
          : `Requires ${missing.join(', ')} in the same or earlier semester`
        if (!reasons.includes(label)) reasons.push(label)
      }
    }
  }

  // ── Check 3: downstream courses that have the moved course as a prereq ─
  // Moving to a later semester: a course placed in or before the new semester may depend on it being earlier.
  for (const p of placed) {
    if (p.slotId === slotId) continue
    for (const group of Object.values(prereqMap[p.code] ?? {})) {
      if (!group.codes.includes(courseCode)) continue
      if (p.sem > newSemester) continue  // placed later: fine
      const otherSat = group.codes
        .filter(c => c !== courseCode)
        .some(c => priorCodes.has(c) || placed.some(p2 => p2.code === c && p2.sem < p.sem))
      if (!otherSat) {
        const label = `Moving here would leave ${p.code} (Semester ${p.sem}) without its prerequisite`
        if (!reasons.includes(label)) reasons.push(label)
      }
    }
  }

  return reasons
}
