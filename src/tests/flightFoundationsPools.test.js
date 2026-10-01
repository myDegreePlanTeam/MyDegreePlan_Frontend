import { describe, it, expect } from 'vitest'
import {
  POOL_COURSES, POOL_LABELS, POOL_CREDIT_ESTIMATES, REQUIREMENT_POOLS,
  resolvePool, resolveSatisfiesPool, mapSatisfiesPoolForPlan, formatMissingForDisplay,
} from '../lib/poolResolver.js'
import { resolveTransferCredits } from '../lib/transferCredits.js'
import { computePlanCompleteness } from '../lib/usePlanCompleteness.js'
import {
  getFlightFoundationsStatus, evaluateFlightFoundationsForPlan, FF_POOL_CATEGORIES,
  listFlightFoundationsCourses,
} from '../lib/flightFoundations.js'

const FF_POOLS = ['FF_SOCIAL', 'FF_HUMANITIES', 'FF_LITERACY']

// ── A Flight Foundations HPC-style plan ──────────────────────────────────────
const FF_SLOTS = [
  { id: 1,  class_code: 'ENGL1010',      is_pool: false },
  { id: 2,  class_code: 'HIST2010',      is_pool: false },
  { id: 3,  class_code: 'HIST2020',      is_pool: false },
  { id: 4,  class_code: 'FF_SOCIAL',     is_pool: true },
  { id: 5,  class_code: 'FF_SOCIAL',     is_pool: true },
  { id: 6,  class_code: 'FF_HUMANITIES', is_pool: true },
  { id: 7,  class_code: 'FF_LITERACY',   is_pool: true },
  { id: 8,  class_code: 'FF_HUMANITIES', is_pool: true },
  { id: 9,  class_code: 'SCIENCE',       is_pool: true },
  { id: 10, class_code: 'CSC_ELECTIVE',  is_pool: true },
]

describe('Flight Foundations pools', () => {
  it('define every pool with a label, credit estimate and requirement-pool status', () => {
    for (const pool of FF_POOLS) {
      expect(POOL_COURSES[pool].length, pool).toBeGreaterThan(0)
      expect(POOL_LABELS[pool], pool).toBeTruthy()
      expect(POOL_CREDIT_ESTIMATES[pool], pool).toBe(3)
      expect(REQUIREMENT_POOLS.has(pool), pool).toBe(true)
    }
  })

  it('take their membership from the Flight Foundations category lists', () => {
    expect(POOL_COURSES.FF_SOCIAL).toEqual(listFlightFoundationsCourses('SOC'))
    expect(POOL_COURSES.FF_HUMANITIES).toEqual(listFlightFoundationsCourses('HUM'))
    expect(POOL_COURSES.FF_LITERACY).toEqual(listFlightFoundationsCourses('LIT'))
    expect(Object.keys(FF_POOL_CATEGORIES).sort()).toEqual([...FF_POOLS].sort())
  })

  it('offer the newly eligible courses and drop the retired ones', () => {
    expect(POOL_COURSES.FF_SOCIAL).toContain('POLS1100')
    expect(POOL_COURSES.FF_SOCIAL).not.toContain('AGBE2010')
    expect(POOL_COURSES.FF_SOCIAL).not.toContain('ANTH1100')
    expect(POOL_COURSES.FF_HUMANITIES).toContain('ENGL2400')
    expect(POOL_COURSES.FF_HUMANITIES).not.toContain('FLST3520')
    expect(POOL_COURSES.FF_LITERACY).toContain('CSC2570')
  })

  it('do not disturb the legacy pools', () => {
    expect(POOL_COURSES.GEN_ED).toContain('AGBE2010')
    expect(POOL_COURSES.GEN_ED).toContain('HIST2010')
    expect(POOL_COURSES.SCIENCE).toHaveLength(11)
    expect(POOL_LABELS.GEN_ED).toBe('General Education')
  })

  it('keep the department science sequences: no newly eligible science course is in SCIENCE', () => {
    for (const code of ['ASTR1010', 'BIOL1010', 'CHEM1010', 'GEOL1090', 'PHYS1090']) {
      expect(POOL_COURSES.SCIENCE).not.toContain(code)
    }
  })

  it('resolve against the live catalog, skipping courses the catalog lacks', () => {
    const courseMap = { PSY1030: { code: 'PSY1030' }, SOC1010: { code: 'SOC1010' } }
    expect(resolvePool('FF_SOCIAL', courseMap).map(c => c.code)).toEqual(['PSY1030', 'SOC1010'])
  })
})

