import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { POOL_CREDIT_ESTIMATES } from '../lib/poolResolver'
import { planForYear } from '../lib/catalogYears'

// The conformance suite: EVERY program that has a department map, from the bundled catalog (the data the app runs on). The
// reference student (Fall start, no prior credit, ACT 29 so MATH 1910) must get exactly the department's path, and the path must
// add up. mapConformance.test.js and engineeringMaps.test.js pin the nine built so far by name, with the semester totals each map
// prints; this one needs no list: a program added by a later wave is checked the moment it is in catalog.json, and a program
// whose plan the builder does not honour is named in the failure instead of shipping a plan that quietly differs from the map.

const T = catalog.tables
const courseMap = Object.fromEntries(T.courses.map(c => [c.code, { credits: c.credits, standing_req: c.standing_req ?? null }]))
const prereqMap = buildRequirementMap(T.prerequisite_entries)
const coreqMap = buildRequirementMap(T.corequisite_entries)

// the math the maps do not show: a lower placement needs them, the reference student does not
const PLACEMENT_ONLY = new Set(['MATH1000', 'MATH1710', 'MATH1720', 'MATH1730', 'MATH1904', 'MATH1906'])

const hours = s => s.flex_credits ?? (s.is_pool ? POOL_CREDIT_ESTIMATES[s.class_code] : courseMap[s.class_code].credits)
const reference = (slots, over = {}) => buildDegreePlan({
  slots, courseMap, prereqMap, coreqMap, priorCredits: [],
  studentProfile: { student_type: 'incoming_freshman', act_math: 29, start_season: 'Fall', ...over },
})

// every (program, plan) whose slots carry a department-map semester, a Fall entrant of that catalog year
const mapped = []
for (const program of T.concentrations) {
  for (const plan of T.degree_plans.filter(p => p.concentration_id === program.id)) {
    const slots = T.requirement_slots.filter(s => s.concentration_id === program.id && s.catalog_year === plan.catalog_year)
    if (slots.some(s => s.map_semester != null)) mapped.push({ program, plan, slots })
  }
}

describe('the catalog has department maps to check', () => {
  it('has at least the nine programs built from the CSC department and engineering maps', () => {
    const codes = mapped.map(m => m.program.code)
    for (const code of ['core', 'cybersecurity', 'hpc', 'ai', 'me', 'me_aero', 'me_mechatronics', 'me_vehicle', 'ne']) expect(codes).toContain(code)
  })
})

describe.each(mapped.map(m => [`${m.program.code} ${m.plan.catalog_year}`, m]))('%s', (_name, { program, plan, slots }) => {
  const result = reference(slots)
  const active = slots.filter(s => !result.archived[s.id])

  it('the reference student gets the department path: every slot in the semester the map prints', () => {
    expect(active.length).toBeGreaterThan(20)
    const moved = active.filter(s => s.map_semester != null && result.assignments[s.id] !== s.map_semester)
      .map(s => `${s.slot_key}: map ${s.map_semester}, built ${result.assignments[s.id]}`)
    expect(moved).toEqual([])
  })

  it('every slot is placed, and the math placement skips is the only thing archived', () => {
    expect(active.filter(s => result.assignments[s.id] == null).map(s => s.slot_key)).toEqual([])
    const archived = slots.filter(s => result.archived[s.id])
    expect(archived.filter(s => !PLACEMENT_ONLY.has(s.class_code)).map(s => s.class_code)).toEqual([])
    expect(archived.every(s => result.archived[s.id] === 'not_applicable')).toBe(true)
  })

  it('the semesters add up to the degree: the plan\'s total hours, no semester past the 21-hour overload ceiling', () => {
    const loads = {}
    for (const s of active) loads[result.assignments[s.id]] = (loads[result.assignments[s.id]] ?? 0) + hours(s)
    const total = Object.values(loads).reduce((a, b) => a + b, 0)
    expect(total).toBe(plan.total_hours)
    expect(Math.max(...Object.values(loads))).toBeLessThanOrEqual(21)
    // a map's semesters are 1..n with none skipped
    const sems = Object.keys(loads).map(Number).sort((a, b) => a - b)
    expect(sems).toEqual(Array.from({ length: sems.length }, (_, i) => i + 1))
  })

  it('a student entering that catalog year in this program follows this plan', () => {
    const start = Number(plan.catalog_year.slice(0, 4))
    expect(planForYear(T.degree_plans, program.id, `${start}-${start + 1}`)?.id).toBe(plan.id)
  })
})
