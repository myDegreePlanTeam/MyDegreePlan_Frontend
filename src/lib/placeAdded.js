// placeAdded.js
//
// Where the slots of a newly added program go, around a plan that already has positions. Pure.
//
//   placeAddedSlots({ unplaced, floors, placed, slots, courseMap, prereqMap, coreqMap, priorCredits, planSlots, startSeason, maxHours })
//     -> { [slotId]: semesterNumber }
//
// Adding a second major or a minor must leave the student's saved positions alone (PLAN_double-major-minor.md, Phase 2), so the degree
// builder cannot place the whole merged list again: it would move the primary's courses too. It still decides the order and the earliest
// semester of each new slot (`floors`, from buildDegreePlan on the merged list, which is aware of the prerequisite chains); this takes each
// new slot, in that order, to the first semester at or after its floor that
//   - has room for it (`maxHours`, the degree builder's own maximum, counting what is already placed there),
//   - is a term its course is offered in (isEnrollmentAllowed),
//   - comes after its prerequisites, and no earlier than its corequisites, among the courses placed so far. Only a prerequisite the plan
//     has in a LATER semester holds a slot back; one that is not in the plan at all, or is a new slot still waiting its turn, is not this
//     module's to judge, as in the degree builder.
// A slot that cannot be placed within 30 semesters of its floor goes at its floor: the plan's own warnings say what is wrong.

import { POOL_CREDIT_ESTIMATES } from './poolResolver.js'
import { checkPrereqs, checkCoreqs } from './prereqChecker.js'
import { isEnrollmentAllowed } from './semesterRestrictions.js'
import { computeSemesterTerms } from './semesterTerms.js'

const DEFAULT_MAX_HOURS = 18
const SEARCH_LIMIT = 30

function hoursOf(slot, courseMap) {
  if (slot.flex_credits) return slot.flex_credits
  if (slot.is_pool) return POOL_CREDIT_ESTIMATES[slot.class_code] ?? 3
  return courseMap?.[slot.class_code]?.credits ?? 3
}

// The course a slot stands for now: its fixed course, or the course picked for a pool, else null.
const codeOf = (slot, planSlots) => (slot.is_pool ? (planSlots?.[slot.id] ?? null) : slot.class_code)

export function placeAddedSlots({
  unplaced = [], floors = {}, placed = {}, slots = [], courseMap = {}, prereqMap = {}, coreqMap = {}, priorCredits = [], planSlots = {},
  startSeason = 'Fall', maxHours = DEFAULT_MAX_HOURS,
}) {
  const slotById = new Map(slots.map(s => [s.id, s]))
  const load = {}
  const codesIn = {}
  const semOfCode = new Map()
  const place = (slot, sem) => {
    load[sem] = (load[sem] ?? 0) + hoursOf(slot, courseMap)
    const code = codeOf(slot, planSlots)
    if (code) { (codesIn[sem] ??= new Set()).add(code); semOfCode.set(code, sem) }
  }
  for (const [slotId, sem] of Object.entries(placed)) {
    const slot = slotById.get(Number(slotId)) ?? slotById.get(slotId)
    if (slot) place(slot, Number(sem))
  }

  // A missing entry is a course code or "(A or B)". It holds a slot at `sem` back when the plan has one of its courses at `sem` or later.
  const holdsBack = (entries, sem) => (entries ?? []).some(entry => {
    const codes = /^\((.+)\)$/.exec(entry)?.[1].split(' or ').map(c => c.trim()) ?? [entry]
    return codes.some(c => semOfCode.has(c) && semOfCode.get(c) >= sem)
  })

  const order = unplaced.map((slot, index) => ({ slot, index }))
    .sort((a, b) => (floors[a.slot.id] ?? 1) - (floors[b.slot.id] ?? 1) || a.index - b.index)

  const lastSem = Math.max(0, ...Object.values(floors), ...Object.values(placed).map(Number))
  const seasonOf = computeSemesterTerms(startSeason, 2000, Array.from({ length: lastSem + SEARCH_LIMIT + 2 }, (_, i) => i + 1))

  const result = {}
  for (const { slot } of order) {
    const floor = Math.max(1, floors[slot.id] ?? 1)
    const code = codeOf(slot, planSlots)
    const hours = hoursOf(slot, courseMap)
    let chosen = null
    for (let sem = floor; sem <= floor + SEARCH_LIMIT && chosen == null; sem++) {
      if ((load[sem] ?? 0) + hours > maxHours) continue
      if (code) {
        if (!isEnrollmentAllowed(code, seasonOf[sem]?.season)) continue
        const earlier = new Set()
        for (const [s, codes] of Object.entries(codesIn)) if (Number(s) < sem) for (const c of codes) earlier.add(c)
        const prereq = checkPrereqs(code, prereqMap, earlier, priorCredits, courseMap, coreqMap)
        if (!prereq.satisfied && holdsBack(prereq.missing, sem)) continue
        const available = new Set([...earlier, ...(codesIn[sem] ?? [])])
        const coreq = checkCoreqs(code, coreqMap, available)
        if (!coreq.satisfied && holdsBack(coreq.missing, sem + 1)) continue
      }
      chosen = sem
    }
    const sem = chosen ?? floor
    result[slot.id] = sem
    place(slot, sem)
  }
  return result
}
