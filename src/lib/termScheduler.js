// termScheduler.js
//
// Packs the courses a student still owes into the terms ahead, as early as the rules allow. Pure: no database, no React, no clock.
// The Requirements tab uses it for the earliest finish and the chain that sets the pace; the recommendation engine (Phase 4 of
// PLAN_deeper-features.md) reuses it to propose a layout, which is why it returns where every task landed.
//
//   scheduleTerms({ tasks, startTerm, satisfied, creditsBefore, ctx, maxHours, maxTerms })
//
// A task is one course or one open choice:
//   { id, code, hours, pool, floor, after }
//     code   the course, or null for a choice nobody has made yet
//     pool   for an open choice: { codes, gates }. `codes` are the courses it can take (null or [] when it takes any course:
//            a Free Elective), `gates` is true for a requirement pool that can stand in for a prerequisite (REQUIREMENT_POOLS)
//     floor  the earliest term index (1 = startTerm) it may sit in; an engineering plan's department map gives one, because the
//            catalog records almost no prerequisites for those courses
//     after  codes that must be done in an earlier term (a pool's implicit prerequisite: electives follow CSC 1310)
//
// A task may sit in a term when, in this order of checking: its floor is reached; its `after` codes are done; the department
// offers it in that season (semesterRestrictions); the student's hours before it meet its standing; checkPrereqs is satisfied by
// courses in EARLIER terms (an empty gating pool in an earlier term stands in, as in the plan's warnings); checkCoreqsProvisional is
// satisfied by courses in the same or an earlier term; and the term has room (maxHours). Nothing here knows a rule the plan does
// not: every check is the function the Plan tab runs.
//
// Two passes run. The first has unlimited room: every task lands in the earliest term the rules allow, so each task's term is a
// true minimum and the largest is a lower bound on any finish (`lowerBound.prerequisites`). The chain that produced it is
// `chain`. The second pass has the room limit and places tasks longest-chain-first (list scheduling): a feasible finish that is
// usually, not always, the best possible, so `optimal` says when it meets the lower bound and a gap says it may be improvable.
//
// Terms are Fall and Spring only (no summers), starting at `startTerm`.

import { checkPrereqs, checkCoreqsProvisional } from './prereqChecker.js'
import { isEnrollmentAllowed, getSeasonRestriction } from './semesterRestrictions.js'
import { advanceTerm, formatTermLabel } from './semesterTerms.js'

export const DEFAULT_MAX_HOURS = 18
const DEFAULT_MAX_TERMS = 16
const STANDING_HOURS = { junior: 60, senior: 90 }

/** The nth term from `startTerm` (n = 1 is `startTerm`), Fall and Spring only. */
export function nthTerm(startTerm, n) {
  let term = startTerm
  for (let i = 1; i < n; i++) term = advanceTerm(term)
  return term
}

function termList(startTerm, count) {
  const out = []
  let term = startTerm
  for (let i = 0; i < count; i++) { out.push(term); term = advanceTerm(term) }
  return out
}

// The groups of a requirement map as a list: { logic, codes }. A flat list (an older shape) is one AND group.
function groupCodes(map, code) {
  const groups = map?.[code]
  if (!groups) return []
  return Array.isArray(groups) ? [{ logic: 'AND', codes: groups }] : Object.values(groups)
}