describe('resolveSatisfiesPool on a Flight Foundations plan', () => {
  it('routes a social-science course to FF_SOCIAL', () => {
    expect(resolveSatisfiesPool('PSY1030', FF_SLOTS)).toBe('FF_SOCIAL')
  })

  it('routes a humanities course to FF_HUMANITIES', () => {
    expect(resolveSatisfiesPool('PHIL1030', FF_SLOTS)).toBe('FF_HUMANITIES')
  })

  it('routes the three literature courses to FF_HUMANITIES: literature is not a separate requirement', () => {
    for (const code of ['ENGL2130', 'ENGL2235', 'ENGL2330']) {
      expect(resolveSatisfiesPool(code, FF_SLOTS)).toBe('FF_HUMANITIES')
    }
  })

  it('still gives literature courses to ENG_LIT when a plan has both pools (legacy-style ordering)', () => {
    const both = [
      { id: 1, class_code: 'FF_HUMANITIES', is_pool: true },
      { id: 2, class_code: 'ENG_LIT', is_pool: true },
    ]
    expect(resolveSatisfiesPool('ENGL2130', both)).toBe('ENG_LIT')
  })

  it('gives CSC2220 to the literacy slot ahead of the CSC elective', () => {
    expect(resolveSatisfiesPool('CSC2220', FF_SLOTS)).toBe('FF_LITERACY')
  })

  it('finds no pool for a fixed History course (its slot is matched by code)', () => {
    expect(resolveSatisfiesPool('HIST2010', FF_SLOTS)).toBeNull()
  })

  it('leaves a Core plan (no literacy slot) routing CSC2220 to its lower elective', () => {
    const core = [{ id: 1, class_code: 'CSC_LOWER_ELECTIVE', is_pool: true }]
    expect(resolveSatisfiesPool('CSC2220', core)).toBe('CSC_LOWER_ELECTIVE')
  })
})

describe('mapSatisfiesPoolForPlan', () => {
  const LEGACY_SLOTS = [{ id: 1, class_code: 'GEN_ED', is_pool: true }]

  it('keeps GEN_ED on a plan that has GEN_ED slots', () => {
    expect(mapSatisfiesPoolForPlan('GEN_ED', 'PSY1030', LEGACY_SLOTS)).toBe('GEN_ED')
  })

  it('resolves GEN_ED against a Flight Foundations plan', () => {
    expect(mapSatisfiesPoolForPlan('GEN_ED', 'PSY1030', FF_SLOTS)).toBe('FF_SOCIAL')
    expect(mapSatisfiesPoolForPlan('GEN_ED', 'HIST2210', FF_SLOTS)).toBe('FF_HUMANITIES')
  })

  it('yields null for a History credit on a Flight Foundations plan', () => {
    expect(mapSatisfiesPoolForPlan('GEN_ED', 'HIST2010', FF_SLOTS)).toBeNull()
  })

  it('passes every other pool through, and tolerates unknown slots', () => {
    expect(mapSatisfiesPoolForPlan('SCIENCE', 'CHEM1110', FF_SLOTS)).toBe('SCIENCE')
    expect(mapSatisfiesPoolForPlan('ENG_LIT', 'ENGL2130', FF_SLOTS)).toBe('ENG_LIT')
    expect(mapSatisfiesPoolForPlan(null, 'X', FF_SLOTS)).toBeNull()
    expect(mapSatisfiesPoolForPlan('GEN_ED', 'PSY1030', [])).toBe('GEN_ED')
    expect(mapSatisfiesPoolForPlan('GEN_ED', 'PSY1030', undefined)).toBe('GEN_ED')
  })
})

