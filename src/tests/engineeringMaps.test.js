import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { mathCurriculumFor } from '../lib/mathPlacement'
import { POOL_CREDIT_ESTIMATES, POOL_COURSES, resolvePool } from '../lib/poolResolver'

// The College of Engineering's 2026-2027 maps (Mechanical Engineering x4, Nuclear Engineering), end to end through the same
// builder the CSC maps use, from the bundled catalog. The reference student: Fall start, no prior credit, ACT 29 (MATH 1910).

const T = catalog.tables
const courseMap = Object.fromEntries(T.courses.map(c => [c.code, { credits: c.credits, standing_req: c.standing_req ?? null }]))
const prereqMap = buildRequirementMap(T.prerequisite_entries)
const coreqMap = buildRequirementMap(T.corequisite_entries)

// the semester totals the PDFs print, fall then spring of each year (128 hours)
const PRINTED = {
  me:              [17, 17, 17, 17, 15, 15, 15, 15],
  me_aero:         [17, 17, 17, 17, 15, 15, 15, 15],
  me_mechatronics: [17, 18, 17, 15, 15, 16, 15, 15],
  me_vehicle:      [17, 17, 17, 17, 15, 15, 15, 15],
  ne:              [17, 17, 17, 16, 15, 15, 16, 15],
}
const PLACEMENT_ONLY = ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1730', 'MATH1904', 'MATH1906']

const hours = s => s.flex_credits ?? (s.is_pool ? POOL_CREDIT_ESTIMATES[s.class_code] : courseMap[s.class_code].credits)
const slotsOf = program => {
  const conc = T.concentrations.find(c => c.code === program)
  return T.requirement_slots.filter(s => s.concentration_id === conc.id && s.catalog_year === '2026-2027')
}
const build = (slots, profile = {}) => buildDegreePlan({
  slots, courseMap, prereqMap, coreqMap, priorCredits: [],
  studentProfile: { student_type: 'incoming_freshman', act_math: 29, start_season: 'Fall', ...profile },
})

describe.each(Object.keys(PRINTED))('%s', program => {
  const slots = slotsOf(program)
  const result = build(slots)
  const archivedCodes = slots.filter(s => result.archived[s.id]).map(s => s.class_code).sort()

  it('keeps Calculus II: an engineering map requires MATH 1920, the new CSC curriculum does not', () => {
    expect(archivedCodes).not.toContain('MATH1920')
    expect(slots.some(s => s.class_code === 'MATH1920' && s.map_semester === 2)).toBe(true)
  })

  it('archives only the placement math the reference student skips', () => {
    expect(archivedCodes).toEqual([...PLACEMENT_ONLY].sort())
  })
})

// The department's own path is used only when it holds up against the catalog. Every engineering map puts PHYS 2110 (4 hours) in the
// same semester as MATH 1920, so the catalog must say MATH 1920 may be taken alongside and PHYS 2110 is 4 hours; if either regresses
// the builder rejects the path and falls back to its own algorithm (see docs/claude/INTEGRATION_mne-engineering.md).
describe.each(Object.keys(PRINTED))('%s: the reference student gets the department map', program => {
  const slots = slotsOf(program)
  const result = build(slots)

  it('puts every slot in the semester the map prints', () => {
    for (const s of slots.filter(x => !result.archived[x.id])) expect(result.assignments[s.id], s.slot_key).toBe(s.map_semester)
  })

  it('has exactly the printed semester totals, 128 hours in all', () => {
    const loads = {}
    for (const s of slots.filter(x => !result.archived[x.id])) loads[result.assignments[s.id]] = (loads[result.assignments[s.id]] ?? 0) + hours(s)
    const planned = Object.keys(loads).sort((a, b) => a - b).map(k => loads[k])
    expect(planned).toEqual(PRINTED[program])
    expect(planned.reduce((a, b) => a + b, 0)).toBe(128)
  })
})

describe('placement below Calculus I still works for an engineering plan', () => {
  const slots = slotsOf('me')
  it('ACT 25 starts in MATH 1730 and keeps Calculus II and III', () => {
    const r = build(slots, { act_math: 25 })
    const kept = slots.filter(s => !r.archived[s.id]).map(s => s.class_code)
    for (const c of ['MATH1730', 'MATH1910', 'MATH1920', 'MATH2110']) expect(kept, c).toContain(c)
    expect(kept).not.toContain('MATH1710')
  })
  it('no score starts in MATH 1000 and takes the whole sequence', () => {
    const r = build(slots, { act_math: null })
    const kept = slots.filter(s => !r.archived[s.id]).map(s => s.class_code)
    for (const c of ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2110']) expect(kept, c).toContain(c)
  })
})

describe('mathCurriculumFor: the plan decides when its map requires Calculus II', () => {
  const csc = [{ class_code: 'MATH1910', map_semester: 1 }, { class_code: 'MATH2010', map_semester: 2 }]
  const engineering = [...csc, { class_code: 'MATH1920', map_semester: 2 }]
  it('a plan whose map names MATH1920 is on the returning curriculum for every student type', () => {
    for (const type of ['incoming_freshman', 'transfer', 'returning', null]) expect(mathCurriculumFor(engineering, type)).toBe('returning')
  })
  it('otherwise the student type decides, as it always did', () => {
    expect(mathCurriculumFor(csc, 'incoming_freshman')).toBe('new')
    expect(mathCurriculumFor(csc, 'returning')).toBe('returning')
  })
  it('an unmapped MATH1920 slot (a legacy plan) does not change the student-type rule', () => {
    expect(mathCurriculumFor([{ class_code: 'MATH1920', map_semester: null }], 'incoming_freshman')).toBe('new')
    expect(mathCurriculumFor(undefined, 'incoming_freshman')).toBe('new')
  })
})

describe('Nuclear Engineering\'s Area of Emphasis is an open pool, searched like Free Elective', () => {
  it('resolves to the open search, not an empty list', () => {
    expect(POOL_COURSES.NE_EMPHASIS).toBeNull()
    expect(resolvePool('NE_EMPHASIS', courseMap)).toBeNull()
    expect(resolvePool('FREE_ELECTIVE', courseMap)).toBeNull()
    expect(resolvePool('ME_ELECTIVE', courseMap).length).toBeGreaterThan(10)
  })

  it('the algorithm places all six emphasis slots for a student off the map (ACT 25, or a Spring start)', () => {
    const slots = slotsOf('ne')
    for (const profile of [{ act_math: 25 }, { start_season: 'Spring' }]) {
      const r = build(slots, profile)
      const emphasis = slots.filter(s => s.class_code === 'NE_EMPHASIS')
      expect(emphasis).toHaveLength(6)
      for (const s of emphasis) expect(r.assignments[s.id], JSON.stringify(profile)).toBeGreaterThanOrEqual(1)
    }
  })
})
