import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { flattenReqArray, parseEquivalencies, assembleCatalog } from '../../scripts/catalogLib.mjs'
import { POOL_CREDIT_ESTIMATES } from '../lib/poolResolver'
import catalogJson from '../data/catalog.json'
import descriptionsJson from '../data/catalog.descriptions.json'
import { classifyPrereq } from '../lib/classifyPrereq'

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
  const program = { code: 'core', name: 'Core', kind: 'concentration', degree: 'B.S.', majorName: 'Computer Science', department: 'CSC', supersedes: null, lastCatalogYear: null, description: 'The core.' }
  // keys follow the spec convention: the code, or CODE#n when a code repeats
  const plan = classCodes => {
    const seen = {}
    const total = {}
    for (const c of classCodes) total[c] = (total[c] ?? 0) + 1
    return {
      programs: [program],
      pools: { GEN_ED: 3 },
      plans: [{
        program: 'core', catalogYear: '2025-2026', genedProgram: 'legacy', coversEarlier: true, hours: 120,
        slots: classCodes.map(classCode => {
          seen[classCode] = (seen[classCode] ?? 0) + 1
          return { key: total[classCode] > 1 ? `${classCode}#${seen[classCode]}` : classCode, classCode, credits: null, mapSemester: null }
        }),
      }],
    }
  }

  it('keeps ids for slots that survive a regeneration and never reuses removed ids', () => {
    const first = assembleCatalog({ ...base, degreePlans: plan(['CSC1', 'GEN_ED', 'GEN_ED']), previous: null }).catalog
    const ids = first.tables.requirement_slots.map(s => s.id)
    const second = assembleCatalog({ ...base, degreePlans: plan(['GEN_ED', 'CSC1', 'CSC2']), previous: first }).catalog
    const byCode = c => second.tables.requirement_slots.filter(s => s.class_code === c).map(s => s.id)
    expect(byCode('CSC1')).toEqual([ids[0]])
    expect(byCode('GEN_ED')).toEqual([ids[1]])         // the older GEN_ED keeps its id; the newer one is dropped
    expect(byCode('CSC2')[0]).toBeGreaterThan(Math.max(...ids))
  })
})

