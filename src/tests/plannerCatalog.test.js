import { describe, it, expect } from 'vitest'
import { plannerCodes, fetchPlannerCatalog, fetchCourseDetail } from '../lib/plannerCatalog'
import { createLocalClient } from '../lib/data/localClient'
import { createMemoryStorage } from '../lib/data/storage'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { POOL_COURSES } from '../lib/poolResolver'
import catalog from '../data/catalog.json'
import descriptions from '../data/catalog.descriptions.json'

const t = catalog.tables
const local = () => createLocalClient({
  loadCatalog: async () => structuredClone(catalog),
  loadDescriptions: async () => descriptions,
  storage: createMemoryStorage(),
})

describe('plannerCodes', () => {
  const slots = [
    { class_code: 'CSC1300', is_pool: false },
    { class_code: 'SCIENCE', is_pool: true },
    { class_code: 'CSC1300', is_pool: false },
  ]
  it('names the fixed courses, every pool option, and the extras, once each', () => {
    const codes = plannerCodes(slots, ['CSC9999'])
    expect(codes).toContain('CSC1300')
    expect(codes).toContain('CSC9999')
    expect(codes).not.toContain('SCIENCE')               // a pool code is not a course
    expect(codes.filter(c => c === 'CSC1300')).toHaveLength(1)
    for (const c of POOL_COURSES.SCIENCE) expect(codes).toContain(c)
  })
  it('tolerates a missing slot list', () => {
    expect(plannerCodes(undefined)).toEqual(expect.arrayContaining(POOL_COURSES.MATH_STATS))
  })
})

