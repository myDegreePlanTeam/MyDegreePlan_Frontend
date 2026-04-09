// transferCredits.js
//
// Pure helpers — no side effects, no Supabase calls.
//
// Exports:
//   resolveTransferCredits(priorCredits, planSlots, slots)
//     → { [slotId]: true }
//     Returns the set of slots satisfied (archived) by prior credits.
//
//   resolveTransferDetails(priorCredits, planSlots, slots)
//     → { [slotId]: { creditType, priorCreditId } }
//     Same matching logic but returns richer info for UI badge labels.
//
//   computePlanCredits(planSlots, priorCredits, slots, courses)
//     → { totalEarned, breakdown }
//     Deduplicates credit hours across prior_credits and plan_slots so the
//     same course code is never counted twice.  Prior credits win if a code
//     appears in both tables.
//
// ── Matching rules (Bug 3 fix — strict Rule 1 / Rule 2 / Rule 3)
//
//   Rule 1 — Exact course match only:
//     A prior credit with satisfies_course_code = 'X' matches ONLY the slot
//     where class_code = 'X' (non-pool, is_pool = false).
//     It NEVER matches a pool slot (GEN_ED, SCIENCE, etc.), even if X happens
//     to be a valid course for that pool.
//
//   Rule 2 — Pool satisfaction is explicit only:
//     A pool slot is satisfied ONLY by a prior credit whose satisfies_pool
//     column equals the pool's class_code (e.g. satisfies_pool = 'GEN_ED').
//     The wizard auto-populates satisfies_pool from test_equivalencies.
//     Students never set it manually.
//     One prior_credit archives at most one slot: Rule 1 takes priority.
//
//   Rule 3 — Unmatched prior credits are valid:
//     A prior credit with no matching slot still appears in Prior Coursework
//     and its credits_awarded counts toward the total degree hours.
//     It archives nothing.
//
//   Only credit-bearing prior credits (credits_awarded > 0) participate.
//   Placement-only entries (credits_awarded === 0) never match anything.

// Pool types that can be explicitly satisfied via satisfies_pool.
// Includes all pool codes used in requirement_slots so that drag-to-prior-credit
// and wizard entries can archive any pool slot.
const SATISFIABLE_POOLS = new Set([
  'GEN_ED', 'ENG_LIT', 'SCIENCE', 'COMM_REQ',
  'MATH_STATS', 'CSC_LOWER_ELECTIVE', 'CSC_UPPER_ELECTIVE',
  'CSC_ELECTIVE', 'CSC_HPC_ELECTIVE', 'FREE_ELECTIVE',
])

// ── resolveTransferCredits ────────────────────────────────────────────────────

/**
 * @param {Array}  priorCredits  – prior_credits rows
 * @param {Object} planSlots     – { [slotId]: selectedCourseCode }
 * @param {Array}  slots         – requirement_slots rows: { id, class_code, is_pool }
 * @returns {Object}             – { [slotId]: true } for every transfer-satisfied slot
 */
export function resolveTransferCredits(priorCredits, planSlots, slots) {
  const creditBearing = (priorCredits ?? []).filter(
    pc => (pc.credits_awarded ?? 0) > 0
  )
  if (creditBearing.length === 0) return {}

  const transferFilled = {}

  // ── Rule 1: exact required-slot match ─────────────────────────────
  // A prior credit with satisfies_course_code = 'X' archives only the
  // non-pool slot whose class_code = 'X'.  No pool fallthrough ever.
  const usedPriorCreditIds = new Set()

  for (const slot of slots) {
    if (slot.is_pool) continue                        // Rule 1: never pool
    // Note: planSlots[slot.id] for non-pool slots is just the fixed class_code stored
    // as a side-effect of semester drags or prior archiving — it does not mean the
    // student "filled" the slot with a different course.  Do not skip here.

    const match = creditBearing.find(
      pc => pc.satisfies_course_code === slot.class_code &&
            !usedPriorCreditIds.has(pc.id)
    )
    if (match) {
      transferFilled[slot.id] = true
      usedPriorCreditIds.add(match.id)
    }
  }

  // ── Rule 2: explicit pool match via satisfies_pool ─────────────────
  // A pool slot is archived only when a prior credit's satisfies_pool
  // equals the slot's class_code.  No automatic fallthrough.
  for (const slot of slots) {
    if (!slot.is_pool) continue
    if (!SATISFIABLE_POOLS.has(slot.class_code)) continue
    if (planSlots[slot.id]) continue                  // student already selected here

    const match = creditBearing.find(
      pc => pc.satisfies_pool === slot.class_code &&
            !usedPriorCreditIds.has(pc.id)
    )
    if (match) {
      transferFilled[slot.id] = true
      usedPriorCreditIds.add(match.id)
    }
  }

  return transferFilled
}

