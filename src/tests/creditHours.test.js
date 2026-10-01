import { describe, it, expect } from 'vitest'
import { creditRange, isVariableCredit, formatCredits, validateHours, clampHours, applyChosenHours } from '../lib/creditHours'

const fixed = { code: 'CSC1300', credits: 4, credits_max: null }
const range = { code: 'AGBE4940', credits: 1, credits_max: 4 }

describe('creditRange / formatCredits', () => {
  it('a fixed course has one number', () => {
    expect(creditRange(fixed)).toEqual({ min: 4, max: 4, variable: false })
    expect(formatCredits(fixed)).toBe('4')
    expect(isVariableCredit(fixed)).toBe(false)
  })
  it('a ranged course shows both ends', () => {
    expect(creditRange(range)).toEqual({ min: 1, max: 4, variable: true })
    expect(formatCredits(range)).toBe('1–4')
  })
  it('a missing credits_max is fixed', () => {
    expect(isVariableCredit({ credits: 3 })).toBe(false)
  })
})

describe('validateHours / clampHours', () => {
  it('accepts whole numbers inside the range, ends included', () => {
    for (const h of [1, 2, 4, '3']) expect(validateHours(range, h)).toBeNull()
  })
  it('rejects outside the range, fractions and blanks', () => {
    expect(validateHours(range, 0)).toMatch(/1 to 4/)
    expect(validateHours(range, 5)).toMatch(/1 to 4/)
    expect(validateHours(range, 2.5)).toMatch(/whole number/)
    expect(validateHours(range, '')).toMatch(/whole number/)
    expect(validateHours(range, null)).toMatch(/whole number/)
  })
  it('has nothing to ask of a fixed course', () => {
    expect(validateHours(fixed, 99)).toBeNull()
  })
  it('clamps into range', () => {
    expect(clampHours(range, 9)).toBe(4)
    expect(clampHours(range, -3)).toBe(1)
    expect(clampHours(range, 'x')).toBe(1)
    expect(clampHours(range, 2.9)).toBe(2)
  })
})

describe('applyChosenHours', () => {
  const courses = { CSC1300: fixed, AGBE4940: range }

  it('overlays a free-add choice and remembers the minimum', () => {
    const out = applyChosenHours(courses, { freeAdds: [{ course_code: 'AGBE4940', credits: 3 }] })
    expect(out.AGBE4940.credits).toBe(3)
    expect(creditRange(out.AGBE4940)).toEqual({ min: 1, max: 4, variable: true })
    expect(courses.AGBE4940.credits).toBe(1)                   // the input is not mutated
  })
  it('overlays a pool pick through its slot', () => {
    const out = applyChosenHours(courses, { planSlots: { 7: 'AGBE4940' }, planSelectedCredits: { 7: 2 } })
    expect(out.AGBE4940.credits).toBe(2)
  })
  it('ignores a choice outside the range, for a fixed course, or for an unknown course', () => {
    const out = applyChosenHours(courses, {
      freeAdds: [{ course_code: 'AGBE4940', credits: 9 }, { course_code: 'CSC1300', credits: 2 }, { course_code: 'ZZZ9999', credits: 2 }],
    })
    expect(out.AGBE4940.credits).toBe(1)
    expect(out.CSC1300.credits).toBe(4)
    expect(out.ZZZ9999).toBeUndefined()
  })
  it('leaves rows with no choice alone', () => {
    const out = applyChosenHours(courses, { freeAdds: [{ course_code: 'AGBE4940', credits: null }] })
    expect(out.AGBE4940).toBe(range)
  })
})
