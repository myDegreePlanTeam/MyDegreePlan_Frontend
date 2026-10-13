// auditEvidence.js
//
// What counted, and what did not, for the Requirements tab. Pure: it reads the rows buildDegreeAudit already made, the gen-ed
// panel, the prior credits and the added courses, and answers two questions a student asks of any audit:
//
//   "Where do the hours in this category come from?"   -> categoryRefs: a course that counts toward a gen-ed category but is not
//        one of that category's own rows (an elective pick, an added course, prior credit) is listed under it, so a category's hours
//        can always be traced to a course. Also freeRefs: the courses spending a Free Elective's hours.
//   "What did not count toward a requirement?"          -> notCounted: hours above a category's limit, introductory language over
//        its cap, hours in a category the major is exempt from, a course counted once already, a course that fills no listed
//        requirement (it still counts toward the total hours), and a placement score that awarded none.
//
// A course counts once, toward one requirement (a slot model, unlike a degree audit that displays one course under several
// requirements and counts it for one). That is why every course appears in exactly one place: as a row, as a reference to the
// row that holds it, or in notCounted.
//
// The evidence for a Flight Foundations plan comes from the evaluator's own course lists, so it cannot disagree with the hours.
// A legacy plan's evaluator keeps no course lists, so its categories carry no references, and a prior credit that counts toward a
// legacy History / Humanities / Social total is not reported as unused.

import { summarizePriorCredits } from './transferCredits.js'
import { GEN_ED_CATEGORIES } from './poolResolver.js'
import { FF_INTRO_LANGUAGE_CAP } from './flightFoundations.js'

const PHASE_STATE = { past: 'done', current: 'in_progress', future: 'planned' }
const KIND_ORDER = ['over_cap', 'language_cap', 'exempt', 'duplicate', 'extra', 'placement']
const LEGACY_GEN_ED_CODES = new Set(Object.values(GEN_ED_CATEGORIES).flat())

const REF_LABELS = {
  major:     'Counted from your major',
  electives: 'Counted from your electives',
  gened:     'Counted from another general-education row',
  added:     'Counted from a course you added',
  prior:     'Counted from prior credit',
}

const stateAt = (semNum, semesterPhase) => PHASE_STATE[semesterPhase?.[semNum]] ?? 'planned'

/**
 * @param {object} input
 * @param {Array}  input.rows            the audit's slot rows (degreeAudit.js)
 * @param {object|null} input.panel      buildGenEdPanel's result, or null
 * @param {boolean} input.isFF           a Flight Foundations plan (the only one whose evaluator lists courses)
 * @param {Array}  input.priorCredits
 * @param {Array}  input.freeAddSlots
 * @param {object} input.courses         { [code]: { name, credits } }
 * @param {object} input.details         resolveTransferDetails(...): { [slotId]: { creditType, priorCreditId } }
 * @param {object} input.semesterLabels, input.semesterPhase, input.creditTypeLabels
 * @returns {{ categoryRefs: Object, categoryNotes: Object, freeRefs: Array, notCounted: Array }}
 */
