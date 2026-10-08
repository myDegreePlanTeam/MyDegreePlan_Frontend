// dragConflicts.test.js
//
// The reasons a move would break a requisite (lib/dragConflicts.js). The plan view holds a conflicting move back and the
// student may move anyway; the conflicts it reports must agree with the plan's own warnings, which read an unfilled
// requirement-pool slot as provisionally meeting a requisite its pool offers.

import { describe, it, expect } from 'vitest'
import { getMoveConflicts } from '../lib/dragConflicts'

// CSC3040: (COMM2025 or PC2500) AND CSC1310
const prereqMap = {
  CSC3040: {
    0: { logic: 'OR',  codes: ['COMM2025', 'PC2500'] },
    1: { logic: 'AND', codes: ['CSC1310'] },
  },
  CSC1310: { 0: { logic: 'AND', codes: ['CSC1300'] } },
}
const coreqMap = { CSC3220: { 0: { logic: 'OR', codes: ['MATH3070', 'MATH3470'] } } }

const slots = [
  { id: 1, class_code: 'CSC1300', is_pool: false, semester_number: 1 },
  { id: 2, class_code: 'CSC1310', is_pool: false, semester_number: 2 },
  { id: 3, class_code: 'CSC3040', is_pool: false, semester_number: 4 },
  { id: 4, class_code: 'COMM_REQ', is_pool: true,  semester_number: 2 },
  { id: 5, class_code: 'CSC3220', is_pool: false, semester_number: 5 },
  { id: 6, class_code: 'MATH_STATS', is_pool: true, semester_number: 5 },
]
const base = { slots, planSlots: {}, planArchived: {}, planSemesterOverrides: {}, freeAddSlots: [], priorCredits: [], prereqMap, coreqMap }
const conflicts = (slotId, newSemester, over = {}) => getMoveConflicts({ ...base, ...over, slotId, newSemester })

describe('getMoveConflicts', () => {
  it('allows a move that keeps every prerequisite earlier', () => {
    expect(conflicts(3, 5)).toEqual([])
  })

  it('reports a prerequisite that would no longer come earlier', () => {
    // semester 1 has neither CSC1310 nor the Communications slot before it
    expect(conflicts(3, 1)).toEqual([
      'Requires one of: COMM2025, PC2500 in an earlier semester',
      'Requires CSC1310 in an earlier semester',
    ])
    // semester 2: the Communications slot is in 2 too, so it is not earlier; only CSC1310 is
    expect(conflicts(3, 2, { slots: slots.map(s => (s.id === 4 ? { ...s, semester_number: 1 } : s)) }))
      .toEqual(['Requires CSC1310 in an earlier semester'])
  })

  it('reports a course already placed that leans on the moved one', () => {
    expect(conflicts(2, 4)).toEqual(['Moving here would leave CSC3040 (Semester 4) without its prerequisite'])
  })

  it('counts an empty Communications slot in an earlier semester as meeting CSC3040 provisionally', () => {
    // CSC3040 to semester 3: CSC1310 is in 2, the empty Communications slot is in 2, no course is chosen yet
    expect(conflicts(3, 3)).toEqual([])
  })

  it('no longer counts it once CSC3040 is moved up to the slot semester or before', () => {
    expect(conflicts(3, 2)).toEqual([
      'Requires one of: COMM2025, PC2500 in an earlier semester',
      'Requires CSC1310 in an earlier semester',
    ])
    const withComm = conflicts(3, 3, { slots: slots.map(s => (s.id === 4 ? { ...s, semester_number: 3 } : s)) })
    expect(withComm).toEqual(['Requires one of: COMM2025, PC2500 in an earlier semester'])
  })

  it('a chosen Communications course is placed like any other course', () => {
    expect(conflicts(3, 3, { planSlots: { 4: 'COMM2025' } })).toEqual([])
    expect(conflicts(3, 2, { planSlots: { 4: 'COMM2025' } })).toEqual([
      'Requires one of: COMM2025, PC2500 in an earlier semester',
      'Requires CSC1310 in an earlier semester',
    ])
  })

  it('a pool slot that cannot offer the requisite does not stand in for it', () => {
    const statsOnly = slots.filter(s => s.id !== 4)
    expect(conflicts(3, 3, { slots: statsOnly })).toEqual(['Requires one of: COMM2025, PC2500 in an earlier semester'])
  })

  it('an unfilled Statistics slot in the same semester meets the corequisite of CSC3220', () => {
    expect(conflicts(5, 5)).toEqual([])
    expect(conflicts(5, 4)).toEqual(['Requires one of: MATH3070, MATH3470 in the same or earlier semester'])
  })

  it('prior credit meets a prerequisite', () => {
    const priorCredits = [{ satisfies_course_code: 'CSC1310' }, { satisfies_course_code: 'PC2500' }]
    expect(conflicts(3, 1, { priorCredits })).toEqual([])
  })

  it('says nothing for a slot with no course, an archived slot or an unknown slot', () => {
    expect(conflicts(4, 1)).toEqual([])
    expect(conflicts(99, 1)).toEqual([])
  })
})
