// genEdPanel.js
//
// The model behind the general-education progress panel (Requirements tab). Pure: it picks the
// evaluator for the student's gen-ed program and returns one shape for both programs, so the
// component renders rows and does no arithmetic.
//
//   buildGenEdPanel({ genedProgram, planSlots, priorCredits, slots, courses, freeAddSlots, planArchived })
//     -> null                       when the plan has no gen-ed slots (nothing to report)
//     -> { program, title, earned, required, satisfied, flexNote, rows }
//
//   rows: [{ key, label, group, earned, min, max, state }]
//     earned  hours counted toward the row (already capped by the evaluator)
//     min/max the plan's effective range; max === min for a fixed row
//     state   'done'    the minimum is met
//             'risk'    legacy only: the open GEN_ED seats cannot cover what is still needed
//             'open'    still short, with room to fill it
//
// `planSlots` is { [slotId]: courseCode }, `courses` the courseMap, `planArchived` the map the
// grid filters on. Argument names match SlotModal's own calls to the same evaluators.

import { getGenEdStatus } from './poolResolver.js'
import { getFlightFoundationsStatus, FF_PROGRAM_CODE } from './flightFoundations.js'

// Pool codes that make a plan a gen-ed plan: the legacy GEN_ED pool and the Flight Foundations ones.
const GEN_ED_POOL_CODES = new Set(['GEN_ED', 'FF_SOCIAL', 'FF_HUMANITIES', 'FF_LITERACY'])

export function hasGenEdSlots(slots) {
  return (slots ?? []).some(s => s?.is_pool && GEN_ED_POOL_CODES.has(s.class_code))
}

export function buildGenEdPanel({
  genedProgram, planSlots = {}, priorCredits = [], slots = [], courses = {}, freeAddSlots = [], planArchived = {},
}) {
  if (!hasGenEdSlots(slots)) return null

  if (genedProgram === FF_PROGRAM_CODE) {
    const status = getFlightFoundationsStatus(planSlots, priorCredits, slots, courses, freeAddSlots, planArchived)
    const rows = status.categories.map(c => ({
      key:    c.category,
      label:  c.label,
      group:  c.group ?? null,
      earned: c.filled,
      min:    c.required,
      max:    Math.max(c.max ?? c.required, c.required),
      state:  c.satisfied ? 'done' : 'open',
    }))
    const flex = status.flex
    return {
      program:   FF_PROGRAM_CODE,
      title:     'Flight Foundations',
      earned:    status.totalEarned,
      required:  status.totalRequired,
      satisfied: status.satisfied,
      flexNote:  flex && flex.total > 0 ? `${flex.used} of ${flex.total} flexible hours placed` : null,
      rows,
    }
  }

  const legacy = getGenEdStatus(planSlots, slots, courses, priorCredits, planArchived)
  const rows = legacy.map(c => ({
    key:    c.category,
    label:  c.label,
    group:  null,
    earned: Math.min(c.filled, c.required),
    min:    c.required,
    max:    c.required,
    state:  c.satisfied ? 'done' : c.atRisk ? 'risk' : 'open',
  }))
  return {
    program:   'legacy',
    title:     'General education',
    earned:    rows.reduce((sum, r) => sum + r.earned, 0),
    required:  rows.reduce((sum, r) => sum + r.min, 0),
    satisfied: rows.every(r => r.state === 'done'),
    flexNote:  null,
    rows,
  }
}

// "6" for a fixed row, "6–9" for a range.
export function formatRange(row) {
  return row.max > row.min ? `${row.min}–${row.max}` : String(row.min)
}
