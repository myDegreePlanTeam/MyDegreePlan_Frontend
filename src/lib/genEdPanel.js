// genEdPanel.js
//
// The model behind the general-education part of the Requirements tab. Pure: it picks the evaluator for the student's
// gen-ed program and returns one shape for both programs, so the component renders rows and does no arithmetic.
//
//   buildGenEdPanel({ genedProgram, planSlots, priorCredits, slots, courses, freeAddSlots, planArchived,
//                     planSemesterOverrides, semesterPhase, exempt })
//     -> null                       when the plan has no gen-ed slots (nothing to report)
//     -> { program, title, earned, done, inProgress, planned, required, state, satisfied, flexNote, exemptions, rows }
//
//   exempt  Flight Foundations categories the student's major is excused from (lib/flightFoundations.js, FF_EXEMPT_MAJORS):
//           such a row has state 'exempt' and no hours, and `required` drops by its hours (35 of 41 for an engineering major
//           without American History). `exemptions` lists them: [{ key, label, hours }]. A legacy plan has none (no exempt
//           major has a legacy plan: each one's first plan is a Flight Foundations plan that covers earlier entrants).
//
//   rows: [{ key, label, group, earned, done, inProgress, planned, min, max, state }]
//     earned  hours counted toward the row, planned or not (the evaluator's number, already capped)
//     done / inProgress / planned   the same hours by when they happen: prior credit and past terms, the current term,
//             later terms. They add up to `earned`.
//     state   'done'         the minimum is met by hours already earned
//             'in_progress'  met once the current term's courses are passed
//             'planned'      met only if the planned courses are taken ("covered by your plan", not done)
//             'open'         still short
//             'risk'         legacy only: the open GEN_ED seats cannot cover what is still needed
//             'exempt'       Flight Foundations only: the catalog excuses the student's major from the category
//
// Done, in progress and planned come from running the evaluator three times over growing sets of the plan (earned, plus the
// current term, plus everything). A slot left out of a pass is passed in as archived, which only skips its course: the hours a
// Flight Foundations plan commits to a category still come from every slot (getPlanMinimums), so the ranges do not move.
// `semesterPhase` is { [semNum]: 'past' | 'current' | 'future' } (lib/termPhase.js); without it every course is ahead.

import { getGenEdStatus } from './poolResolver.js'
import { getFlightFoundationsStatus, FF_PROGRAM_CODE } from './flightFoundations.js'
import { phaseOfSemester } from './termPhase.js'

// Pool codes that make a plan a gen-ed plan: the legacy GEN_ED pool and the Flight Foundations ones.
const GEN_ED_POOL_CODES = new Set(['GEN_ED', 'FF_SOCIAL', 'FF_HUMANITIES', 'FF_LITERACY'])

export function hasGenEdSlots(slots) {
  return (slots ?? []).some(s => s?.is_pool && GEN_ED_POOL_CODES.has(s.class_code))
}

// The three passes: which phases of the plan each one counts.
const PASSES = [
  new Set(['past']),
  new Set(['past', 'current']),
  new Set(['past', 'current', 'future']),
]

function inputsForPass({ phases, slots, planArchived, planSemesterOverrides, freeAddSlots, semesterPhase }) {
  const skipped = { ...planArchived }
  for (const slot of slots) {
    if (skipped[slot.id]) continue
    const sem = planSemesterOverrides?.[slot.id] ?? slot.semester_number
    if (!phases.has(phaseOfSemester(semesterPhase, sem))) skipped[slot.id] = 'not_yet'
  }
  const freeAdds = (freeAddSlots ?? []).filter(fa => phases.has(phaseOfSemester(semesterPhase, fa.semester_number)))
  return { planArchived: skipped, freeAddSlots: freeAdds }
}

const RANK = { exempt: 0, done: 0, in_progress: 1, planned: 2, open: 3, risk: 4 }

