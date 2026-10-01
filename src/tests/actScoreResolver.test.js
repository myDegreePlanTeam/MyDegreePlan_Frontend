import { describe, it, expect } from 'vitest'
import { resolveActMathPlacement, resolveActEnglishCredit, actScoresToProfileFields } from '../lib/actScoreResolver'

// ── resolveActMathPlacement ───────────────────────────────────────────────────
// Highest-tier-only: returns ONE placement row for the highest tier reached.

describe('resolveActMathPlacement', () => {
  it('returns null for null', () => expect(resolveActMathPlacement(null)).toBeNull())
  it('returns null for undefined', () => expect(resolveActMathPlacement(undefined)).toBeNull())
  it('returns null for 0', () => expect(resolveActMathPlacement(0)).toBeNull())

  it('score 1 → MATH1000', () => {
    const r = resolveActMathPlacement(1)
    expect(r.satisfies_course_code).toBe('MATH1000')
    expect(r.credits_awarded).toBe(0)
    expect(r.credit_type).toBe('act_placement')
  })

  it('score 18 → MATH1000', () => {
    expect(resolveActMathPlacement(18).satisfies_course_code).toBe('MATH1000')
  })

  it('score 19 → MATH1710', () => {
    expect(resolveActMathPlacement(19).satisfies_course_code).toBe('MATH1710')
  })

  it('score 24 → MATH1710', () => {
    expect(resolveActMathPlacement(24).satisfies_course_code).toBe('MATH1710')
  })

  it('score 25 → MATH1730', () => {
    expect(resolveActMathPlacement(25).satisfies_course_code).toBe('MATH1730')
  })

  it('score 26 → MATH1730', () => {
    expect(resolveActMathPlacement(26).satisfies_course_code).toBe('MATH1730')
  })

  it('score 27 → MATH1904', () => {
    expect(resolveActMathPlacement(27).satisfies_course_code).toBe('MATH1904')
  })

  it('score 28 → MATH1904', () => {
    expect(resolveActMathPlacement(28).satisfies_course_code).toBe('MATH1904')
  })

  it('score 29 → MATH1910', () => {
    expect(resolveActMathPlacement(29).satisfies_course_code).toBe('MATH1910')
  })

  it('score 36 → MATH1910', () => {
    expect(resolveActMathPlacement(36).satisfies_course_code).toBe('MATH1910')
  })

  it('note includes the score', () => {
    expect(resolveActMathPlacement(27).note).toContain('27')
  })

  it('returns exactly one row (highest tier only)', () => {
    // score 36 should return one object, not an array
    const r = resolveActMathPlacement(36)
    expect(Array.isArray(r)).toBe(false)
    expect(r).not.toBeNull()
  })
})

// ── resolveActEnglishCredit ───────────────────────────────────────────────────
// Cumulative: every tier at or below the score is awarded.

describe('resolveActEnglishCredit', () => {
  it('returns [] for null', () => expect(resolveActEnglishCredit(null)).toEqual([]))
  it('returns [] for undefined', () => expect(resolveActEnglishCredit(undefined)).toEqual([]))
  it('returns [] for 0', () => expect(resolveActEnglishCredit(0)).toEqual([]))

  it('score 26 → no credit (below 27)', () => {
    expect(resolveActEnglishCredit(26)).toHaveLength(0)
  })

  it('score 27 → ENGL1010 only', () => {
    const rows = resolveActEnglishCredit(27)
    expect(rows).toHaveLength(1)
    expect(rows[0].satisfies_course_code).toBe('ENGL1010')
    expect(rows[0].credits_awarded).toBe(3)
    expect(rows[0].credit_type).toBe('act_credit')
  })

  it('score 30 → ENGL1010 only', () => {
    const rows = resolveActEnglishCredit(30)
    expect(rows).toHaveLength(1)
    expect(rows[0].satisfies_course_code).toBe('ENGL1010')
  })

  it('score 31 → ENGL1010 + ENGL1020', () => {
    const rows = resolveActEnglishCredit(31)
    expect(rows).toHaveLength(2)
    expect(rows[0].satisfies_course_code).toBe('ENGL1010')
    expect(rows[1].satisfies_course_code).toBe('ENGL1020')
    expect(rows[1].credits_awarded).toBe(3)
  })

  it('score 36 → ENGL1010 + ENGL1020', () => {
    const rows = resolveActEnglishCredit(36)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.satisfies_course_code)).toEqual(['ENGL1010', 'ENGL1020'])
  })

  it('note includes the score', () => {
    const rows = resolveActEnglishCredit(31)
    expect(rows[0].note).toContain('31')
    expect(rows[1].note).toContain('31')
  })
})

// ── actScoresToProfileFields ──────────────────────────────────────────────────
// Regression: onboarding used to hand Dashboard a profile with only act_math,
// so the Settings ACT card showed the other four scores blank.

describe('actScoresToProfileFields', () => {
  it('maps all five onboarding scores to numeric profile columns', () => {
    expect(actScoresToProfileFields({
      math: '28', english: '30', science: '25', reading: '27', composite: '29',
    })).toEqual({
      act_math: 28, act_english: 30, act_science: 25, act_reading: 27, act_composite: 29, sat_math: null,
    })
  })

  it('maps an SAT Math score the same way', () => {
    expect(actScoresToProfileFields({ satMath: '650' })).toMatchObject({ sat_math: 650, act_math: null })
  })

  it('maps blank / missing scores to null', () => {
    expect(actScoresToProfileFields({ math: '', english: null, composite: '20' })).toEqual({
      act_math: null, act_english: null, act_science: null, act_reading: null, act_composite: 20, sat_math: null,
    })
  })
})
