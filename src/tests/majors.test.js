import { describe, it, expect } from 'vitest'
import { enrolledMajors, majorsHeading, swapPrimary, mergeInOrder, inheritedRows } from '../lib/majors.js'
import { programsFromRows } from '../lib/studentPrograms.js'
import { T, courses } from './support/realStudent.js'

const prog = code => T.concentrations.find(p => p.code === code)
const slotsOf = code => T.requirement_slots.filter(s => s.concentration_id === prog(code).id && s.catalog_year === '2026-2027')
const profile = { id: 1, concentration_id: prog('core').id, catalog_year: '2026-2027', gened_program: 'flight_foundations', start_season: 'Fall', start_year: 2026 }
const row = (code, over = {}) => ({ id: 5, concentration_id: prog(code).id, role: 'major', catalog_year: '2026-2027', gened_program: 'flight_foundations', position: 1, ...over })
const info = Object.fromEntries(T.concentrations.map(p => [p.id, { name: p.name }]))

describe('enrolledMajors and the heading', () => {
  it('is the primary alone for a student with one major, and says "Your major"', () => {
    const programs = programsFromRows(profile, [])
    const majors = enrolledMajors({ programs, info })
    expect(majors).toHaveLength(1)
    expect(majors[0]).toMatchObject({ primary: true, name: 'CSC Core', rowId: null })
    expect(majorsHeading(majors)).toBe('Your major')
  })

  it('lists the primary first, then the secondary majors in the order added, and says "Your majors"', () => {
    const programs = programsFromRows(profile, [row('me', { id: 7, position: 2 }), row('minor_mathematics', { id: 6, role: 'minor', position: 1 }), row('ai', { id: 8, position: 3 })])
    const majors = enrolledMajors({ programs, info })
    expect(majors.map(m => [m.name, m.primary])).toEqual([['CSC Core', true], ['Mechanical Engineering', false], ['Artificial Intelligence', false]])
    expect(majorsHeading(majors)).toBe('Your majors')
  })

  it('leaves a minor out: it is not a major', () => {
    const programs = programsFromRows(profile, [row('minor_mathematics', { role: 'minor' })])
    expect(enrolledMajors({ programs, info })).toHaveLength(1)
    expect(majorsHeading(enrolledMajors({ programs, info }))).toBe('Your major')
  })
})

describe('swapPrimary', () => {
  const programs = programsFromRows(profile, [row('me', { id: 7 })])
  const plan = swapPrimary({ profile, row: programs[1] })

  it('puts the secondary major on the profile, with its plan year and gen-ed program', () => {
    expect(plan.profileFields).toEqual({ concentration_id: prog('me').id, catalog_year: '2026-2027', gened_program: 'flight_foundations' })
  })

  it('turns the old primary into the secondary row, entered at the student\'s own start', () => {
    expect(plan.rowFields).toEqual({
      concentration_id: prog('core').id, catalog_year: '2026-2027', gened_program: 'flight_foundations', entry_season: 'Fall', entry_year: 2026,
    })
  })

  it('moves the semester notes from the old primary to the new one', () => {
    expect(plan.notesFrom).toBe(prog('core').id)
    expect(plan.notesTo).toBe(prog('me').id)
  })

  it('never invents a start term the profile does not have', () => {
    const out = swapPrimary({ profile: { ...profile, start_season: null, start_year: '' }, row: programs[1] })
    expect(out.rowFields.entry_season).toBeNull()
    expect(out.rowFields.entry_year).toBeNull()
  })
})

describe('mergeInOrder, with the primary changed', () => {
  const sets = [
    { program: { programId: prog('core').id, role: 'major', genedProgram: 'flight_foundations' }, slots: slotsOf('core') },
    { program: { programId: prog('me').id, role: 'major', genedProgram: 'flight_foundations' }, slots: slotsOf('me') },
  ]
  const asCore = mergeInOrder({ sets, primaryId: prog('core').id, courses })
  const asMe = mergeInOrder({ sets, primaryId: prog('me').id, courses })

  it('owns the cards the primary names, so the other program\'s duplicates stand behind them', () => {
    const owner = merged => merged.slots.find(s => s.class_code === 'ENGL1010')
    expect(asCore.programsOf[owner(asCore).id][0]).toBe(prog('core').id)
    expect(asMe.programsOf[owner(asMe).id][0]).toBe(prog('me').id)
    expect(owner(asCore).id).not.toBe(owner(asMe).id)
  })

  it('has the same courses either way: a course counts once', () => {
    const codes = merged => new Set(merged.slots.filter(s => !s.is_pool).map(s => s.class_code))
    expect(codes(asMe)).toEqual(codes(asCore))
  })
})

describe('inheritedRows: nothing the student did is lost when the primary changes', () => {
  const sets = [
    { program: { programId: prog('core').id, role: 'major', genedProgram: 'flight_foundations' }, slots: slotsOf('core') },
    { program: { programId: prog('me').id, role: 'major', genedProgram: 'flight_foundations' }, slots: slotsOf('me') },
  ]
  const before = mergeInOrder({ sets, primaryId: prog('core').id, courses })
  const after = mergeInOrder({ sets, primaryId: prog('me').id, courses })
  const slotsById = new Map([...slotsOf('core'), ...slotsOf('me')].map(s => [s.id, s]))
  // the student's saved rows: every visible slot placed, one general-education pool picked
  const social = before.slots.find(s => s.class_code === 'FF_SOCIAL')
  const savedRows = before.slots.map((s, i) => ({
    requirement_slot_id: s.id, semester_number: 3 + (i % 2), selected_course_code: s.id === social.id ? 'PSY1030' : (s.is_pool ? null : s.class_code),
    status: 'planned', credits_remaining: 0, archived: false, archive_reason: null, position_source: 'algorithm',
  }))
  const rows = inheritedRows({ before, after, savedRows, slotsById, studentId: 1 })

  it('gives a card that becomes visible the place and pick of the card it stood behind', () => {
    const englNew = after.slots.find(s => s.class_code === 'ENGL1010')
    const englOld = before.slots.find(s => s.class_code === 'ENGL1010')
    const inherited = rows.find(r => r.requirement_slot_id === englNew.id)
    expect(inherited).toBeTruthy()
    expect(inherited.semester_number).toBe(savedRows.find(r => r.requirement_slot_id === englOld.id).semester_number)
    expect(inherited.selected_course_code).toBe('ENGL1010')
    expect(inherited.student_id).toBe(1)
  })

  it('carries a general-education pick to the pool that takes its place', () => {
    const picked = rows.filter(r => r.selected_course_code === 'PSY1030')
    expect(picked).toHaveLength(1)
    expect(slotsById.get(picked[0].requirement_slot_id).class_code).toBe('FF_SOCIAL')
    expect(picked[0].requirement_slot_id).not.toBe(social.id)
  })

  it('writes nothing for a card that was already visible, or that already has a row', () => {
    const visibleBefore = new Set(before.slots.map(s => s.id))
    expect(rows.every(r => !visibleBefore.has(r.requirement_slot_id))).toBe(true)
    const again = inheritedRows({ before, after, savedRows: [...savedRows, ...rows.map(r => ({ ...r }))], slotsById, studentId: 1 })
    expect(again).toEqual([])
  })

  it('writes no selected_credits unless there is some, so an older database can take the row', () => {
    expect(rows.every(r => !('selected_credits' in r))).toBe(true)
  })

  it('does nothing when the primary does not change', () => {
    expect(inheritedRows({ before, after: before, savedRows, slotsById, studentId: 1 })).toEqual([])
  })
})
