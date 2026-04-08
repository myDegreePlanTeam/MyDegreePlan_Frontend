// transferCredits.js
//
// Pure helpers — no side effects, no Supabase calls.
//
// Exports:
//   resolveTransferCredits(priorCredits, planSlots, slots)
//     → { [slotId]: true }
//     Returns the set of slots satisfied by prior credits.
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
// ── Matching rules (shared by resolveTransferCredits / resolveTransferDetails)
//
//   Two-pass approach — required slots are matched before pool slots so that
//   one prior-credit entry cannot satisfy BOTH a specific required slot AND a
//   gen-ed pool slot for the same course (Bug 3 fix):
//
//   Pass 1 — Non-pool slots: satisfied if a prior credit's
//     satisfies_course_code equals the slot's class_code AND the slot has no
//     active student selection.  Consumed codes are recorded.
//
//   Pass 2 — Pool slots (GEN_ED, ENG_LIT, SCIENCE, COMM_REQ): satisfied by
//     the first credit-bearing prior-credit code not yet consumed.  One prior
//     credit entry satisfies at most one pool slot.
//
//   Only credit-bearing prior credits (credits_awarded > 0) participate.
//   Placement-only entries (credits_awarded === 0) are never matched.

// Pool types that accept transfer-credit satisfaction
const TRANSFERABLE_POOLS = new Set(['GEN_ED', 'ENG_LIT', 'SCIENCE', 'COMM_REQ'])

// ── resolveTransferCredits ────────────────────────────────────────────────────

/**
 * @param {Array}  priorCredits  – prior_credits rows
 * @param {Object} planSlots     – { [slotId]: selectedCourseCode }
 * @param {Array}  slots         – requirement_slots rows: { id, class_code, is_pool }
 * @returns {Object}             – { [slotId]: true } for every transfer-satisfied slot
 */
export function resolveTransferCredits(priorCredits, planSlots, slots) {
  const creditBearing = (priorCredits ?? []).filter(
    pc => (pc.credits_awarded ?? 0) > 0 && pc.satisfies_course_code
  )
  if (creditBearing.length === 0) return {}

  const coveredCodes = new Set(creditBearing.map(pc => pc.satisfies_course_code))
  const transferFilled = {}
  // Codes consumed by any slot so far (required OR pool) — prevents one prior
  // credit from satisfying both a required slot and a pool slot.
  const usedCodes = new Set()

  // Pass 1: required (non-pool) slots — direct code match, highest priority
  for (const slot of slots) {
    if (slot.is_pool) continue
    if (planSlots[slot.id]) continue                     // student already filled this
    if (coveredCodes.has(slot.class_code)) {
      transferFilled[slot.id] = true
      usedCodes.add(slot.class_code)
    }
  }

  // Pass 2: pool slots — consume first unused covered code
  for (const slot of slots) {
    if (!slot.is_pool) continue
    if (!TRANSFERABLE_POOLS.has(slot.class_code)) continue
    if (planSlots[slot.id]) continue                     // student already selected here
    for (const code of coveredCodes) {
      if (!usedCodes.has(code)) {
        transferFilled[slot.id] = true
        usedCodes.add(code)
        break
      }
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
    pc => (pc.credits_awarded ?? 0) > 0 && pc.satisfies_course_code
  )
  if (creditBearing.length === 0) return {}

  // Map courseCode → first matching prior credit (first wins if duplicates)
  const codeToCredit = {}
  for (const pc of creditBearing) {
    if (!codeToCredit[pc.satisfies_course_code]) {
      codeToCredit[pc.satisfies_course_code] = pc
    }
  }

  const coveredCodes = new Set(Object.keys(codeToCredit))
  const details = {}
  const usedCodes = new Set()

  // Pass 1: non-pool slots
  for (const slot of slots) {
    if (slot.is_pool) continue
    if (planSlots[slot.id]) continue
    if (coveredCodes.has(slot.class_code)) {
      const pc = codeToCredit[slot.class_code]
      details[slot.id] = { creditType: pc.credit_type, priorCreditId: pc.id }
      usedCodes.add(slot.class_code)
    }
  }

  // Pass 2: pool slots — consume first unused covered code
  for (const slot of slots) {
    if (!slot.is_pool) continue
    if (!TRANSFERABLE_POOLS.has(slot.class_code)) continue
    if (planSlots[slot.id]) continue
    for (const [code, pc] of Object.entries(codeToCredit)) {
      if (!usedCodes.has(code)) {
        details[slot.id] = { creditType: pc.credit_type, priorCreditId: pc.id }
        usedCodes.add(code)
        break
      }
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
