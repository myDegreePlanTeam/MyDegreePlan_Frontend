// addProgram.js
//
// Adding a second major to a student's plan (PLAN_double-major-minor.md, Phase 2): which programs may be added, in which catalog year the
// added program's plan is followed, and the student_programs row that records it. Pure.
//
// The plan an added program follows is the one in effect when the student ENTERS it, so it is resolved from the term they declare, not
// from the term they started at the university (D8). The primary program's catalog year is never touched.

import { academicYearOf, availablePrograms, planForYear } from './catalogYears.js'
import { isProgramReady } from './programBrowser.js'

export const ENTRY_SEASONS = ['Fall', 'Spring', 'Summer']

/** What the student is told before they confirm: the catalog is silent on how two majors may share courses, and this is what the planner assumes. */
export const OVERLAP_NOTE =
  'A course both degree programs need counts toward each and appears once in your plan, and its hours are counted once. '
  + 'The catalog does not say whether two majors may share courses, so confirm this with your advisor.'

/**
 * The programs that may be added as a second major, from the `concentrations` and `degree_plans` rows.
 * A major (or a concentration of one) that is open to the declared term and has a plan for it, that the planner supports, and that is
 * not the student's own major: another concentration of the same major is a different plan for the same degree, not a second major.
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
 * The student_programs row for adding `program` as a second major, or null when there is no plan for the declared term.
 * @param {{ studentId: number, program: object, plans: Array, season: string, year: number|string, position?: number }} input
 */
export function newProgramRow({ studentId, program, plans, season, year, position = 1 }) {
  const termYear = academicYearOf(season, year)
  const plan = termYear ? planForYear(plans, program.id, termYear) : null
  if (!plan) return null
  return {
    student_id: studentId,
    concentration_id: program.id,
    role: 'major',
    catalog_year: plan.catalog_year,
    gened_program: plan.gened_program,
    entry_season: season,
    entry_year: Number(year),
    position,
  }
}

/** The position after the last program already added (the primary is 0). */
export const nextPosition = programs => Math.max(0, ...(programs ?? []).map(p => p.position ?? 0)) + 1
