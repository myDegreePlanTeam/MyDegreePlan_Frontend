// degreeBuilder.js — Degree-plan placement algorithm
//
// Given a student's profile and the full requirement_slots for their
// concentration, assigns every active slot to a semester number and archives
// slots that don't apply to the student (e.g., math chain courses above their
// ACT placement level, or courses covered by prior credits).
//
// The algorithm is pure: it takes JS objects and returns an assignment map.
// All Supabase I/O is done by the caller (Onboarding.jsx / ProfileSettings.jsx).
//
// Exported:
//   buildDegreePlan(opts) → { assignments, archived }
//
//   assignments : { [slotId]: semesterNumber }  — position_source = 'algorithm'
//   archived    : { [slotId]: archiveReason }   — 'not_applicable' | 'prior_credit'

import { resolveTransferCredits } from './transferCredits'
import { resolveActMathPlacement } from './actScoreResolver'

// ─── Math chain data ──────────────────────────────────────────────────────────

const MATH_CHAINS_NEW = {
  MATH1000: ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH2010'],
  MATH1710: ['MATH1710', 'MATH1720', 'MATH1910', 'MATH2010'],
  MATH1730: ['MATH1730', 'MATH1910', 'MATH2010'],
  MATH1904: ['MATH1904', 'MATH1906', 'MATH2010'],
  MATH1910: ['MATH1910', 'MATH2010'],
}

const MATH_CHAINS_RETURNING = {
  MATH1000: ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2010'],
  MATH1710: ['MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2010'],
  MATH1730: ['MATH1730', 'MATH1910', 'MATH1920', 'MATH2010'],
  MATH1904: ['MATH1904', 'MATH1906', 'MATH2010'],
  MATH1910: ['MATH1910', 'MATH1920', 'MATH2010'],
}

const ALL_MATH_CHAIN_CODES = new Set([
  'MATH1000', 'MATH1710', 'MATH1720', 'MATH1730',
  'MATH1904', 'MATH1906', 'MATH1910', 'MATH1920', 'MATH2010',
])

// ─── Credit estimates for pool slots ─────────────────────────────────────────
// Used when the student hasn't filled the pool yet. The algorithm needs a
// credit-hour estimate to balance semesters.

const POOL_CREDIT_ESTIMATES = {
  GEN_ED:              3,
  ENG_LIT:             3,
  SCIENCE:             4,
  COMM_REQ:            3,
  MATH_STATS:          3,
  CSC_LOWER_ELECTIVE:  3,
  CSC_UPPER_ELECTIVE:  3,
  CSC_ELECTIVE:        3,
  CSC_HPC_ELECTIVE:    3,
  FREE_ELECTIVE:       3,
}

// ─── Semester credit targets ──────────────────────────────────────────────────

const CREDIT_TARGET = 15   // aim for this per semester
const CREDIT_MAX    = 18   // never exceed this
const SUMMER_TARGET = 6    // lighter load for summer semesters
const SUMMER_MAX    = 9
const SEMESTER_CAP  = 20   // standing checks never push a course past this

// ─── Standing requirement thresholds ─────────────────────────────────────────

const STANDING_THRESHOLDS = { junior: 60, senior: 90 }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStudentMathChain(actMath, studentType) {
  const placement = resolveActMathPlacement(actMath)
  const startCode = placement?.satisfies_course_code ?? 'MATH1910'
  const chains = studentType === 'returning' ? MATH_CHAINS_RETURNING : MATH_CHAINS_NEW
  return new Set(chains[startCode] ?? ['MATH1910', 'MATH2010'])
}

function slotCredits(slot, courseMap) {
  if (slot.flex_credits) return slot.flex_credits
  if (slot.is_pool)      return POOL_CREDIT_ESTIMATES[slot.class_code] ?? 3
  return courseMap[slot.class_code]?.credits ?? 3
}

