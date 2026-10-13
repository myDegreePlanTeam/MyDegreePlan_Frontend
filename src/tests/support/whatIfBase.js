// The state of a student who has just built a plan on one program, in the shape lib/whatIf.js takes as `base`, from the real catalog.
//
// whatIfStudent('core', 29) is a Fall 2026 starter with ACT Math 29: every term still ahead, nothing picked, the degree builder's placement.
// whatIfCandidate('minor_mathematics', 'minor') is a program to try adding, with the slots of its 2026-2027 plan.

import { T, courses, courseMap, prereqMap, coreqMap } from './realStudent.js'
import { buildDegreePlan } from '../../lib/degreeBuilder.js'
import { computeSemesterTerms, formatTermLabel } from '../../lib/semesterTerms.js'
import { resolveMathPlacementRow } from '../../lib/actScoreResolver.js'
import { getFlightFoundationsExemptions } from '../../lib/flightFoundations.js'

export const program = code => T.concentrations.find(p => p.code === code)
export const slotsOfProgram = code => T.requirement_slots.filter(s => s.concentration_id === program(code).id && s.catalog_year === '2026-2027')
const totalOf = code => T.degree_plans.find(d => d.concentration_id === program(code).id && d.catalog_year === '2026-2027').total_hours

export function whatIfCandidate(code, role = 'major') {
  return { programId: program(code).id, role, slots: slotsOfProgram(code), totalHours: totalOf(code), genedProgram: 'flight_foundations', name: program(code).name }
}

export function whatIfStudent(code = 'core', act = 29, { startSeason = 'Fall', startYear = 2026 } = {}) {
  const prog = program(code)
  const slots = slotsOfProgram(code)
  const profile = { student_type: 'incoming_freshman', act_math: act, sat_math: null, start_season: startSeason, start_year: startYear, gened_program: 'flight_foundations' }
  const priorCredits = [{ id: 'act', ...resolveMathPlacementRow({ act }) }]
  const { assignments, archived } = buildDegreePlan({ slots, courseMap, prereqMap, coreqMap, priorCredits, studentProfile: profile })
  const nums = Array.from({ length: Math.max(...Object.values(assignments)) }, (_, i) => i + 1)
  const semesterTerms = computeSemesterTerms(startSeason, startYear, nums)
  return {
    profile,
    primary: { programId: prog.id, slots, totalHours: totalOf(code), genedProgram: 'flight_foundations' },
    added: [],
    courses,
    prereqMap,
    coreqMap,
    priorCredits,
    freeAddSlots: [],
    planSlots: {},
    planArchived: archived,
    planSemesterOverrides: assignments,
    semesterTerms,
    semesterPhase: Object.fromEntries(nums.map(n => [n, 'future'])),
    semesterLabels: Object.fromEntries(Object.entries(semesterTerms).map(([n, t]) => [n, formatTermLabel(t)])),
    genedExempt: getFlightFoundationsExemptions(prog.major_code),
    names: Object.fromEntries(T.concentrations.map(p => [p.id, p.name])),
  }
}