// One pass over the terms. `maxHours` of Infinity is the unlimited pass.
function runPass({ tasks, terms, satisfied, creditsBefore, ctx, maxHours, order }) {
  const { prereqMap = {}, coreqMap = {}, courseMap = {}, priorCredits = [] } = ctx
  const termOf = new Map()
  const doneCodes = new Set(satisfied)
  const pendingBefore = []           // gating pools placed in earlier terms: { key, codes }
  const remaining = new Set(tasks.map(t => t.id))
  const placedByTerm = []
  let creditsDone = creditsBefore

  for (let ti = 1; ti <= terms.length && remaining.size > 0; ti++) {
    const season = terms[ti - 1].season
    const sameCodes = new Set()
    const samePending = []
    const placed = []
    let hours = 0

    const standingOk = code => {
      const need = STANDING_HOURS[courseMap[code]?.standing_req]
      return !need || creditsDone >= need
    }
    const courseOk = code => (
      isEnrollmentAllowed(code, season) && standingOk(code)
      && checkPrereqs(code, prereqMap, doneCodes, priorCredits, courseMap, coreqMap, pendingBefore).satisfied
    )
    const feasible = task => {
      if (ti < (task.floor ?? 1)) return false
      if ((task.after ?? []).some(code => !doneCodes.has(code))) return false
      if (hours > 0 && hours + task.hours > maxHours) return false
      if (task.code) {
        if (!courseOk(task.code)) return false
        const available = new Set([...doneCodes, ...sameCodes])
        return checkCoreqsProvisional(task.code, coreqMap, available, [...pendingBefore, ...samePending]).satisfied
      }
      // An open choice: some course it takes must be allowed here. A choice that takes any course always is.
      const codes = task.pool?.codes
      if (!Array.isArray(codes) || codes.length === 0) return true
      return codes.some(courseOk)
    }

    // A corequisite partner placed later in the same term can unlock a task checked earlier, so repeat until nothing changes.
    for (let changed = true; changed;) {
      changed = false
      for (const task of order) {
        if (!remaining.has(task.id) || !feasible(task)) continue
        remaining.delete(task.id)
        termOf.set(task.id, ti)
        placed.push(task)
        hours += task.hours
        if (task.code) sameCodes.add(task.code)
        else if (task.pool?.gates && Array.isArray(task.pool.codes)) samePending.push({ key: task.id, codes: task.pool.codes })
        changed = true
      }
    }

    for (const code of sameCodes) doneCodes.add(code)
    pendingBefore.push(...samePending)
    creditsDone += hours
    placedByTerm.push({ index: ti, term: terms[ti - 1], label: formatTermLabel(terms[ti - 1]), hours, tasks: placed })
  }
  return { termOf, remaining, terms: placedByTerm, doneCodes, pendingBefore }
}

// How many terms each task keeps a chain going: the longest run of tasks that must come one after another behind it.
function chainTails(tasks, ctx) {
  const { prereqMap = {}, coreqMap = {} } = ctx
  const byCode = new Map()
  const gating = []
  for (const t of tasks) {
    if (t.code) (byCode.get(t.code) ?? byCode.set(t.code, []).get(t.code)).push(t)
    else if (t.pool?.gates && Array.isArray(t.pool.codes)) gating.push(t)
  }
  const providers = code => [...(byCode.get(code) ?? []), ...gating.filter(p => p.pool.codes.includes(code))]

  const dependents = new Map(tasks.map(t => [t.id, []]))   // provider id -> [{ task, weight }]
  for (const t of tasks) {
    if (!t.code) continue
    for (const group of groupCodes(prereqMap, t.code)) {
      for (const code of group.codes) {
        const sameTerm = groupCodes(coreqMap, t.code).some(g => g.codes.includes(code))
        for (const p of providers(code)) if (p.id !== t.id) dependents.get(p.id).push({ task: t, weight: sameTerm ? 0 : 1 })
      }
    }
    for (const group of groupCodes(coreqMap, t.code)) {
      for (const code of group.codes) for (const p of providers(code)) if (p.id !== t.id) dependents.get(p.id).push({ task: t, weight: 0 })
    }
    for (const code of t.after ?? []) for (const p of providers(code)) if (p.id !== t.id) dependents.get(p.id).push({ task: t, weight: 1 })
  }

  const tail = new Map()
  const visiting = new Set()
  const walk = task => {
    if (tail.has(task.id)) return tail.get(task.id)
    if (visiting.has(task.id)) return 0
    visiting.add(task.id)
    let best = 0
    for (const { task: next, weight } of dependents.get(task.id)) best = Math.max(best, weight + walk(next))
    visiting.delete(task.id)
    tail.set(task.id, best)
    return best
  }
  for (const t of tasks) walk(t)
  return { tail, providers }
}

