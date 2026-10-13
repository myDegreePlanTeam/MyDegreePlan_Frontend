import { describe, it, expect } from 'vitest'
import { buildBackup, parseBackup, backupFileName, BackupError } from '../lib/data/backup'

const ctx = { validSlotIds: new Set([1, 2]), validConcentrationIds: new Set([1]) }
const sample = () => buildBackup({
  student_profiles: [{ id: 1, user_id: 'u', concentration_id: 1 }],
  student_plan_slots: [{ id: 1, student_id: 1, requirement_slot_id: 1 }, { id: 2, student_id: 1, requirement_slot_id: 2 }],
  student_semester_notes: [{ id: 1, student_id: 1, concentration_id: 1, semester_number: 1 }],
  student_free_add_slots: [{ id: 1, student_id: 1, course_code: 'A', semester_number: 1 }],
  prior_credits: [{ id: 'x', plan_id: 1, credit_type: 'ap_credit' }],
}, new Date('2026-10-01T12:00:00Z'))

describe('backup: added programs (format 2)', () => {
  const withPrograms = programs => buildBackup({
    student_profiles: [{ id: 1, user_id: 'u', concentration_id: 1 }],
    student_programs: programs,
  })
  const two = { ...ctx, validConcentrationIds: new Set([1, 2]) }

  it('says format 2 only when the plan has an added program, so a plan without one still opens on an older install', () => {
    expect(withPrograms([]).format).toBe(1)
    expect(withPrograms([{ id: 1, student_id: 1, concentration_id: 2, role: 'minor', catalog_year: '2026-2027' }]).format).toBe(2)
    expect(sample().format).toBe(1)
  })
  it('round-trips an added program', () => {
    const row = { id: 1, student_id: 1, concentration_id: 2, role: 'minor', catalog_year: '2026-2027', position: 1 }
    const { tables, dropped } = parseBackup(JSON.stringify(withPrograms([row])), two)
    expect(dropped).toBe(0)
    expect(tables.student_programs).toEqual([row])
  })
  it('reads a format 1 file, which has no added programs', () => {
    const { tables, dropped } = parseBackup(JSON.stringify(sample()), ctx)
    expect(dropped).toBe(0)
    expect(tables.student_programs).toEqual([])
  })
  it('still refuses a format this build does not know', () => {
    const b = sample()
    b.format = 3
    expect(() => parseBackup(JSON.stringify(b), ctx)).toThrow(/different version/)
  })
  it('drops an added program whose program is gone, that is the profile\'s own program, or whose profile is not in the file', () => {
    const rows = [
      { id: 1, student_id: 1, concentration_id: 2, role: 'major', catalog_year: '2026-2027' },
      { id: 2, student_id: 1, concentration_id: 99, role: 'minor', catalog_year: '2026-2027' },
      { id: 3, student_id: 1, concentration_id: 1, role: 'major', catalog_year: '2026-2027' },
      { id: 4, student_id: 7, concentration_id: 2, role: 'minor', catalog_year: '2026-2027' },
    ]
    const { tables, dropped } = parseBackup(JSON.stringify(withPrograms(rows)), two)
    expect(tables.student_programs.map(r => r.id)).toEqual([1])
    expect(dropped).toBe(3)
  })
})

describe('backup', () => {
  it('round-trips a plan unchanged', () => {
    const { tables, dropped } = parseBackup(JSON.stringify(sample()), ctx)
    expect(dropped).toBe(0)
    expect(tables.student_plan_slots).toHaveLength(2)
    expect(tables.prior_credits[0].id).toBe('x')
  })
  it('stamps app, format and date, and names the file by day', () => {
    expect(sample()).toMatchObject({ app: 'mydegreeplan', format: 1, exportedAt: '2026-10-01T12:00:00.000Z' })
    expect(backupFileName(new Date('2026-10-01T12:00:00Z'))).toBe('mydegreeplan-backup-2026-10-01.json')
  })
  it('drops plan slots whose requirement slot no longer exists, and counts them', () => {
    const b = sample()
    b.tables.student_plan_slots.push({ id: 3, student_id: 1, requirement_slot_id: 999 })
    const { tables, dropped } = parseBackup(JSON.stringify(b), ctx)
    expect(tables.student_plan_slots.map(r => r.id)).toEqual([1, 2])
    expect(dropped).toBe(1)
  })
  it('drops everything belonging to a profile whose concentration is gone', () => {
    const b = sample()
    b.tables.student_profiles[0].concentration_id = 42
    const { tables, dropped } = parseBackup(JSON.stringify(b), ctx)
    expect(Object.values(tables).every(r => r.length === 0)).toBe(true)
    expect(dropped).toBe(6)
  })
  it.each([
    ['not json', 'nope', /not valid JSON/],
    ['another app', JSON.stringify({ app: 'other', format: 1, tables: {} }), /not a MyDegreePlan backup/],
    ['null', 'null', /not a MyDegreePlan backup/],
    ['future format', JSON.stringify({ app: 'mydegreeplan', format: 3, tables: {} }), /different version/],
    ['no tables', JSON.stringify({ app: 'mydegreeplan', format: 1 }), /no data/],
    ['malformed table', JSON.stringify({ app: 'mydegreeplan', format: 1, tables: { prior_credits: 'x' } }), /malformed/],
    ['malformed row', JSON.stringify({ app: 'mydegreeplan', format: 1, tables: { prior_credits: [1] } }), /malformed/],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseBackup(text, ctx)).toThrow(BackupError)
    expect(() => parseBackup(text, ctx)).toThrow(message)
  })
  it('ignores tables it does not know, so a file cannot write into the catalog', () => {
    const b = sample()
    b.tables.courses = [{ code: 'EVIL' }]
    const { tables } = parseBackup(JSON.stringify(b), ctx)
    expect(tables.courses).toBeUndefined()
  })
})
