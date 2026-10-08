// termPhase.js
//
// Whether a plan semester is over, under way or ahead, from the calendar. This replaces the student marking a semester
// complete: a course in a past term counts as passed, one in the current term is in progress, one in a later term is
// planned. A student who did not pass a course in a past term removes it or moves it to a later term (a retake).
//
// Pure: `today` is passed in, so tests can run any date.

import { termForDate } from './semesterTerms'

// within a year the terms run Spring, Summer, Fall
const SEASON_RANK = { Spring: 0, Summer: 1, Fall: 2 }

/** A number that sorts terms chronologically, or null for a term that is missing or has an unknown season. */
export function termOrder(term) {
  const rank = SEASON_RANK[term?.season]
  const year = Number(term?.year)
  if (rank === undefined || !Number.isFinite(year)) return null
  return year * 3 + rank
}

/**
 * @param {{season: string, year: number}} term
 * @param {Date} today
 * @returns {'past'|'current'|'future'}  a term that cannot be placed is 'future' (never assumed passed)
 */
export function termPhase(term, today) {
  const t = termOrder(term)
  const now = termOrder(termForDate(today))
  if (t === null || now === null) return 'future'
  if (t < now) return 'past'
  return t === now ? 'current' : 'future'
}

/** The course status a phase implies, in the words student_plan_slots.status has always used. */
export function statusForPhase(phase) {
  return phase === 'past' ? 'completed' : phase === 'current' ? 'in_progress' : 'planned'
}

/** { [semNum]: phase } for every semester with a term. */
export function semesterPhases(semesterTerms, today) {
  const phases = {}
  for (const [n, term] of Object.entries(semesterTerms ?? {})) phases[n] = termPhase(term, today)
  return phases
}

/**
 * Splits the credit hours of computePlanCredits' breakdown into earned and still ahead. Prior credit is earned; a course
 * is earned when its semester is past.
 *
 * @param {Array} breakdown  computePlanCredits(...).breakdown
 * @param {(item: object) => number|null|undefined} semesterOf  the semester number of a 'slot' or 'free_add' item
 * @param {Object} phases  semesterPhases(...)
 * @returns {{ completed: number, planned: number }}
 */
export function splitCreditsByPhase(breakdown, semesterOf, phases) {
  let completed = 0
  let planned = 0
  for (const item of breakdown ?? []) {
    if (item.source === 'transfer' || phases[semesterOf(item)] === 'past') completed += item.credits
    else planned += item.credits
  }
  return { completed, planned }
}