/**
 * @param {object} input
 * @param {Array}  input.tasks
 * @param {{season: string, year: number}} input.startTerm  the first term a task may sit in (a Summer rolls to the next Fall)
 * @param {Set<string>|string[]} [input.satisfied]  courses done (or finishing) before startTerm
 * @param {number} [input.creditsBefore]            hours earned before startTerm, for standing
 * @param {{prereqMap, coreqMap, courseMap, priorCredits}} input.ctx
 * @param {number} [input.maxHours]                 the most hours in a term
 * @param {number} [input.maxTerms]
 * @returns {{
 *   startTerm, maxHours, terms: Array<{index, term, label, hours, tasks}>, termOf: Map, termCount: number,
 *   chain: Array<{ id, code, index, term, label, note: string|null, waitsFor: 'map'|'season'|'standing'|null }>,
 *   lowerBound: { prerequisites: number, hours: number, index: number },
 *   optimal: boolean, blocked: Array<{ id, code, reason, missing: string[] }>,
 * }}
 */
export function scheduleTerms({ tasks, startTerm, satisfied = [], creditsBefore = 0, ctx = {}, maxHours = DEFAULT_MAX_HOURS, maxTerms = DEFAULT_MAX_TERMS }) {
  const start = startTerm?.season === 'Summer' ? advanceTerm(startTerm) : startTerm
  const terms = termList(start, maxTerms)
  const known = new Set(satisfied)

  const { tail, providers } = chainTails(tasks, ctx)
  const byName = (a, b) => String(a.code ?? a.id).localeCompare(String(b.code ?? b.id))
  const restricted = t => (t.code && getSeasonRestriction(t.code) ? 1 : 0)
  const longestChain = (a, b) => (tail.get(b.id) - tail.get(a.id)) || (b.hours - a.hours) || byName(a, b)
  const order = [...tasks].sort(longestChain)

  // Unlimited room: each task's earliest term, and what limits it.
  const free = runPass({ tasks, terms, satisfied: known, creditsBefore, ctx, maxHours: Infinity, order })
  const earliestOf = t => free.termOf.get(t.id) ?? Infinity

  // The real schedule: the same rules with a limit on each term's hours. List scheduling is a heuristic, so it is run under a few
  // orderings (longest chain first; chain first but courses offered in one season before the rest; soonest-available first; biggest
  // first) and the one that finishes soonest, then fills its last term least, is kept.
  const orderings = [
    order,
    [...tasks].sort((a, b) => (restricted(b) - restricted(a)) || longestChain(a, b)),
    [...tasks].sort((a, b) => (earliestOf(a) - earliestOf(b)) || longestChain(a, b)),
    [...tasks].sort((a, b) => (b.hours - a.hours) || longestChain(a, b)),
  ]
  const lastHours = r => r.terms.filter(t => t.tasks.length).slice(-1)[0]?.hours ?? 0
  const spanOf = r => r.terms.filter(t => t.tasks.length).slice(-1)[0]?.index ?? 0
  let real = null
  for (const candidate of orderings) {
    const attempt = runPass({ tasks, terms, satisfied: known, creditsBefore, ctx, maxHours, order: candidate })
    const better = !real
      || attempt.remaining.size < real.remaining.size
      || (attempt.remaining.size === real.remaining.size && (spanOf(attempt) < spanOf(real) || (spanOf(attempt) === spanOf(real) && lastHours(attempt) > lastHours(real))))
    if (better) real = attempt
  }

  const earliest = id => free.termOf.get(id) ?? Infinity
  const placedFree = tasks.filter(t => free.termOf.has(t.id))
  const chainLength = placedFree.reduce((max, t) => Math.max(max, earliest(t.id)), 0)
  const hoursTotal = tasks.reduce((sum, t) => sum + t.hours, 0)
  const hoursBound = Number.isFinite(maxHours) && hoursTotal > 0 ? Math.ceil(hoursTotal / maxHours) : 0

  // The chain behind the latest earliest term: from the last task, step back to the prerequisite that finished latest before it.
  // A step that waited longer than its prerequisite needed says why (the season it is offered, the department map, or standing).
  const chain = []
  const last = [...placedFree].sort((a, b) => (earliest(b.id) - earliest(a.id)) || (tail.get(a.id) - tail.get(b.id)))[0]
  const byId = new Map(tasks.map(t => [t.id, t]))
  const seen = new Set()
  // Why a step sits later than its prerequisite alone would put it: { waitsFor, note }
  const waitNote = (task, index, behindIndex) => {
    const season = terms[index - 1].season
    if ((task.floor ?? 1) >= index) return { waitsFor: 'map', note: "Not before this term on the department's degree map" }
    if (task.code && getSeasonRestriction(task.code) === season && index - behindIndex > 1) return { waitsFor: 'season', note: `Offered ${season} only` }
    if (task.code && (STANDING_HOURS[ctx.courseMap?.[task.code]?.standing_req] ?? 0) > 0 && index - behindIndex > 1) return { waitsFor: 'standing', note: 'Waits for enough credit hours' }
    return { waitsFor: null, note: null }
  }
  for (let cur = last, guard = 0; cur && guard < 40; guard++) {
    const index = earliest(cur.id)
    // What it waited for: a prerequisite in an earlier term, or a corequisite partner in the same one (CSC 1300 goes with MATH 1910)
    const behind = []
    if (cur.code) {
      for (const group of groupCodes(ctx.prereqMap, cur.code)) for (const code of group.codes) behind.push(...providers(code))
      for (const group of groupCodes(ctx.coreqMap, cur.code)) for (const code of group.codes) behind.push(...providers(code))
    }
    for (const code of cur.after ?? []) behind.push(...providers(code))
    const binding = behind
      .filter(p => p.id !== cur.id && !seen.has(p.id) && earliest(p.id) <= index)
      .sort((a, b) => (earliest(b.id) - earliest(a.id)) || String(a.code ?? a.id).localeCompare(String(b.code ?? b.id)))[0]
    seen.add(cur.id)
    chain.unshift({
      id: cur.id, code: cur.code, index, term: terms[index - 1], label: formatTermLabel(terms[index - 1]),
      ...(index > 1 ? waitNote(cur, index, binding ? Math.min(earliest(binding.id), index - 1) : 0) : { waitsFor: null, note: null }),
    })
    cur = binding ? byId.get(binding.id) : null
  }

  const placed = real.terms.filter(t => t.tasks.length > 0)
  const termCount = placed.length ? placed[placed.length - 1].index : 0
  const blocked = tasks.filter(t => !real.termOf.has(t.id)).map(t => {
    // Why: what the checker still wants, given every course the schedule could place
    const missing = t.code
      ? (checkPrereqs(t.code, ctx.prereqMap ?? {}, free.doneCodes, ctx.priorCredits ?? [], ctx.courseMap ?? {}, ctx.coreqMap ?? {}, free.pendingBefore).missing ?? [])
      : []
    return { id: t.id, code: t.code, missing, reason: missing.length ? 'prerequisite' : free.termOf.has(t.id) ? 'room' : 'unschedulable' }
  })

  const lowerIndex = Math.max(chainLength, hoursBound)
  return {
    startTerm: start,
    maxHours,
    terms: real.terms.slice(0, termCount),
    termOf: real.termOf,
    termCount,
    chain,
    lowerBound: { prerequisites: chainLength, hours: hoursBound, index: lowerIndex },
    optimal: blocked.length === 0 && termCount === lowerIndex,
    blocked,
    earliestTermOf: free.termOf,
  }
}
