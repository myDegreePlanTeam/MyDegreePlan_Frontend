// degreeAudit.js
//
// The model behind the Requirements tab: the plan read as a degree audit. Pure: nothing here reads the
// database, the clock or React, so every case is a unit test.
//
//   buildDegreeAudit({ slots, planSlots, planArchived, planSemesterOverrides, freeAddSlots, priorCredits,
//                      courses, totalHours, semesterLabels, semesterPhase, genedProgram, majorLabel, genedExempt,
//                      programs, programsOf })
//     -> { summary, blocks }
//
// A student who follows more than one program (a secondary major, a minor) passes `programs` ([{ programId, name, role }], the primary first)
// and `programsOf` ({ [slotId]: programId[] }, from lib/programMerge.js). The major block then becomes one block per program (`major` for the
// primary, `major:<programId>` for the others) while general education and electives stay one block each: a course is homed once, in the block
// of the program that owns its card (the first program that asks for it), and the other programs it serves list it as a reference
// ("Counted from <program>") instead of a second row, so nothing is counted or fixed from two places. A program's own subject (the one most of
// its own courses carry) decides which of its courses with a general-education category stay in its block.
//
// Every requirement is in one of four states, all derived from the calendar (lib/termPhase.js), never marked:
//   'done'         covered by prior credit, or placed in a past term
//   'in_progress'  placed in the current term
//   'planned'      placed in a later term
//   'not_placed'   a choice with no course picked yet (or Free Elective hours still open)
//
// A slot that can be removed from the grid is not a requirement, and a slot that cannot be (a fixed course) is: a fixed
// slot reads "Required" and a pool slot "Choose 1 of N".
//
// Each slot has ONE home, so nothing is listed twice and nothing can be fixed from two places:
//   major      the department's own courses, and required choices the plan does not file under general education
//   gened      a course or pool that counts toward a general-education category, grouped by category
//   electives  elective pools (CSC Elective, ...) and Free Elective hours
// A course that is homed in the major but also counts toward a category (CSC2570 and Digital Literacy) stays in the
// major; its category shows a reference to it (`refs`) and no second row.
//
// Homes are derived (homeOf): the specs carry no group names. The rule, in order:
//   a pool whose members all fall in one gen-ed category (SCIENCE, COMM_REQ), or a GEN_ED / FF_* pool    -> gened
//   FREE_ELECTIVE, and any pool named *ELECTIVE(S), *EMPHASIS or EL_*                                  -> electives
//   any other pool (a required choice: Statistics, OR_..., ME_DESIGN)                                    -> major
//   a fixed course with a gen-ed category and a subject other than the plan's own                        -> gened
//   any other fixed course                                                                                -> major
// The plan's own subject is the one most of its fixed, non-gen-ed courses carry (CSC for Computer Science, ME for
// Mechanical Engineering).
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
import { buildEvidence } from './auditEvidence.js'
import { FF_PROGRAM_CODE, FF_CATEGORIES, FF_POOL_CATEGORIES, getFlightFoundationsCategory } from './flightFoundations.js'

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

const GEN_ED_POOLS = new Set(['GEN_ED', 'ENG_LIT', 'FF_SOCIAL', 'FF_HUMANITIES', 'FF_LITERACY'])
const ELECTIVE_POOL = /(^|_)(ELECTIVES?|EMPHASIS)(_\d+)?$|^EL_/

const CATEGORY_LABELS = Object.fromEntries(FF_CATEGORIES.map(c => [c.code, c.label]))

const subjectOf = code => /^[A-Z]+/.exec(code ?? '')?.[0] ?? ''

