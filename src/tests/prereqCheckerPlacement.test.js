// prereqCheckerPlacement.test.js
//
// Tests for the Tier-7 additions to checkPrereqs:
//   1. priorCredits parameter — treats prior credits as Semester-0 completions
//   2. Placement classification — courses with ACT/SAT text in description
//      never emit warnings, regardless of priorCredits
//   3. Consent classification — courses requiring instructor consent never warn
//   4. Backward compatibility — all existing calls with 3 params still work
//      (the 40 original tests in prereqChecker.test.js also cover this)
//
// These tests use the same prereqMap shape as the original test file:
//   { [courseCode]: { [groupIndex]: { logic: 'AND'|'OR', codes: string[] } } }

import { describe, it, expect } from 'vitest'
import { checkPrereqs } from '../lib/prereqChecker'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const MATH1910_PREREQ_MAP = {
  MATH1910: {
    0: { logic: 'AND', codes: ['MATH1730'] },
  },
}

const CSC3100_PREREQ_MAP = {
  CSC3100: {
    0: { logic: 'AND', codes: ['CSC2100'] },
    1: { logic: 'OR',  codes: ['CSC2220', 'CSC2570'] },
  },
}

// Course with ACT Math text in description (placement-gated)
const COURSE_MAP_ACT = {
  MATH1910: {
    code: 'MATH1910',
    description: 'Calculus I. Prereq: MATH1730 or ACT Math score of 29 or higher.',
  },
}

// Course with "Consent of instructor" in description
const COURSE_MAP_CONSENT = {
  CSC2901: {
    code: 'CSC2901',
    description: 'Independent study. Consent of instructor required.',
  },
}

const COURSE_MAP_NORMAL = {
  CSC3100: {
    code: 'CSC3100',
    description: 'Data structures and algorithms.',
  },
}

// ── Backward compatibility ───────────────────────────────────────────────────
// Calling with only 3 args (no priorCredits, no courseMap) must behave exactly
// as before the Tier-7 additions.

describe('checkPrereqs — backward compatibility (3-param calls)', () => {
  it('still returns satisfied: true when prereq is met (no new params)', () => {
    const result = checkPrereqs('CSC3100', CSC3100_PREREQ_MAP, new Set(['CSC2100', 'CSC2570']))
    expect(result).toEqual({ satisfied: true })
  })

  it('still returns satisfied: false when prereq is missing (no new params)', () => {
    const result = checkPrereqs('CSC3100', CSC3100_PREREQ_MAP, new Set())
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('CSC2100')
  })

  it('still returns satisfied: true for a course with no prereqMap entry', () => {
    expect(checkPrereqs('FREE9999', {}, new Set())).toEqual({ satisfied: true })
  })
})

// ── priorCredits parameter ───────────────────────────────────────────────────

