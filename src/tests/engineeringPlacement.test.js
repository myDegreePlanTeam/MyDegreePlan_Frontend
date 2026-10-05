import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { mathChainFor, mathSequenceFor, planRequiresCalculusII } from '../lib/mathPlacement'

// Math placement on a plan whose department map requires Calculus II (the engineering majors). The placement chain and the
// onboarding sequence come from the plan's own slots; a student placed below Calculus I, or on the extended track, is
// delayed against the department map and never put ahead of it. Real catalog, same builder as engineeringMaps.test.js.

const T = catalog.tables
const courseMap = Object.fromEntries(T.courses.map(c => [c.code, { credits: c.credits, standing_req: c.standing_req ?? null }]))
const prereqMap = buildRequirementMap(T.prerequisite_entries)
const coreqMap = buildRequirementMap(T.corequisite_entries)

const slotsOf = (program, year = '2026-2027') => {
  const conc = T.concentrations.find(c => c.code === program)
  return T.requirement_slots.filter(s => s.concentration_id === conc.id && s.catalog_year === year)
}
const build = (slots, act) => buildDegreePlan({
  slots, courseMap, prereqMap, coreqMap, priorCredits: [],
  studentProfile: { student_type: 'incoming_freshman', act_math: act, start_season: 'Fall' },
})

describe('mathChainFor', () => {
  const me = slotsOf('me')
  const ne = slotsOf('ne')
  const csc = slotsOf('core')

  it('an engineering plan is read from its own slots', () => {
    expect(planRequiresCalculusII(me)).toBe(true)
    expect(planRequiresCalculusII(csc)).toBe(false)
    expect(mathChainFor('MATH1910', me, 'incoming_freshman')).toEqual(['MATH1910', 'MATH1920', 'MATH2010'])
    expect(mathChainFor('MATH1000', me, 'incoming_freshman')).toEqual(['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2010'])
  })

  it('the extended track still takes Calculus II after MATH 1906 (it was dropped, and MATH 2110 and 2120 lost their prerequisite)', () => {
    expect(mathChainFor('MATH1904', me, 'incoming_freshman')).toEqual(['MATH1904', 'MATH1906', 'MATH1920', 'MATH2010'])
  })

  it('takes MATH 2010 only where the plan has it (Nuclear Engineering does not)', () => {
    expect(ne.some(s => s.class_code === 'MATH2010')).toBe(false)
    expect(mathChainFor('MATH1910', ne, 'incoming_freshman')).toEqual(['MATH1910', 'MATH1920'])
    expect(mathChainFor('MATH1904', ne, 'incoming_freshman')).toEqual(['MATH1904', 'MATH1906', 'MATH1920'])
  })

  it('a Computer Science plan keeps its tables, for every student type', () => {
    expect(mathChainFor('MATH1904', csc, 'incoming_freshman')).toEqual(['MATH1904', 'MATH1906', 'MATH2010'])
    expect(mathChainFor('MATH1910', csc, 'incoming_freshman')).toEqual(['MATH1910', 'MATH2010'])
    expect(mathChainFor('MATH1910', csc, 'returning')).toEqual(['MATH1910', 'MATH1920', 'MATH2010'])
    expect(mathChainFor('MATH1904', csc, 'returning')).toEqual(['MATH1904', 'MATH1906', 'MATH2010'])
    expect(mathChainFor('MATH5555', csc, 'incoming_freshman')).toEqual(['MATH1910', 'MATH2010'])
  })
})

describe('mathSequenceFor (what onboarding shows)', () => {
  it('Mechanical Engineering: its own later math, in the map\'s order, and no statistics choice (BUG-55)', () => {
    expect(mathSequenceFor('MATH1910', slotsOf('me'), 'incoming_freshman')).toEqual({
      chain: ['MATH1910', 'MATH1920', 'MATH2010'], later: ['MATH2120', 'MATH2110'], fork: [],
    })
  })

  it('Nuclear Engineering: Calculus III and Differential Equations, no MATH 2010', () => {
    const seq = mathSequenceFor('MATH1910', slotsOf('ne'), 'incoming_freshman')
    expect(seq.chain).toEqual(['MATH1910', 'MATH1920'])
    expect(seq.later).toEqual(expect.arrayContaining(['MATH2110', 'MATH2120']))
    expect(seq.chain).not.toContain('MATH2010')
    expect(seq.fork).toEqual([])
  })

  it('every Computer Science program still shows its chain and the statistics choice, and nothing else', () => {
    for (const code of ['core', 'cybersecurity', 'hpc']) {
      const seq = mathSequenceFor('MATH1910', slotsOf(code), 'incoming_freshman')
      expect(seq, code).toEqual({ chain: ['MATH1910', 'MATH2010'], later: [], fork: ['MATH3070', 'MATH3470'] })
    }
  })
})

describe.each(['me', 'me_aero', 'me_mechatronics', 'me_vehicle', 'ne'])('%s: every placement gets a plan that holds the map\'s order', program => {
  const slots = slotsOf(program)
  const code = id => slots.find(s => s.id === id).class_code

  it.each([null, 18, 22, 25, 28, 29])('ACT Math %s', act => {
    const r = build(slots, act)
    const active = slots.filter(s => !r.archived[s.id])
    const semOf = c => r.assignments[active.find(s => s.class_code === c)?.id]

    // Calculus II is never skipped, whatever the placement
    expect(r.archived[slots.find(s => s.class_code === 'MATH1920').id]).toBeUndefined()
    // nothing starts before the semester the department map gives it
    for (const s of active.filter(x => Number.isInteger(x.map_semester))) {
      expect(r.assignments[s.id], `${s.class_code} (map ${s.map_semester})`).toBeGreaterThanOrEqual(s.map_semester)
    }
    // the calculus order: Calculus I (or its extended pair) before II, II before III and Differential Equations
    const first = semOf('MATH1910') ?? semOf('MATH1906')
    expect(semOf('MATH1920')).toBeGreaterThan(first)
    for (const c of ['MATH2110', 'MATH2120']) expect(semOf(c), c).toBeGreaterThan(semOf('MATH1920'))
    if (semOf('MATH1906')) expect(semOf('MATH1906')).toBeGreaterThan(semOf('MATH1904'))
    // a regular load, and every active slot placed
    const loads = {}
    for (const s of active) loads[r.assignments[s.id]] = (loads[r.assignments[s.id]] ?? 0) + (s.flex_credits ?? courseMap[s.class_code]?.credits ?? 3)
    expect(Math.max(...Object.values(loads))).toBeLessThanOrEqual(21)
    expect(active.every(s => Number.isInteger(r.assignments[s.id]) && code(s.id))).toBe(true)
  })

  it('ACT Math 28 (extended calculus) archives MATH 1910 and keeps 1904, 1906 and 1920', () => {
    const r = build(slots, 28)
    const archived = slots.filter(s => r.archived[s.id]).map(s => s.class_code)
    expect(archived).toContain('MATH1910')
    for (const c of ['MATH1904', 'MATH1906', 'MATH1920']) expect(archived, c).not.toContain(c)
  })
})

describe('Mechanical Engineering with no math score', () => {
  const slots = slotsOf('me')
  const r = build(slots, null)
  const semOf = c => r.assignments[slots.find(s => s.class_code === c).id]

  it('puts Senior Design in the last two years, not the second (it had no prerequisite, so nothing held it back)', () => {
    expect(semOf('MATH1000')).toBe(1)
    expect(semOf('ME4410')).toBeGreaterThanOrEqual(7)
    expect(semOf('ME4420')).toBeGreaterThan(semOf('ME4410'))
  })
})
