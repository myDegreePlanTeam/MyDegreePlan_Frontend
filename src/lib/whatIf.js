// whatIf.js
//
// What adding a second major or a minor would cost, worked out without saving anything (PLAN_double-major-minor.md, Phase 7, D11). Pure.
// It runs the same merge (lib/programMerge.js), audit (lib/degreeAudit.js) and scheduler (lib/degreeProjection.js) the plan itself uses,
// on the student's real state with and without the candidate, so what it says is what adding the program would give, not a second model.
//
//   evaluateAddition({ base, candidate })  -> { addedHours, newRequiredCourses, sharedCourses, hoursNeeded, base, withAddition,
//                                               delayTerms, pastFourYears, alreadyPastFourYears, optimal, finishKnown }
//   describeDelay(result)                  -> { state, sentence, detail }       the warning, in words; never a blocker
//   rankMinors({ base, candidates })       -> [{ candidate, result }]          the minors the student is closest to completing, closest first
//
//   base       the student's state: { profile, primary, added, courses, prereqMap, coreqMap, priorCredits, freeAddSlots, planSlots,
//              planArchived, planSemesterOverrides, semesterTerms, semesterPhase, semesterLabels, genedExempt, names }
//                primary { programId, slots, totalHours, genedProgram }, added [{ programId, role, slots, totalHours, genedProgram }]
//                names { [programId]: name }, courses the catalog rows of every slot of base AND the candidate
//   candidate  { programId, role, slots, totalHours, genedProgram, name }
//
// "Four years" is eight Fall/Spring terms from the student's first term (D11; the owner may say otherwise: Question 9). Summers are not
// scheduled, as everywhere else. A finish is an estimate: `optimal` is false when the scheduler found a faster arrangement might exist.

import { mergePrograms, addedSlotIdsOf } from './programMerge.js'
import { buildDegreeAudit } from './degreeAudit.js'
import { buildDegreePlan } from './degreeBuilder.js'
import { projectDegree } from './degreeProjection.js'
import { advanceTerm, formatTermLabel, isSameTerm } from './semesterTerms.js'

export const FOUR_YEARS_TERMS = 8

// The first Fall or Spring term at or after the student's start: a student who starts in a Summer takes their first term in the Fall.
function firstScheduledTerm(season, year) {
  const term = { season, year: Number(year) }
  return term.season === 'Summer' ? advanceTerm(term) : term
}

/** How many Fall/Spring terms from the student's first term a finish term is (the first term is 1); null when it cannot be told. */
export function termNumberFromStart(profile, term) {
  if (!term || !profile?.start_season || !profile?.start_year) return null
  let t = firstScheduledTerm(profile.start_season, profile.start_year)
  for (let n = 1; n <= 40; n++) {
    if (isSameTerm(t, term)) return n
    t = advanceTerm(t)
  }
  return null
}

function sideOf(base, added, { candidateIds = new Set() } = {}) {
  const { primary, courses, planSlots, planArchived } = base
  const merged = mergePrograms(primary, added, { courses, planSlots })
  const programs = [primary, ...added].map(p => ({ programId: p.programId, name: base.names?.[p.programId] ?? 'Degree program' }))

  // A slot the student has no saved state for yet (the candidate's) is archived the way the degree builder would: a prior credit that covers
  // it, or a math placement that skips it. The student's own saved state is never touched.
  const placement = buildDegreePlan({
    slots: merged.slots, addedSlotIds: addedSlotIdsOf(merged.programsOf, primary.programId), courseMap: courses,
    prereqMap: base.prereqMap, coreqMap: base.coreqMap, priorCredits: base.priorCredits,
    studentProfile: { student_type: base.profile.student_type, act_math: base.profile.act_math, sat_math: base.profile.sat_math, start_season: base.profile.start_season },
  })
  const archived = { ...Object.fromEntries(Object.entries(placement.archived).filter(([id]) => candidateIds.has(Number(id)) || candidateIds.has(id))), ...planArchived }

  const audit = buildDegreeAudit({
    slots: merged.slots, planSlots, planArchived: archived, planSemesterOverrides: base.planSemesterOverrides, freeAddSlots: base.freeAddSlots,
    priorCredits: base.priorCredits, courses, totalHours: merged.totalHours, semesterLabels: base.semesterLabels ?? {}, semesterPhase: base.semesterPhase,
    genedProgram: primary.genedProgram ?? base.profile.gened_program, majorLabel: base.names?.[primary.programId] ?? null, genedExempt: base.genedExempt ?? [],
    programs, programsOf: merged.programsOf,
  })
  const projection = projectDegree({
    audit, slots: merged.slots, courses, prereqMap: base.prereqMap, coreqMap: base.coreqMap, priorCredits: base.priorCredits,
    freeAddSlots: base.freeAddSlots, semesterTerms: base.semesterTerms, semesterPhase: base.semesterPhase,
  })
  return { merged, audit, projection }
}

function finishOf(profile, projection) {
  const term = projection?.graduation?.term ?? null
  return {
    label: term ? formatTermLabel(term) : null,
    term,
    index: projection?.graduation?.index ?? null,            // terms from the first term not yet begun
    fromStart: termNumberFromStart(profile, term),           // terms from the student's first term (the four-year measure)
    complete: !!projection?.complete,
    optimal: projection?.optimal ?? null,
    blocked: projection?.blocked?.length ?? 0,
  }
}