describe('checkPrereqs — priorCredits satisfies prereqs', () => {
  it('satisfied when AND prereq is covered by a prior credit', () => {
    const priorCredits = [
      { satisfies_course_code: 'MATH1730', credits_awarded: 4, credit_type: 'ap_credit' },
    ]
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),           // no plan slots satisfy it
      priorCredits
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('satisfied when prior credit satisfies one of an OR group', () => {
    const priorCredits = [
      { satisfies_course_code: 'CSC2220', credits_awarded: 3, credit_type: 'transfer_credit' },
    ]
    const result = checkPrereqs(
      'CSC3100',
      CSC3100_PREREQ_MAP,
      new Set(['CSC2100']),  // AND group met by plan slot
      priorCredits,
      COURSE_MAP_NORMAL
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('prior credit with null satisfies_course_code does NOT satisfy any prereq', () => {
    const priorCredits = [
      { satisfies_course_code: null, credits_awarded: 0, credit_type: 'act_placement' },
    ]
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),
      priorCredits
    )
    // MATH1730 still missing — ACT placement gate has no satisfies_course_code
    // (This course is also ACT-gated in the description test below, but here
    //  we use a plain course map without description text, so classification
    //  returns 'completion' and the missing prereq is reported normally.)
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('MATH1730')
  })

  it('prior credit via dual enrollment satisfies an AND prereq', () => {
    const priorCredits = [
      { satisfies_course_code: 'CSC2100', credits_awarded: 3, credit_type: 'dual_enrollment' },
    ]
    // OR group still unmet — only AND group covered
    const result = checkPrereqs(
      'CSC3100',
      CSC3100_PREREQ_MAP,
      new Set(),
      priorCredits,
      COURSE_MAP_NORMAL
    )
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('(CSC2220 or CSC2570)')
    expect(result.missing).not.toContain('CSC2100')
  })

  it('multiple prior credits together satisfy all groups', () => {
    const priorCredits = [
      { satisfies_course_code: 'CSC2100', credits_awarded: 3, credit_type: 'dual_enrollment' },
      { satisfies_course_code: 'CSC2570', credits_awarded: 3, credit_type: 'transfer_credit' },
    ]
    const result = checkPrereqs(
      'CSC3100',
      CSC3100_PREREQ_MAP,
      new Set(),
      priorCredits,
      COURSE_MAP_NORMAL
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('plan slots + prior credits together satisfy prereqs when neither alone would', () => {
    // AND group met by plan slot, OR group met by prior credit
    const priorCredits = [
      { satisfies_course_code: 'CSC2570', credits_awarded: 3, credit_type: 'ap_credit' },
    ]
    const result = checkPrereqs(
      'CSC3100',
      CSC3100_PREREQ_MAP,
      new Set(['CSC2100']),  // AND met by plan
      priorCredits,
      COURSE_MAP_NORMAL
    )
    expect(result).toEqual({ satisfied: true })
  })
})

// ── ACT / placement classification ──────────────────────────────────────────

describe('checkPrereqs — placement-only classification (ACT text in description)', () => {
  it('returns satisfied: true for a placement-gated course when act_placement prior credit is present', () => {
    // MATH1910 description says "ACT Math score of 27 or higher"
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0 },
    ]
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),          // nothing satisfied in plan
      priorCredits,
      COURSE_MAP_ACT      // description has ACT text
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('returns satisfied: true for a placement course when act_placement score is recorded', () => {
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0 },
    ]
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),
      priorCredits,
      COURSE_MAP_ACT
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('act_placement suppresses ALL prereq groups, not just one', () => {
    // Fake a course with both AND and OR groups but ACT text in description
    const map = {
      FAKE1111: {
        0: { logic: 'AND', codes: ['PREREQ_A'] },
        1: { logic: 'OR',  codes: ['PREREQ_B', 'PREREQ_C'] },
      },
    }
    const courseMap = {
      FAKE1111: { description: 'Some course. ACT Math score 26 or equivalent.' },
    }
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'FAKE1111', credits_awarded: 0 },
    ]
    const result = checkPrereqs('FAKE1111', map, new Set(), priorCredits, courseMap)
    expect(result).toEqual({ satisfied: true })
  })

  it('does NOT suppress warnings when description has no ACT text', () => {
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),
      [],
      { MATH1910: { description: 'Calculus I. No special placement text.' } }
    )
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('MATH1730')
  })

  it('courseMap with "ACT mathematics score" pattern classifies as placement; suppressed when act_placement present', () => {
    const courseMap = {
      CHEM1110: { description: 'General Chemistry. ACT mathematics score of 26 required or MATH1710.' },
    }
    const prereqMap = { CHEM1110: { 0: { logic: 'AND', codes: ['MATH1710'] } } }
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'CHEM1110', credits_awarded: 0 },
    ]
    const result = checkPrereqs('CHEM1110', prereqMap, new Set(), priorCredits, courseMap)
    expect(result).toEqual({ satisfied: true })
  })
})

// ── Consent classification ───────────────────────────────────────────────────