// The same id guarantees against the prototype repo's real planSlotSync (the one seed.js and build:catalog use).
// The repo is not present in every checkout (a frontend-only build), so these skip themselves without it.
const SLOT_SYNC = fileURLToPath(new URL('../../../MyDegreePlan_Prototype/slotSync.js', import.meta.url))
describe.skipIf(!existsSync(SLOT_SYNC))('assembleCatalog with the real planSlotSync', () => {
  const program = { code: 'core', name: 'Core', kind: 'concentration', degree: 'B.S.', majorName: 'Computer Science', department: 'CSC', supersedes: null, lastCatalogYear: null, description: 'The core.' }
  const base = (planSlotSync) => ({
    courses: [{ code: 'CSC1', name: 'One', credits: 3, subjectCode: 'CSC', prerequisites: [], corequisites: [] }],
    equivalencySql: '',
    planSlotSync,
  })
  const degreePlans = (slots, extra = {}) => ({
    programs: [program],
    pools: { GEN_ED: 3 },
    plans: [{ program: 'core', catalogYear: '2025-2026', genedProgram: 'legacy', coversEarlier: true, hours: 120, ...extra,
      slots: slots.map(([key, classCode]) => ({ key, classCode, credits: null, mapSemester: null })) }],
  })

  it('keeps a slot\'s id by key however the plan is reordered, and writes keys, years and the plan index', async () => {
    const { planSlotSync } = await import(/* @vite-ignore */ pathToFileURL(SLOT_SYNC).href)
    const first = assembleCatalog({ ...base(planSlotSync), degreePlans: degreePlans([['CSC1', 'CSC1'], ['GEN_ED#1', 'GEN_ED'], ['GEN_ED#2', 'GEN_ED']]), previous: null }).catalog
    const id = key => first.tables.requirement_slots.find(s => s.slot_key === key).id
    const second = assembleCatalog({ ...base(planSlotSync), degreePlans: degreePlans([['GEN_ED#2', 'GEN_ED'], ['CSC1', 'CSC1'], ['GEN_ED#1', 'GEN_ED']]), previous: first }).catalog
    const by = key => second.tables.requirement_slots.find(s => s.slot_key === key).id
    expect([by('CSC1'), by('GEN_ED#1'), by('GEN_ED#2')]).toEqual([id('CSC1'), id('GEN_ED#1'), id('GEN_ED#2')])
    expect(second.tables.requirement_slots.every(s => s.catalog_year === '2025-2026')).toBe(true)
    expect(second.tables.degree_plans).toEqual([{ id: 1, concentration_id: 1, catalog_year: '2025-2026', gened_program: 'legacy', total_hours: 120, covers_earlier: true }])
  })

  it('adopts the rows of a catalog built before keys existed, keeping every id', async () => {
    const { planSlotSync } = await import(/* @vite-ignore */ pathToFileURL(SLOT_SYNC).href)
    const old = { format: 1, tables: {
      courses: [], concentrations: [{ id: 1, code: 'core', name: 'Core', total_hours: 120 }],
      requirement_slots: [
        { id: 40, concentration_id: 1, class_code: 'CSC1', is_pool: false, gened_program: 'legacy' },
        { id: 41, concentration_id: 1, class_code: 'GEN_ED', is_pool: true, gened_program: 'legacy' },
        { id: 55, concentration_id: 1, class_code: 'GEN_ED', is_pool: true, gened_program: 'legacy' },
      ],
    } }
    const { catalog, totals } = assembleCatalog({ ...base(planSlotSync), degreePlans: degreePlans([['CSC1', 'CSC1'], ['GEN_ED#1', 'GEN_ED'], ['GEN_ED#2', 'GEN_ED']]), previous: old })
    expect(totals).toEqual({ kept: 3, inserted: 0, removed: 0 })
    expect(catalog.tables.requirement_slots.map(s => [s.id, s.slot_key])).toEqual([[40, 'CSC1'], [41, 'GEN_ED#1'], [55, 'GEN_ED#2']])
  })

  it('gives a new plan year its own set of slots and its own index row, leaving the old year alone', async () => {
    const { planSlotSync } = await import(/* @vite-ignore */ pathToFileURL(SLOT_SYNC).href)
    const first = assembleCatalog({ ...base(planSlotSync), degreePlans: degreePlans([['CSC1', 'CSC1']]), previous: null }).catalog
    const both = {
      programs: [program], pools: { GEN_ED: 3 },
      plans: [
        ...degreePlans([['CSC1', 'CSC1']]).plans,
        { program: 'core', catalogYear: '2027-2028', genedProgram: 'flight_foundations', coversEarlier: false, hours: 120, slots: [{ key: 'CSC1', classCode: 'CSC1', credits: null, mapSemester: 2 }] },
      ],
    }
    const { catalog, totals } = assembleCatalog({ ...base(planSlotSync), degreePlans: both, previous: first })
    expect(totals).toEqual({ kept: 1, inserted: 1, removed: 0 })
    const rows = catalog.tables.requirement_slots
    expect(rows.map(s => [s.catalog_year, s.gened_program, s.map_semester ?? null])).toEqual([['2025-2026', 'legacy', null], ['2027-2028', 'flight_foundations', 2]])
    expect(rows[0].id).toBe(first.tables.requirement_slots[0].id)
    expect(catalog.tables.degree_plans.map(p => p.catalog_year)).toEqual(['2025-2026', '2027-2028'])
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
      // the pool codes the generated plans declare are the ones the app knows (poolResolver.js)
      expect(s.is_pool, `slot ${s.id} ${s.class_code}`).toBe(s.class_code in POOL_CREDIT_ESTIMATES)
      if (!s.is_pool) expect(courseCodes.has(s.class_code), s.class_code).toBe(true)
    }
  })
  it('carries the full Tennessee Tech catalog, not just the planner courses', () => {
    expect(t.courses.length).toBeGreaterThan(5000)
    const subjects = new Set(t.courses.map(c => c.subject_code))
    for (const s of ['CSC', 'MATH', 'AI', 'BIOL', 'NURS', 'MUS']) expect(subjects.has(s), s).toBe(true)
  })
  it('only has requisite rows for courses it lists', () => {
    for (const name of ['prerequisite_entries', 'corequisite_entries']) {
      const stray = t[name].filter(r => !courseCodes.has(r.course_code)).map(r => r.course_code)
      expect(stray, name).toEqual([])
    }
  })
  it('puts every description in exactly one place', () => {
    for (const c of t.courses) {
      const inline = 'description' in c
      const lazy = c.code in descriptionsJson
      expect(inline && lazy, `${c.code} in both`).toBe(false)
    }
    for (const code of Object.keys(descriptionsJson)) expect(courseCodes.has(code), code).toBe(true)
  })
  it('keeps ACT and consent sentences where classifyPrereq reads them', () => {
    const courseMap = Object.fromEntries(t.courses.map(c => [c.code, c]))
    expect(classifyPrereq('CSC4040', null, courseMap)).toBe('consent')      // "... and consent of instructor"
    expect(classifyPrereq('CSC1200', null, courseMap)).toBe('placement')    // "ACT Math Score of 25 or higher or ..."
    expect(classifyPrereq('MATH1710', null, courseMap)).toBe('placement')
    expect(classifyPrereq('CSC1310', null, courseMap)).toBe('completion')
  })
  it('describes every program, and indexes one degree plan per slot set', () => {
    for (const c of t.concentrations) {
      for (const f of ['kind', 'degree', 'major_name', 'department', 'description']) expect(c[f], `${c.code}.${f}`).toBeTruthy()
      expect(['major', 'concentration']).toContain(c.kind)
    }
    expect(t.concentrations.find(c => c.code === 'dsai').last_catalog_year).toBe('2025-2026')
    const sets = new Set(t.requirement_slots.map(s => `${s.concentration_id}|${s.catalog_year}`))
    const indexed = new Set(t.degree_plans.map(p => `${p.concentration_id}|${p.catalog_year}`))
    expect(indexed).toEqual(sets)
    expect(t.degree_plans.length).toBe(sets.size)
  })
  it('gives every slot a key (unique within its plan), a catalog year and a gen-ed program that matches its plan', () => {
    const plan = new Map(t.degree_plans.map(p => [`${p.concentration_id}|${p.catalog_year}`, p]))
    const seen = new Set()
    for (const s of t.requirement_slots) {
      expect(s.slot_key, `slot ${s.id}`).toBeTruthy()
      const id = `${s.concentration_id}|${s.catalog_year}|${s.slot_key}`
      expect(seen.has(id), id).toBe(false)
      seen.add(id)
      expect(s.gened_program, `slot ${s.id}`).toBe(plan.get(`${s.concentration_id}|${s.catalog_year}`).gened_program)
    }
  })
  it('gives each concentration a complete slot set per program it offers (DSAI is legacy only)', () => {
    const programs = Object.fromEntries(t.concentrations.map(c => [c.code, new Set(t.requirement_slots.filter(s => s.concentration_id === c.id).map(s => s.gened_program))]))
    expect([...programs.dsai]).toEqual(['legacy'])
    for (const code of ['core', 'cybersecurity', 'hpc']) expect(programs[code].size).toBe(2)
  })
})
