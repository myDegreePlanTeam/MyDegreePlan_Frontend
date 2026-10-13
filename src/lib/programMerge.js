// @ts-check
// programMerge.js
//
// Merges the requirement slots of a student's primary program with the slots of added programs (a second major, a minor) into the one
// list the plan view, the degree builder and the audit already take. Pure: nothing here reads the database, the clock or React.
// Phase 0 of plans/PLAN_double-major-minor.md (decisions D2 to D5): nothing imports this module yet.
//
//   mergePrograms(primary, added, { courses, planSlots, overlapPolicy })
//     -> { slots, programsOf, shadows, shadowOf, freeElective, totalHours }
//
//   primary   { programId, slots, totalHours }                        the program the student is enrolled in
//   added     [{ programId, role: 'major' | 'minor', slots }]         in the order the student added them
//
//   slots        the merged list the grid sees: every primary slot, plus each added slot that is neither a duplicate nor general
//                education. The slot objects are the stored rows themselves, except a Free Elective bucket that an added program
//                has used up part of, which is a copy with fewer `flex_credits`.
//   programsOf   { [slotId]: programId[] }  every program a visible slot counts toward, owner first
//   shadows      [{ slotId, programId, targetSlotId | null, reason }]  the added program's slots that are not on the grid.
//                reason 'duplicate'  the same fixed course as a visible slot (D3); targetSlotId is that slot
//                       'gen_ed'     general education, which comes from the primary program only (D4). targetSlotId is the primary's
//                                    pool of the same category that it stands behind; null when the added program follows a different
//                                    general-education program than the primary (legacy against Flight Foundations), so nothing stands behind it
//                       'free_elective'  the added program's own unrestricted hours, which the primary's bucket stands in for (D5); also
//                                    a primary bucket the added programs' hours used up completely (its programId is the primary's)
//   shadowOf     { [shadowSlotId]: targetSlotId }  the shadows that have a target. A shadow row stays in student_plan_slots, so the
//                row's state (archived, picked course) is the target's: see expandToShadows.
//   freeElective { primaryHours, addedHours, absorbed, extraHours }
//                primaryHours   open Free Elective hours the primary plan has (its buckets minus what is already picked)
//                addedHours     hours of the added programs' own requirements that are not shared with the primary
//                absorbed       min of the two: spent from the primary's Free Elective hours
//                extraHours     the rest: hours the plan grows by
//   totalHours   primary.totalHours + extraHours, and never below the total of an added major (a 128-hour major keeps the plan at 128)
//
// A general-education pool of an added program with no pool of the same category left on the primary's side stays on the grid, owned by
// the added program: the primary does not cover it, and dropping it would silently lose a requirement (Mathematics B.S. asks for English
// Literature and a literacy course that the Computer Science Core plan does not have). When the two programs follow different
// general-education programs the added program's pools are dropped instead: the student follows the primary's.
//
// The policy is data, not code, so a pair of programs a department later restricts is a one-line change:
//   overlapPolicy.shareCourses   true (default)  a fixed course named by two programs is one slot that serves both (D2)
//                                false           nothing is collapsed: every program keeps its own slot for the course
//   Whatever the policy, a pool is never collapsed (it is a choice, and a chosen course already counts once).

import { POOL_CREDIT_ESTIMATES } from './poolResolver.js'
import { FF_POOL_CATEGORIES } from './flightFoundations.js'

/** @typedef {{ id: number|string, class_code: string, is_pool: boolean, flex_credits?: number|null, [key: string]: any }} Slot */
/** @typedef {{ programId: number|string, role?: 'major'|'minor', slots: Slot[], totalHours?: number }} ProgramSlots */

export const DEFAULT_OVERLAP_POLICY = Object.freeze({ shareCourses: true })

// The general-education category a pool slot fills, or null when the pool is a program requirement. Two plans may spell the same
// category differently (a Flight Foundations plan's FF_SCIENCE, a plan's own SCIENCE sequence), and the primary program decides.
const GEN_ED_KEYS = {
  ...FF_POOL_CATEGORIES,        // FF_SOCIAL SOC, FF_HUMANITIES HUM, FF_LITERACY LIT
  FF_SCIENCE: 'SCI',
  SCIENCE:    'SCI',
  FF_QUANT:   'QR',
  COMM_REQ:   'COMM_ORAL',
  GEN_ED:     'GEN_ED',          // the legacy program's own pools
  ENG_LIT:    'ENG_LIT',
}

/** The general-education category a slot fills ('SOC', 'SCI', ...), or null. Only pools have one: a fixed course is collapsed by code. */
export function genEdKey(slot) {
  return slot?.is_pool ? (GEN_ED_KEYS[slot.class_code] ?? null) : null
}

const hoursOfSlot = (slot, courses) => {
  if (slot.flex_credits) return slot.flex_credits
  if (slot.is_pool) return POOL_CREDIT_ESTIMATES[slot.class_code] ?? 3
  return courses?.[slot.class_code]?.credits ?? 3
}

// Hours of a Free Elective bucket nothing has been picked for yet. A bucket with a pick is never shrunk below the pick.
function openHours(slot, courses, planSlots) {
  const flex = slot.flex_credits ?? hoursOfSlot(slot, courses)
  const picked = planSlots?.[slot.id] ? (courses?.[planSlots[slot.id]]?.credits ?? flex) : 0
  return Math.max(0, flex - picked)
}

const isFreeElective = slot => !!slot.is_pool && slot.class_code === 'FREE_ELECTIVE'

// The general-education program (requirement_slots.gened_program) a slot set follows, or null for an empty set or a database without it.
const genedProgramOf = slots => slots.find(s => s.gened_program)?.gened_program ?? null

