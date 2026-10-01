import { describe, it, expect } from 'vitest'
import { courseKind, countByKind } from '../lib/courseKinds'
import { searchCourses } from '../lib/courseSearch'
import { createLocalClient } from '../lib/data/localClient'
import { createMemoryStorage } from '../lib/data/storage'
import catalog from '../data/catalog.json'
import descriptions from '../data/catalog.descriptions.json'

describe('courseKind', () => {
  it('numbers below 5000 are undergraduate', () => {
    for (const c of ['CSC1300', 'MATH1910', 'ENGL2130', 'CSC4990', 'ENGL0010']) expect(courseKind(c)).toBe('undergraduate')
  })
  it('5000 and up are graduate', () => {
    for (const c of ['CSC5240', 'MATH7010', 'NURS6320']) expect(courseKind(c)).toBe('graduate')
  })
  it('anything that is not a TTU course number is a placeholder', () => {
    for (const c of ['AIELEC', 'ACCTELEC', 'CIS186', 'EDU201', 'COL101', '', null, undefined]) expect(courseKind(c)).toBe('placeholder')
  })
  it('counts each kind', () => {
    expect(countByKind([{ code: 'CSC1300' }, { code: 'CSC5240' }, { code: 'AIELEC' }, { code: 'CSC2310' }]))
      .toEqual({ undergraduate: 2, graduate: 1, placeholder: 1 })
  })
})

describe('searchCourses over the real catalog', () => {
  const db = () => createLocalClient({
    loadCatalog: async () => structuredClone(catalog),
    loadDescriptions: async () => descriptions,
    storage: createMemoryStorage(),
  })

  it('shows undergraduate courses by default and keeps graduate ones and placeholders apart', async () => {
    const under = await searchCourses(db(), 'artificial')
    expect(under.rows.map(c => c.code)).toEqual(expect.arrayContaining(['CSC3450', 'CSC4240']))
    expect(under.rows.every(c => courseKind(c.code) === 'undergraduate')).toBe(true)
    expect(under.counts.graduate).toBeGreaterThan(0)          // CSC5240 and friends exist, one tab over
    expect(under.counts.placeholder).toBeGreaterThan(0)       // AIELEC

    const grad = await searchCourses(db(), 'artificial', 'graduate')
    expect(grad.rows.map(c => c.code)).toContain('CSC5240')
    expect(grad.rows.every(c => courseKind(c.code) === 'graduate')).toBe(true)

    const holders = await searchCourses(db(), 'artificial', 'placeholder')
    expect(holders.rows.map(c => c.code)).toContain('AIELEC')
  })
  it('returns the range columns so the hours can be asked for', async () => {
    const { rows } = await searchCourses(db(), 'AGBE4940')
    expect(rows[0]).toMatchObject({ code: 'AGBE4940', credits: 1, credits_max: 4 })
  })
  it('caps the list at 40', async () => {
    const { rows } = await searchCourses(db(), 'a')
    expect(rows.length).toBeLessThanOrEqual(40)
  })
})