// 'done' | 'in_progress' | 'planned' | 'open', from what each pass reaches against the minimum.
function stateOf(min, [afterPast, afterCurrent, afterAll]) {
  if (afterPast >= min) return 'done'
  if (afterCurrent >= min) return 'in_progress'
  return afterAll >= min ? 'planned' : 'open'
}

export function buildGenEdPanel({
  genedProgram, planSlots = {}, priorCredits = [], slots = [], courses = {}, freeAddSlots = [], planArchived = {},
  planSemesterOverrides = {}, semesterPhase = {}, exempt = [],
}) {
  if (!hasGenEdSlots(slots)) return null

  const passes = PASSES.map(phases => inputsForPass({
    phases, slots, planArchived, planSemesterOverrides, freeAddSlots, semesterPhase,
  }))
  const split = ([a, b, c]) => ({ done: a, inProgress: Math.max(0, b - a), planned: Math.max(0, c - b) })
  // The panel is as far along as its least advanced row, and open while hours it needs are still unplaced.
  const stateOfPanel = (rows, covered) => {
    const worst = rows.reduce((w, r) => (RANK[r.state] > RANK[w] ? r.state : w), 'done')
    return covered || worst === 'risk' ? worst : 'open'
  }

  if (genedProgram === FF_PROGRAM_CODE) {
    const statuses = passes.map(p =>
      getFlightFoundationsStatus(planSlots, priorCredits, slots, courses, p.freeAddSlots, p.planArchived, { exempt }))
    const all = statuses[2]
    const rows = all.categories.map((c, i) => {
      const hours = statuses.map(s => s.categories[i].filled)
      return {
        key:    c.category,
        label:  c.label,
        group:  c.group ?? null,
        earned: c.filled,
        ...split(hours),
        min:    c.required,
        max:    Math.max(c.max ?? c.required, c.required),
        exempt: !!c.exempt,
        state:  c.exempt ? 'exempt' : stateOf(c.required, hours),
      }
    })
    const totals = statuses.map(s => s.totalEarned)
    return {
      program:   FF_PROGRAM_CODE,
      title:     'Flight Foundations',
      earned:    all.totalEarned,
      ...split(totals),
      required:  all.totalRequired,
      state:     stateOfPanel(rows, all.satisfied),
      satisfied: all.satisfied,
      flexNote:  all.flex && all.flex.total > 0 ? `${all.flex.used} of ${all.flex.total} flexible hours placed` : null,
      exemptions: all.categories.filter(c => c.exempt).map(c => ({ key: c.category, label: c.label, hours: c.catalogMin })),
      rows,
    }
  }

  // Legacy: three fixed categories of 6 hours. Hours come from each pass; "at risk" needs every open seat, so it is read
  // from the full pass only.
  const statuses = passes.map(p => getGenEdStatus(planSlots, slots, courses, priorCredits, p.planArchived))
  const full = getGenEdStatus(planSlots, slots, courses, priorCredits, planArchived)
  const rows = full.map((c, i) => {
    const hours = statuses.map(s => Math.min(s[i].filled, c.required))
    const state = stateOf(c.required, hours)
    return {
      key:    c.category,
      label:  c.label,
      group:  null,
      earned: Math.min(c.filled, c.required),
      ...split(hours),
      min:    c.required,
      max:    c.required,
      state:  state === 'open' && c.atRisk ? 'risk' : state,
    }
  })
  const required = rows.reduce((sum, r) => sum + r.min, 0)
  const totals = [0, 1, 2].map(i => rows.reduce((sum, r) => sum + r.done + (i > 0 ? r.inProgress : 0) + (i > 1 ? r.planned : 0), 0))
  return {
    program:   'legacy',
    title:     'General education',
    earned:    totals[2],
    ...split(totals),
    required,
    state:     stateOfPanel(rows, totals[2] >= required),
    satisfied: rows.every(r => r.min <= r.earned),
    flexNote:  null,
    exemptions: [],
    rows,
  }
}

// "6" for a fixed row, "6–9" for a range.
export function formatRange(row) {
  return row.max > row.min ? `${row.min}–${row.max}` : String(row.min)
}
