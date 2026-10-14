// @ts-check
// programMerge.js
//
// Merges the requirement slots of a student's primary program with the slots of added programs (a secondary major, a minor) into the one
// list the plan view, the degree builder and the audit already take. Pure: nothing here reads the database, the clock or React.
// Phase 0 of plans/PLAN_double-major-minor.md (decisions D2 to D5): nothing imports this module yet.
//
//   mergePrograms(primary, added, { courses, planSlots, overlapPolicy })
//     -> { slots, programsOf, shadows, shadowOf, freeElective, totalHours }
//
//   primary   { programId, slots, totalHours, genedProgram? }          the program the student is enrolled in
//   added     [{ programId, role: 'major' | 'minor', slots, totalHours?, genedProgram? }]   in the order the student added them
//
//   slots        the merged list the grid sees: every primary slot, plus each added slot that is neither a duplicate nor general
//                education. The slot objects are the stored rows themselves, except a Free Elective bucket that an added program
//                has used up part of, which is a copy with fewer `flex_credits`.
//   programsOf   { [slotId]: programId[] }  every program a visible slot counts toward, owner first
//   shadows      [{ slotId, programId, targetSlotId | null, reason }]  the slots that are not on the grid (an added program's, but for
//                a primary pool or bucket another program's course stands in for).
//                reason 'duplicate'  the same fixed course as a visible slot (D3), or a course that counts for it in a double major
//                                    (src/data/sharedCredit.json: CHEM 4920 Chemistry Seminar for BIOL 3920); targetSlotId is that slot
//                       'gen_ed'     general education, which comes from the primary program only (D4). targetSlotId is the primary's
//                                    pool of the same category that it stands behind; null when the added program follows a different
//                                    general-education program than the primary (legacy against Flight Foundations), so nothing stands behind it
//                       'satisfied'  a pool of one program that a fixed course of another program on the grid satisfies (Mathematics
//                                    B.S. asks for "CSC 1300 or ENGR 1120" and Computer Science has CSC 1300); targetSlotId is that course's slot.
//                                    Only a pool with a list of courses is satisfied this way, one course per pool, and only by another program's course.
//                                    It works both ways: a pool of the primary (or of a program added earlier) that a later program's required course
//                                    satisfies leaves the grid too, while nothing else has been picked for it (Biology's "Health Science Biology
//                                    Directed Electives" and Chemistry's required BIOL 4150 Molecular Genetics; Chemistry's "PHYS 2010 or PHYS 2110"
//                                    and Biology's required PHYS 2010), so one course counts for both and the plan never asks for it twice.
//                       (An hours bucket of the added program, "M hours from this list", that other programs' fixed courses cover only in part is not
//                        a shadow: it stays on the grid with the hours they leave open, as `flex_credits`, and the courses count toward it.)
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

import { POOL_CREDIT_ESTIMATES, POOL_COURSES, BUCKET_POOLS } from './poolResolver.js'
import { FF_POOL_CATEGORIES } from './flightFoundations.js'
import SHARED_CREDIT from '../data/sharedCredit.json'

/** @typedef {{ id: number|string, class_code: string, is_pool: boolean, flex_credits?: number|null, [key: string]: any }} Slot */
/** @typedef {{ programId: number|string, role?: 'major'|'minor', slots: Slot[], totalHours?: number, genedProgram?: string }} ProgramSlots */

export const DEFAULT_OVERLAP_POLICY = Object.freeze({ shareCourses: true })

// The courses that count for each course in a double major besides itself (src/data/sharedCredit.json)
/** @type {Record<string, string[]>} */
const SHARED_WITH = {}
for (const { courses } of SHARED_CREDIT.groups) {
  for (const code of courses) SHARED_WITH[code] = [...(SHARED_WITH[code] ?? []), ...courses.filter(c => c !== code)]
}

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

// The general-education program a slot set follows when its caller did not say (requirement_slots.gened_program), or null for an empty set or a database without the column.
const genedProgramOf = slots => slots.find(s => s.gened_program)?.gened_program ?? null

