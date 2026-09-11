import { describe, it, expect } from 'vitest'
import { getPlanCodes, getRemovedCodes, getRemovedPrereqs } from '../lib/removedPrereqs'

// Prereqs from the live catalog.
const PREREQS = {
  PHYS2110: { 0: { logic: 'AND', codes: ['MATH1920'] } },
  MATH3470: { 0: { logic: 'AND', codes: ['MATH1920'] } },
  MATH3070: { 0: { logic: 'OR', codes: ['MATH1130', 'MATH1710', 'MATH1910', 'MATH1906'] } },
  CHEM1120: { 0: { logic: 'AND', codes: ['CHEM1110'] } },
}

const SLOTS = [
  { id: 1, class_code: 'MATH1910',   is_pool: false },
  { id: 2, class_code: 'MATH1920',   is_pool: false },
  { id: 3, class_code: 'MATH2010',   is_pool: false },
  { id: 4, class_code: 'SCIENCE',    is_pool: true },
  { id: 5, class_code: 'MATH_STATS', is_pool: true },
  { id: 6, class_code: 'ENGL1010',   is_pool: false },
]

// New student on the MATH1910 track: the builder archived MATH1920.
const NEW_STUDENT = { slots: SLOTS, planSlots: {}, planArchived: { 2: 'not_applicable' } }

function removedFor(courseCode, state) {
  const planCodes    = getPlanCodes(state)
  const removedCodes = getRemovedCodes(state.slots, state.planArchived)
  return getRemovedPrereqs(courseCode, PREREQS, planCodes, removedCodes)
}

describe('getPlanCodes', () => {
  it('collects fixed slots, filled pools, free-adds, and prior credit', () => {
    const codes = getPlanCodes({
      slots: SLOTS,
      planSlots: { 4: 'CHEM1110' },
      planArchived: { 2: 'not_applicable', 6: 'prior_credit' },
      freeAddSlots: [{ id: 9, course_code: 'CSC1200' }],
      priorCredits: [{ satisfies_course_code: 'ENGL1010', credits_awarded: 3 }],
    })
    expect([...codes].sort()).toEqual(['CHEM1110', 'CSC1200', 'ENGL1010', 'MATH1910', 'MATH2010'])
  })
})

describe('getRemovedCodes', () => {
  it('keeps only fixed courses archived for the math placement', () => {
    const removed = getRemovedCodes(SLOTS, { 2: 'not_applicable', 5: 'not_applicable', 6: 'prior_credit' })
    expect([...removed]).toEqual(['MATH1920'])
  })
})

describe('getRemovedPrereqs', () => {
  it('flags MATH1920 for PHYS2110 and MATH3470 when the plan removed it', () => {
    expect(removedFor('PHYS2110', NEW_STUDENT)).toEqual(['MATH1920'])
    expect(removedFor('MATH3470', NEW_STUDENT)).toEqual(['MATH1920'])
  })

  it('says nothing for a returning student, whose plan keeps MATH1920', () => {
    expect(removedFor('PHYS2110', { ...NEW_STUDENT, planArchived: {} })).toEqual([])
  })

  it('says nothing once the student adds MATH1920 back', () => {
    const state = { ...NEW_STUDENT, freeAddSlots: [{ id: 9, course_code: 'MATH1920' }] }
    expect(removedFor('PHYS2110', state)).toEqual([])
  })

  it('says nothing when prior credit covers MATH1920', () => {
    const state = { ...NEW_STUDENT, priorCredits: [{ satisfies_course_code: 'MATH1920', credits_awarded: 4 }] }
    expect(removedFor('MATH3470', state)).toEqual([])
  })

  it('says nothing when another member of the group is in the plan', () => {
    expect(removedFor('MATH3070', NEW_STUDENT)).toEqual([])
  })

  it('ignores prereqs the plan never had (sequence partners)', () => {
    expect(removedFor('CHEM1120', NEW_STUDENT)).toEqual([])
  })

  it('returns nothing for a course without prereqs', () => {
    expect(removedFor('COMM2025', NEW_STUDENT)).toEqual([])
  })
})
