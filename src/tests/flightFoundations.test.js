import { describe, it, expect } from 'vitest'
import {
  FF_CATEGORIES, FF_TOTAL_HOURS, FF_FLEX_HOURS, FF_INTRO_LANGUAGE_COURSES,
  getFlightFoundationsCategory, getFlightFoundationsCategoryInfo,
  listFlightFoundationsCourses, isFlightFoundationsCourse,
  getGenEdProgram, evaluateFlightFoundations, evaluateFlightFoundationsForPlan, getPlanMinimums,
} from '../lib/flightFoundations.js'

const e = (code, credits) => ({ code, credits })
const cat = (result, code) => result.categories.find(c => c.code === code)

// A plan that lands on exactly 41: the shape a CSC student reaches —
// science 8 hrs, humanities at its 6-hr floor, literacy at its 3-hr floor.
const FULL_PLAN = [
  e('ENGL1010'), e('ENGL1020'), e('COMM2025'),
  e('MATH1910'),
  e('HIST2010'), e('HIST2020'),
  e('ECON2010'), e('PSY1030'),
  e('ART1035'), e('PHIL1030'),
  e('CHEM1110'), e('CHEM1120'),
  e('CSC2220'),
]

describe('program definition', () => {
  it('fixed categories + ranged minimums make 37 hrs, leaving 4 flex of 41', () => {
    expect(FF_CATEGORIES.reduce((s, c) => s + c.min, 0)).toBe(37)
    expect(FF_TOTAL_HOURS).toBe(41)
    expect(FF_FLEX_HOURS).toBe(4)
  })

  it('has the catalog hour ranges', () => {
    const range = code => {
      const c = getFlightFoundationsCategoryInfo(code)
      return [c.min, c.max]
    }
    expect(range('COMM_COMP')).toEqual([6, 6])
    expect(range('COMM_ORAL')).toEqual([3, 3])
    expect(range('QR')).toEqual([3, 3])
    expect(range('HIST')).toEqual([6, 6])
    expect(range('SOC')).toEqual([6, 6])
    expect(range('HUM')).toEqual([6, 9])
    expect(range('SCI')).toEqual([4, 8])
    expect(range('LIT')).toEqual([3, 4])
  })

  it('Communication is 9 hrs: 6 composition + 3 oral', () => {
    const comm = FF_CATEGORIES.filter(c => c.group === 'Communication')
    expect(comm.reduce((s, c) => s + c.min, 0)).toBe(9)
  })

  it('lists 97 eligible courses with the published per-category counts', () => {
    const counts = Object.fromEntries(FF_CATEGORIES.map(c => [c.code, c.courses.length]))
    expect(counts).toEqual({
      COMM_COMP: 2, COMM_ORAL: 3, QR: 11, HIST: 2, SOC: 13, HUM: 29, SCI: 26, LIT: 11,
    })
  })

  it('no course is eligible for more than one category', () => {
    const all = FF_CATEGORIES.flatMap(c => c.courses)
    expect(new Set(all).size).toBe(all.length)
  })

  it('looks courses up by category', () => {
    expect(getFlightFoundationsCategory('HIST2010')).toBe('HIST')
    expect(getFlightFoundationsCategory('CSC2220')).toBe('LIT')
    expect(getFlightFoundationsCategory('MATH1910')).toBe('QR')
    expect(getFlightFoundationsCategory('CSC1300')).toBeNull()
    expect(isFlightFoundationsCourse('PHIL1030')).toBe(true)
    expect(isFlightFoundationsCourse('CSC1300')).toBe(false)
    expect(listFlightFoundationsCourses('HIST')).toEqual(['HIST2010', 'HIST2020'])
    expect(listFlightFoundationsCourses('NOPE')).toEqual([])
  })

  it('drops the legacy-only courses and adds the newly eligible ones', () => {
    for (const gone of ['AGBE2010', 'ANTH1100', 'FLST3520']) {
      expect(isFlightFoundationsCourse(gone)).toBe(false)
    }
    for (const added of ['ART3170', 'ENGL2130', 'ENGL2400', 'NURS2400', 'POLS1100', 'SPAN1015', 'MATH1845']) {
      expect(isFlightFoundationsCourse(added)).toBe(true)
    }
  })

  it('returns a copy from listFlightFoundationsCourses', () => {
    listFlightFoundationsCourses('HIST').push('X')
    expect(listFlightFoundationsCourses('HIST')).toHaveLength(2)
  })
})

