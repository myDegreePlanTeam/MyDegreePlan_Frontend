// pickReliance.js
//
// Which courses in a plan sit before a prerequisite or without a corequisite, and which open picks a later course is leaning on.
// A course's prerequisite is read from its position: the codes placed in strictly earlier semesters (corequisites: the same
// semester too). An unfilled requirement pool in an earlier semester provisionally meets a prerequisite its pool offers (CSC3040
// after an empty Communications pick); `reliance` records which picks were leaned on and by which courses, which is what makes a
// pick "the one to start with".
//
// Pure. The plan view (DegreePlan.jsx) and first run's "Your plan is ready" (lib/firstPlan.js) both call it, so the screen that
// previews a plan and the plan itself name the same pick. Archived and unplaced slots are left out: their semester is null, and
// `null < n` is true, so they would count as placed before everything.

import { POOL_COURSES, POOL_LABELS, isProvidingPool } from './poolResolver.js'
import { checkPrereqs, checkCoreqsProvisional } from './prereqChecker.js'

// -> { placed: [{ key, code, sem }], pending: [{ key, sem, codes }] }
function layOut({ slots, semesterOf, planSlots = {}, freeAddSlots = [] }) {
  const placed  = []
  const pending = []
  for (const slot of slots) {
    const sem  = semesterOf(slot)
    const code = slot.is_pool ? planSlots[slot.id] : slot.class_code
    if (sem == null) continue
    if (code) placed.push({ key: slot.id, code, sem })
    else if (slot.is_pool && isProvidingPool(slot.class_code)) {
      pending.push({ key: slot.id, sem, codes: POOL_COURSES[slot.class_code] ?? [] })
    }
  }
  for (const fa of freeAddSlots) {
    placed.push({ key: `fa_${fa.id}`, code: fa.course_code, sem: fa.semester_number })
  }
  return { placed, pending }
}

/**
 * Prerequisites, by position.
 * @param {object} plan  slots (not archived), semesterOf(slot), planSlots { [slotId]: chosen code }, freeAddSlots, prereqMap, coreqMap,
 *                       priorCredits, courses (the course map checkPrereqs reads standing from)
 * @returns {{ warnings: { [key]: string[] }, reliance: { [slotId]: string[] } }}
 *   warnings  what each course is missing;  reliance  the courses leaning on each open pick
 */
export function prereqStanding({ slots, semesterOf, planSlots, freeAddSlots, prereqMap, coreqMap, priorCredits = [], courses }) {
  const { placed, pending } = layOut({ slots, semesterOf, planSlots, freeAddSlots })
  const warnings = {}
  const reliance = {}
  for (const item of placed) {
    const completedCodes = new Set(placed.filter(p => p.sem < item.sem).map(p => p.code))
    const pendingPools = pending.filter(p => p.sem < item.sem)
    const result = checkPrereqs(item.code, prereqMap, completedCodes, priorCredits, courses, coreqMap, pendingPools)
    if (!result.satisfied) warnings[item.key] = result.missing
    for (const key of result.relyingOn ?? []) (reliance[key] ??= []).push(item.code)
  }
  return { warnings, reliance }
}

/**
 * Corequisites, by position: the same semester counts, and so does a prior credit.
 * @returns {{ warnings: { [key]: string[] }, reliance: { [slotId]: string[] } }}
 */
export function coreqStanding({ slots, semesterOf, planSlots, freeAddSlots, coreqMap, priorCredits = [] }) {
  const { placed, pending } = layOut({ slots, semesterOf, planSlots, freeAddSlots })
  const priorCodes = priorCredits.filter(pc => pc.satisfies_course_code).map(pc => pc.satisfies_course_code)
  const warnings = {}
  const reliance = {}
  for (const item of placed) {
    const completedCodes = new Set([...placed.filter(p => p.sem < item.sem).map(p => p.code), ...priorCodes])
    const availableCodes = new Set([
      ...completedCodes,
      ...placed.filter(p => p.sem === item.sem && p.code !== item.code).map(p => p.code),
    ])
    const result = checkCoreqsProvisional(item.code, coreqMap, availableCodes, pending.filter(p => p.sem <= item.sem))
    if (!result.satisfied) warnings[item.key] = result.missing
    for (const key of result.relyingOn ?? []) (reliance[key] ??= []).push(item.code)
  }
  return { warnings, reliance }
}

/**
 * The open pick to start with: the earliest one a later course leans on, or null when none does.
 * @returns {{ slotId, label: string, dependents: string[], semester: number }|null}
 */
export function firstDependentPick(plan) {
  const prereq = prereqStanding(plan).reliance
  const coreq  = coreqStanding(plan).reliance
  let first = null
  for (const slot of plan.slots) {
    const semester = plan.semesterOf(slot)
    if (semester == null || !slot.is_pool || plan.planSlots?.[slot.id]) continue
    const dependents = [...new Set([...(prereq[slot.id] ?? []), ...(coreq[slot.id] ?? [])])]
    if (dependents.length === 0) continue
    if (!first || semester < first.semester) {
      first = { slotId: slot.id, label: POOL_LABELS[slot.class_code] ?? slot.class_code, dependents, semester }
    }
  }
  return first
}
