import { describe, it, expect } from 'vitest'
import { flattenReqArray, parseEquivalencies, assembleCatalog, POOL_CODES } from '../../scripts/catalogLib.mjs'
import catalogJson from '../data/catalog.json'

describe('flattenReqArray', () => {
  it('turns strings into AND groups and inner arrays into OR groups', () => {
    expect(flattenReqArray('X', ['A', ['B', 'C']])).toEqual([
      { course_code: 'X', required_code: 'A', group_index: 0, logic: 'AND' },
      { course_code: 'X', required_code: 'B', group_index: 1, logic: 'OR' },
      { course_code: 'X', required_code: 'C', group_index: 1, logic: 'OR' },
    ])
  })
  it('flattens double-nested OR groups (MATH1910 shape)', () => {
    const rows = flattenReqArray('MATH1910', ['MATH1730', ['MATH1710', ['MATH1720']]])
    expect(rows.filter(r => r.group_index === 1).map(r => r.required_code)).toEqual(['MATH1710', 'MATH1720'])
  })
})

describe('parseEquivalencies', () => {
  const sql = `
    DELETE FROM test_equivalencies WHERE test_type = 'ap_credit';
    INSERT INTO test_equivalencies (a) VALUES
      ('ap_credit', 'Biology', 3, 'BIOL1113', 4, NULL),
      ('test_out', 'Dante''s Inferno', NULL, 'ENGL1010', 3, 'GEN_ED'), -- trailing comment
      ('act_placement', 'ACT Math', 29, 'MATH1910', 0, NULL);
  `
  it('parses tuples, NULLs, escaped quotes and trailing comments', () => {
    const rows = parseEquivalencies(sql)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ id: 1, test_type: 'ap_credit', test_name: 'Biology', min_score: 3, awarded_course_code: 'BIOL1113', credits_awarded: 4, satisfies_pool: null })
    expect(rows[1]).toMatchObject({ test_name: "Dante's Inferno", min_score: null, satisfies_pool: 'GEN_ED' })
  })
  it('fails loudly on a row it cannot parse', () => {
    expect(() => parseEquivalencies("('ap_credit', 'Biology', 3)")).toThrow(/cannot parse/)
  })
})

// A stand-in for the prototype repo's planSlotSync: match by (class_code, nth occurrence).
function stubSync(existing, desired) {
  const by = new Map()
  for (const r of [...existing].sort((a, b) => a.id - b.id)) {
    if (!by.has(r.class_code)) by.set(r.class_code, [])
    by.get(r.class_code).push(r)
  }
  const insert = []
  let kept = 0
  for (const d of desired) {
    const m = by.get(d.class_code)?.shift()
    if (m) kept++; else insert.push(d)
  }
  return { update: [], insert, remove: [...by.values()].flat().map(r => r.id), kept }
}

describe('assembleCatalog id stability', () => {
  const base = {
    courses: [{ code: 'CSC1', name: 'One', credits: 3, subjectCode: 'CSC', prerequisites: [], corequisites: [] }],
    equivalencySql: '',
    planSlotSync: stubSync,
  }
  const plan = classCodes => [{ code: 'core', name: 'Core', program: 'legacy', data: { hours: 120, courses: classCodes.map(classCode => ({ classCode })) } }]

  it('keeps ids for slots that survive a regeneration and never reuses removed ids', () => {
    const first = assembleCatalog({ ...base, plans: plan(['CSC1', 'GEN_ED', 'GEN_ED']), previous: null }).catalog
    const ids = first.tables.requirement_slots.map(s => s.id)
    const second = assembleCatalog({ ...base, plans: plan(['GEN_ED', 'CSC1', 'CSC2']), previous: first }).catalog
    const byCode = c => second.tables.requirement_slots.filter(s => s.class_code === c).map(s => s.id)
    expect(byCode('CSC1')).toEqual([ids[0]])
    expect(byCode('GEN_ED')).toEqual([ids[1]])         // the older GEN_ED keeps its id; the newer one is dropped
    expect(byCode('CSC2')[0]).toBeGreaterThan(Math.max(...ids))
  })
})

describe('committed catalog.json', () => {
  const t = catalogJson.tables
  const courseCodes = new Set(t.courses.map(c => c.code))

  it('has every table, populated', () => {
    for (const name of ['courses', 'prerequisite_entries', 'corequisite_entries', 'concentrations', 'requirement_slots', 'test_equivalencies']) {
      expect(t[name].length, name).toBeGreaterThan(0)
    }
  })
  it('has unique ids and course codes', () => {
    for (const name of ['prerequisite_entries', 'corequisite_entries', 'concentrations', 'requirement_slots', 'test_equivalencies']) {
      expect(new Set(t[name].map(r => r.id)).size, name).toBe(t[name].length)
    }
    expect(courseCodes.size).toBe(t.courses.length)
  })
  it('points every slot at a real concentration, and at a real course or a known pool', () => {
    const concIds = new Set(t.concentrations.map(c => c.id))
    for (const s of t.requirement_slots) {
      expect(concIds.has(s.concentration_id), `slot ${s.id}`).toBe(true)
      expect(s.is_pool, `slot ${s.id} ${s.class_code}`).toBe(POOL_CODES.has(s.class_code))
      if (!s.is_pool) expect(courseCodes.has(s.class_code), s.class_code).toBe(true)
    }
  })
  it('gives each concentration a complete slot set per program it offers (DSAI is legacy only)', () => {
    const programs = Object.fromEntries(t.concentrations.map(c => [c.code, new Set(t.requirement_slots.filter(s => s.concentration_id === c.id).map(s => s.gened_program))]))
    expect([...programs.dsai]).toEqual(['legacy'])
    for (const code of ['core', 'cybersecurity', 'hpc']) expect(programs[code].size).toBe(2)
  })
})