describe('a plan loads its own slice of the full catalog', () => {
  const slotsFor = (concentrationId, program) =>
    t.requirement_slots.filter(s => s.concentration_id === concentrationId && s.gened_program === program)

  it('is a small slice of a catalog that holds thousands of courses', async () => {
    const core = t.concentrations.find(c => c.code === 'core')
    const { courses, prereqs, error } = await fetchPlannerCatalog(local(), slotsFor(core.id, 'flight_foundations'))
    expect(error).toBeNull()
    expect(t.courses.length).toBeGreaterThan(5000)
    expect(courses.length).toBeLessThan(400)              // ~125 today; the Docker API caps a response at 1000 rows
    expect(prereqs.length).toBeGreaterThan(0)
    expect(prereqs.length).toBeLessThan(400)
    expect(new Set(courses.map(c => c.code)).size).toBe(courses.length)
  })

  // The reason the filter is safe: the builder only ever reads rows keyed by a slot's course or a pool option.
  it('gives the degree builder exactly the plan it would build from the whole catalog', async () => {
    const db = local()
    const ctx = (rows, prereqRows, coreqRows) => ({
      courseMap: Object.fromEntries(rows.map(c => [c.code, c])),
      prereqMap: buildRequirementMap(prereqRows),
      coreqMap: buildRequirementMap(coreqRows),
    })
    const everything = ctx(t.courses, t.prerequisite_entries, t.corequisite_entries)
    let compared = 0
    for (const conc of t.concentrations) {
      for (const program of ['legacy', 'flight_foundations']) {
        const slots = slotsFor(conc.id, program)
        if (!slots.length) continue
        const slice = await fetchPlannerCatalog(db, slots)
        const scoped = ctx(slice.courses, slice.prereqs, slice.coreqs)
        for (const actMath of [null, 17, 22, 26, 29, 33]) {
          for (const studentType of ['freshman', 'transfer']) {
            const profile = { student_type: studentType, act_math: actMath, start_season: 'fall' }
            const args = { slots, priorCredits: [], studentProfile: profile }
            const a = buildDegreePlan({ ...args, ...scoped })
            const b = buildDegreePlan({ ...args, ...everything })
            expect(a, `${conc.code}/${program} act=${actMath} ${studentType}`).toEqual(b)
            compared++
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(40)
  })
})

describe('a course added from the search box', () => {
  it('arrives with its prerequisites, standing and description, so it is checked straight away', async () => {
    const { course, prereqs, coreqs, error } = await fetchCourseDetail(local(), 'AI3000')
    expect(error).toBeNull()
    expect(course).toMatchObject({ code: 'AI3000', credits: 3 })
    expect(course.description).toMatch(/machine learning/i)       // a non-core description, loaded on demand
    expect(prereqs.map(r => r.required_code).sort()).toEqual(['CSC2220', 'CSC2400'])
    expect(coreqs).toEqual([])
  })
  it('returns no course for an unknown code instead of failing', async () => {
    const { course, error } = await fetchCourseDetail(local(), 'ZZZ9999')
    expect(error).toBeNull()
    expect(course).toBeNull()
  })
})

describe('the full catalog in the local engine', () => {
  it('has the courses the 2026-27 degree maps need, including the new AI subject', async () => {
    const { data } = await local().from('courses').select('code, name, credits').in('code', ['AI3000', 'AI3100', 'AI3200', 'AI4200', 'CSC4620'])
    expect(data.map(c => c.code).sort()).toEqual(['AI3000', 'AI3100', 'AI3200', 'AI4200', 'CSC4620'])
    expect(data.every(c => c.credits === 3)).toBe(true)
  })
  it('reads columns that rows leave out as null', async () => {
    const { data } = await local().from('courses').select('code, credits_max, standing_req, requisite_text').eq('code', 'CSC1300')
    expect(data).toEqual([{ code: 'CSC1300', credits_max: null, standing_req: null, requisite_text: null }])
  })
  it('keeps the top of a variable-credit range', async () => {
    const { data } = await local().from('courses').select('credits, credits_max').eq('code', 'ACCT6950')
    expect(data[0].credits_max).toBeGreaterThan(data[0].credits)
  })
  it('records the standing the parser found for a course no template names', async () => {
    const { data } = await local().from('courses').select('standing_req').eq('code', 'WFS4230')
    expect(data[0].standing_req).toBe('junior')
  })
})

describe('lazy descriptions', () => {
  // A course no template, pool or equivalency names: its description is not in catalog.json.
  const deferred = Object.keys(descriptions)[0]

  it('are not in catalog.json for a course outside the core, and are in the lazy file', () => {
    expect(descriptions[deferred]).toBeTruthy()
    expect('description' in t.courses.find(c => c.code === deferred)).toBe(false)
  })
  it('are embedded for the courses a plan can name', () => {
    const core = t.courses.find(c => c.code === 'CSC1310')
    expect(core.description).toMatch(/data types/i)
  })
  it('load on demand, and not for a query that never asks for one', async () => {
    let loads = 0
    const db = createLocalClient({
      loadCatalog: async () => structuredClone(catalog),
      loadDescriptions: async () => { loads++; return descriptions },
      storage: createMemoryStorage(),
    })
    await db.from('courses').select('code, name, credits, subject_code').or('code.ilike."%ACCT%",name.ilike."%tax%"').limit(40)
    expect(loads).toBe(0)
    await db.from('courses').select('code, description').in('code', ['CSC1310'])
    expect(loads).toBe(0)                                   // a core course already has its description
    const { data } = await db.from('courses').select('code, description').in('code', [deferred])
    expect(loads).toBe(1)
    expect(data[0].description).toBe(descriptions[deferred])
    await db.from('courses').select('description').in('code', [deferred])
    expect(loads).toBe(1)                                   // loaded once
  })
  it('fail the query, not the app, when the lazy file cannot be fetched, and retry next time', async () => {
    let calls = 0
    const db = createLocalClient({
      loadCatalog: async () => structuredClone(catalog),
      loadDescriptions: async () => { calls++; if (calls === 1) throw new Error('offline'); return descriptions },
      storage: createMemoryStorage(),
    })
    const first = await db.from('courses').select('description').in('code', [deferred])
    expect(first.error).toBeTruthy()
    const second = await db.from('courses').select('description').in('code', [deferred])
    expect(second.error).toBeNull()
    expect(second.data[0].description).toBe(descriptions[deferred])
  })
})
