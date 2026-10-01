import { describe, it, expect } from 'vitest'
import { isRemainderPool, getPoolExtras, getPoolRemainder } from '../lib/poolRemainder'
import { calculateCredits } from '../lib/semesterCredits'
import { creditsBeforeSemester } from '../lib/transferCredits'

// The Flight Foundations Core plan's Free Elective is one 8-hour slot. A
// 3-hour course fills 3 of the 8; the other 5 must stay on the plan as a
// follow-up choice instead of vanishing from the semester and degree totals.

const courses = {
  ART1030:  { credits: 3 },
  MUS1030:  { credits: 3 },
  DANC1010: { credits: 2 },
  BIOL1010: { credits: 4 },
  CSC1300:  { credits: 4 },
}

const free = { id: 10, class_code: 'FREE_ELECTIVE', is_pool: true, flex_credits: 8 }
const csc  = { id: 11, class_code: 'CSC_ELECTIVE',  is_pool: true, flex_credits: 3 }
const fixed = { id: 12, class_code: 'CSC1300', is_pool: false }

const extra = (id, course_code, fills_slot_id, semester_number = 8) =>
  ({ id, course_code, fills_slot_id, semester_number, status: 'planned' })

describe('isRemainderPool', () => {
  it('is true only for a Free Elective with flex hours', () => {
    expect(isRemainderPool(free)).toBe(true)
    expect(isRemainderPool({ ...free, flex_credits: null })).toBe(false)
    expect(isRemainderPool({ ...free, flex_credits: 0 })).toBe(false)
    expect(isRemainderPool(csc)).toBe(false)
    expect(isRemainderPool(fixed)).toBe(false)
    expect(isRemainderPool(null)).toBe(false)
  })
})

describe('getPoolExtras', () => {
  it('returns only the free-adds linked to the slot', () => {
    const fas = [extra(1, 'MUS1030', 10), extra(2, 'ART1030', 99), { id: 3, course_code: 'CSC1300', semester_number: 2 }]
    expect(getPoolExtras(10, fas).map(f => f.id)).toEqual([1])
  })

  it('tolerates a missing list', () => {
    expect(getPoolExtras(10, undefined)).toEqual([])
  })
})

describe('getPoolRemainder', () => {
  it('is the unfilled hours after a short course (8 - 3 = 5)', () => {
    expect(getPoolRemainder(free, { 10: 'ART1030' }, courses, [])).toBe(5)
  })

  it('shrinks as follow-up picks fill it, and chains', () => {
    const one = [extra(1, 'MUS1030', 10)]
    expect(getPoolRemainder(free, { 10: 'ART1030' }, courses, one)).toBe(2)
    const two = [...one, extra(2, 'DANC1010', 10)]
    expect(getPoolRemainder(free, { 10: 'ART1030' }, courses, two)).toBe(0)
  })

  it('never goes negative when a pick overshoots the bucket', () => {
    const fas = [extra(1, 'BIOL1010', 10), extra(2, 'BIOL1010', 10)]
    expect(getPoolRemainder(free, { 10: 'ART1030' }, courses, fas)).toBe(0)
  })

  it('is 0 when one course covers the whole bucket', () => {
    expect(getPoolRemainder({ ...free, flex_credits: 3 }, { 10: 'ART1030' }, courses, [])).toBe(0)
  })

  it('ignores free-adds linked to another slot or to none', () => {
    const fas = [extra(1, 'MUS1030', 99), { id: 2, course_code: 'MUS1030', semester_number: 8 }]
    expect(getPoolRemainder(free, { 10: 'ART1030' }, courses, fas)).toBe(5)
  })

  it('reports the full bucket, less follow-ups, while the slot is unfilled', () => {
    expect(getPoolRemainder(free, {}, courses, [])).toBe(8)
    expect(getPoolRemainder(free, {}, courses, [extra(1, 'MUS1030', 10)])).toBe(5)
  })

  it('treats a chosen course missing from the catalog as filling the bucket', () => {
    expect(getPoolRemainder(free, { 10: 'GONE1000' }, courses, [])).toBe(0)
  })

  it('is 0 for every slot that is not an hours bucket', () => {
    expect(getPoolRemainder(csc, { 11: 'CSC1300' }, courses, [])).toBe(0)
    expect(getPoolRemainder(csc, {}, courses, [])).toBe(0)
    expect(getPoolRemainder(fixed, {}, courses, [])).toBe(0)
  })
})

describe('calculateCredits with a Free Elective remainder', () => {
  it('keeps the unfilled hours in the semester total', () => {
    // 3 chosen + 5 still to fill = the slot's 8, not 3.
    expect(calculateCredits([free], [], courses, { 10: 'ART1030' })).toBe(8)
  })

  it('counts a follow-up pick once, in its own semester, and shrinks the remainder', () => {
    const fas = [extra(1, 'MUS1030', 10, 8)]
    // Parent's semester: 3 chosen + 2 still owed (5 - 3).
    expect(calculateCredits([free], [], courses, { 10: 'ART1030' }, fas)).toBe(5)
    // Follow-up's semester: just its own 3.
    expect(calculateCredits([], fas, courses, { 10: 'ART1030' }, fas)).toBe(3)
  })

  it('keeps the whole bucket constant across the two semesters', () => {
    const fas = [extra(1, 'MUS1030', 10, 7)]
    const parent   = calculateCredits([free], [], courses, { 10: 'ART1030' }, fas)
    const followUp = calculateCredits([], fas, courses, { 10: 'ART1030' }, fas)
    expect(parent + followUp).toBe(8)
  })

  it('still counts an unfilled Free Elective at its flex hours', () => {
    expect(calculateCredits([free], [], courses, {})).toBe(8)
  })

  it('leaves other pools unchanged', () => {
    expect(calculateCredits([csc], [], courses, { 11: 'CSC1300' })).toBe(4)
    expect(calculateCredits([csc], [], courses, {})).toBe(3)
  })

  it('defaults allFreeAddSlots to the semester\'s own list', () => {
    const fas = [extra(1, 'MUS1030', 10, 8)]
    expect(calculateCredits([free], fas, courses, { 10: 'ART1030' })).toBe(8)
  })
})

describe('creditsBeforeSemester with a Free Elective remainder', () => {
  const plan = {
    slots: [free],
    courses,
    planSlots: { 10: 'ART1030' },
    planSemesterOverrides: { 10: 1 },
    planArchived: {},
    priorCredits: [],
    freeAddSlots: [],
  }

  it('counts the open hours toward standing for terms after the slot', () => {
    expect(creditsBeforeSemester(2, plan)).toBe(8)
  })

  it('counts a follow-up pick in its own term, not twice', () => {
    const fas = [extra(1, 'MUS1030', 10, 1)]
    // Same term as the slot: both are "before" term 2. 3 + 3 + 2 owed.
    expect(creditsBeforeSemester(2, { ...plan, freeAddSlots: fas })).toBe(8)
  })

  it('counts an unfilled Free Elective, less follow-up picks, at its remaining hours', () => {
    const open = { ...plan, planSlots: {} }
    expect(creditsBeforeSemester(2, open)).toBe(8)
    expect(creditsBeforeSemester(2, { ...open, freeAddSlots: [extra(1, 'MUS1030', 10, 1)] })).toBe(8)
  })
})