// Returns true if groupSatisfied: all prereqs in an AND group, or any prereq
// in an OR group, are present in satisfiedCodes.
function groupSatisfied(group, satisfiedCodes) {
  if (group.logic === 'OR') {
    return group.codes.some(c => satisfiedCodes.has(c))
  }
  return group.codes.every(c => satisfiedCodes.has(c))
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * buildDegreePlan — assign semester numbers to all requirement slots.
 *
 * @param {object} opts
 * @param {Array}  opts.slots       — all requirement_slots for the concentration
 * @param {object} opts.courseMap   — { [code]: { credits, standing_req, ... } }
 * @param {object} opts.prereqMap   — { [code]: { [groupIndex]: { logic, codes } } }
 * @param {object} opts.coreqMap    — same shape as prereqMap
 * @param {Array}  opts.priorCredits — student's prior_credits rows
 * @param {object} opts.studentProfile — { student_type, act_math, start_season }
 *
 * @returns {{ assignments: object, archived: object }}
 *   assignments: { [slotId]: semesterNumber }
 *   archived:    { [slotId]: 'not_applicable' | 'prior_credit' }
 */
export function buildDegreePlan({ slots, courseMap, prereqMap, coreqMap, priorCredits, studentProfile }) {
  const { student_type, act_math, start_season } = studentProfile

  // ── Step 1: Archive slots covered by prior credits ──────────────────────
  // resolveTransferCredits returns { [slotId]: true } for covered slots.
  const priorCreditCovered = resolveTransferCredits(priorCredits, {}, slots)

  // ── Step 2: Archive inapplicable math chain courses ─────────────────────
  const studentChain = getStudentMathChain(act_math, student_type)
  const mathArchived = {}
  for (const slot of slots) {
    if (ALL_MATH_CHAIN_CODES.has(slot.class_code) && !studentChain.has(slot.class_code)) {
      mathArchived[slot.id] = 'not_applicable'
    }
  }

  // ── Step 3: Merge archived sets ─────────────────────────────────────────
  const archived = { ...mathArchived }
  for (const slotId of Object.keys(priorCreditCovered)) {
    archived[slotId] = 'prior_credit'
  }

  // ── Step 4: Active (non-archived) slots for placement ───────────────────
  const activeSlots = slots.filter(s => !archived[s.id])

  // ── Step 5: Build prior-satisfied set ───────────────────────────────────
  // Codes whose requirement is already met before semester 1.
  // Only credit-bearing entries count — act_placement rows (credits_awarded=0)
  // gate access but don't satisfy the course as a completed prerequisite.
  const priorSatisfied = new Set()
  for (const pc of priorCredits) {
    if (pc.satisfies_course_code && (pc.credits_awarded ?? 0) > 0) {
      priorSatisfied.add(pc.satisfies_course_code)
    }
  }

  // ── Step 6: Compute minimum semester for each slot ──────────────────────
  // Propagate prereq constraints: slot X must be placed in a semester
  // strictly after all its non-pool prerequisites.  Pool slots default to
  // minSem=1 (they carry no prereqs at the algorithm level).
  //
  // Also enforce coreqs: slot X can be no earlier than each coreq's minSem
  // (can be concurrent, so no +1 here).
  //
  // Fix (Bug 3): when a code appears in both a prereq group AND a coreq group
  // for the same course, it means the course can be taken concurrently (the
  // coreq annotation overrides the prereq +1).  Skip such codes in prereq
  // propagation so the coreq pass sets the correct same-semester timing.
  //
  // We iterate to fixed-point (DAG constraint propagation).

  // Map course code → slot id for reverse lookups
  const codeToSlotId = {}
  for (const slot of activeSlots) {
    if (!slot.is_pool) codeToSlotId[slot.class_code] = slot.id
  }

  // Build a per-course set of codes that are also listed as coreqs, so the
  // prereq propagation can skip them (coreq timing is same-semester, not +1).
  const coreqCodesFor = {}
  for (const slot of activeSlots) {
    if (slot.is_pool) continue
    const groups = coreqMap[slot.class_code] ?? {}
    const coreqCodes = new Set()
    for (const g of Object.values(groups)) {
      for (const c of g.codes) coreqCodes.add(c)
    }
    coreqCodesFor[slot.class_code] = coreqCodes
  }

  const minSem = {}
  for (const slot of activeSlots) minSem[slot.id] = 1

  let changed = true
  let safetyIter = 0
  const maxIter = activeSlots.length * 3

  while (changed && safetyIter < maxIter) {
    changed = false
    safetyIter++

    for (const slot of activeSlots) {
      if (slot.is_pool) continue
      const groups = prereqMap[slot.class_code] ?? {}
      const coreqCodes = coreqCodesFor[slot.class_code] ?? new Set()

      for (const group of Object.values(groups)) {
        // If the whole group is satisfied by prior credits, skip it.
        if (groupSatisfied(group, priorSatisfied)) continue

        if (group.logic === 'AND') {
          // Every code in the group must be in an earlier semester.
          for (const code of group.codes) {
            if (priorSatisfied.has(code)) continue
            // Skip codes that are also coreqs — coreq pass handles same-semester timing.
            if (coreqCodes.has(code)) continue
            const depSlotId = codeToSlotId[code]
            if (!depSlotId) continue
            const needed = (minSem[depSlotId] ?? 1) + 1
            if (needed > minSem[slot.id]) {
              minSem[slot.id] = needed
              changed = true
            }
          }
        } else {
          // OR group: at least one code must be in an earlier semester.
          // Exclude codes that are also coreqs (they don't contribute a +1 constraint).
          // If all remaining options are coreqs or prior-satisfied, the prereq
          // adds no timing constraint (the coreq pass already handles it).
          const candidates = group.codes.filter(
            c => !priorSatisfied.has(c) && !coreqCodes.has(c) && codeToSlotId[c]
          )
          if (candidates.length === 0) continue
          const bestDep = candidates
            .map(c => minSem[codeToSlotId[c]] ?? 1)
            .reduce((min, v) => Math.min(min, v), Infinity)
          if (bestDep !== Infinity) {
            const needed = bestDep + 1
            if (needed > minSem[slot.id]) {
              minSem[slot.id] = needed
              changed = true
            }
          }
        }
      }

      // Coreq: coreq slots must be in the same or earlier semester (no +1).
      const coreqGroups = coreqMap[slot.class_code] ?? {}
      for (const group of Object.values(coreqGroups)) {
        if (groupSatisfied(group, priorSatisfied)) continue
        if (group.logic === 'OR') {
          const bestDep = group.codes
            .filter(c => !priorSatisfied.has(c) && codeToSlotId[c])
            .map(c => minSem[codeToSlotId[c]] ?? 1)
            .reduce((min, v) => Math.min(min, v), Infinity)
          if (bestDep !== Infinity && bestDep > minSem[slot.id]) {
            minSem[slot.id] = bestDep
            changed = true
          }
        } else {
          for (const code of group.codes) {
            if (priorSatisfied.has(code)) continue
            const depSlotId = codeToSlotId[code]
            if (!depSlotId) continue
            const needed = minSem[depSlotId] ?? 1
            if (needed > minSem[slot.id]) {
              minSem[slot.id] = needed
              changed = true
            }
          }
        }
      }
    }
  }

  // ── Step 6b: Set effective minSem for pool slots that have implicit prereqs ─
  // Pool slots bypass the prereq graph entirely (is_pool = true).  Several
  // pools are gated by courses the student must complete first:
  //
  //   ENG_LIT              — all options require ENGL1020
  //   CSC_UPPER_ELECTIVE   — all options require CSC1310
  //   CSC_ELECTIVE         — same
  //   CSC_HPC_ELECTIVE     — same
  //   CSC_LOWER_ELECTIVE   — all options require CSC1300
  //
  // If ENGL1020 / CSC1310 / CSC1300 is archived (prior credit covers it),
  // its slot isn't in activeSlots and minSem stays at 1 — correct, since
  // the prereq is already satisfied before semester 1.

  const engl1020SlotId  = activeSlots.find(s => s.class_code === 'ENGL1020')?.id
  const csc1310SlotId   = activeSlots.find(s => s.class_code === 'CSC1310')?.id
  const csc1300SlotId   = activeSlots.find(s => s.class_code === 'CSC1300')?.id

  for (const slot of activeSlots) {
    if (!slot.is_pool) continue
    if (slot.class_code === 'ENG_LIT') {
      if (engl1020SlotId) {
        minSem[slot.id] = Math.max(minSem[slot.id], (minSem[engl1020SlotId] ?? 1) + 1)
      }
    }
    if (['CSC_UPPER_ELECTIVE', 'CSC_ELECTIVE', 'CSC_HPC_ELECTIVE'].includes(slot.class_code)) {
      if (csc1310SlotId) {
        minSem[slot.id] = Math.max(minSem[slot.id], (minSem[csc1310SlotId] ?? 1) + 1)
      }
    }
    if (slot.class_code === 'CSC_LOWER_ELECTIVE') {
      if (csc1300SlotId) {
        minSem[slot.id] = Math.max(minSem[slot.id], (minSem[csc1300SlotId] ?? 1) + 1)
      }
    }
  }

  // ── Step 7: Sort active slots by (minSem, priority) ─────────────────────
  // Priority: math chain courses first (they gate everything downstream),
  // then required CSC courses, then gen-ed / pool fillers.
  function slotPriority(slot) {
    if (ALL_MATH_CHAIN_CODES.has(slot.class_code)) return 0
    if (!slot.is_pool && slot.class_code.startsWith('CSC')) return 1
    if (!slot.is_pool && slot.class_code.startsWith('ENGL')) return 2
    if (!slot.is_pool) return 3
    return 4   // pool slots fill last
  }

  const sorted = [...activeSlots].sort((a, b) => {
    if (minSem[a.id] !== minSem[b.id]) return minSem[a.id] - minSem[b.id]
    const pa = slotPriority(a), pb = slotPriority(b)
    if (pa !== pb) return pa - pb
    return (a.class_code ?? '').localeCompare(b.class_code ?? '')
  })

  // ── Step 8: Required-course bin-packing (Pass 1) ────────────────────────
  // Required (non-pool) slots are packed first so the math chain and CSC
  // sequence land in their correct semesters. The ceiling is creditTarget (15)
  // rather than creditMax (18) to spread load evenly and leave headroom for
  // pool backfill. Pool placement happens in Step 11 after the capstone pin.
  const isSummerStart = start_season === 'Summer'

  function creditTarget(sem) { return isSummerStart && sem === 1 ? SUMMER_TARGET : CREDIT_TARGET }
  function creditMax(sem)    { return isSummerStart && sem === 1 ? SUMMER_MAX    : CREDIT_MAX    }

  const assignments = {}
  const semCredits  = {}

  function packSlot(slot, ceilFn = creditMax) {
    const earliest = minSem[slot.id]
    const cr       = slotCredits(slot, courseMap)
    let sem        = earliest

    while (true) {
      const current = semCredits[sem] ?? 0
      const max     = ceilFn(sem)
      if (current + cr <= max) {
        assignments[slot.id] = sem
        semCredits[sem]      = current + cr
        break
      }
      sem++
      if (sem > earliest + 30) {
        assignments[slot.id] = sem
        semCredits[sem]      = (semCredits[sem] ?? 0) + cr
        break
      }
    }
  }

  // Pass 1: required (non-pool) courses — ceiling = creditTarget (15) to spread
  // load evenly across semesters rather than packing each one to 18 first.
  for (const slot of sorted) {
    if (!slot.is_pool) packSlot(slot, creditTarget)
  }

  // ── Step 10: Post-pack validation ────────────────────────────────────────
  // Pre-computed minSem values reflect the earliest a slot *could* go based
  // on the prereq chain lengths.  Greedy packing may push a prerequisite to a
  // later semester than its minimum (credit-load overflow), meaning downstream
  // courses whose minSem was computed relative to that earlier estimate can
  // land in the same — or an earlier — semester than their prereq.
  //
  // This pass also enforces coreq order and standing requirements (junior:
  // 60 cr, senior: 90 cr accumulated in all semesters BEFORE the slot's
  // semester, including prior credits).  Standing_req lives on courseMap
  // entries.  It runs here on projected pool credits and again in Step 12 on
  // actual loads.
  //
  // We iterate until no more bumps are needed (cascading moves settle).

  // Total hours from prior credits (count toward standing thresholds).
  const priorHours = priorCredits.reduce((sum, pc) => sum + (pc.credits_awarded ?? 0), 0)

  // Credits actually placed before `sem`, plus prior credits.
  function creditsBefore(sem) {
    let total = priorHours
    for (const [s, cr] of Object.entries(semCredits)) {
      if (Number(s) < sem) total += cr
    }
    return total
  }

  // Pool slots aren't placed until Step 11, so during this pass semCredits
  // holds only the required courses (about half the degree) and a 60/90-hour
  // standing threshold can never be met. Project the pool credits instead:
  // Step 11 front-fills each semester up to its target load, so top every
  // earlier semester up to creditTarget until the pool budget runs out.
  const poolCredits = activeSlots
    .filter(s => s.is_pool)
    .reduce((sum, s) => sum + slotCredits(s, courseMap), 0)

  function projectedCreditsBefore(sem) {
    let total  = priorHours
    let budget = poolCredits
    for (let s = 1; s < sem; s++) {
      const placed = semCredits[s] ?? 0
      const topUp  = Math.min(Math.max(creditTarget(s) - placed, 0), budget)
      budget -= topUp
      total  += placed + topUp
    }
    return total
  }

  // Move a slot from its current assignment to newSem, updating semCredits.
  function reassign(slot, newSem) {
    const cr     = slotCredits(slot, courseMap)
    const oldSem = assignments[slot.id]
    semCredits[oldSem] = (semCredits[oldSem] ?? 0) - cr
    // Find first semester >= newSem with credit room.
    let target = newSem
    while ((semCredits[target] ?? 0) + cr > creditMax(target)) target++
    assignments[slot.id]  = target
    semCredits[target]    = (semCredits[target] ?? 0) + cr
  }

  // Push required slots later until prereq order and standing both hold.
  // Moves only ever go later, and a standing check never pushes past
  // SEMESTER_CAP, so the loop settles. (The old `> 20` guard only exited the
  // inner walk; the outer loop then bumped the course again on every pass.)
  function enforceOrdering(creditsBeforeFn) {
    let changed = true
    let iter    = 0
    const maxIter = activeSlots.length * 2

    while (changed && iter < maxIter) {
      changed = false
      iter++

      for (const slot of sorted) {
        if (slot.is_pool) continue
        const coreqSet = coreqCodesFor[slot.class_code] ?? new Set()
        let minRequired = assignments[slot.id]

        // ── Prereq order: must be strictly after every assigned prerequisite ─
        const groups = prereqMap[slot.class_code] ?? {}
        for (const group of Object.values(groups)) {
          if (groupSatisfied(group, priorSatisfied)) continue

          if (group.logic === 'AND') {
            for (const code of group.codes) {
              if (priorSatisfied.has(code) || coreqSet.has(code)) continue
              const depId = codeToSlotId[code]
              if (!depId || assignments[depId] === undefined) continue
              minRequired = Math.max(minRequired, assignments[depId] + 1)
            }
          } else {
            // OR group: satisfied if at least one packed dep is strictly earlier.
            const packedDeps = group.codes.filter(
              c => !priorSatisfied.has(c) && !coreqSet.has(c)
                && codeToSlotId[c] && assignments[codeToSlotId[c]] !== undefined
            )
            if (packedDeps.length === 0) continue
            const anyEarlier = packedDeps.some(
              c => assignments[codeToSlotId[c]] < assignments[slot.id]
            )
            if (!anyEarlier) {
              const minDep = Math.min(...packedDeps.map(c => assignments[codeToSlotId[c]]))
              minRequired = Math.max(minRequired, minDep + 1)
            }
          }
        }

        // ── Coreq order: same semester as, or after, its corequisites ────────
        // A coreq pushed later (e.g. CSC4610 by senior standing) must drag
        // the courses that take it concurrently along with it.
        const coreqGroups = coreqMap[slot.class_code] ?? {}
        for (const group of Object.values(coreqGroups)) {
          if (groupSatisfied(group, priorSatisfied)) continue
          const depSems = group.codes
            .filter(c => !priorSatisfied.has(c) && codeToSlotId[c]
              && assignments[codeToSlotId[c]] !== undefined)
            .map(c => assignments[codeToSlotId[c]])
          if (depSems.length === 0) continue
          const needed = group.logic === 'OR' ? Math.min(...depSems) : Math.max(...depSems)
          minRequired = Math.max(minRequired, needed)
        }

        // ── Standing requirement: credit-hour threshold before this semester ─
        const standingReq = courseMap[slot.class_code]?.standing_req
        const threshold   = STANDING_THRESHOLDS[standingReq] ?? 0
        if (threshold > 0) {
          while (creditsBeforeFn(minRequired) < threshold && minRequired < SEMESTER_CAP) {
            minRequired++
          }
        }

        if (minRequired > assignments[slot.id]) {
          reassign(slot, minRequired)
          changed = true
        }
      }
    }
  }

  enforceOrdering(projectedCreditsBefore)

  // ── Step 10b: Pin CSC4615 to the final semester ─────────────────────────
  // The capstone must always be the last course in the plan. Prereq/standing
  // constraints alone don't guarantee this — packing may place it in semester
  // 6 or 7 while later semesters remain thin. Moving it later never violates
  // prereq ordering (all its deps are already in earlier semesters).
  // Re-run after Step 12, which can move other courses later.
  const csc4615Slot = activeSlots.find(s => s.class_code === 'CSC4615')
  function pinCapstone() {
    if (!csc4615Slot || assignments[csc4615Slot.id] === undefined) return
    const maxSem = Math.max(...Object.values(assignments))
    if (assignments[csc4615Slot.id] < maxSem) reassign(csc4615Slot, maxSem)
  }
  pinCapstone()

  // ── Step 11: Pool-slot backfill ─────────────────────────────────────────
  // While a junior/senior-standing course is still short of its 60/90 hours,
  // semesters before it are filled front to back: each pool slot takes the
  // earliest eligible semester still under its target load (overshooting up
  // to CREDIT_MAX is fine). That keeps cumulative hours on pace with the
  // standing positions Step 10 projected — balancing those semesters instead
  // evens every load out below target and leaves the courses short. Once
  // every threshold is met, pool slots go to the least-loaded semester with
  // room (which fills the thin tail semesters), then to a new semester.
  const standingSlots = activeSlots.filter(s =>
    !s.is_pool && STANDING_THRESHOLDS[courseMap[s.class_code]?.standing_req]
  )

  // Latest semester holding a standing-gated course that is still short.
  function frontFillLimit() {
    let limit = 0
    for (const s of standingSlots) {
      const sem = assignments[s.id]
      const threshold = STANDING_THRESHOLDS[courseMap[s.class_code].standing_req]
      if (creditsBefore(sem) < threshold) limit = Math.max(limit, sem)
    }
    return limit
  }

  function backfillPoolSlot(slot) {
    const earliest   = minSem[slot.id] ?? 1
    const cr         = slotCredits(slot, courseMap)
    const maxSemUsed = Math.max(...Object.values(assignments))

    let bestSem = null

    // The second SCIENCE slot goes right after the first so the lab sequence
    // lands in consecutive semesters.
    if (slot.class_code === 'SCIENCE') {
      const first = activeSlots.find(s =>
        s.class_code === 'SCIENCE' && s.id !== slot.id && assignments[s.id] !== undefined
      )
      const next = first ? assignments[first.id] + 1 : null
      if (next != null && next >= earliest && next <= maxSemUsed
          && (semCredits[next] ?? 0) + cr <= creditMax(next)) {
        bestSem = next
      }
    }

    const limit = bestSem === null ? frontFillLimit() : 0
    for (let s = earliest; bestSem === null && s < limit && s <= maxSemUsed; s++) {
      const current = semCredits[s] ?? 0
      if (current < creditTarget(s) && current + cr <= creditMax(s)) bestSem = s
    }

    if (bestSem === null) {
      let bestLoad = Infinity
      for (let s = earliest; s <= maxSemUsed; s++) {
        const current = semCredits[s] ?? 0
        if (current + cr <= creditMax(s) && current < bestLoad) {
          bestLoad = current
          bestSem  = s
        }
      }
    }

    // No eligible semester within the existing range — open a new one.
    if (bestSem === null) bestSem = Math.max(maxSemUsed + 1, earliest)

    assignments[slot.id] = bestSem
    semCredits[bestSem]  = (semCredits[bestSem] ?? 0) + cr
  }

  for (const slot of sorted) {
    if (slot.is_pool) backfillPoolSlot(slot)
  }

  // ── Step 9: SCIENCE slot adjacency fix ──────────────────────────────────
  // The two SCIENCE pool slots should land in adjacent semesters so the
  // student takes a coherent lab-science sequence.  If they're already
  // adjacent, nothing to do.  If not, try to move the second one to the
  // semester immediately following the first (if that semester has room).
  // Runs after backfill so the adjacency adjustment isn't undone by Step 11.
  const scienceSlots = activeSlots.filter(s => s.class_code === 'SCIENCE')
  if (scienceSlots.length === 2) {
    const [s1, s2] = scienceSlots.sort((a, b) => assignments[a.id] - assignments[b.id])
    const semA = assignments[s1.id]
    const semB = assignments[s2.id]
    if (semB !== semA + 1) {
      const targetB = semA + 1
      const crB     = slotCredits(s2, courseMap)
      const spaceB  = (semCredits[targetB] ?? 0) + crB <= creditMax(targetB)
      if (spaceB && targetB >= (minSem[s2.id] ?? 1)) {
        semCredits[semB]    = (semCredits[semB]    ?? 0) - crB
        semCredits[targetB] = (semCredits[targetB] ?? 0) + crB
        assignments[s2.id]  = targetB
      }
    }
  }

  // ── Step 12: Re-check order and standing against actual loads ───────────
  // Step 10 placed standing-gated courses using projected pool credits. Now
  // that every slot is placed, run the same pass on the real per-semester
  // totals (anything still short moves later) and re-pin the capstone.
  enforceOrdering(creditsBefore)
  pinCapstone()

  return { assignments, archived }
}
