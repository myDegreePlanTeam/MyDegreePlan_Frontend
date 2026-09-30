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
import {
  fetchRequirementSlots, programForProfile, programForEntryTerm, isMissingProgramColumn,
} from '../lib/requirementSlots.js'

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

// ── requirementSlots ─────────────────────────────────────────────────────────

// A recording stand-in for the supabase query builder.
function fakeClient(rowsByProgram, { failOn = null } = {}) {
  const calls = []
  const client = {
    calls,
    from(table) {
      const call = { table, filters: {}, order: [] }
      calls.push(call)
      const builder = {
        select(cols) { call.select = cols; return builder },
        eq(col, val) { call.filters[col] = val; return builder },
        order(col, opts) { call.order.push([col, opts]); return builder },
        then(resolve) {
          if (failOn && call.filters.gened_program === failOn) {
            return resolve({ data: null, error: { message: 'boom' } })
          }
          return resolve({ data: rowsByProgram[call.filters.gened_program] ?? [], error: null })
        },
      }
      return builder
    },
  }
  return client
}

describe('fetchRequirementSlots', () => {
  const ffRows = [{ id: 1, class_code: 'FF_SOCIAL' }]
  const legacyRows = [{ id: 9, class_code: 'GEN_ED' }]

  it('loads the wanted program for the concentration', async () => {
    const client = fakeClient({ flight_foundations: ffRows, legacy: legacyRows })
    const r = await fetchRequirementSlots(client, 7, 'flight_foundations', 'id, class_code')
    expect(r.data).toEqual(ffRows)
    expect(r.program).toBe('flight_foundations')
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].filters).toEqual({ concentration_id: 7, gened_program: 'flight_foundations' })
    expect(client.calls[0].table).toBe('requirement_slots')
  })

  it('always selects gened_program', async () => {
    const client = fakeClient({ legacy: legacyRows })
    await fetchRequirementSlots(client, 1, 'legacy', 'id, class_code')
    expect(client.calls[0].select).toBe('id, class_code, gened_program')
    await fetchRequirementSlots(client, 1, 'legacy', 'id, gened_program')
    expect(client.calls[1].select).toBe('id, gened_program')
  })

  it('applies the requested ordering', async () => {
    const client = fakeClient({ legacy: legacyRows })
    await fetchRequirementSlots(client, 1, 'legacy', 'id', [
      { column: 'semester_number' }, { column: 'slot_order', ascending: false },
    ])
    expect(client.calls[0].order).toEqual([
      ['semester_number', { ascending: true }], ['slot_order', { ascending: false }],
    ])
  })

  it('falls back to legacy when the concentration has no Flight Foundations slots (DSAI)', async () => {
    const client = fakeClient({ legacy: legacyRows })
    const r = await fetchRequirementSlots(client, 3, 'flight_foundations', 'id')
    expect(r.data).toEqual(legacyRows)
    expect(r.program).toBe('legacy')
    expect(client.calls.map(c => c.filters.gened_program)).toEqual(['flight_foundations', 'legacy'])
  })

  it('does not fall back on an error', async () => {
    const client = fakeClient({ legacy: legacyRows }, { failOn: 'flight_foundations' })
    const r = await fetchRequirementSlots(client, 3, 'flight_foundations', 'id')
    expect(r.error).toEqual({ message: 'boom' })
    expect(client.calls).toHaveLength(1)
  })

  it('treats an unknown program as legacy', async () => {
    const client = fakeClient({ legacy: legacyRows })
    const r = await fetchRequirementSlots(client, 1, 'something-else', 'id')
    expect(r.program).toBe('legacy')
    expect(client.calls[0].filters.gened_program).toBe('legacy')
  })
})

describe('program selection', () => {
  it('programForProfile defaults to legacy', () => {
    expect(programForProfile({ gened_program: 'flight_foundations' })).toBe('flight_foundations')
    expect(programForProfile({ gened_program: 'legacy' })).toBe('legacy')
    expect(programForProfile({})).toBe('legacy')
    expect(programForProfile(null)).toBe('legacy')
    expect(programForProfile({ gened_program: 'bogus' })).toBe('legacy')
  })

  it('programForEntryTerm: Fall 2026+ is Flight Foundations, earlier and unknown are legacy', () => {
    expect(programForEntryTerm('Fall', 2026)).toBe('flight_foundations')
    expect(programForEntryTerm('Spring', 2027)).toBe('flight_foundations')
    expect(programForEntryTerm('Summer', 2026)).toBe('legacy')
    expect(programForEntryTerm('Fall', 2024)).toBe('legacy')
    expect(programForEntryTerm(null, null)).toBe('legacy')
  })
})

describe('a database without the tier 21 column', () => {
  const missing = { code: '42703', message: 'column requirement_slots.gened_program does not exist' }

  // Fails any query that selects or filters on gened_program, like PostgREST does.
  function oldSchemaClient(rows) {
    const calls = []
    return {
      calls,
      from() {
        const call = { filters: {}, order: [] }
        calls.push(call)
        const b = {
          select(cols) { call.select = cols; return b },
          eq(col, val) { call.filters[col] = val; return b },
          order(col, opts) { call.order.push([col, opts]); return b },
          then(resolve) {
            const touches = /gened_program/.test(call.select ?? '') || 'gened_program' in call.filters
            return resolve(touches ? { data: null, error: missing } : { data: rows, error: null })
          },
        }
        return b
      },
    }
  }

  it('recognises the missing-column error', () => {
    expect(isMissingProgramColumn(missing)).toBe(true)
    expect(isMissingProgramColumn({ code: '42703', message: 'column x.y does not exist' })).toBe(true)
    expect(isMissingProgramColumn({ code: 'PGRST116', message: 'no rows' })).toBe(false)
    expect(isMissingProgramColumn(null)).toBe(false)
  })

  it('loads the unfiltered legacy slots, asking for neither the column nor a program', async () => {
    const rows = [{ id: 1, class_code: 'GEN_ED' }]
    const client = oldSchemaClient(rows)
    const r = await fetchRequirementSlots(client, 4, 'flight_foundations', 'id, class_code',
      [{ column: 'semester_number' }])
    expect(r.data).toEqual(rows)
    expect(r.error).toBeNull()
    expect(r.program).toBe('legacy')
    const last = client.calls.at(-1)
    expect(last.select).toBe('id, class_code')
    expect(last.filters).toEqual({ concentration_id: 4 })
    expect(last.order).toEqual([['semester_number', { ascending: true }]])
  })
})