export function buildEvidence({
  rows, panel, isFF, priorCredits = [], freeAddSlots = [], courses = {}, details = {},
  semesterLabels = {}, semesterPhase = {}, creditTypeLabels = {},
}) {
  const nameOf = code => courses[code]?.name ?? null
  const pcById = new Map(priorCredits.map(pc => [pc.id, pc]))
  const faById = new Map(freeAddSlots.map(fa => [fa.id, fa]))
  const usedPrior = new Set(Object.values(details).map(d => d.priorCreditId))
  const slotRows = rows.filter(r => !String(r.key).startsWith('rem_'))

  const priorRef = (pc, kind) => ({
    key: null, kind, label: REF_LABELS[kind], code: pc.satisfies_course_code, name: nameOf(pc.satisfies_course_code),
    hours: pc.credits_awarded ?? 0, term: null, semNum: null, state: 'done',
    source: 'prior_credit', sourceLabel: creditTypeLabels[pc.credit_type] ?? null, note: pc.note ?? null,
  })
  const addedRef = (fa, kind) => ({
    key: `fa_${fa.id}`, kind, label: REF_LABELS[kind], code: fa.course_code, name: nameOf(fa.course_code),
    hours: courses[fa.course_code]?.credits ?? 0, term: semesterLabels[fa.semester_number] ?? null, semNum: fa.semester_number ?? null,
    state: stateAt(fa.semester_number, semesterPhase), source: 'plan', sourceLabel: null, note: null,
  })
  const slotRef = (row, code) => {
    const kind = row.block === 'major' ? 'major' : row.block === 'electives' ? 'electives' : 'gened'
    return {
      key: row.key, kind, label: REF_LABELS[kind], code, name: nameOf(code), hours: courses[code]?.credits ?? row.hours,
      term: row.term, semNum: row.semNum, state: row.state, source: row.source, sourceLabel: row.sourceLabel, note: row.sourceNote ?? null,
    }
  }

  // ── Where each category's hours come from ──────────────────────────────────
  const categoryRefs = {}
  const categoryNotes = {}
  const countedPrior = new Set()
  const countedAdded = new Set()

  if (isFF && panel) {
    for (const p of panel.rows) {
      const refs = []
      for (const c of p.courses ?? []) {
        if (c.source === 'prior_credit') countedPrior.add(c.ref)
        if (c.source === 'free_add') countedAdded.add(c.ref)
        // already a row of this category's own group: nothing to point at
        if (rows.some(r => r.category === p.key && r.code === c.code)) continue

        if (c.source === 'prior_credit' && pcById.has(c.ref)) refs.push(priorRef(pcById.get(c.ref), 'prior'))
        else if (c.source === 'free_add' && faById.has(c.ref)) refs.push(addedRef(faById.get(c.ref), 'added'))
        else if (c.source === 'plan') {
          const row = slotRows.find(r => r.slotId === c.ref)
          if (row) refs.push(slotRef(row, c.code))
        }
      }
      categoryRefs[p.key] = refs
      const capExcess = p.excess - (p.key === 'HUM' ? panel.languageExcess ?? 0 : 0)
      if (!p.exempt && capExcess > 0) {
        categoryNotes[p.key] = `${capExcess} hrs above this category's limit count toward your degree total, not toward the category.`
      }
    }
  }

  // ── Free Elective hours spent by follow-up picks ───────────────────────────
  const freeRefs = freeAddSlots.filter(fa => fa.fills_slot_id != null).map(fa => addedRef(fa, 'added'))

  // ── What did not count toward a requirement ────────────────────────────────
  const notCounted = []

  if (isFF && panel) {
    for (const p of panel.rows) {
      const capExcess = p.excess - (p.key === 'HUM' ? panel.languageExcess ?? 0 : 0)
      if (p.exempt && p.excess > 0) {
        notCounted.push({
          kind: 'exempt', key: null, code: null, name: p.label, hours: p.excess, term: null, semNum: null,
          reason: `Your major is exempt from ${p.label}, so these hours count toward your degree total, not toward Flight Foundations.`,
        })
      } else if (capExcess > 0) {
        notCounted.push({
          kind: 'over_cap', key: null, code: null, name: p.label, hours: capExcess, term: null, semNum: null,
          reason: `Above the ${p.max}-hour limit. They count toward your degree total, not toward ${p.label}.`,
        })
      }
    }
    if ((panel.languageExcess ?? 0) > 0) {
      notCounted.push({
        kind: 'language_cap', key: null, code: null, name: 'Introductory language', hours: panel.languageExcess, term: null, semNum: null,
        reason: `Only ${FF_INTRO_LANGUAGE_CAP} hours of introductory language count toward Humanities and Cultural Expression. The rest count toward your degree total only.`,
      })
    }
  }

  // The courses already held, in the order computePlanCredits counts them: prior credit, then the plan, then added courses.
  const held = new Set()
  for (const pc of priorCredits) if ((pc.credits_awarded ?? 0) > 0 && pc.satisfies_course_code) held.add(pc.satisfies_course_code)
  const onPlan = new Set(slotRows.filter(r => r.code && r.source !== 'prior_credit').map(r => r.code))
  for (const code of onPlan) held.add(code)
  const { duplicateOf } = summarizePriorCredits(priorCredits)

  for (const pc of priorCredits) {
    if (usedPrior.has(pc.id) || countedPrior.has(pc.id)) continue
    const code = pc.satisfies_course_code
    const hours = pc.credits_awarded ?? 0
    const base = { key: null, code, name: code ? nameOf(code) : (pc.note ?? 'Prior credit'), hours, term: null, semNum: null }
    if (hours <= 0 || !code) {
      notCounted.push({ ...base, kind: 'placement', reason: `Placed you ${code ? 'into this course' : 'in a course'}${pc.note ? ` (${pc.note})` : ''}. It awards no hours.` })
    } else if (duplicateOf[pc.id] || onPlan.has(code)) {
      notCounted.push({ ...base, kind: 'duplicate', reason: 'This course is already counted once, so it adds no hours here. A course counts once.' })
    } else if (!isFF && LEGACY_GEN_ED_CODES.has(code)) {
      continue   // counts toward a legacy History / Humanities / Social total, which keeps no course list to point at
    } else {
      notCounted.push({ ...base, kind: 'extra', reason: 'Counts toward your total hours. It does not fill a listed requirement.' })
    }
  }

  const seenAdded = new Set()
  for (const fa of freeAddSlots) {
    const code = fa.course_code
    const duplicate = held.has(code) || seenAdded.has(code)
    seenAdded.add(code)
    if (fa.fills_slot_id != null || countedAdded.has(fa.id)) { held.add(code); continue }
    const item = {
      key: `fa_${fa.id}`, code, name: nameOf(code), hours: courses[code]?.credits ?? 0,
      term: semesterLabels[fa.semester_number] ?? null, semNum: fa.semester_number ?? null,
    }
    if (duplicate) {
      notCounted.push({ ...item, kind: 'duplicate', hours: 0, reason: 'This course is already counted once, so it adds no hours here. A course counts once.' })
    } else {
      held.add(code)
      notCounted.push({ ...item, kind: 'extra', reason: 'Counts toward your total hours. It does not fill a listed requirement.' })
    }
  }

  notCounted.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
  return { categoryRefs, categoryNotes, freeRefs, notCounted }
}
