import { describe, it, expect } from 'vitest'
import { programLabels, tagsForSlots, dimmedSlots, filterOptions } from '../lib/programTags'

const programs = [{ programId: 1, primary: true }, { programId: 2, primary: false }]
const info = { 1: { name: 'CSC Core', department: 'CSC' }, 2: { name: 'Mechanical Engineering', department: 'MNE' } }

describe('programLabels', () => {
  it('uses the department when it tells the programs apart', () => {
    expect(programLabels(programs, info)).toEqual({ 1: 'CSC', 2: 'MNE' })
  })
  it('uses the name when two programs share a department, or the department is unknown', () => {
    const same = { 1: { name: 'CSC Core', department: 'CSC' }, 2: { name: 'Computer Science Minor', department: 'CSC' } }
    expect(programLabels(programs, same)).toEqual({ 1: 'CSC Core', 2: 'Computer Science Minor' })
    expect(programLabels(programs, { 1: { name: 'CSC Core' }, 2: { name: 'Other' } })).toEqual({ 1: 'CSC Core', 2: 'Other' })
    expect(programLabels(programs, {})).toEqual({ 1: 'Program', 2: 'Program' })
  })
})

describe('tagsForSlots', () => {
  const labels = { 1: 'CSC', 2: 'MNE' }
  it('names every program a slot serves, owner first', () => {
    expect(tagsForSlots({ 10: [1], 11: [1, 2], 12: [2] }, labels, programs)).toEqual({ 10: ['CSC'], 11: ['CSC', 'MNE'], 12: ['MNE'] })
  })
  it('says nothing for a student with one program: there is nothing to tell apart', () => {
    expect(tagsForSlots({ 10: [1] }, labels, programs.slice(0, 1))).toEqual({})
    expect(tagsForSlots({ 10: [1] }, labels, [])).toEqual({})
  })
})

describe('dimmedSlots', () => {
  const slots = [{ id: 10 }, { id: 11 }, { id: 12 }]
  const programsOf = { 10: [1], 11: [1, 2], 12: [2] }
  it('dims what does not serve the program picked, and keeps what is shared', () => {
    expect(dimmedSlots(slots, programsOf, 2)).toEqual({ 10: true })
    expect(dimmedSlots(slots, programsOf, '1')).toEqual({ 12: true })
  })
  it('dims nothing with no filter', () => {
    expect(dimmedSlots(slots, programsOf, null)).toEqual({})
  })
  it('dims a slot no program is recorded for', () => {
    expect(dimmedSlots([{ id: 99 }], programsOf, 1)).toEqual({ 99: true })
  })
})

describe('filterOptions', () => {
  it('lists the programs, primary first, only when there is more than one', () => {
    expect(filterOptions(programs, { 1: 'CSC', 2: 'MNE' })).toEqual([{ id: 1, label: 'CSC' }, { id: 2, label: 'MNE' }])
    expect(filterOptions(programs.slice(0, 1), { 1: 'CSC' })).toEqual([])
  })
})
