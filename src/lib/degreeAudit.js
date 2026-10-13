// degreeAudit.js
//
// The model behind the Requirements tab: the plan read as a degree audit. Pure: nothing here reads the
// database, the clock or React, so every case is a unit test.
//
//   buildDegreeAudit({ slots, planSlots, planArchived, planSemesterOverrides, freeAddSlots, priorCredits,
//                      courses, totalHours, semesterLabels, semesterPhase, genedProgram })
//     -> { summary, blocks }
//
// Every requirement is in one of four states, all derived from the calendar (lib/termPhase.js), never marked:
//   'done'         covered by prior credit, or placed in a past term
//   'in_progress'  placed in the current term
//   'planned'      placed in a later term
//   'not_placed'   a choice with no course picked yet (or Free Elective hours still open)
//
// A slot that can be removed from the grid is not a requirement, and a slot that cannot be (a fixed course) is: a fixed
// slot reads "Required" and a pool slot "Choose 1 of N". Blocks are derived from the slot's type, because the degree
// specs carry no group names:
//   gened     the general-education pools (GEN_ED, FF_SOCIAL, FF_HUMANITIES, FF_LITERACY), with the category progress
//   required  every fixed course
//   choices   every other pool (science sequence, CSC electives, ...)
//   free      Free Elective hours
//
// A row's `key` is what the plan view selects: the slot id, or `rem_<slotId>` for the open hours of a Free Elective.
// `semNum` is where the slot sits now (a drag override wins over the template); null for a row not on the grid.
//
// Hours use the same rules as computePlanCredits (a course counts once; prior credit first), so the summary and the
// plan header cannot disagree: `summary.done` equals splitCreditsByPhase(...).completed.

import { computePlanCredits, resolveTransferDetails } from './transferCredits.js'
import { POOL_LABELS, POOL_COURSES, POOL_CREDIT_ESTIMATES } from './poolResolver.js'
import { getPoolRemainder, isRemainderPool } from './poolRemainder.js'
import { buildGenEdPanel } from './genEdPanel.js'

const GEN_ED_POOL_CODES = new Set(['GEN_ED', 'FF_SOCIAL', 'FF_HUMANITIES', 'FF_LITERACY'])

export const CREDIT_TYPE_LABELS = {
  ap_credit:       'AP',
  transfer_credit: 'Transfer',
  test_out:        'CLEP',
  ib_credit:       'IB',
  act_placement:   'ACT',
  act_credit:      'ACT',
  cambridge:       'Cambridge',
}

const PHASE_STATE = { past: 'done', current: 'in_progress', future: 'planned' }

const BLOCK_TITLES = {
  gened:    'General education',
  required: 'Required courses',
  choices:  'Choose from a list',
  free:     'Free electives',
}
const BLOCK_ORDER = ['required', 'gened', 'choices', 'free']

export function blockOf(slot) {
  if (!slot.is_pool) return 'required'
  if (slot.class_code === 'FREE_ELECTIVE') return 'free'
  return GEN_ED_POOL_CODES.has(slot.class_code) ? 'gened' : 'choices'
}

// A state for a placed course, from the semester it sits in. A course with no semester is ahead, never assumed passed.
function stateOfSemester(semNum, semesterPhase) {
  return PHASE_STATE[semesterPhase?.[semNum]] ?? 'planned'
}

function emptyCounts() {
  return { done: 0, in_progress: 0, planned: 0, not_placed: 0 }
}

