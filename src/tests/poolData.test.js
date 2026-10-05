import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  POOL_COURSES, POOL_CREDIT_ESTIMATES, POOL_FLOORS, POOL_LABELS, REQUIREMENT_POOLS, resolvePool,
} from '../lib/poolResolver.js'
import { listFlightFoundationsCourses } from '../lib/flightFoundations.js'
import poolsFile from '../data/pools.json'

// Pools are data: src/data/pools.json, written by `npm run build:catalog` from the prototype repo's
// degree-specs/pools.json (through degree_plans.json). poolResolver.js derives its constants from it.

const PROTO = fileURLToPath(new URL('../../../MyDegreePlan_Prototype/', import.meta.url))
const HAVE = existsSync(`${PROTO}degree_plans.json`)

describe('pool data', () => {
  it('derives labels, hours, floors and the course lists from pools.json', () => {
    expect(POOL_LABELS.SCIENCE).toBe('Natural Science')
    expect(POOL_CREDIT_ESTIMATES.SCIENCE).toBe(4)
    expect(POOL_CREDIT_ESTIMATES.FREE_ELECTIVE).toBe(3)
    expect(POOL_COURSES.MATH_STATS).toEqual(['MATH3070', 'MATH3470'])
    expect(POOL_COURSES.COMM_REQ).toEqual(['COMM2025', 'PC2500'])
    expect(POOL_COURSES.CSC_LOWER_ELECTIVE).toEqual(['CSC2220', 'CSC2570', 'CSC2770'])
    expect(POOL_COURSES.FREE_ELECTIVE).toBeNull()
    expect(Object.keys(POOL_COURSES)).toEqual(Object.keys(POOL_CREDIT_ESTIMATES))
  })

  it("keeps the Flight Foundations lists where they are published (flightFoundations.js)", () => {
    expect(POOL_COURSES.FF_SOCIAL).toEqual(listFlightFoundationsCourses('SOC'))
    expect(POOL_COURSES.FF_HUMANITIES).toEqual(listFlightFoundationsCourses('HUM'))
    expect(POOL_COURSES.FF_LITERACY).toEqual(listFlightFoundationsCourses('LIT'))
  })

  it('keeps the order pools claim a course in, and the order they take open seats in the builder', () => {
    const codes = Object.keys(POOL_COURSES)
    expect(codes.indexOf('ENG_LIT')).toBeLessThan(codes.indexOf('FF_HUMANITIES'))
    expect(codes.indexOf('FF_LITERACY')).toBeLessThan(codes.indexOf('CSC_ELECTIVE'))
    // ME_DESIGN (Machine or Thermal Design) is last: Senior Design II takes one of its courses alongside or before it
    expect([...REQUIREMENT_POOLS]).toEqual(['SCIENCE', 'COMM_REQ', 'MATH_STATS', 'ENG_LIT', 'GEN_ED', 'FF_SOCIAL', 'FF_HUMANITIES', 'FF_LITERACY', 'ME_DESIGN'])
  })

  it('names the course every option of a pool needs first', () => {
    expect(POOL_FLOORS).toEqual({
      ENG_LIT: 'ENGL1020', CSC_LOWER_ELECTIVE: 'CSC1300', CSC_UPPER_ELECTIVE: 'CSC1310',
      CSC_ELECTIVE: 'CSC1310', CSC_HPC_ELECTIVE: 'CSC1310', CSC_HPC_ELECTIVE_2026: 'CSC1310',
    })
  })

  it('follows the department wording: any additional 2000+ / 3000-4000 level CSC course', () => {
    const any = POOL_COURSES.CSC_ELECTIVE
    const upper = POOL_COURSES.CSC_UPPER_ELECTIVE
    expect(any).toEqual(expect.arrayContaining(['CSC2310', 'CSC3300', 'CSC4100', 'CSC4620']))
    expect(any.every(c => c.startsWith('CSC'))).toBe(true)
    expect(upper.every(c => Number(c.slice(-4)) >= 3000)).toBe(true)
    expect(upper).toEqual(expect.arrayContaining(['CSC3040', 'CSC4610']))
    expect(any).not.toContain('CSC4990')
    expect(any).not.toContain('CSC4615')
    expect(any).not.toContain('CSCELEC')
  })

  it('versions the HPC elective list: 2025-2026 plans keep five courses, the 2026-2027 map names three', () => {
    expect(POOL_COURSES.CSC_HPC_ELECTIVE).toEqual(['CSC4040', 'CSC4220', 'CSC4400', 'CSC4575', 'CSC4710'])
    expect(POOL_COURSES.CSC_HPC_ELECTIVE_2026).toEqual(['CSC4040', 'CSC4220', 'CSC4575'])
    expect(POOL_LABELS.CSC_HPC_ELECTIVE_2026).toBe(POOL_LABELS.CSC_HPC_ELECTIVE)
  })

  it('resolves a pool to the catalog courses that exist', () => {
    const courseMap = { CSC2310: { code: 'CSC2310' }, CSC3300: { code: 'CSC3300' } }
    expect(resolvePool('CSC_ELECTIVE', courseMap).map(c => c.code)).toEqual(['CSC2310', 'CSC3300'])
    expect(resolvePool('FREE_ELECTIVE', courseMap)).toBeNull()
    expect(resolvePool('NOPE', courseMap)).toEqual([])
  })

  it.skipIf(!HAVE)('src/data/pools.json is what degree_plans.json says (run npm run build:catalog)', () => {
    const plans = JSON.parse(readFileSync(`${PROTO}degree_plans.json`, 'utf8'))
    expect(poolsFile).toEqual(plans.poolDefs)
    // every pool a plan uses is defined
    const used = new Set(plans.plans.flatMap(p => p.slots.map(s => s.classCode)).filter(c => c in plans.pools))
    for (const code of used) expect(code in POOL_COURSES, code).toBe(true)
  })
})
