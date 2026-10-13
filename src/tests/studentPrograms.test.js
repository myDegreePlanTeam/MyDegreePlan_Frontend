import { describe, it, expect } from 'vitest'
import { createLocalClient } from '../lib/data/localClient'
import { createMemoryStorage } from '../lib/data/storage'
import { programsFromRows, fetchStudentPrograms } from '../lib/studentPrograms'

const fixture = {
  tables: {
    courses: [], prerequisite_entries: [], corequisite_entries: [], requirement_slots: [], degree_plans: [], test_equivalencies: [],
    concentrations: [{ id: 1, code: 'core' }, { id: 2, code: 'math_bs' }, { id: 3, code: 'math_minor' }],
  },
}
const profile = { id: 1, concentration_id: 1, catalog_year: '2026-2027', gened_program: 'flight_foundations', start_season: 'Fall', start_year: 2026 }
const make = () => createLocalClient({ loadCatalog: async () => fixture, storage: createMemoryStorage() })

describe('programsFromRows', () => {
  it('is the primary program alone for a student who added nothing', () => {
    expect(programsFromRows(profile, [])).toEqual([{
      id: null, programId: 1, role: 'major', primary: true, catalogYear: '2026-2027', genedProgram: 'flight_foundations',
      entrySeason: 'Fall', entryYear: 2026, position: 0,
    }])
  })

  it('is empty for a profile that has not chosen a program', () => {
    expect(programsFromRows({ id: 1, concentration_id: null }, [])).toEqual([])
    expect(programsFromRows(null, [])).toEqual([])
  })

  it('reads a profile saved before catalog years from its gen-ed program', () => {
    expect(programsFromRows({ id: 1, concentration_id: 1, gened_program: 'legacy' }, [])[0].catalogYear).toBe('2025-2026')
  })

  it('lists the added programs after the primary, in the order they were added', () => {
    const rows = [
      { id: 12, concentration_id: 3, role: 'minor', catalog_year: '2026-2027', position: 2 },
      { id: 11, concentration_id: 2, role: 'major', catalog_year: '2026-2027', gened_program: 'flight_foundations', entry_season: 'Spring', entry_year: 2027, position: 1 },
    ]
    const programs = programsFromRows(profile, rows)
    expect(programs.map(p => [p.programId, p.role, p.primary])).toEqual([[1, 'major', true], [2, 'major', false], [3, 'minor', false]])
    expect(programs[1]).toMatchObject({ id: 11, catalogYear: '2026-2027', entrySeason: 'Spring', entryYear: 2027 })
  })

  it('breaks a tie in position by row id, numerically', () => {
    const rows = [{ id: 10, concentration_id: 3, catalog_year: 'x' }, { id: 9, concentration_id: 2, catalog_year: 'x' }]
    expect(programsFromRows(profile, rows).map(p => p.programId)).toEqual([1, 2, 3])
  })

  it('ignores a stray row for the primary program, and reads an unknown role as a major', () => {
    const programs = programsFromRows(profile, [{ id: 1, concentration_id: 1, catalog_year: '2026-2027' }, { id: 2, concentration_id: 2, role: 'weird', catalog_year: '2026-2027' }])
    expect(programs.map(p => [p.programId, p.role])).toEqual([[1, 'major'], [2, 'major']])
  })

  it('gives a row with no plan year the year of the term it was declared, else the primary\'s', () => {
    const rows = [{ id: 1, concentration_id: 2, entry_season: 'Spring', entry_year: 2028 }, { id: 2, concentration_id: 3 }]
    expect(programsFromRows(profile, rows).map(p => p.catalogYear)).toEqual(['2026-2027', '2027-2028', '2026-2027'])
  })
})

describe('fetchStudentPrograms', () => {
  it('reads the added programs of the student from the data client', async () => {
    const db = make()
    await db.from('student_programs').insert([
      { student_id: 1, concentration_id: 3, role: 'minor', catalog_year: '2026-2027', position: 2 },
      { student_id: 1, concentration_id: 2, role: 'major', catalog_year: '2026-2027', position: 1 },
      { student_id: 9, concentration_id: 2, role: 'major', catalog_year: '2026-2027', position: 1 },
    ])
    const { data, error } = await fetchStudentPrograms(db, profile)
    expect(error).toBeNull()
    expect(data.map(p => [p.programId, p.role])).toEqual([[1, 'major'], [2, 'major'], [3, 'minor']])
  })

  it('answers with the primary alone on a database that has no student_programs table yet', async () => {
    const old = { from: () => { const chain = { select: () => chain, eq: () => chain, order: () => chain, then: (a, b) => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation "student_programs" does not exist' } }).then(a, b) }; return chain } }
    const { data, error } = await fetchStudentPrograms(old, profile)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('passes any other error on, with no programs', async () => {
    const broken = { from: () => { const chain = { select: () => chain, eq: () => chain, order: () => chain, then: (a, b) => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(a, b) }; return chain } }
    const { data, error } = await fetchStudentPrograms(broken, profile)
    expect(error.message).toBe('timeout')
    expect(data).toEqual([])
  })

  it('does not query for a profile with no id yet', async () => {
    const never = { from: () => { throw new Error('queried') } }
    expect((await fetchStudentPrograms(never, { concentration_id: 1 })).data).toHaveLength(1)
  })
})