describe('getGenEdProgram', () => {
  it('Fall 2026 and later is Flight Foundations', () => {
    expect(getGenEdProgram('Fall', 2026)).toBe('flight_foundations')
    expect(getGenEdProgram('Spring', 2027)).toBe('flight_foundations')
    expect(getGenEdProgram('Summer', 2027)).toBe('flight_foundations')
    expect(getGenEdProgram('Fall', 2030)).toBe('flight_foundations')
  })

  it('through Summer 2026 is the legacy program', () => {
    expect(getGenEdProgram('Summer', 2026)).toBe('legacy')
    expect(getGenEdProgram('Spring', 2026)).toBe('legacy')
    expect(getGenEdProgram('Fall', 2025)).toBe('legacy')
  })

  it('accepts a numeric string year and returns null when the term is unknown', () => {
    expect(getGenEdProgram('Fall', '2026')).toBe('flight_foundations')
    expect(getGenEdProgram(null, 2026)).toBeNull()
    expect(getGenEdProgram('Fall', undefined)).toBeNull()
    expect(getGenEdProgram('Fall', 'abc')).toBeNull()
  })
})

describe('evaluateFlightFoundations — totals', () => {
  it('empty input: nothing earned, 41 remaining, not satisfied', () => {
    const r = evaluateFlightFoundations([])
    expect(r.totalEarned).toBe(0)
    expect(r.totalRemaining).toBe(41)
    expect(r.satisfied).toBe(false)
    expect(r.flex).toEqual({ total: 4, used: 0, remaining: 4 })
    expect(r.categories).toHaveLength(8)
  })

  it('tolerates null / undefined / junk entries', () => {
    expect(evaluateFlightFoundations(undefined).totalEarned).toBe(0)
    expect(evaluateFlightFoundations(null).totalEarned).toBe(0)
    expect(evaluateFlightFoundations([null, {}, { code: '' }]).totalEarned).toBe(0)
  })

  it('a full CSC-shaped plan is satisfied at exactly 41', () => {
    const r = evaluateFlightFoundations(FULL_PLAN)
    expect(r.totalEarned).toBe(41)
    expect(r.totalRemaining).toBe(0)
    expect(r.satisfied).toBe(true)
    expect(r.flex.used).toBe(4)
    expect(r.flex.remaining).toBe(0)
  })

  it('reports per-category earned/remaining/satisfied', () => {
    const r = evaluateFlightFoundations([e('ENGL1010'), e('HIST2010'), e('CHEM1110')])
    expect(cat(r, 'COMM_COMP')).toMatchObject({ raw: 3, earned: 3, remaining: 3, satisfied: false })
    expect(cat(r, 'HIST')).toMatchObject({ earned: 3, remaining: 3, satisfied: false })
    expect(cat(r, 'SCI')).toMatchObject({ earned: 4, remaining: 0, satisfied: true })
    expect(cat(r, 'HUM')).toMatchObject({ earned: 0, remaining: 6, satisfied: false })
  })
})

describe('evaluateFlightFoundations — caps and excess', () => {
  it('a fixed category counts no more than its hours', () => {
    const r = evaluateFlightFoundations([e('ECON2010'), e('ECON2020'), e('PSY1030'), e('SOC1010')])
    expect(cat(r, 'SOC')).toMatchObject({ raw: 12, earned: 6, excess: 6, satisfied: true })
    expect(r.totalEarned).toBe(6)
  })

  it('a 4-hr course in a 3-hr category earns 3 and leaves 1 excess hour', () => {
    const r = evaluateFlightFoundations([e('MATH1910')])
    expect(cat(r, 'QR')).toMatchObject({ raw: 4, earned: 3, excess: 1, satisfied: true })
  })

  it('MATH 1730 (5 hrs) satisfies QR with 2 excess hours', () => {
    const r = evaluateFlightFoundations([e('MATH1730')])
    expect(cat(r, 'QR')).toMatchObject({ raw: 5, earned: 3, excess: 2 })
  })

  it('a ranged category stops at its maximum', () => {
    const hum = ['ART1035', 'ART2000', 'ART2020', 'MUS1030', 'PHIL1030'].map(c => e(c))
    const r = evaluateFlightFoundations(hum)
    expect(cat(r, 'HUM')).toMatchObject({ raw: 15, earned: 9, excess: 6 })
  })
})