// The subject most of the plan's fixed, non-gen-ed courses carry. Ties go to the alphabetically first.
export function ownSubject(slots) {
  const counts = new Map()
  for (const s of slots ?? []) {
    if (s.is_pool || getFlightFoundationsCategory(s.class_code)) continue
    const subject = subjectOf(s.class_code)
    if (subject) counts.set(subject, (counts.get(subject) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
}

// The one gen-ed category every member of a pool falls in, or null.
function poolCategory(code) {
  if (FF_POOL_CATEGORIES[code]) return FF_POOL_CATEGORIES[code]
  const members = POOL_COURSES[code]
  if (!Array.isArray(members) || members.length === 0) return null
  const categories = new Set(members.map(getFlightFoundationsCategory))
  return categories.size === 1 && !categories.has(null) ? [...categories][0] : null
}

/**
 * Where a slot lives in the audit.
 * @returns {{ block: 'major'|'gened'|'electives', category: string|null, alsoCounts: string|null }}
 *   category    the gen-ed category the slot counts toward (a gen-ed home), else null
 *   alsoCounts  a major course that also counts toward a category (it stays in the major)
 */
export function homeOf(slot, subject) {
  const code = slot.class_code
  if (slot.is_pool) {
    if (code === 'FREE_ELECTIVE') return { block: 'electives', category: null, alsoCounts: null }
    const category = poolCategory(code)
    if (GEN_ED_POOLS.has(code) || category) return { block: 'gened', category, alsoCounts: null }
    if (code.startsWith('FF_')) return { block: 'gened', category: null, alsoCounts: null }
    if (ELECTIVE_POOL.test(code)) return { block: 'electives', category: null, alsoCounts: null }
    return { block: 'major', category: null, alsoCounts: null }
  }
  const category = getFlightFoundationsCategory(code)
  if (!category) return { block: 'major', category: null, alsoCounts: null }
  if (subjectOf(code) === subject) return { block: 'major', category: null, alsoCounts: category }
  return { block: 'gened', category, alsoCounts: null }
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
  courses = {}, totalHours = 0, semesterLabels = {}, semesterPhase = {}, genedProgram = 'legacy', majorLabel = null, genedExempt = [],
  programs = [], programsOf = {},
} = {}) {
  const details = resolveTransferDetails(priorCredits, planSlots, slots)
  const subject = ownSubject(slots)
  const multi = programs.length > 1
  const ownerOf = slot => programsOf[slot.id]?.[0] ?? programs[0]?.programId ?? null
  // Each program's own subject, from the slots it owns (the merged list's subject would be the primary's for everyone)
  const subjectOfProgram = multi
    ? Object.fromEntries(programs.map(p => [p.programId, ownSubject(slots.filter(s => ownerOf(s) === p.programId))]))
    : {}
  const isFF = genedProgram === FF_PROGRAM_CODE
  const rows = []

  for (const slot of slots) {
    const archived = planArchived?.[slot.id]
    // Not part of this student's degree (the math chain below their placement): not a requirement.
    if (archived === 'not_applicable') continue

    const owner = multi ? ownerOf(slot) : null
    const home = homeOf(slot, multi ? (subjectOfProgram[owner] ?? subject) : subject)
    const semNum = archived ? null : (planSemesterOverrides?.[slot.id] ?? slot.semester_number ?? null)
    const picked = slot.is_pool ? planSlots?.[slot.id] : null
    const code = slot.is_pool ? picked : slot.class_code
    const poolLabel = POOL_LABELS[slot.class_code] ?? slot.class_code
    const poolSize = slot.is_pool ? POOL_COURSES[slot.class_code]?.length ?? null : null

    const row = {
      key:          slot.id,
      slotId:       slot.id,
      block:        home.block,
      // the program that owns this card and every program it serves (null for a student with one program)
      programId:    owner,
      programIds:   multi ? (programsOf[slot.id] ?? [owner]) : null,
      category:     isFF ? home.category : null,
      poolCode:     slot.is_pool ? slot.class_code : null,
      required:     !slot.is_pool,
      code:         code ?? null,
      name:         code ? (courses[code]?.name ?? null) : null,
      label:        code ?? poolLabel,
      poolLabel:    slot.is_pool ? poolLabel : null,
      choose:       slot.is_pool && !code && poolSize ? `Choose 1 of ${poolSize}` : null,
      optionCount:  poolSize,
      alsoCounts:   isFF && home.alsoCounts ? CATEGORY_LABELS[home.alsoCounts] ?? null : null,
      hours:        courses[code]?.credits ?? (slot.is_pool ? (slot.flex_credits ?? POOL_CREDIT_ESTIMATES[slot.class_code] ?? 3) : 0),
      semNum,
      term:         semNum != null ? (semesterLabels[semNum] ?? null) : null,
      source:       'plan',
      sourceLabel:  null,
      state:        'not_placed',
    }

    if (archived) {
      // Covered by prior credit (or a future Banner import): done, and off the grid. The row names the credit's own course and note,
      // since a pool slot has no course of its own.
      const credit = priorCredits.find(pc => pc.id === details[slot.id]?.priorCreditId)
      row.state = 'done'
      row.source = 'prior_credit'
      row.sourceLabel = CREDIT_TYPE_LABELS[details[slot.id]?.creditType] ?? null
      row.sourceNote = credit?.note ?? null
      if (slot.is_pool && credit?.satisfies_course_code) {
        row.code = credit.satisfies_course_code
        row.name = courses[row.code]?.name ?? null
        row.label = row.code
        row.choose = null
        row.hours = credit.credits_awarded ?? row.hours
      }
    } else if (code) {
      row.state = stateOfSemester(semNum, semesterPhase)
    }
    rows.push(row)

    // The open hours of a Free Elective bucket after a pick (the row the plan shows as `rem_<id>`).
    if (!archived && isRemainderPool(slot) && planSlots?.[slot.id]) {
      const open = getPoolRemainder(slot, planSlots, courses, freeAddSlots)
      if (open > 0) {
        rows.push({
          ...row, key: `rem_${slot.id}`, code: null, name: null, label: poolLabel, choose: null, optionCount: null, required: false,
          alsoCounts: null, hours: open, source: 'plan', sourceLabel: null, state: 'not_placed',
        })
      }
    }
  }

  const panel = buildGenEdPanel({
    genedProgram, planSlots, priorCredits, slots, courses, freeAddSlots, planArchived, planSemesterOverrides, semesterPhase,
    exempt: genedExempt,
  })

  const evidence = buildEvidence({
    rows, panel, isFF, priorCredits, freeAddSlots, courses, details, semesterLabels, semesterPhase, creditTypeLabels: CREDIT_TYPE_LABELS,
  })

  const nameOfProgram = Object.fromEntries(programs.map(p => [p.programId, p.name]))
  // The courses another program owns that this one also needs: listed in its block as a reference, not a second row
  const sharedRefs = programId => rows
    .filter(r => r.code && r.programId !== programId && r.programIds?.includes(programId))
    .map(r => ({
      key: r.key, kind: r.block, label: `Counted from ${nameOfProgram[r.programId] ?? 'your other program'}`, code: r.code, name: r.name,
      hours: r.hours, term: r.term, semNum: r.semNum, state: r.state, source: r.source, sourceLabel: r.sourceLabel, note: r.sourceNote ?? null,
    }))
  const majorBlocks = multi
    ? programs.map((p, i) => makeBlock(
      i === 0 ? 'major' : `major:${p.programId}`, `${(i === 0 && majorLabel) || p.name} (${i === 0 ? 'primary major' : p.role === 'minor' ? 'minor' : 'secondary major'})`, rows, panel, isFF, evidence,
      { kind: 'major', match: r => r.block === 'major' && r.programId === p.programId, refs: sharedRefs(p.programId) },
    ))
    : [makeBlock('major', majorLabel || 'Your major', rows, panel, isFF, evidence)]
  const blocks = [
    ...majorBlocks,
    makeBlock('gened',     'General education',        rows, panel, isFF, evidence),
    makeBlock('electives', 'Electives',                rows, panel, isFF, evidence),
  ].filter(Boolean)

  return {
    summary: {
      // What the Plan tab's header already shows (hours by state), kept as one line of context.
      ...summarizeHours({ slots, planSlots, planArchived, planSemesterOverrides, freeAddSlots, priorCredits, courses, totalHours, semesterPhase }),
      // What only this tab can say: how many requirements are done, under way, planned, or still to choose.
      requirements: countRows(rows),
    },
    blocks,
    // Hours that count toward the total but not toward a requirement, and why (lib/auditEvidence.js).
    notCounted: evidence.notCounted,
  }
}

function countRows(rows) {
  const counts = emptyCounts()
  for (const r of rows) counts[r.state]++
  return counts
}

// `kind` is which of the three homes the block is (its id, for the primary or a student with one program); `match` picks its rows (a block
// of one program among several); `refs` are courses counted from another program, listed after the block's own groups.
function makeBlock(id, title, allRows, panel, isFF, evidence, { kind = id, match = r => r.block === kind, refs = [] } = {}) {
  const rows = allRows.filter(match)
  const groups = kind === 'major' ? majorGroups(rows) : kind === 'gened' ? genEdGroups(rows, panel, isFF, evidence) : electiveGroups(rows, evidence)
  if (kind === 'major' && refs.length) groups.push({ id: 'shared', title: 'Counted from your other major or minor', rows: [], progress: null, refs })
  if (groups.length === 0) return null
  const counts = countRows(rows)
  return {
    id, title, rows, groups, counts, total: rows.length,
    complete: rows.length > 0 && counts.done === rows.length,
    // The gen-ed block carries its program summary (title, hours covered, state); the other blocks have none.
    panel: kind === 'gened' ? panel : null,
  }
}

function majorGroups(rows) {
  const core = rows.filter(r => r.required)
  const choices = rows.filter(r => !r.required)
  const groups = []
  if (core.length) groups.push({ id: 'core', title: 'Required courses', rows: core, progress: null, refs: [] })
  for (const code of [...new Set(choices.map(r => r.poolCode))]) {
    const own = choices.filter(r => r.poolCode === code)
    groups.push({ id: `choice:${code}`, title: own[0].poolLabel, rows: own, progress: null, refs: [] })
  }
  return groups
}

function electiveGroups(rows, evidence) {
  const codes = [...new Set(rows.map(r => r.poolCode))]
  // Free Elective hours last; the department's own electives first.
  codes.sort((a, b) => (a === 'FREE_ELECTIVE') - (b === 'FREE_ELECTIVE'))
  return codes.map(code => {
    const own = rows.filter(r => r.poolCode === code)
    // The courses spending a Free Elective's hours are not rows (the bucket is one slot), so they are listed under it.
    const refs = code === 'FREE_ELECTIVE' ? evidence.freeRefs : []
    return { id: `elective:${code}`, title: code === 'FREE_ELECTIVE' ? 'Free electives' : own[0].poolLabel, rows: own, progress: null, refs, note: null }
  })
}

// A Flight Foundations plan is grouped by category, every category shown whether or not it has a slot of its own (it may be
// met by a major course). A legacy plan has three category rows of hours and one list of picks.
function genEdGroups(rows, panel, isFF, evidence) {
  // No gen-ed pool in the plan (so no program summary): the courses that count toward a category are still listed.
  if (!panel) return rows.length ? [{ id: 'picks', title: 'General education courses', progress: null, rows, refs: [] }] : []
  if (isFF) {
    const groups = panel.rows.map(p => ({
      id: p.key, title: p.label, progress: p, rows: rows.filter(r => r.category === p.key),
      refs: evidence.categoryRefs[p.key] ?? [], note: evidence.categoryNotes[p.key] ?? null,
    }))
    const other = rows.filter(r => !r.category)
    if (other.length) groups.push({ id: 'other', title: 'Other general education', progress: null, rows: other, refs: [] })
    return groups
  }
  const groups = panel.rows.map(p => ({ id: p.key, title: p.label, progress: p, rows: [], refs: [] }))
  if (rows.length) groups.push({ id: 'picks', title: 'Your general-education courses', progress: null, rows, refs: [] })
  return groups
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