describe('checkPrereqs — consent-only classification', () => {
  it('returns satisfied: true for consent-gated course with no satisfied codes', () => {
    const prereqMap = {
      CSC2901: { 0: { logic: 'AND', codes: ['SOME_PREREQ'] } },
    }
    const result = checkPrereqs(
      'CSC2901',
      prereqMap,
      new Set(),
      [],
      COURSE_MAP_CONSENT
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('"instructor\'s consent" variant also suppresses warnings', () => {
    const courseMap = {
      FAKE2222: { description: "Requires instructor's consent to enroll." },
    }
    const prereqMap = {
      FAKE2222: { 0: { logic: 'AND', codes: ['SOME_COURSE'] } },
    }
    const result = checkPrereqs('FAKE2222', prereqMap, new Set(), [], courseMap)
    expect(result).toEqual({ satisfied: true })
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('checkPrereqs — edge cases with new parameters', () => {
  it('empty priorCredits array has no effect', () => {
    const result = checkPrereqs(
      'CSC3100',
      CSC3100_PREREQ_MAP,
      new Set(['CSC2100', 'CSC2570']),
      [],
      COURSE_MAP_NORMAL
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('courseMap entry with no description does not crash', () => {
    const courseMap = { CSC3100: { code: 'CSC3100' } }  // no description field
    const result = checkPrereqs(
      'CSC3100',
      CSC3100_PREREQ_MAP,
      new Set(['CSC2100', 'CSC2570']),
      [],
      courseMap
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('courseMap missing the courseCode entry does not crash', () => {
    const result = checkPrereqs(
      'CSC3100',
      CSC3100_PREREQ_MAP,
      new Set(),
      [],
      {}  // empty courseMap — no entry for CSC3100
    )
    expect(result.satisfied).toBe(false)
    // Normal warnings still emitted since classification defaults to 'completion'
    expect(result.missing).toContain('CSC2100')
  })

  it('priorCredits with ib_credit type works identically to ap_credit', () => {
    const priorCredits = [
      { satisfies_course_code: 'MATH1730', credits_awarded: 4, credit_type: 'ib_credit' },
    ]
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),
      priorCredits
    )
    expect(result).toEqual({ satisfied: true })
  })
})

// ── BUG-31 fix: act_placement guard ─────────────────────────────────────────
// Placement-classified courses now fall through to normal prereq evaluation
// unless the student has a recorded act_placement prior credit for that course.

describe('checkPrereqs — BUG-31: act_placement guard for placement-classified courses', () => {
  it('returns satisfied: true when student has a matching act_placement prior credit', () => {
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0 },
    ]
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),
      priorCredits,
      COURSE_MAP_ACT
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('returns satisfied: false with missing prereqs when no act_placement prior credit exists', () => {
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),
      [],
      COURSE_MAP_ACT
    )
    expect(result.satisfied).toBe(false)
    // Missing is combined into one OR group with the ACT score as an alternative
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0]).toContain('MATH1730')
    expect(result.missing[0]).toContain('ACT Math 29+')
  })

  it('returns satisfied: false when act_placement is for a different course code', () => {
    // CHEM1110 is not a prereq of MATH1910, so this placement entry does not
    // trigger the guard (wrong courseCode) and does not satisfy MATH1730.
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'CHEM1110', credits_awarded: 0 },
    ]
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(),
      priorCredits,
      COURSE_MAP_ACT
    )
    expect(result.satisfied).toBe(false)
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0]).toContain('MATH1730')
    expect(result.missing[0]).toContain('ACT Math 29+')
  })

  it('returns satisfied: true via normal prereq path when prereq course is in satisfiedCodes (no act_placement needed)', () => {
    const result = checkPrereqs(
      'MATH1910',
      MATH1910_PREREQ_MAP,
      new Set(['MATH1730']),
      [],
      COURSE_MAP_ACT
    )
    expect(result).toEqual({ satisfied: true })
  })
})