/**
 * @param {{ programId: number|string, slots: Slot[], totalHours?: number }} primary
 * @param {ProgramSlots[]} [added]
 * @param {{ courses?: object, planSlots?: Record<string, string>, overlapPolicy?: { shareCourses?: boolean } }} [options]
 *   courses    { [code]: { credits } }; the hours of each course
 *   planSlots  { [slotId]: pickedCode }; a Free Elective bucket is never shrunk below the course already picked in it
 */
export function mergePrograms(primary, added = [], { courses = {}, planSlots = {}, overlapPolicy = DEFAULT_OVERLAP_POLICY } = {}) {
  const policy = { ...DEFAULT_OVERLAP_POLICY, ...overlapPolicy }
  const visible = [...primary.slots]
  const programsOf = Object.fromEntries(primary.slots.map(s => [s.id, [primary.programId]]))
  /** @type {Array<{ slotId: any, programId: any, targetSlotId: any, reason: string }>} */
  const shadows = []

  // Fixed courses on the grid that no later program has claimed yet, by code: each may stand in for one duplicate
  const claimableFixed = new Map()
  const push = (map, key, slot) => map.set(key, [...(map.get(key) ?? []), slot])
  const addFixed = slot => { if (!slot.is_pool) push(claimableFixed, slot.class_code, slot) }
  // Primary pools of each general-education category, in order, that no added program has claimed yet
  const claimableGenEd = new Map()
  for (const s of primary.slots) {
    addFixed(s)
    const key = genEdKey(s)
    if (key) push(claimableGenEd, key, s)
  }

  const primaryGenEd = genedProgramOf(primary.slots)
  /** @type {Slot[]} */
  const addedOwn = []   // visible slots owned by an added program: their hours are what the primary's Free Elective hours absorb
  for (const program of added) {
    for (const slot of program.slots) {
      if (isFreeElective(slot)) {
        shadows.push({ slotId: slot.id, programId: program.programId, targetSlotId: null, reason: 'free_elective' })
        continue
      }
      const key = genEdKey(slot)
      if (key) {
        const addedGenEd = genedProgramOf(program.slots)
        const otherProgram = !!primaryGenEd && !!addedGenEd && addedGenEd !== primaryGenEd
        const target = otherProgram ? null : (claimableGenEd.get(key)?.shift() ?? null)
        if (target || otherProgram) {
          shadows.push({ slotId: slot.id, programId: program.programId, targetSlotId: target?.id ?? null, reason: 'gen_ed' })
          if (target) programsOf[target.id].push(program.programId)
          continue
        }
        // nothing of this category left on the primary's side: it stays, owned by the added program (see above)
      }
      if (!slot.is_pool && policy.shareCourses) {
        const target = claimableFixed.get(slot.class_code)?.shift() ?? null
        if (target) {
          shadows.push({ slotId: slot.id, programId: program.programId, targetSlotId: target.id, reason: 'duplicate' })
          programsOf[target.id].push(program.programId)
          continue
        }
      }
      visible.push(slot)
      addedOwn.push(slot)
      programsOf[slot.id] = [program.programId]
      addFixed(slot)
    }
  }

  // Free Elective hours (D5): the added programs' own hours are spent from the primary's open bucket hours first
  const primaryBuckets = primary.slots.filter(s => isFreeElective(s))
  const primaryHours = primaryBuckets.reduce((sum, s) => sum + openHours(s, courses, planSlots), 0)
  const addedHours = addedOwn.reduce((sum, s) => sum + hoursOfSlot(s, courses), 0)
  const absorbed = Math.min(primaryHours, addedHours)
  const extraHours = addedHours - absorbed

  let toSpend = absorbed
  const shrunk = new Map()
  for (const bucket of primaryBuckets) {
    if (toSpend <= 0) break
    const open = openHours(bucket, courses, planSlots)
    const take = Math.min(open, toSpend)
    if (take <= 0) continue
    // A bucket with no hours left leaves the grid (a pool with no flex_credits would read as one 3-hour course). It had no pick: the
    // hours spent never go below an existing pick.
    const left = (bucket.flex_credits ?? hoursOfSlot(bucket, courses)) - take
    shrunk.set(bucket.id, left > 0 ? { ...bucket, flex_credits: left } : null)
    if (left <= 0) shadows.push({ slotId: bucket.id, programId: primary.programId, targetSlotId: null, reason: 'free_elective' })
    toSpend -= take
  }
  const slots = visible.flatMap(s => (shrunk.has(s.id) ? (shrunk.get(s.id) ? [shrunk.get(s.id)] : []) : [s]))

  const shadowOf = Object.fromEntries(shadows.filter(s => s.targetSlotId != null).map(s => [s.slotId, s.targetSlotId]))
  return {
    slots,
    programsOf,
    shadows,
    shadowOf,
    freeElective: { primaryHours, addedHours, absorbed, extraHours },
    totalHours: Math.max((primary.totalHours ?? 0) + extraHours, ...added.filter(p => p.role !== 'minor').map(p => p.totalHours ?? 0)),
  }
}

/**
 * Gives every shadow row the value of the slot it stands behind. `byTarget` is a map keyed by slot id that the pipeline filled for the
 * merged list (planArchived from resolveTransferCredits, planSlots picks, semester overrides); the result also has the shadow ids, so a
 * prior credit that archives the visible card archives the hidden row too, and the row written to student_plan_slots matches.
 * @template T
 * @param {Record<string, T>} byTarget
 * @param {Record<string, string|number>} shadowOf
 * @returns {Record<string, T>}
 */
export function expandToShadows(byTarget, shadowOf) {
  const out = { ...byTarget }
  for (const [shadowId, targetId] of Object.entries(shadowOf)) {
    if (byTarget?.[targetId] !== undefined) out[shadowId] = byTarget[targetId]
  }
  return out
}