describe('evaluateFlightFoundations — shared flex hours', () => {
  it('only 4 flex hours count, however much surplus a student holds', () => {
    // Hum 9 (+3 flex) and Sci 8 (+4 flex) hold 7 flex hrs; only 4 count.
    const plan = [
      e('ART1035'), e('ART2000'), e('ART2020'),
      e('CHEM1110'), e('CHEM1120'),
    ]
    const r = evaluateFlightFoundations(plan)
    expect(r.flex.used).toBe(4)
    // Hum 6 + Sci 4 minimums + 4 flex = 14 of the 17 ranged hrs; Literacy's 3 are missing.
    expect(r.totalEarned).toBe(14)
    expect(r.satisfied).toBe(false)
  })

  it('surplus in one category cannot stand in for another category’s minimum', () => {
    // Everything but Literacy, with Hum 9 + Sci 8: Literacy still needs its 3.
    const plan = [
      ...FULL_PLAN.filter(c => c.code !== 'CSC2220'),
      e('ART2000'), // Hum 9
    ]
    const r = evaluateFlightFoundations(plan)
    expect(cat(r, 'LIT')).toMatchObject({ earned: 0, remaining: 3, satisfied: false })
    expect(r.satisfied).toBe(false)
    expect(r.totalEarned).toBe(38)
  })

  it('all minimums met but flex unspent is not yet satisfied', () => {
    // Hum 6, Sci 4, Literacy 3 = the 13 minimum hours; the 4 flex hrs are still open.
    const plan = [
      ...FULL_PLAN.filter(c => !['CHEM1120'].includes(c.code)),
    ]
    const r = evaluateFlightFoundations(plan)
    expect(r.categories.every(c => c.satisfied)).toBe(true)
    expect(r.flex).toEqual({ total: 4, used: 0, remaining: 4 })
    expect(r.totalEarned).toBe(37)
    expect(r.satisfied).toBe(false)
  })

  it('flex can be spent in Literacy (4 hrs via two DLED hours)', () => {
    const plan = [
      ...FULL_PLAN.filter(c => !['CHEM1120', 'CSC2220'].includes(c.code)),
      e('CSC2220', 3), e('DLED2000', 1),   // Literacy 4 → 1 flex hr
    ]
    const r = evaluateFlightFoundations(plan)
    expect(cat(r, 'LIT')).toMatchObject({ earned: 4 })
    expect(r.flex.used).toBe(1)
  })
})

describe('evaluateFlightFoundations — introductory language cap', () => {
  it('counts only 3 hrs of introductory language toward Humanities', () => {
    const r = evaluateFlightFoundations([e('SPAN1010'), e('FREN1010')])
    expect(cat(r, 'HUM')).toMatchObject({ raw: 6, earned: 3, excess: 3 })
    expect(r.languageExcess).toBe(3)
  })

  it('a non-introductory language course is not capped', () => {
    const r = evaluateFlightFoundations([e('SPAN1010'), e('SPAN2510'), e('FREN2510')])
    expect(cat(r, 'HUM')).toMatchObject({ raw: 9, earned: 9, excess: 0 })
    expect(r.languageExcess).toBe(0)
  })

  it('intro language plus other humanities still reaches the category maximum', () => {
    const r = evaluateFlightFoundations([
      e('SPAN1010'), e('GERM1010'), e('ART1035'), e('ART2000'), e('ART2020'),
    ])
    // 6 language hrs → 3 count; 9 other hrs → 12 countable, capped at 9
    expect(cat(r, 'HUM')).toMatchObject({ earned: 9 })
  })

  it('covers exactly the four elementary-level language courses', () => {
    expect([...FF_INTRO_LANGUAGE_COURSES].sort()).toEqual(['FREN1010', 'GERM1010', 'SPAN1010', 'SPAN1015'])
    for (const c of FF_INTRO_LANGUAGE_COURSES) expect(getFlightFoundationsCategory(c)).toBe('HUM')
  })
})

