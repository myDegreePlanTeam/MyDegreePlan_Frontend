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
//   computePlanCredits(planSlots, priorCredits, slots, courses, freeAddSlots)
//     → { totalEarned, breakdown }
//     Deduplicates credit hours across prior_credits, plan_slots, and
//     student_free_add_slots so the same course code is never counted twice.
//     Prior credits win if a code appears in multiple sources.
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

// ── matchPriorCreditsToSlots (private) ────────────────────────────────────────
//
// Single source of truth for the Rule 1 / Rule 2 matching used by both
// resolveTransferCredits and resolveTransferDetails.  Centralising the logic
// here prevents the two functions from drifting (BUG-3).
//
// Returns an array of { slotId, priorCredit } pairs in stable Rule 1 → Rule 2
// order, preserving the "first match wins" + "one credit at most one slot"
// invariants via a shared usedPriorCreditIds set.
//
// IMPORTANT — neither rule skips on planSlots[slot.id].
// For non-pool slots class_code is fixed by the template, so any value in
// planSlots[slot.id] is a side-effect of semester drags or prior archiving.
// For pool slots, pool credit beats student selection (BUG-42): a filled
// pool slot still archives when satisfies_pool matches.  syncArchivedSlots
// preserves the student's selection on the upserted DB row so an unarchive
// restores it.
//
// @param {Array}  priorCredits
// @param {Object} planSlots         { [slotId]: selectedCourseCode }
// @param {Array}  slots             requirement_slots rows
// @returns {Array<{ slotId, priorCredit }>}
function matchPriorCreditsToSlots(priorCredits, planSlots, slots) {
  const creditBearing = (priorCredits ?? []).filter(
    pc => (pc.credits_awarded ?? 0) > 0
  )
  if (creditBearing.length === 0) return []

  const matches = []
  const usedPriorCreditIds = new Set()
  const slotList           = slots ?? []

  // Rule 1: non-pool exact match.  Do NOT skip on planSlots[slot.id].
  for (const slot of slotList) {
    if (slot.is_pool) continue

    const match = creditBearing.find(
      pc => pc.satisfies_course_code === slot.class_code &&
            !usedPriorCreditIds.has(pc.id)
    )
    if (match) {
      matches.push({ slotId: slot.id, priorCredit: match })
      usedPriorCreditIds.add(match.id)
    }
  }

  // Rule 2: pool slots — explicit satisfies_pool only.  Fill state is
  // intentionally NOT a guard: pool credit beats student selection (BUG-42).
  // The student's planSlots[slot.id] is preserved on the upserted DB row by
  // syncArchivedSlots so an unarchive restores it within the session.
  for (const slot of slotList) {
    if (!slot.is_pool) continue
    if (!SATISFIABLE_POOLS.has(slot.class_code)) continue

    const match = creditBearing.find(
      pc => pc.satisfies_pool === slot.class_code &&
            !usedPriorCreditIds.has(pc.id)
    )
    if (match) {
      matches.push({ slotId: slot.id, priorCredit: match })
      usedPriorCreditIds.add(match.id)
    }
  }

  return matches
}

// ── resolveTransferCredits ────────────────────────────────────────────────────

/**
 * @param {Array}  priorCredits  – prior_credits rows
 * @param {Object} planSlots     – { [slotId]: selectedCourseCode }
 * @param {Array}  slots         – requirement_slots rows: { id, class_code, is_pool }
 * @returns {Object}             – { [slotId]: true } for every transfer-satisfied slot
 */
export function resolveTransferCredits(priorCredits, planSlots, slots) {
  const transferFilled = {}
  for (const { slotId } of matchPriorCreditsToSlots(priorCredits, planSlots, slots)) {
    transferFilled[slotId] = true
  }
  return transferFilled
}

// ── resolveTransferDetails ────────────────────────────────────────────────────

/**
 * Same matching logic as resolveTransferCredits but returns richer info so
 * the UI can display the correct badge label ("AP", "Transfer", etc.).
 *
 * Implemented atop the same private helper as resolveTransferCredits so the
 * two functions cannot drift (BUG-3).
 *
 * @param {Array}  priorCredits
 * @param {Object} planSlots
 * @param {Array}  slots
 * @returns {Object} – { [slotId]: { creditType: string, priorCreditId: string } }
 */
export function resolveTransferDetails(priorCredits, planSlots, slots) {
  const details = {}
  for (const { slotId, priorCredit } of matchPriorCreditsToSlots(priorCredits, planSlots, slots)) {
    details[slotId] = {
      creditType:    priorCredit.credit_type,
      priorCreditId: priorCredit.id,
    }
  }
  return details
}

// ── computePlanCredits ────────────────────────────────────────────────────────