export function buildDegreeAudit({
  slots = [], planSlots = {}, planArchived = {}, planSemesterOverrides = {}, freeAddSlots = [], priorCredits = [],
  courses = {}, totalHours = 0, semesterLabels = {}, semesterPhase = {}, genedProgram = 'legacy',
} = {}) {
  const details = resolveTransferDetails(priorCredits, planSlots, slots)
  const rowsByBlock = { gened: [], required: [], choices: [], free: [] }

  for (const slot of slots) {
    const archived = planArchived?.[slot.id]
    // Not part of this student's degree (the math chain below their placement): not a requirement.
    if (archived === 'not_applicable') continue

    const block = blockOf(slot)
    const semNum = archived ? null : (planSemesterOverrides?.[slot.id] ?? slot.semester_number ?? null)
    const picked = slot.is_pool ? planSlots?.[slot.id] : null
    const code = slot.is_pool ? picked : slot.class_code
    const poolLabel = POOL_LABELS[slot.class_code] ?? slot.class_code
    const poolSize = slot.is_pool ? POOL_COURSES[slot.class_code]?.length ?? null : null

    const row = {
      key:       slot.id,
      slotId:    slot.id,
      block,
      required:  !slot.is_pool,
      code:      code ?? null,
      name:      code ? (courses[code]?.name ?? null) : null,
      label:     code ?? poolLabel,
      poolLabel: slot.is_pool ? poolLabel : null,
      choose:    slot.is_pool && !code && poolSize ? `Choose 1 of ${poolSize}` : null,
      hours:     courses[code]?.credits ?? (slot.is_pool ? (slot.flex_credits ?? POOL_CREDIT_ESTIMATES[slot.class_code] ?? 3) : 0),
      semNum,
      term:      semNum != null ? (semesterLabels[semNum] ?? null) : null,
      source:    'plan',
      sourceLabel: null,
      state:     'not_placed',
    }

    if (archived) {
      // Covered by prior credit (or a future Banner import): done, and off the grid.
      row.state = 'done'
      row.source = 'prior_credit'
      row.sourceLabel = CREDIT_TYPE_LABELS[details[slot.id]?.creditType] ?? null
    } else if (code) {
      row.state = stateOfSemester(semNum, semesterPhase)
    }
    rowsByBlock[block].push(row)

    // The open hours of a Free Elective bucket after a pick (the row the plan shows as `rem_<id>`).
    if (!archived && isRemainderPool(slot) && planSlots?.[slot.id]) {
      const open = getPoolRemainder(slot, planSlots, courses, freeAddSlots)
      if (open > 0) {
        rowsByBlock.free.push({
          key: `rem_${slot.id}`, slotId: slot.id, block: 'free', required: false, code: null, name: null,
          label: poolLabel, poolLabel, choose: null, hours: open, semNum, term: row.term,
          source: 'plan', sourceLabel: null, state: 'not_placed',
        })
      }
    }
  }

  const blocks = BLOCK_ORDER
    .map(id => {
      const rows = rowsByBlock[id]
      const panel = id === 'gened'
        ? buildGenEdPanel({ genedProgram, planSlots, priorCredits, slots, courses, freeAddSlots, planArchived, planSemesterOverrides, semesterPhase })
        : null
      if (rows.length === 0 && !panel) return null
      const counts = emptyCounts()
      for (const r of rows) counts[r.state]++
      return { id, title: BLOCK_TITLES[id], rows, counts, total: rows.length, complete: rows.length > 0 && counts.done === rows.length, panel }
    })
    .filter(Boolean)

  return { summary: summarizeHours({ slots, planSlots, planArchived, planSemesterOverrides, freeAddSlots, priorCredits, courses, totalHours, semesterPhase }), blocks }
}

// Hours by state. Same pass order as computePlanCredits (prior credit, plan slots, free adds; a course once), over the
// slots still on the grid, as the plan header counts them.
function summarizeHours({ slots, planSlots, planArchived, planSemesterOverrides, freeAddSlots, priorCredits, courses, totalHours, semesterPhase }) {
  const active = slots.filter(s => !planArchived?.[s.id])
  const { breakdown } = computePlanCredits(planSlots, priorCredits, active, courses, freeAddSlots)
  const slotById = new Map(active.map(s => [s.id, s]))
  const faById = new Map((freeAddSlots ?? []).map(f => [f.id, f]))
  const semOf = item => item.slotId != null
    ? (planSemesterOverrides?.[item.slotId] ?? slotById.get(item.slotId)?.semester_number)
    : faById.get(item.freeAddId)?.semester_number

  const hours = { done: 0, in_progress: 0, planned: 0 }
  for (const item of breakdown) {
    const state = item.source === 'transfer' ? 'done' : stateOfSemester(semOf(item), semesterPhase)
    hours[state] += item.credits
  }
  const placed = hours.done + hours.in_progress + hours.planned
  const total = totalHours > 0 ? totalHours : placed
  const pct = n => (total > 0 ? (n / total) * 100 : 0)
  // Bars stack left to right and never run past 100%, even when the plan holds more hours than the degree needs.
  const donePct = Math.min(100, pct(hours.done))
  const inProgressPct = Math.min(pct(hours.in_progress), 100 - donePct)
  const plannedPct = Math.min(pct(hours.planned), 100 - donePct - inProgressPct)
  return {
    total,
    done:        hours.done,
    inProgress:  hours.in_progress,
    planned:     hours.planned,
    remaining:   Math.max(0, total - placed),
    donePct,
    inProgressPct,
    plannedPct,
  }
}