describe('evaluateFlightFoundations — entries', () => {
  it('counts a course code once', () => {
    const r = evaluateFlightFoundations([e('HIST2010'), e('HIST2010')])
    expect(cat(r, 'HIST').raw).toBe(3)
  })

  it('first entry for a code wins (so prior-credit hours are kept)', () => {
    const r = evaluateFlightFoundations([e('PHYS2110', 5), e('PHYS2110', 4)])
    expect(cat(r, 'SCI').raw).toBe(5)
  })

  it('counts cross-listed ENGL 2600 / PC 2600 once', () => {
    const r = evaluateFlightFoundations([e('ENGL2600'), e('PC2600')])
    expect(cat(r, 'LIT').raw).toBe(3)
    expect(r.nonFlightFoundation).toEqual([])
  })

  it('ignores courses outside Flight Foundations and reports them', () => {
    const r = evaluateFlightFoundations([e('CSC1300'), e('CSC3300'), e('HIST2010')])
    expect(r.nonFlightFoundation).toEqual(['CSC1300', 'CSC3300'])
    expect(r.totalEarned).toBe(3)
  })

  it('falls back to default credits when credits are missing or zero', () => {
    const r = evaluateFlightFoundations([e('CHEM1110'), e('MATH1910', 0), e('ART1035', undefined)])
    expect(cat(r, 'SCI').raw).toBe(4)
    expect(cat(r, 'QR').raw).toBe(4)
    expect(cat(r, 'HUM').raw).toBe(3)
  })

  it('uses the caller’s credits over the defaults (variable-credit DLED 2000)', () => {
    expect(cat(evaluateFlightFoundations([e('DLED2000', 1)]), 'LIT').raw).toBe(1)
    expect(cat(evaluateFlightFoundations([e('DLED2000', 2)]), 'LIT').raw).toBe(2)
    expect(cat(evaluateFlightFoundations([e('PHYS2110', 5)]), 'SCI').raw).toBe(5)
  })

  it('lists the counted courses per category', () => {
    const r = evaluateFlightFoundations([e('HIST2010'), e('HIST2020')])
    expect(cat(r, 'HIST').courses).toEqual([
      { code: 'HIST2010', credits: 3 }, { code: 'HIST2020', credits: 3 },
    ])
  })
})

describe('evaluateFlightFoundationsForPlan', () => {
  const slots = [
    { id: 1, class_code: 'ENGL1010', is_pool: false },
    { id: 2, class_code: 'MATH1910', is_pool: false },
    { id: 3, class_code: 'GEN_ED',   is_pool: true },
    { id: 4, class_code: 'GEN_ED',   is_pool: true },   // left empty
    { id: 5, class_code: 'CSC1300',  is_pool: false },
  ]
  const courses = {
    ENGL1010: { credits: 3 }, MATH1910: { credits: 4 }, PSY1030: { credits: 3 },
    CSC1300: { credits: 4 }, ECON2010: { credits: 3 }, HIST2010: { credits: 3 },
  }

  it('gathers fixed slots, filled pool slots and free-adds; skips empty pool slots', () => {
    const r = evaluateFlightFoundationsForPlan(
      { 3: 'PSY1030' }, [], slots, courses, [{ id: 9, course_code: 'ECON2010' }],
    )
    expect(cat(r, 'COMM_COMP').raw).toBe(3)
    expect(cat(r, 'QR').earned).toBe(3)
    expect(cat(r, 'SOC').raw).toBe(6)
    expect(r.nonFlightFoundation).toEqual(['CSC1300'])
  })

  it('counts a prior credit once, not again via the plan slot for the same course', () => {
    const prior = [{ id: 'a', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }]
    const r = evaluateFlightFoundationsForPlan({}, prior, slots, courses)
    expect(cat(r, 'COMM_COMP').raw).toBe(3)
  })

  it('counts prior credit toward its category even when the slot is archived away', () => {
    const prior = [{ id: 'a', satisfies_course_code: 'HIST2010', credits_awarded: 3 }]
    const r = evaluateFlightFoundationsForPlan({}, prior, [], courses)
    expect(cat(r, 'HIST').raw).toBe(3)
  })

  it('ignores placement-only prior credits (0 hrs) and entries with no course code', () => {
    const prior = [
      { id: 'a', satisfies_course_code: 'MATH1910', credits_awarded: 0 },
      { id: 'b', satisfies_course_code: null, satisfies_pool: 'GEN_ED', credits_awarded: 3 },
    ]
    const r = evaluateFlightFoundationsForPlan({}, prior, [], courses)
    expect(r.totalEarned).toBe(0)
  })

  it('handles an empty plan', () => {
    const r = evaluateFlightFoundationsForPlan({}, [], [], {})
    expect(r.totalEarned).toBe(0)
    expect(r.satisfied).toBe(false)
  })
})