/**
 * Computes total credited hours without double-counting.
 *
 * Rule: A course code may contribute its credit hours ONCE to the plan total,
 * regardless of how many times it appears across prior_credits, plan_slots,
 * and student_free_add_slots.  Prior-credit entries win over plan_slot and
 * free-add entries for the same course code — the external credit is the
 * authoritative record.
 *
 * Pass order:
 *   1. prior credits           (source = 'transfer')
 *   2. plan slots              (source = 'slot')
 *   3. free-add slots          (source = 'free_add')
 *
 * Each subsequent pass skips course codes already accounted for in earlier
 * passes via a shared `seen` Set.
 *
 * @param {Object} planSlots     – { [slotId]: selectedCourseCode }
 * @param {Array}  priorCredits  – prior_credits rows
 * @param {Array}  slots         – requirement_slots rows
 * @param {Object} courses       – { [courseCode]: { credits, ... } }
 * @param {Array}  freeAddSlots  – student_free_add_slots rows (optional)
 * @returns {{ totalEarned: number, breakdown: Array }}
 *   breakdown item shapes:
 *     { courseCode, credits, source: 'transfer', priorCreditId? }
 *     { courseCode, credits, source: 'slot',     slotId }
 *     { courseCode, credits, source: 'free_add', freeAddId, status }
 *   slotId / freeAddId / status are included so callers can resolve completion
 *   state (planStatuses for slots, fa.status for free-add rows).
 */
export function computePlanCredits(planSlots, priorCredits, slots, courses, freeAddSlots = []) {
  const seen = new Set()
  const breakdown = []

  // Pass 1: prior credits (source = 'transfer') — win over plan slots and free-add
  for (const pc of (priorCredits ?? [])) {
    if ((pc.credits_awarded ?? 0) <= 0) continue
    if (!pc.satisfies_course_code) continue
    if (seen.has(pc.satisfies_course_code)) continue
    seen.add(pc.satisfies_course_code)
    breakdown.push({
      courseCode:    pc.satisfies_course_code,
      credits:       pc.credits_awarded,
      source:        'transfer',
      priorCreditId: pc.id,
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

  // Pass 3: student_free_add_slots (source = 'free_add') — first-class plan
  // data the student added outside the template.  Dedup against prior credits
  // and plan slots so a course code never contributes its credits twice (BUG-6).
  for (const fa of (freeAddSlots ?? [])) {
    const code = fa?.course_code
    if (!code) continue
    if (seen.has(code)) continue
    const credits = (courses ?? {})[code]?.credits ?? 0
    seen.add(code)
    breakdown.push({
      courseCode: code,
      credits,
      source:     'free_add',
      freeAddId:  fa.id,
      status:     fa.status,
    })
  }

  const totalEarned = breakdown.reduce((sum, b) => sum + b.credits, 0)
  return { totalEarned, breakdown }
}

/**
 * Returns the set of course codes already represented in the plan.
 * Mirrors the dedup keyspace of computePlanCredits exactly: a code is
 * "taken" if it contributes (or would contribute) credit hours via
 * prior_credits, plan_slots, or student_free_add_slots.
 *
 * Rules:
 *   - prior_credits row counts ONLY if credits_awarded > 0 AND
 *     satisfies_course_code is non-null (matches Pass 1 of
 *     computePlanCredits — placement-only entries do not block).
 *   - non-pool slot contributes its class_code.
 *   - filled pool slot contributes the planSlots[slot.id] selection.
 *   - free-add slot contributes its course_code.
 *
 * Used by AddCourseModal to grey out catalog rows already in the plan
 * (BUG-34).
 *
 * @param {Object} planSlots     – { [slotId]: selectedCourseCode }
 * @param {Array}  slots         – requirement_slots rows
 * @param {Array}  priorCredits  – prior_credits rows
 * @param {Array}  freeAddSlots  – student_free_add_slots rows (optional)
 * @returns {Set<string>}
 */
export function getTakenCodes(planSlots, slots, priorCredits, freeAddSlots = []) {
  const taken = new Set()

  for (const pc of (priorCredits ?? [])) {
    if ((pc.credits_awarded ?? 0) <= 0) continue
    if (!pc.satisfies_course_code) continue
    taken.add(pc.satisfies_course_code)
  }

  for (const slot of (slots ?? [])) {
    let code
    if (slot.is_pool) {
      code = planSlots?.[slot.id]
      if (!code) continue
    } else {
      code = slot.class_code
    }
    taken.add(code)
  }

  for (const fa of (freeAddSlots ?? [])) {
    if (!fa?.course_code) continue
    taken.add(fa.course_code)
  }

  return taken
}