/**
 * @param {{ programId: number|string, slots: Slot[], totalHours?: number, genedProgram?: string }} primary
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
  // Fixed courses on the grid with the program that owns each, for the pools they satisfy; `spent` is the (course, program) pairs already used
  const fixedCards = []
  const spent = new Set()
  // Hours of a course already given to pools of an added program, by (course, program): a 4-hour course covers two 2-hour rows
  const coveredHours = new Map()
  const addFixed = (slot, owner) => { if (!slot.is_pool) { push(claimableFixed, slot.class_code, slot); fixedCards.push({ slot, owner }) } }
  // Primary pools of each general-education category, in order, that no added program has claimed yet
  const claimableGenEd = new Map()
  for (const s of primary.slots) {
    addFixed(s, primary.programId)
    const key = genEdKey(s)
    if (key) push(claimableGenEd, key, s)
  }

  const primaryGenEd = primary.genedProgram ?? genedProgramOf(primary.slots)
  /** @type {Slot[]} */
  const addedOwn = []   // visible slots owned by an added program: their hours are what the primary's Free Elective hours absorb
  for (const program of added) {
    // A minor's upper-division bucket is processed before its general one, so the courses that can only count there are not used up first
    const inOrder = [...program.slots].sort((a, b) => Number(/_UP$/.test(b.class_code ?? '')) - Number(/_UP$/.test(a.class_code ?? '')))
    for (const slot of inOrder) {
      if (isFreeElective(slot)) {
        shadows.push({ slotId: slot.id, programId: program.programId, targetSlotId: null, reason: 'free_elective' })
        continue
      }
      const key = genEdKey(slot)
      if (key) {
        const addedGenEd = program.genedProgram ?? genedProgramOf(program.slots)
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
        const code = [slot.class_code, ...(SHARED_WITH[slot.class_code] ?? [])].find(c => claimableFixed.get(c)?.length)
        const target = code ? claimableFixed.get(code).shift() : null
        if (target) {
          shadows.push({ slotId: slot.id, programId: program.programId, targetSlotId: target.id, reason: 'duplicate' })
          programsOf[target.id].push(program.programId)
          spent.add(`${target.id}:${program.programId}`)       // the course now counts for this requirement, not also for a bucket
          continue
        }
      }
      if (slot.is_pool && policy.shareCourses && BUCKET_POOLS.has(slot.class_code) && Array.isArray(POOL_COURSES[slot.class_code])) {
        // "M hours from this list": every course of another program on the grid that the list names counts, once, toward the hours
        const members = POOL_COURSES[slot.class_code]
        let open = slot.flex_credits ?? hoursOfSlot(slot, courses)
        const used = []
        for (const card of fixedCards) {
          if (open <= 0) break
          const key = `${card.slot.id}:${program.programId}`
          if (card.owner === program.programId || !members.includes(card.slot.class_code) || spent.has(key) || (coveredHours.get(key) ?? 0) > 0) continue
          spent.add(key)
          used.push(card)
          open -= courses?.[card.slot.class_code]?.credits ?? 3
        }
        for (const card of used) programsOf[card.slot.id].push(program.programId)
        if (used.length && open <= 0) {
          shadows.push({ slotId: slot.id, programId: program.programId, targetSlotId: used[0].slot.id, reason: 'satisfied' })
          continue
        }
        if (used.length) {
          const rest = { ...slot, flex_credits: open }
          visible.push(rest)
          addedOwn.push(rest)
          programsOf[slot.id] = [program.programId]
          continue
        }
      }
      if (slot.is_pool && policy.shareCourses && !BUCKET_POOLS.has(slot.class_code)) {
        const members = POOL_COURSES[slot.class_code]
        // A course covers pool rows up to its own hours (the department's map prints "CSC 1300 or ENGR 1120" as two 2-hour rows, and CSC 1300
        // is 4 hours); the first row it covers may be larger than the course, as a single-course choice always was.
        const need = hoursOfSlot(slot, courses)
        const keyOf = c => `${c.slot.id}:${program.programId}`
        const room = c => {
          const used = coveredHours.get(keyOf(c)) ?? 0
          return used === 0 || used + need <= (courses?.[c.slot.class_code]?.credits ?? 3)
        }
        const card = Array.isArray(members)
          ? fixedCards.find(c => c.owner !== program.programId && members.includes(c.slot.class_code) && !spent.has(keyOf(c)) && room(c))
          : null
        if (card) {
          coveredHours.set(keyOf(card), (coveredHours.get(keyOf(card)) ?? 0) + need)
          shadows.push({ slotId: slot.id, programId: program.programId, targetSlotId: card.slot.id, reason: 'satisfied' })
          if (!programsOf[card.slot.id].includes(program.programId)) programsOf[card.slot.id].push(program.programId)
          continue
        }
      }
      visible.push(slot)
      addedOwn.push(slot)
      programsOf[slot.id] = [program.programId]
      addFixed(slot, program.programId)
    }
  }

  // The other way round: a pool of the primary, or of a program added earlier, that a fixed course of a program added after it satisfies.
  // The loop above only looks back at the courses already on the grid. A pool the student has picked another course for keeps its pick.
  // A primary pool that leaves the grid frees its hours, which the added program's course stood for in `addedOwn`.
  let sharedHours = 0
  for (const pool of policy.shareCourses ? [...visible] : []) {
    if (!pool.is_pool || isFreeElective(pool) || genEdKey(pool) || BUCKET_POOLS.has(pool.class_code)) continue
    const members = POOL_COURSES[pool.class_code]
    if (!Array.isArray(members)) continue
    const owner = programsOf[pool.id][0]
    const pick = planSlots[pool.id]
    const keyOf = c => `${c.slot.id}:${owner}`
    const card = fixedCards.find(c => c.owner !== owner && members.includes(c.slot.class_code) && (!pick || pick === c.slot.class_code)
      && !spent.has(keyOf(c)) && !coveredHours.get(keyOf(c)))
    if (!card) continue
    spent.add(keyOf(card))
    visible.splice(visible.indexOf(pool), 1)
    if (addedOwn.includes(pool)) addedOwn.splice(addedOwn.indexOf(pool), 1)
    else sharedHours += Math.min(hoursOfSlot(pool, courses), courses?.[card.slot.class_code]?.credits ?? 3)
    delete programsOf[pool.id]
    shadows.push({ slotId: pool.id, programId: owner, targetSlotId: card.slot.id, reason: 'satisfied' })
    if (!programsOf[card.slot.id].includes(owner)) programsOf[card.slot.id].push(owner)
  }

  // Free Elective hours (D5): the added programs' own hours are spent from the primary's open bucket hours first
  const primaryBuckets = primary.slots.filter(s => isFreeElective(s))
  const primaryHours = primaryBuckets.reduce((sum, s) => sum + openHours(s, courses, planSlots), 0)
  const addedHours = Math.max(0, addedOwn.reduce((sum, s) => sum + hoursOfSlot(s, courses), 0) - sharedHours)
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

/** The ids of the visible slots a program added to the primary one owns, from `programsOf`: the slots the math placement judges differently. */
export function addedSlotIdsOf(programsOf, primaryProgramId) {
  return Object.entries(programsOf ?? {}).filter(([, ids]) => ids?.[0] != null && String(ids[0]) !== String(primaryProgramId)).map(([id]) => Number(id))
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