describe("plan-committed minimums (a major science sequence)", () => {
  // The CSC shape: 8 science hrs committed, so the 4 flex hours are already spent.
  const csc = { SCI: 8 }

  it('raises the category minimum and leaves no shared flex', () => {
    const r = evaluateFlightFoundations([], { minimums: csc })
    expect(cat(r, 'SCI')).toMatchObject({ min: 8, max: 8, catalogMin: 4, catalogMax: 8 })
    expect(r.flex).toEqual({ total: 0, used: 0, remaining: 0 })
  })

  it('pins Humanities and Literacy at their minimums (6 and 3), not 6-9 and 3-4', () => {
    const r = evaluateFlightFoundations([], { minimums: csc })
    expect(cat(r, 'HUM')).toMatchObject({ min: 6, max: 6, catalogMax: 9 })
    expect(cat(r, 'LIT')).toMatchObject({ min: 3, max: 3, catalogMax: 4 })
  })

  it('does not count a third Humanities course beyond the 6 hrs', () => {
    const r = evaluateFlightFoundations(
      ['ART1035', 'ART2000', 'ART2020'].map(c => e(c)), { minimums: csc },
    )
    expect(cat(r, 'HUM')).toMatchObject({ raw: 9, earned: 6, excess: 3, satisfied: true })
  })

  it('reaches exactly 41 with 6 humanities, 8 science and 3 literacy hrs', () => {
    const r = evaluateFlightFoundations(FULL_PLAN, { minimums: csc })
    expect(r.satisfied).toBe(true)
    expect(r.totalEarned).toBe(41)
    expect(r.flex.total).toBe(0)
  })

  it('a 4-hr literacy course is not flex for that plan', () => {
    const plan = [...FULL_PLAN.filter(c => c.code !== 'CSC2220'), e('CSC2220', 3), e('DLED2000', 1)]
    const r = evaluateFlightFoundations(plan, { minimums: csc })
    expect(cat(r, 'LIT')).toMatchObject({ raw: 4, earned: 3, excess: 1 })
    expect(r.totalEarned).toBe(41)
  })

  it('keeps the program ranges when a plan commits nothing extra', () => {
    const r = evaluateFlightFoundations([], { minimums: { SCI: 4, HUM: 6 } })
    expect(cat(r, 'HUM')).toMatchObject({ min: 6, max: 9 })
    expect(cat(r, 'SCI')).toMatchObject({ min: 4, max: 8 })
    expect(r.flex.total).toBe(4)
  })

  it('clamps a commitment to the category range', () => {
    const r = evaluateFlightFoundations([], { minimums: { SCI: 12, QR: 9 } })
    expect(cat(r, 'SCI')).toMatchObject({ min: 8, max: 8 })
    expect(cat(r, 'QR')).toMatchObject({ min: 3, max: 3 })
  })

  it('shares the remaining flex between categories when only some is committed', () => {
    // 6 science hrs committed: 2 flex hrs left to spend in Humanities / Literacy / Science.
    const r = evaluateFlightFoundations([], { minimums: { SCI: 6 } })
    expect(r.flex.total).toBe(2)
    expect(cat(r, 'HUM').max).toBe(8)
    expect(cat(r, 'SCI').max).toBe(8)
    expect(cat(r, 'LIT').max).toBe(4)
  })
})

describe('getPlanMinimums', () => {
  const pool = (class_code, flex_credits = null) => ({ class_code, is_pool: true, flex_credits })

  it('counts 4 hrs per SCIENCE slot and 3 per Flight Foundations pool slot', () => {
    expect(getPlanMinimums([
      pool('SCIENCE'), pool('SCIENCE'), pool('FF_HUMANITIES'), pool('FF_HUMANITIES'),
      pool('FF_LITERACY'), pool('FF_SOCIAL'),
    ])).toEqual({ SCI: 8, HUM: 6, LIT: 3, SOC: 3 })
  })

  it('ignores fixed slots, other pools, and handles empty input', () => {
    expect(getPlanMinimums([{ class_code: 'HIST2010', is_pool: false }, pool('CSC_ELECTIVE')])).toEqual({})
    expect(getPlanMinimums(undefined)).toEqual({})
    expect(getPlanMinimums([])).toEqual({})
  })

  it("uses the slot own credit hours when it has them", () => {
    expect(getPlanMinimums([pool('FF_LITERACY', 4)])).toEqual({ LIT: 4 })
  })

  it('is applied by evaluateFlightFoundationsForPlan', () => {
    const slots = [pool('SCIENCE'), pool('SCIENCE')].map((s, i) => ({ ...s, id: i + 1 }))
    const ev = evaluateFlightFoundationsForPlan({}, [], slots, {})
    expect(cat(ev, 'SCI')).toMatchObject({ min: 8, max: 8 })
    expect(cat(ev, 'HUM').max).toBe(6)
  })
})
