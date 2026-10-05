import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { POOL_LIMITS, POOL_NOTES, getPoolLimitWarnings, limitBrokenByPick } from '../lib/poolResolver'
import { buildPlanIssues } from '../lib/planIssues'

// The catalog's Area of Emphasis rules for Mechanical Engineering, enforced from the pool's `limits` in pools.json: at least 9
// of the 15 hours from the ME course list (at most 6 from outside it), at most 3 hours of BMGT 3510 / ENGR 4510 / ENTR 4500, and
// a note for what only a person can approve.

const T = catalog.tables
const courses = Object.fromEntries(T.courses.map(c => [c.code, { code: c.code, credits: c.credits }]))
const meSlots = T.requirement_slots.filter(s => s.concentration_id === T.concentrations.find(c => c.code === 'me').id && s.catalog_year === '2026-2027')
const aoe = meSlots.filter(s => s.class_code === 'ME_ELECTIVE')
const fill = (...codes) => Object.fromEntries(codes.map((code, i) => [aoe[i].id, code]))

describe('the ME Area of Emphasis pool carries the catalog limits', () => {
  it('has the two limits and the approval note', () => {
    expect(aoe).toHaveLength(5)
    expect(POOL_LIMITS.ME_ELECTIVE.map(l => [l.label, l.maxHours])).toEqual([['Courses outside the ME list', 6], ['General engineering and business courses', 3]])
    expect(POOL_NOTES.ME_ELECTIVE).toMatch(/approval of the instructor and the ME department/)
  })
})

describe('getPoolLimitWarnings', () => {
  it('has nothing to say about ME courses only, or an empty plan', () => {
    expect(getPoolLimitWarnings({}, meSlots, courses)).toEqual({})
    expect(getPoolLimitWarnings(fill('ME4020', 'ME4060', 'ME4120', 'ME4140', 'ME4180'), meSlots, courses)).toEqual({})
  })

  it('allows two courses from outside the ME list (6 hours) and flags a third', () => {
    expect(getPoolLimitWarnings(fill('ME4020', 'ME4060', 'ME4120', 'MATH4530', 'MATH3470'), meSlots, courses)).toEqual({})
    const warned = getPoolLimitWarnings(fill('ME4020', 'ME4060', 'MATH4530', 'MATH3470', 'MET4400'), meSlots, courses)
    expect(Object.keys(warned).map(Number).sort()).toEqual([aoe[2].id, aoe[3].id, aoe[4].id].sort())
    expect(warned[aoe[2].id][0]).toMatchObject({ label: 'Courses outside the ME list', hours: 9, maxHours: 6 })
    expect(warned[aoe[2].id][0].why).toMatch(/At least 9 of the 15/)
  })

  it('allows one general engineering or business course (3 hours) and flags two, in both limits', () => {
    expect(getPoolLimitWarnings(fill('ME4020', 'ME4060', 'ME4120', 'ME4140', 'BMGT3510'), meSlots, courses)).toEqual({})
    const warned = getPoolLimitWarnings(fill('ME4020', 'ME4060', 'ME4120', 'BMGT3510', 'ENGR4510'), meSlots, courses)
    expect(Object.keys(warned).map(Number).sort()).toEqual([aoe[3].id, aoe[4].id].sort())
    expect(warned[aoe[3].id].map(w => w.label)).toEqual(['General engineering and business courses'])
    expect(warned[aoe[3].id][0]).toMatchObject({ hours: 6, maxHours: 3 })
  })

  it('counts the hours the student chose for a course with a range', () => {
    // ME 4900 is 1-3 hours and on the ME list, so it never counts as outside it; a 1-hour MET pick does
    const withHours = { ...courses, MET4400: { code: 'MET4400', credits: 1 }, MATH4530: { code: 'MATH4530', credits: 1 }, MATH3470: { code: 'MATH3470', credits: 1 }, MET4450: { code: 'MET4450', credits: 1 } }
    expect(getPoolLimitWarnings(fill('ME4020', 'ME4060', 'MATH4530', 'MATH3470', 'MET4400'), meSlots, withHours)).toEqual({})
    expect(Object.keys(getPoolLimitWarnings(fill('ME4020', 'ME4060', 'MATH4530', 'MATH3470', 'MET4400'), meSlots, { ...withHours, MET4400: { code: 'MET4400', credits: 5 } }))).toHaveLength(3)
  })

  it('ignores an archived slot (a prior credit covers it)', () => {
    const picks = fill('ME4020', 'ME4060', 'MATH4530', 'MATH3470', 'MET4400')
    expect(getPoolLimitWarnings(picks, meSlots, courses, { [aoe[4].id]: 'prior_credit' })).toEqual({})
  })

  it('does not touch another pool or a program without limits', () => {
    const csc = T.requirement_slots.filter(s => s.concentration_id === T.concentrations.find(c => c.code === 'core').id && s.catalog_year === '2026-2027')
    const picks = Object.fromEntries(csc.filter(s => s.is_pool).map(s => [s.id, 'MATH4530']))
    expect(getPoolLimitWarnings(picks, csc, courses)).toEqual({})
  })
})

