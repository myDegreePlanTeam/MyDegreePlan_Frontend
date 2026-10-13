import { describe, it, expect } from 'vitest'
import {
  addableMajors, addableMinors, newProgramRow, nextPosition, minorTranscriptNotice, OVERLAP_NOTE, MINOR_OVERLAP_NOTE, NOT_MODELLED_NOTE, MINOR_TRANSCRIPT_LIMIT, ENTRY_SEASONS,
} from '../lib/addProgram'
import catalog from '../data/catalog.json'

const T = catalog.tables
const prog = code => T.concentrations.find(p => p.code === code)
const names = list => list.map(p => p.code)

describe('addableMajors', () => {
  it('offers the supported majors that have a plan for the declared term, never the student\'s own program', () => {
    const options = addableMajors(T.concentrations, T.degree_plans, '2026-2027', { primary: prog('core'), added: [] })
    expect(names(options)).toContain('me')
    expect(names(options)).not.toContain('core')
  })

  it('leaves out another concentration of the student\'s own major: that is not a second major', () => {
    const options = addableMajors(T.concentrations, T.degree_plans, '2026-2027', { primary: prog('core'), added: [] })
    expect(options.filter(p => p.major_code === prog('core').major_code)).toEqual([])
  })

  it('leaves out a program already added, and other concentrations of that major', () => {
    const me = prog('me')
    const options = addableMajors(T.concentrations, T.degree_plans, '2026-2027', { primary: prog('core'), added: [{ programId: me.id }] })
    expect(options.filter(p => p.major_code === me.major_code)).toEqual([])
  })

  it('leaves out minors, programs the planner does not support yet, and programs with no plan for the term', () => {
    const options = addableMajors(T.concentrations, T.degree_plans, '2026-2027', { primary: prog('core'), added: [] })
    expect(options.every(p => p.kind !== 'minor')).toBe(true)
    expect(names(options)).not.toContain('math_bs')           // not supported yet
    expect(addableMajors(T.concentrations, T.degree_plans, null, { primary: prog('core') })).toEqual([])
  })

  it('offers nothing a program closed for the term (Data Science and AI closed after 2025-2026)', () => {
    const options = addableMajors(T.concentrations, T.degree_plans, '2026-2027', { primary: prog('me'), added: [] })
    expect(names(options)).not.toContain('dsai')
  })
})

describe('newProgramRow', () => {
  const me = prog('me')
  const input = { studentId: 3, program: me, plans: T.degree_plans, season: 'Fall', year: 2026, position: 1 }

  it('records the plan year and gen-ed program of the plan in effect for the declared term, and the term itself', () => {
    expect(newProgramRow(input)).toEqual({
      student_id: 3, concentration_id: me.id, role: 'major', catalog_year: '2026-2027', gened_program: 'flight_foundations',
      entry_season: 'Fall', entry_year: 2026, position: 1,
    })
  })

  it('follows the plan of the declared term, not of the student\'s start: Spring 2027 is still the 2026-2027 catalog', () => {
    expect(newProgramRow({ ...input, season: 'Spring', year: 2027 }).catalog_year).toBe('2026-2027')
  })

  it('takes a year given as text', () => {
    expect(newProgramRow({ ...input, year: '2026' }).entry_year).toBe(2026)
  })

  it('is null when the program has no plan for the term, or the term is not one', () => {
    expect(newProgramRow({ ...input, program: { id: -1 } })).toBeNull()
    expect(newProgramRow({ ...input, season: 'Winter' })).toBeNull()
    expect(newProgramRow({ ...input, year: '' })).toBeNull()
  })
})

describe('the rest', () => {
  it('numbers the next added program after the last (the primary is 0)', () => {
    expect(nextPosition([])).toBe(1)
    expect(nextPosition([{ position: 1 }, { position: 3 }])).toBe(4)
  })
  it('says what is assumed about sharing courses, and offers the three terms', () => {
    expect(OVERLAP_NOTE).toMatch(/advisor/)
    expect(ENTRY_SEASONS).toEqual(['Fall', 'Spring', 'Summer'])
  })
})

describe('minors', () => {
  const minors = T.concentrations.filter(p => p.kind === 'minor')

  it('offers every minor open to the term and not already added, by name, the ones the planner does not model included', () => {
    const options = addableMinors(T.concentrations, T.degree_plans, '2026-2027', { added: [] })
    expect(options.length).toBe(minors.length)
    expect(options.every(p => p.kind === 'minor')).toBe(true)
    expect(options.map(p => p.name)).toEqual([...options.map(p => p.name)].sort((a, b) => a.localeCompare(b)))
    const math = prog('minor_mathematics')
    expect(addableMinors(T.concentrations, T.degree_plans, '2026-2027', { added: [{ programId: math.id }] }).some(p => p.id === math.id)).toBe(false)
    expect(addableMinors(T.concentrations, T.degree_plans, null, { added: [] })).toEqual([])
  })

  it('never lists a minor among the second majors', () => {
    expect(addableMajors(T.concentrations, T.degree_plans, '2026-2027', { primary: prog('core'), added: [] }).some(p => p.kind === 'minor')).toBe(false)
  })

  it('records a minor as a minor, following the plan year of the term it is declared', () => {
    const row = newProgramRow({ studentId: 3, program: prog('minor_mathematics'), plans: T.degree_plans, season: 'Spring', year: 2027, position: 2, role: 'minor' })
    expect(row).toMatchObject({ student_id: 3, role: 'minor', catalog_year: '2026-2027', entry_season: 'Spring', entry_year: 2027, position: 2 })
    expect(newProgramRow({ studentId: 3, program: prog('me'), plans: T.degree_plans, season: 'Fall', year: 2026, role: 'whatever' }).role).toBe('major')
  })

  it('warns, and never blocks, when a minor would be more than the catalog puts on a transcript', () => {
    expect(minorTranscriptNotice(0)).toBeNull()
    expect(minorTranscriptNotice(MINOR_TRANSCRIPT_LIMIT - 1)).toBeNull()
    expect(minorTranscriptNotice(MINOR_TRANSCRIPT_LIMIT)).toMatch(/3 minors.*no more than 2/)
    expect(minorTranscriptNotice(3)).toMatch(/4 minors/)
  })

  it('says what is assumed about a minor and about one the planner does not model', () => {
    expect(MINOR_OVERLAP_NOTE).toMatch(/counts toward each/)
    expect(NOT_MODELLED_NOTE).toMatch(/does not check/)
    expect(OVERLAP_NOTE).not.toBe(MINOR_OVERLAP_NOTE)
  })
})
