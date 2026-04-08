// usePlanCompleteness.js
//
// Derives whether the student's active degree plan is fully filled in.
// The core logic lives in computePlanCompleteness (a pure function) so it can
// be unit-tested without a React environment.  The default export wraps it in
// useMemo for use inside components.
//
// Inputs:
//   slots       — array of requirement_slot rows from Supabase
//                 Each row: { id, class_code, is_pool, flex_credits, ... }
//   planSlots   — { [slotId]: selectedCourseCode } map (student's selections)
//   genEdStatus — output of getGenEdStatus() — array of three objects:
//                 [{ category, filled, required, satisfied, atRisk }, ...]
//
// Output: { isComplete, totalSlots, filledSlots, genEdSatisfied }

import { useMemo } from 'react'

// ── Pure helper ───────────────────────────────────────────────────────────────

export function computePlanCompleteness(slots, planSlots, genEdStatus) {
  // An empty/loading plan is never "complete".
  if (!slots || slots.length === 0) {
    return { isComplete: false, totalSlots: 0, filledSlots: 0, genEdSatisfied: false }
  }

  let totalSlots  = 0
  let filledSlots = 0

  for (const slot of slots) {
    totalSlots++

    if (!slot.is_pool) {
      // Fixed required course — the course code is baked into the slot row,
      // so it is always considered filled (the student cannot un-select it).
      filledSlots++
    } else if (slot.class_code === 'FREE_ELECTIVE') {
      // TODO: treat free-elective slots as always satisfied until a dedicated
      // free-elective credit resolver is implemented.  The slot may have a
      // flex_credits value but we cannot verify it from client state alone.
      filledSlots++
    } else {
      // Pool slot — the student must actively choose a course.
      if (planSlots[slot.id]) {
        filledSlots++
      }
    }
  }

  // GEN_ED sub-category satisfaction ──────────────────────────────────────────
  // getGenEdStatus() always returns three items (History, Humanities, Social)
  // even when the plan has no GEN_ED slots.  In that case all three would show
  // satisfied=false (0 of 6 hrs filled) which would permanently block isComplete
  // for concentrations that have no GEN_ED pool slots.
  //
  // Guard: only enforce GEN_ED satisfaction when the plan actually has GEN_ED slots.
  const hasGenEdSlots = slots.some(s => s.is_pool && s.class_code === 'GEN_ED')
  const genEdSatisfied = !hasGenEdSlots
    || (Array.isArray(genEdStatus) && genEdStatus.length > 0 && genEdStatus.every(cat => cat.satisfied))

  const isComplete = totalSlots > 0 && filledSlots === totalSlots && genEdSatisfied

  return { isComplete, totalSlots, filledSlots, genEdSatisfied }
}

// ── React hook ────────────────────────────────────────────────────────────────

export default function usePlanCompleteness(slots, planSlots, genEdStatus) {
  return useMemo(
    () => computePlanCompleteness(slots, planSlots, genEdStatus),
    [slots, planSlots, genEdStatus]
  )
}
