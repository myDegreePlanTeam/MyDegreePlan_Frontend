// addProgram.js
//
// Adding a secondary major or a minor to a student's plan (PLAN_double-major-minor.md, Phases 2 and 6): which programs may be added, in which
// catalog year the added program's plan is followed, and the student_programs row that records it. Pure.
//
// The plan an added program follows is the one in effect when the student ENTERS it, so it is resolved from the term they declare, not
// from the term they started at the university (D8). The primary program's catalog year is never touched.

import { academicYearOf, availablePrograms, planForYear } from './catalogYears.js'
import { isProgramReady } from './programBrowser.js'

export const ENTRY_SEASONS = ['Fall', 'Spring', 'Summer']

/** What the student is told before they confirm: the catalog is silent on how two majors may share courses, and this is what the planner assumes. */
export const OVERLAP_NOTE =
  'A course both programs need counts toward each and appears once in your plan, and its hours are counted once. '
  + 'The catalog does not say whether two majors may share courses, so confirm this with your advisor.'

/** What a student is told about a minor: the catalog lets a course count toward a degree and a minor at once. */
export const MINOR_OVERLAP_NOTE =
  'A course your degree and this minor both need counts toward each and appears once in your plan, and its hours are counted once. '
  + 'Fifteen hours are the least a minor needs, in addition to your degree requirements.'

/** A minor the planner does not model (no slots): listed with the catalog text, nothing in the plan is checked against it. */
export const NOT_MODELLED_NOTE =
  'The planner does not check this minor\'s requirements, and adds nothing to your plan for it. It is listed so you can see the catalog\'s wording; confirm the courses with its department.'

/** The catalog puts at most two minors on a transcript. */
export const MINOR_TRANSCRIPT_LIMIT = 2

/**
 * A notice, never a block, when adding a minor would make more than the transcript limit: "no more than two appear on the transcript".
 * @param {number} minorsAlready  minors the student has added
 * @returns {string|null}
 */
export function minorTranscriptNotice(minorsAlready) {
  return minorsAlready >= MINOR_TRANSCRIPT_LIMIT
    ? `You would have ${minorsAlready + 1} minors. The catalog lists no more than ${MINOR_TRANSCRIPT_LIMIT} on a transcript: ask the registrar which ones.`
    : null
}

/**
 * The minors that may be added: open to the declared term, with a plan for it, and not already in the plan. Every minor is offered,
 * the ones the planner does not model included (they are labelled when chosen).
 */
export function addableMinors(programs, plans, termYear, { added = [] } = {}) {
  const taken = new Set(added.map(p => p.programId ?? p.id))
  return availablePrograms(programs, plans, termYear, { includeMinors: true })
    .filter(p => p.kind === 'minor' && !taken.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The programs that may be added as a secondary major, from the `concentrations` and `degree_plans` rows.
 * A major (or a concentration of one) that is open to the declared term and has a plan for it, that the planner supports, and that is
 * not the student's own major: another concentration of the same major is a different plan for the same degree, not a secondary major.
 * @param {Array} programs
 * @param {Array} plans
 * @param {string|null} termYear   catalog year of the declared term
 * @param {{ primary: object|null, added: Array }} current  the student's primary program (a concentrations row) and the rows already added
 */
export function addableMajors(programs, plans, termYear, { primary = null, added = [] } = {}) {
  const taken = new Set([primary?.id, ...added.map(p => p.programId ?? p.id)].filter(id => id != null))
  const takenMajors = new Set([primary, ...added.map(a => programs.find(p => p.id === (a.programId ?? a.id)))].map(p => p?.major_code).filter(Boolean))
  return availablePrograms(programs, plans, termYear)
    .filter(p => p.kind !== 'minor' && !taken.has(p.id) && !(p.major_code && takenMajors.has(p.major_code)) && isProgramReady(p))
}

/**
 * The student_programs row for adding `program` as a secondary major, or null when there is no plan for the declared term.
 * @param {{ studentId: number, program: object, plans: Array, season: string, year: number|string, position?: number, role?: 'major'|'minor' }} input
 */
export function newProgramRow({ studentId, program, plans, season, year, position = 1, role = 'major' }) {
  const termYear = academicYearOf(season, year)
  const plan = termYear ? planForYear(plans, program.id, termYear) : null
  if (!plan) return null
  return {
    student_id: studentId,
    concentration_id: program.id,
    role: role === 'minor' ? 'minor' : 'major',
    catalog_year: plan.catalog_year,
    gened_program: plan.gened_program,
    entry_season: season,
    entry_year: Number(year),
    position,
  }
}

/** The position after the last program already added (the primary is 0). */
export const nextPosition = programs => Math.max(0, ...(programs ?? []).map(p => p.position ?? 0)) + 1
