import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { creditsBeforeSemester } from '../lib/transferCredits'
import { POOL_CREDIT_ESTIMATES } from '../lib/poolResolver'

// The 2026-2027 degree maps, end to end: the reference student (Fall start, no prior credit, ACT 29 so MATH 1910) must
// get exactly the department's path, and every other student must get what the placement algorithm gives them (the
// map changes nothing for anyone else). Built from the bundled catalog, the data the app runs on.

const T = catalog.tables
const courseMap = Object.fromEntries(T.courses.map(c => [c.code, { credits: c.credits, standing_req: c.standing_req ?? null }]))
const prereqMap = buildRequirementMap(T.prerequisite_entries)
const coreqMap = buildRequirementMap(T.corequisite_entries)

// What each map prints as the semester totals (Word "Total Credit Hours"), fall then spring of each year.
const PRINTED = {
  core:          [15, 16, 17, 16, 15, 15, 12, 14],
  cybersecurity: [15, 16, 16, 16, 15, 14, 15, 13],
  hpc:           [15, 16, 17, 16, 15, 15, 14, 12],
  ai:            [15, 16, 16, 16, 15, 16, 14, 12],
}
// the math courses the maps do not show: a lower placement needs them, the reference student does not
const PLACEMENT_ONLY = ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1730', 'MATH1904', 'MATH1906']

function slotsOf(program, year = '2026-2027') {
  const conc = T.concentrations.find(c => c.code === program)
  return T.requirement_slots.filter(s => s.concentration_id === conc.id && s.catalog_year === year)
}
const hours = s => s.flex_credits ?? (s.is_pool ? POOL_CREDIT_ESTIMATES[s.class_code] : courseMap[s.class_code].credits)
const noMap = slots => slots.map(s => ({ ...s, map_semester: null }))

function build(slots, profile = {}, { priorCredits = [], prereqs = prereqMap, coreqs = coreqMap, courses = courseMap } = {}) {
  return buildDegreePlan({
    slots, courseMap: courses, prereqMap: prereqs, coreqMap: coreqs, priorCredits,
    studentProfile: { student_type: 'incoming_freshman', act_math: 29, start_season: 'Fall', ...profile },
  })
}
const loadsOf = (slots, { assignments, archived }) => {
  const loads = {}
  for (const s of slots.filter(x => !archived[x.id])) loads[assignments[s.id]] = (loads[assignments[s.id]] ?? 0) + hours(s)
  return Object.keys(loads).sort((a, b) => a - b).map(k => loads[k])
}

describe.each(Object.keys(PRINTED))('%s: the reference student gets the department map', program => {
  const slots = slotsOf(program)
  const result = build(slots)

  it('puts every slot in the semester the map prints', () => {
    const active = slots.filter(s => !result.archived[s.id])
    expect(active.length).toBeGreaterThan(30)
    for (const s of active) expect(result.assignments[s.id], `${s.slot_key}`).toBe(s.map_semester)
  })

  it('has exactly the printed semester totals, 120 hours in all', () => {
    const loads = loadsOf(slots, result)
    expect(loads).toEqual(PRINTED[program])
    expect(loads.reduce((a, b) => a + b, 0)).toBe(120)
  })

  it('archives only the math the student\'s placement skips', () => {
    const archivedCodes = slots.filter(s => result.archived[s.id]).map(s => s.class_code).sort()
    expect(archivedCodes).toEqual([...PLACEMENT_ONLY].sort())
    expect(Object.values(result.archived).every(r => r === 'not_applicable')).toBe(true)
  })
})

describe('everyone else gets the placement algorithm, exactly as if the plan had no map', () => {
  const slots = slotsOf('core')
  const plain = noMap(slots)
  const same = (profile, opts) => expect(build(slots, profile, opts)).toEqual(build(plain, profile, opts))

  it('a lower math placement (ACT 25 starts in MATH 1730)', () => same({ act_math: 25 }))
  it('no test score at all (MATH 1000)', () => same({ act_math: null }))
  it('a Spring start', () => same({ start_season: 'Spring' }))
  it('a Summer start', () => same({ start_season: 'Summer' }))
  it('any prior credit', () => {
    same({}, { priorCredits: [{ id: 1, credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }] })
    const withCredit = build(slots, {}, { priorCredits: [{ id: 1, credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }] })
    expect(Object.values(withCredit.archived)).toContain('prior_credit')
  })
  it('credit that matches no slot still moves the student off the path', () => {
    same({}, { priorCredits: [{ id: 2, credit_type: 'transfer_credit', satisfies_course_code: 'PSY1030', credits_awarded: 3 }] })
  })

  it('and those plans are valid: every slot placed, never more than 18 hours', () => {
    for (const profile of [{ act_math: 25 }, { act_math: null }, { start_season: 'Spring' }]) {
      const r = build(slots, profile)
      for (const s of slots.filter(x => !r.archived[x.id])) expect(r.assignments[s.id], s.slot_key).toBeGreaterThanOrEqual(1)
      expect(Math.max(...loadsOf(slots, r))).toBeLessThanOrEqual(18)
    }
  })
})

describe('a map that does not hold up is not used', () => {
  const slots = slotsOf('ai')
  const plain = noMap(slots)
  const move = (key, semester) => slots.map(s => (s.slot_key === key ? { ...s, map_semester: semester } : s))

  it('a prerequisite placed after the course that needs it', () => {
    const prereqs = { ...prereqMap, CSC1300: { 0: { logic: 'AND', codes: ['CSC1310'] } } }   // CSC1310 is in semester 2
    expect(build(slots, {}, { prereqs })).toEqual(build(plain, {}, { prereqs }))
  })

  it('a corequisite placed after the course', () => {
    const coreqs = { ...coreqMap, CSC1300: { 0: { logic: 'AND', codes: ['CSC1310'] } } }
    expect(build(slots, {}, { coreqs })).toEqual(build(plain, {}, { coreqs }))
  })

  it('a fall-only course in a spring semester', () => {
    const edited = move('AI3000', 6)
    expect(build(edited)).toEqual(build(noMap(edited)))
  })

  it('a senior-standing course too early', () => {
    const courses = { ...courseMap, CSC4610: { ...courseMap.CSC4610, standing_req: 'senior' } }
    const edited = move('CSC4610', 3)
    expect(build(edited, {}, { courses })).toEqual(build(noMap(edited), {}, { courses }))
  })

  it('a semester over 18 hours', () => {
    const edited = slots.map(s => (s.map_semester === 2 || s.map_semester === 3 ? { ...s, map_semester: 1 } : s))
    expect(build(edited)).toEqual(build(noMap(edited)))
  })

  it('a slot with no map semester (a plan the department has not mapped)', () => {
    const edited = slots.map(s => (s.slot_key === 'CSC1300' ? { ...s, map_semester: null } : s))
    expect(build(edited)).toEqual(build(noMap(edited)))
  })

  it('the unedited AI map is used as printed', () => {
    const r = build(slots)
    expect(r.assignments[slots.find(s => s.slot_key === 'AI3000').id]).toBe(5)
    expect(creditsBeforeSemester(5, { slots, planSemesterOverrides: r.assignments, planArchived: r.archived, priorCredits: [], courses: courseMap })).toBe(15 + 16 + 16 + 16)
  })
})

describe('plans without a department map are untouched', () => {
  it('the 2025-2026 plans have no map semesters, so the algorithm runs as before', () => {
    for (const program of ['core', 'cybersecurity', 'hpc', 'dsai']) {
      const slots = slotsOf(program, '2025-2026')
      expect(slots.every(s => s.map_semester == null), program).toBe(true)
    }
  })
})