// ── resolveTransferDetails ────────────────────────────────────────────────────

/**
 * Same matching logic as resolveTransferCredits but returns richer info so
 * the UI can display the correct badge label ("AP", "Transfer", etc.).
 *
 * @param {Array}  priorCredits
 * @param {Object} planSlots
 * @param {Array}  slots
 * @returns {Object} – { [slotId]: { creditType: string, priorCreditId: string } }
 */
export function resolveTransferDetails(priorCredits, planSlots, slots) {
  const creditBearing = (priorCredits ?? []).filter(
    pc => (pc.credits_awarded ?? 0) > 0
  )
  if (creditBearing.length === 0) return {}

  const details = {}
  const usedPriorCreditIds = new Set()

  // Rule 1: non-pool exact match
  for (const slot of slots) {
    if (slot.is_pool) continue
    if (planSlots[slot.id]) continue
    const match = creditBearing.find(
      pc => pc.satisfies_course_code === slot.class_code &&
            !usedPriorCreditIds.has(pc.id)
    )
    if (match) {
      details[slot.id] = { creditType: match.credit_type, priorCreditId: match.id }
      usedPriorCreditIds.add(match.id)
    }
  }

  // Rule 2: explicit pool match
  for (const slot of slots) {
    if (!slot.is_pool) continue
    if (!SATISFIABLE_POOLS.has(slot.class_code)) continue
    if (planSlots[slot.id]) continue
    const match = creditBearing.find(
      pc => pc.satisfies_pool === slot.class_code &&
            !usedPriorCreditIds.has(pc.id)
    )
    if (match) {
      details[slot.id] = { creditType: match.credit_type, priorCreditId: match.id }
      usedPriorCreditIds.add(match.id)
    }
  }

  return details
}

// ── computePlanCredits ────────────────────────────────────────────────────────

/**
 * Computes total credited hours without double-counting.
 *
 * Rule: A course code may contribute its credit hours ONCE to the plan total,
 * regardless of how many times it appears across prior_credits and plan_slots.
 * Prior-credit entries win over plan_slot entries for the same course code —
 * the external credit is the authoritative record.
 *
 * @param {Object} planSlots     – { [slotId]: selectedCourseCode }
 * @param {Array}  priorCredits  – prior_credits rows
 * @param {Array}  slots         – requirement_slots rows
 * @param {Object} courses       – { [courseCode]: { credits, ... } }
 * @returns {{ totalEarned: number, breakdown: Array }}
 *   breakdown item: { courseCode, credits, source: 'slot'|'transfer', slotId? }
 *   slotId is included for source='slot' items so callers can look up status.
 */
export function computePlanCredits(planSlots, priorCredits, slots, courses) {
  const seen = new Set()
  const breakdown = []

  // Pass 1: prior credits (source = 'transfer') — win over plan slots
  for (const pc of (priorCredits ?? [])) {
    if ((pc.credits_awarded ?? 0) <= 0) continue
    if (!pc.satisfies_course_code) continue
    if (seen.has(pc.satisfies_course_code)) continue
    seen.add(pc.satisfies_course_code)
    breakdown.push({
      courseCode: pc.satisfies_course_code,
      credits:    pc.credits_awarded,
      source:     'transfer',
    })
  }

  // Pass 2: plan slots (source = 'slot') — skip if already counted via transfer
  for (const slot of (slots ?? [])) {
    let code, credits
    if (slot.is_pool) {
      code = planSlots?.[slot.id]
      if (!code) continue                               // unfilled pool slot — skip
      credits = (courses ?? {})[code]?.credits ?? slot.flex_credits ?? 3
    } else {
      code    = slot.class_code
      credits = (courses ?? {})[code]?.credits ?? 0
    }
    if (seen.has(code)) continue                        // already counted via prior credit
    seen.add(code)
    breakdown.push({ courseCode: code, credits, source: 'slot', slotId: slot.id })
  }

  const totalEarned = breakdown.reduce((sum, b) => sum + b.credits, 0)
  return { totalEarned, breakdown }
}
