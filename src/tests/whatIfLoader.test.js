import { describe, it, expect } from 'vitest'
import { createLocalClient } from '../lib/data/localClient'
import { createMemoryStorage } from '../lib/data/storage'
import { loadCandidate, loadCandidates, extendBase, minorRows } from '../lib/whatIfLoader'
import { evaluateAddition } from '../lib/whatIf'
import { newProgramRow, addableMinors } from '../lib/addProgram'
import { whatIfStudent } from './support/whatIfBase'
import catalog from '../data/catalog.json'

const T = catalog.tables
const make = () => createLocalClient({ loadCatalog: async () => catalog, storage: createMemoryStorage() })
const prog = code => T.concentrations.find(p => p.code === code)
const rowFor = (code, role) => newProgramRow({ studentId: 1, program: prog(code), plans: T.degree_plans, season: 'Fall', year: 2026, role })

describe('whatIfLoader', () => {
  it('reads a candidate\'s slots, name and hours, and the catalog rows its courses need', async () => {
    const { candidate, catalog: read, error } = await loadCandidate(make(), rowFor('minor_mathematics', 'minor'))
    expect(error).toBeNull()
    expect(candidate).toMatchObject({ programId: prog('minor_mathematics').id, role: 'minor', name: 'Mathematics Minor', totalHours: 15, genedProgram: 'flight_foundations' })
    expect(candidate.slots.map(s => s.class_code).sort()).toEqual(['MATH1910', 'MATH1920', 'MN_MATH_MATH', 'MN_MATH_MATH_UP'])
    expect(read.courses.MATH1920).toMatchObject({ credits: 4 })
    expect(Object.keys(read.prereqMap).length).toBeGreaterThan(0)
  })

  it('reads a minor the planner does not model as a candidate with no slots', async () => {
    const { candidate } = await loadCandidate(make(), rowFor('minor_aquatics', 'minor'))
    expect(candidate.slots).toEqual([])
    expect(candidate.name).toBe('Aquatics Minor')
  })

  it('reads many at once, in the order given', async () => {
    const rows = ['minor_physics', 'minor_mathematics'].map(c => rowFor(c, 'minor'))
    const { candidates } = await loadCandidates(make(), rows)
    expect(candidates.map(c => c.name)).toEqual(['Physics Minor', 'Mathematics Minor'])
  })

  it('passes a failing read on, with no candidates', async () => {
    const failing = { from: () => { const chain = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, limit: () => chain, then: (a, b) => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(a, b) }; return chain } }
    const out = await loadCandidates(failing, [rowFor('minor_physics', 'minor')])
    expect(out.error.message).toBe('timeout')
    expect(out.candidates).toEqual([])
  })

  it('extends a base without overriding what the student\'s own plan loaded', () => {
    const base = { courses: { A: { credits: 3, own: true } }, prereqMap: { A: { 0: 'own' } }, coreqMap: {} }
    const out = extendBase(base, { courses: { A: { credits: 9 }, B: { credits: 4 } }, prereqMap: { A: { 0: 'cand' }, B: { 0: 'cand' } }, coreqMap: { B: {} } })
    expect(out.courses).toEqual({ A: { credits: 3, own: true }, B: { credits: 4 } })
    expect(out.prereqMap).toEqual({ A: { 0: 'own' }, B: { 0: 'cand' } })
    expect(out.coreqMap).toEqual({ B: {} })
  })

  it('makes one row per minor that has a plan for the term', () => {
    const minors = addableMinors(T.concentrations, T.degree_plans, '2026-2027')
    const rows = minorRows(minors, { studentId: 1, season: 'Fall', year: 2026, plans: T.degree_plans })
    expect(rows).toHaveLength(minors.length)
    expect(rows.every(r => r.role === 'minor' && r.catalog_year === '2026-2027')).toBe(true)
    expect(minorRows(minors, { studentId: 1, season: 'Fall', year: 2010, plans: [] })).toEqual([])
  })

  it('feeds a what-if the same answer the in-memory candidate gives', async () => {
    const base = whatIfStudent('core', 29)
    const { candidate, catalog: read } = await loadCandidate(make(), rowFor('me', 'major'))
    const r = evaluateAddition({ base: extendBase(base, read), candidate })
    expect(r.addedHours).toBe(98)
    expect(r.withAddition.label).toBe('Fall 2032')
  })
})
