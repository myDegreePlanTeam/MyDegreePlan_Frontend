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
    ['future format', JSON.stringify({ app: 'mydegreeplan', format: 2, tables: {} }), /different version/],
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