describe('prior credit archiving on a Flight Foundations plan', () => {
  const prior = (id, code, pool = null, credits = 3) => ({
    id, satisfies_course_code: code, satisfies_pool: pool, credits_awarded: credits,
  })

  it('archives the fixed History slot from its course code', () => {
    const r = resolveTransferCredits([prior('a', 'HIST2010')], {}, FF_SLOTS)
    expect(r).toEqual({ 2: true })
  })

  it('archives a FF_SOCIAL slot from a satisfies_pool credit', () => {
    const r = resolveTransferCredits([prior('a', 'PSY1030', 'FF_SOCIAL')], {}, FF_SLOTS)
    expect(r).toEqual({ 4: true })
  })

  it('archives one social slot per credit and ignores a third (Social is capped at 2 slots)', () => {
    const r = resolveTransferCredits([
      prior('a', 'PSY1030', 'FF_SOCIAL'), prior('b', 'ECON2010', 'FF_SOCIAL'),
      prior('c', 'POLS1030', 'FF_SOCIAL'),
    ], {}, FF_SLOTS)
    expect(Object.keys(r).sort()).toEqual(['4', '5'])
  })

  it('archives the literacy slot from a CSC2220 transfer', () => {
    const r = resolveTransferCredits([prior('a', 'CSC2220', 'FF_LITERACY')], {}, FF_SLOTS)
    expect(r).toEqual({ 7: true })
  })
})

describe('getFlightFoundationsStatus', () => {
  const courses = {
    ENGL1010: { credits: 3 }, HIST2010: { credits: 3 }, HIST2020: { credits: 3 },
    PSY1030: { credits: 3 }, ECON2010: { credits: 3 }, PHIL1030: { credits: 3 },
    ENGL2130: { credits: 3 }, DS2810: { credits: 3 }, CHEM1110: { credits: 4 },
  }

  it('reports each category in the panel shape', () => {
    const status = getFlightFoundationsStatus({ 4: 'PSY1030' }, [], FF_SLOTS, courses)
    const soc = status.categories.find(c => c.category === 'SOC')
    expect(soc).toMatchObject({
      label: 'Social and Behavioral Sciences', filled: 3, required: 6, max: 6,
      satisfied: false, remaining: 3,
    })
    expect(status.totalRequired).toBe(41)
    expect(status.program).toBe('flight_foundations')
  })

  it('counts fixed History slots, filled pool slots and prior credits together', () => {
    const prior = [{ id: 'p', satisfies_course_code: 'ECON2010', credits_awarded: 3 }]
    const status = getFlightFoundationsStatus(
      { 4: 'PSY1030', 6: 'PHIL1030', 8: 'ENGL2130' }, prior, FF_SLOTS, courses,
    )
    const by = code => status.categories.find(c => c.category === code)
    expect(by('HIST').filled).toBe(6)
    expect(by('SOC').filled).toBe(6)
    expect(by('HUM').filled).toBe(6)
  })

  it('skips archived slots', () => {
    const archived = evaluateFlightFoundationsForPlan({}, [], FF_SLOTS, courses, [], { 2: 'not_applicable' })
    expect(archived.categories.find(c => c.code === 'HIST').raw).toBe(3)
  })

  it('does not count a course from a slot archived as not_applicable', () => {
    const slots = [
      { id: 1, class_code: 'MATH1710', is_pool: false },
      { id: 2, class_code: 'MATH1910', is_pool: false },
    ]
    const c = { MATH1710: { credits: 3 }, MATH1910: { credits: 4 } }
    const ev = evaluateFlightFoundationsForPlan({}, [], slots, c, [], { 1: 'not_applicable' })
    expect(ev.categories.find(x => x.code === 'QR').courses.map(x => x.code)).toEqual(['MATH1910'])
  })
})

describe('computePlanCompleteness with Flight Foundations pools', () => {
  it('treats FF pool slots as gen-ed slots: unsatisfied categories block completion', () => {
    const slots = [{ id: 1, class_code: 'FF_SOCIAL', is_pool: true }]
    const r = computePlanCompleteness(slots, { 1: 'PSY1030' }, [{ category: 'SOC', satisfied: false }])
    expect(r.genEdSatisfied).toBe(false)
    expect(r.isComplete).toBe(false)
  })

  it('completes when every category row is satisfied', () => {
    const slots = [{ id: 1, class_code: 'FF_SOCIAL', is_pool: true }]
    const r = computePlanCompleteness(slots, { 1: 'PSY1030' }, [{ category: 'SOC', satisfied: true }])
    expect(r.isComplete).toBe(true)
  })
})

describe('formatMissingForDisplay', () => {
  it('still collapses the oral-communication pair to its label', () => {
    expect(formatMissingForDisplay(['(COMM2025 or PC2500)'])).toBe('Communications')
  })
})