export function evaluateAddition({ base, candidate }) {
  const candidateIds = new Set(candidate.slots.map(s => s.id))
  const before = sideOf(base, base.added)
  const after = sideOf(base, [...base.added, candidate], { candidateIds })

  const baseFinish = finishOf(base.profile, before.projection)
  const withFinish = finishOf(base.profile, after.projection)
  const owned = after.audit.blocks.flatMap(b => b.rows).filter(r => r.programId === candidate.programId)
  const stillOwed = owned.filter(r => r.state !== 'done')
  const shadows = after.merged.shadows.filter(s => s.programId === candidate.programId && s.targetSlotId != null)

  const finishKnown = baseFinish.index != null && withFinish.index != null
  const delayTerms = finishKnown ? Math.max(0, withFinish.index - baseFinish.index) : null
  return {
    candidate: { programId: candidate.programId, role: candidate.role, name: candidate.name ?? base.names?.[candidate.programId] ?? 'this program' },
    addedHours: after.merged.totalHours - before.merged.totalHours,
    // slots the candidate adds to the plan that nothing already covers, and the courses it shares with what the student has
    newRequiredCourses: owned.filter(r => !r.required || r.code).length,
    sharedCourses: shadows.length,
    // the hours of the candidate's own requirements that are not done: the measure of "closest to completing"
    hoursNeeded: stillOwed.reduce((sum, r) => sum + (r.hours ?? 0), 0),
    base: baseFinish,
    withAddition: withFinish,
    finishKnown,
    delayTerms,
    pastFourYears: withFinish.fromStart != null && withFinish.fromStart > FOUR_YEARS_TERMS,
    alreadyPastFourYears: baseFinish.fromStart != null && baseFinish.fromStart > FOUR_YEARS_TERMS,
    optimal: baseFinish.optimal !== false && withFinish.optimal !== false,
    incomplete: baseFinish.blocked > 0 || withFinish.blocked > 0,
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The warning in words. Three states, none a blocker: `none` (adding it does not move the finish: Free Elective hours and shared courses
 * absorb it), `later` (it pushes the finish past the current plan), `past_four_years` (the finish is past eight terms from the start; also
 * said when it already was). An estimate says "about" unless the schedule met its lower bound.
 * @returns {{ state: 'none' | 'later' | 'past_four_years' | 'unknown', sentence: string, detail: string|null }}
 */
export function describeDelay(result) {
  if (!result) return { state: 'unknown', sentence: '', detail: null }
  const name = result.candidate.name
  const noun = result.candidate.role === 'minor' ? 'this minor' : 'this second major'
  if (!result.finishKnown) {
    return { state: 'unknown', sentence: `A finish date cannot be worked out for your plan with ${name} yet.`, detail: result.incomplete ? 'Some course in the plan has a prerequisite that is not in it.' : null }
  }
  const about = result.optimal ? '' : 'about '
  const hours = result.addedHours > 0 ? `${plural(result.addedHours, 'hour')} more than your plan has now` : 'no more hours than your plan has now'
  const detail = `${noun[0].toUpperCase()}${noun.slice(1)} adds ${hours}${result.sharedCourses > 0 ? `, and shares ${plural(result.sharedCourses, 'course')} with it` : ''}.`

  if (result.pastFourYears) {
    const over = plural(result.withAddition.fromStart - FOUR_YEARS_TERMS, 'semester')
    return {
      state: 'past_four_years',
      sentence: result.delayTerms > 0
        ? `Adding ${name} pushes your finish from ${result.base.label} to ${about}${result.withAddition.label}, ${over} past four years.`
        : `Your finish, ${result.base.label}, is already ${over} past four years, and adding ${name} does not move it.`,
      detail,
    }
  }
  if (result.delayTerms > 0) {
    return {
      state: 'later',
      sentence: `Adding ${name} pushes your finish from ${result.base.label} to ${about}${result.withAddition.label} (${plural(result.delayTerms, 'more semester')}). It stays within four years.`,
      detail,
    }
  }
  return {
    state: 'none',
    sentence: `Adding ${name} does not move your finish (${result.base.label}).`,
    detail,
  }
}

/**
 * The minors the student is closest to completing, from the plan they have: fewest hours still needed first, then the smallest delay, then
 * the name. Only minors with requirements the planner models are ranked (the ones with slots); the rest are returned apart, unranked,
 * because no number is claimed for them.
 * @param {{ base: object, candidates: Array<object> }} input  candidates: [{ programId, role: 'minor', slots, totalHours, genedProgram, name }]
 */
export function rankMinors({ base, candidates }) {
  const modelled = candidates.filter(c => c.slots?.length > 0)
  const ranked = modelled
    .map(candidate => ({ candidate, result: evaluateAddition({ base, candidate }) }))
    .sort((a, b) => a.result.hoursNeeded - b.result.hoursNeeded
      || (a.result.delayTerms ?? Infinity) - (b.result.delayTerms ?? Infinity)
      || String(a.candidate.name).localeCompare(String(b.candidate.name)))
  return { ranked, notRanked: candidates.filter(c => !(c.slots?.length > 0)) }
}
