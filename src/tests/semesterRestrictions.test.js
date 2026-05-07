import { describe, it, expect } from 'vitest'
import { FALL_ONLY, SPRING_ONLY, getSeasonRestriction, isEnrollmentAllowed } from '../lib/semesterRestrictions'

describe('getSeasonRestriction', () => {
  it('returns "Fall" for every FALL_ONLY code', () => {
    for (const code of FALL_ONLY) {
      expect(getSeasonRestriction(code)).toBe('Fall')
    }
  })

  it('returns "Spring" for every SPRING_ONLY code', () => {
    for (const code of SPRING_ONLY) {
      expect(getSeasonRestriction(code)).toBe('Spring')
    }
  })

  it('returns null for an unrestricted course', () => {
    expect(getSeasonRestriction('CSC1300')).toBeNull()
    expect(getSeasonRestriction('MATH1710')).toBeNull()
    expect(getSeasonRestriction('GEN_ED')).toBeNull()
  })
})

describe('isEnrollmentAllowed', () => {
  it('fall-only in Fall → true', () => {
    expect(isEnrollmentAllowed('CSC3220', 'Fall')).toBe(true)
  })

  it('fall-only in Spring → false', () => {
    expect(isEnrollmentAllowed('CSC3220', 'Spring')).toBe(false)
  })

  it('fall-only in Summer → false', () => {
    expect(isEnrollmentAllowed('CSC3220', 'Summer')).toBe(false)
  })

  it('spring-only in Spring → true', () => {
    expect(isEnrollmentAllowed('CSC3100', 'Spring')).toBe(true)
  })

  it('spring-only in Fall → false', () => {
    expect(isEnrollmentAllowed('CSC3100', 'Fall')).toBe(false)
  })

  it('spring-only in Summer → false', () => {
    expect(isEnrollmentAllowed('CSC3100', 'Summer')).toBe(false)
  })

  it('unrestricted course in Summer → true', () => {
    expect(isEnrollmentAllowed('CSC1300', 'Summer')).toBe(true)
  })

  it('unrestricted course in Fall → true', () => {
    expect(isEnrollmentAllowed('CSC1300', 'Fall')).toBe(true)
  })

  it('null semesterSeason → allow regardless of restriction', () => {
    expect(isEnrollmentAllowed('CSC3220', null)).toBe(true)
    expect(isEnrollmentAllowed('CSC3100', null)).toBe(true)
  })
})
