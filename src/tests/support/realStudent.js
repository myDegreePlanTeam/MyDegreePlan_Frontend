// A student built from the real catalog, for tests that need the real prerequisites, seasons and department maps.
//
// freshStudent('cybersecurity', 29) is a student who has not started: the degree builder's plan for the program and ACT Math score
// (it archives the math chain below their placement, as onboarding does), with the placement recorded as the prior credit onboarding
// writes, and every term still ahead. It returns what the Requirements tab and the printed audit are built from.

import catalog from '../../data/catalog.json'
import { buildDegreePlan } from '../../lib/degreeBuilder.js'
import { buildDegreeAudit } from '../../lib/degreeAudit.js'
import { projectDegree } from '../../lib/degreeProjection.js'
import { buildRequirementMap } from '../../lib/requirementMap.js'
import { computeSemesterTerms, formatTermLabel } from '../../lib/semesterTerms.js'
import { resolveMathPlacementRow } from '../../lib/actScoreResolver.js'
import { getFlightFoundationsExemptions } from '../../lib/flightFoundations.js'

export const T = catalog.tables
export const courses = Object.fromEntries(T.courses.map(c => [c.code, c]))
export const courseMap = Object.fromEntries(T.courses.map(c => [c.code, { credits: c.credits, standing_req: c.standing_req ?? null }]))
export const prereqMap = buildRequirementMap(T.prerequisite_entries)
export const coreqMap = buildRequirementMap(T.corequisite_entries)

export function freshStudent(code, act) {
  const prog = T.concentrations.find(p => p.code === code)
  const plan = T.degree_plans.find(d => d.concentration_id === prog.id && d.gened_program === 'flight_foundations')
  const slots = T.requirement_slots.filter(s => s.concentration_id === prog.id && s.catalog_year === plan.catalog_year)
  const priorCredits = [{ id: 'act', ...resolveMathPlacementRow({ act }) }]
  const { assignments, archived } = buildDegreePlan({
    slots, courseMap, prereqMap, coreqMap, priorCredits,
    studentProfile: { student_type: 'incoming_freshman', act_math: act, start_season: 'Fall' },
  })
  const nums = Array.from({ length: Math.max(...Object.values(assignments)) }, (_, i) => i + 1)
  const semesterTerms = computeSemesterTerms('Fall', 2026, nums)
  const semesterPhase = Object.fromEntries(nums.map(n => [n, 'future']))
  const semesterLabels = Object.fromEntries(Object.entries(semesterTerms).map(([n, t]) => [n, formatTermLabel(t)]))
  const audit = buildDegreeAudit({
    slots, courses, genedProgram: 'flight_foundations', totalHours: plan.total_hours, semesterPhase, priorCredits,
    planArchived: archived, planSemesterOverrides: assignments, semesterLabels, majorLabel: prog.name,
    genedExempt: getFlightFoundationsExemptions(prog.major_code),
  })
  const projection = projectDegree({ audit, slots, courses, prereqMap, coreqMap, priorCredits, semesterTerms, semesterPhase })
  return { slots, audit, projection, priorCredits, semesterTerms, assignments }
}