describe('limitBrokenByPick (the slot picker)', () => {
  const slot = aoe[4]
  const pick = code => ({ code, credits: courses[code].credits })

  it('allows a course that keeps the plan inside both limits', () => {
    expect(limitBrokenByPick(slot, pick('ME4810'), fill('ME4020', 'ME4060', 'MATH4530', 'MATH3470'), meSlots, courses)).toBeNull()
    expect(limitBrokenByPick(slot, pick('BMGT3510'), fill('ME4020', 'ME4060', 'ME4120', 'ME4140'), meSlots, courses)).toBeNull()
  })

  it('refuses a third course from outside the ME list, with the catalog\'s reason', () => {
    expect(limitBrokenByPick(slot, pick('MET4400'), fill('ME4020', 'ME4060', 'MATH4530', 'MATH3470'), meSlots, courses)).toMatch(/At least 9 of the 15/)
  })

  it('refuses a second general engineering or business course', () => {
    expect(limitBrokenByPick(slot, pick('ENGR4510'), fill('ME4020', 'ME4060', 'ME4120', 'BMGT3510'), meSlots, courses)).toMatch(/At most 3 hours of BMGT 3510/)
  })

  it('replaces the slot\'s own pick instead of adding to it', () => {
    // slot 4 already holds BMGT 3510: choosing ENGR 4510 for the same slot is one such course, not two
    expect(limitBrokenByPick(slot, pick('ENGR4510'), fill('ME4020', 'ME4060', 'ME4120', 'ME4140', 'BMGT3510'), meSlots, courses)).toBeNull()
  })

  it('has no opinion about a pool without limits', () => {
    const science = meSlots.find(s => s.class_code === 'COMM_REQ')
    expect(limitBrokenByPick(science, pick('COMM2025'), {}, meSlots, courses)).toBeNull()
  })
})

describe('the Issues list', () => {
  it('reports a pick over a limit as a warning on its slot', () => {
    const warnings = getPoolLimitWarnings(fill('ME4020', 'ME4060', 'ME4120', 'BMGT3510', 'ENGR4510'), meSlots, courses)
    const issues = buildPlanIssues({
      semesters: [{ semNum: 8, label: 'Spring 2030', credits: 15, completed: false, items: [{ key: aoe[3].id, code: 'BMGT3510' }, { key: aoe[4].id, code: 'ENGR4510' }] }],
      poolLimitWarnings: warnings,
    })
    const limit = issues.filter(i => i.id.startsWith('pool-limit:'))
    expect(limit).toHaveLength(2)
    expect(limit[0]).toMatchObject({ severity: 'warning', title: 'Too many hours of general engineering and business courses' })
    expect(limit[0].body).toMatch(/6 hours are chosen and at most 3 count/)
  })
})
