// validatePriorCredit.test.js
//
// Tests for the validatePriorCredit backend safety net.
//
// validatePriorCredit(creditType, courseCode, creditsAwarded,
//                     testEquivalencies, courseCatalog)
//   → { valid: boolean, error: string | null, correctedCredits: number | null }
//
// Rules under test:
//   Rule 1 — Placement types (act_placement) must have credits_awarded = 0.
//   Rule 2 — Scored exam types (ap_credit, test_out, ib_credit) must match
//             a test_equivalencies row; credits must match the table value.
//   Rule 3 — Transfer/dual_enrollment credits are capped at catalog hours;
//             cap is 6 if course is not in catalog.
//   Rule 4 — courseCode is required for all non-placement credit types.

import { describe, it, expect } from 'vitest'
import { validatePriorCredit } from '../lib/validatePriorCredit'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const TEST_EQ = [
  // AP Calculus AB → MATH1910 (4 cr)
  { test_type: 'ap_credit', test_name: 'AP Calculus AB', min_score: 3,
    awarded_course_code: 'MATH1910', credits_awarded: 4 },
  // AP English Language → ENGL1010 (3 cr)
  { test_type: 'ap_credit', test_name: 'AP English Language', min_score: 3,
    awarded_course_code: 'ENGL1010', credits_awarded: 3 },
  // CLEP Calculus → MATH1910 (4 cr)
  { test_type: 'test_out', test_name: 'CLEP Calculus', min_score: 50,
    awarded_course_code: 'MATH1910', credits_awarded: 4 },
  // IB History → HIST2010 (3 cr)
  { test_type: 'ib_credit', test_name: 'IB History HL', min_score: 5,
    awarded_course_code: 'HIST2010', credits_awarded: 3 },
  // ACT English score 27+ → ENGL1010 (3 cr)
  { test_type: 'act_credit', test_name: 'ACT English', min_score: 27,
    awarded_course_code: 'ENGL1010', credits_awarded: 3 },
  // ACT English score 31+ → additionally ENGL1020 (3 cr)
  { test_type: 'act_credit', test_name: 'ACT English', min_score: 31,
    awarded_course_code: 'ENGL1020', credits_awarded: 3 },
  // ACT Math — placement only (credits_awarded = 0)
  { test_type: 'act_credit', test_name: 'ACT Mathematics', min_score: 27,
    awarded_course_code: 'MATH1910', credits_awarded: 0 },
]

const CATALOG = {
  MATH1910: { code: 'MATH1910', name: 'Calculus I',         credits: 4 },
  ENGL1010: { code: 'ENGL1010', name: 'English Comp I',     credits: 3 },
  CSC1300:  { code: 'CSC1300',  name: 'Intro to Comp Sci',  credits: 3 },
  HIST2010: { code: 'HIST2010', name: 'US History I',       credits: 3 },
}

// ── Rule 1: placement-only ────────────────────────────────────────────────────

describe('validatePriorCredit — Rule 1 (act_placement)', () => {
  it('valid when act_placement has credits_awarded = 0', () => {
    const result = validatePriorCredit('act_placement', null, 0, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
    expect(result.correctedCredits).toBeNull()
  })

  it('invalid when act_placement has credits_awarded > 0', () => {
    const result = validatePriorCredit('act_placement', null, 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/placement scores do not award credit/i)
    expect(result.correctedCredits).toBe(0)
  })

  it('courseCode is irrelevant for placement types — null is fine', () => {
    const result = validatePriorCredit('act_placement', null, 0, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })
})

// ── Rule 4: courseCode required ───────────────────────────────────────────────

describe('validatePriorCredit — Rule 4 (courseCode required)', () => {
  it('invalid when courseCode is null for ap_credit', () => {
    const result = validatePriorCredit('ap_credit', null, 4, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/course code is required/i)
  })

  it('invalid when courseCode is empty string', () => {
    const result = validatePriorCredit('ap_credit', '', 4, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/course code is required/i)
  })

  it('invalid when courseCode is whitespace only', () => {
    const result = validatePriorCredit('transfer_credit', '   ', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/course code is required/i)
  })
})

// ── Rule 2: scored exam types — test_equivalencies validation ─────────────────

describe('validatePriorCredit — Rule 2 (ap_credit)', () => {
  it('valid when ap_credit matches test_equivalencies with correct credits', () => {
    const result = validatePriorCredit('ap_credit', 'MATH1910', 4, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
    expect(result.correctedCredits).toBeNull()
  })

  it('invalid when no test_equivalencies row exists for the course', () => {
    // CSC1300 has no AP equivalency in TEST_EQ
    const result = validatePriorCredit('ap_credit', 'CSC1300', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/no ap_credit equivalency found/i)
    expect(result.correctedCredits).toBeNull()
  })

  it('invalid when credits_awarded does not match equivalency; returns correctedCredits', () => {
    // AP Calc AB awards 4 cr, student claimed 3
    const result = validatePriorCredit('ap_credit', 'MATH1910', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/credits awarded must be 4/i)
    expect(result.correctedCredits).toBe(4)
  })

  it('invalid when credits_awarded is too high', () => {
    const result = validatePriorCredit('ap_credit', 'MATH1910', 12, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.correctedCredits).toBe(4)
  })

  it('valid for ENGL1010 via ap_credit', () => {
    const result = validatePriorCredit('ap_credit', 'ENGL1010', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })
})

describe('validatePriorCredit — Rule 2 (test_out / CLEP)', () => {
  it('valid for MATH1910 via test_out with correct credits', () => {
    const result = validatePriorCredit('test_out', 'MATH1910', 4, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })

  it('invalid when no CLEP equivalency exists for course', () => {
    const result = validatePriorCredit('test_out', 'CSC1300', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/no test_out equivalency/i)
  })
})

describe('validatePriorCredit — Rule 2 (ib_credit)', () => {
  it('valid for HIST2010 via ib_credit with correct credits', () => {
    const result = validatePriorCredit('ib_credit', 'HIST2010', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })

  it('invalid when ib_credit credits mismatch; returns correctedCredits', () => {
    const result = validatePriorCredit('ib_credit', 'HIST2010', 4, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.correctedCredits).toBe(3)
  })
})

// ── Rule 3: transfer_credit and dual_enrollment ───────────────────────────────

describe('validatePriorCredit — Rule 3 (transfer_credit)', () => {
  it('valid when credits_awarded equals catalog hours', () => {
    const result = validatePriorCredit('transfer_credit', 'MATH1910', 4, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })

  it('valid when credits_awarded is less than catalog hours', () => {
    // Student transferred only a partial equivalent — allowed
    const result = validatePriorCredit('transfer_credit', 'MATH1910', 2, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })

  it('invalid when credits_awarded exceeds catalog hours; returns correctedCredits', () => {
    // MATH1910 is 4 cr; student claimed 6 — cap at 4
    const result = validatePriorCredit('transfer_credit', 'MATH1910', 6, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/exceeds the catalog credit hours/i)
    expect(result.correctedCredits).toBe(4)
  })

  it('course not in catalog — valid if credits ≤ 6', () => {
    const result = validatePriorCredit('transfer_credit', 'ZZZZ9999', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })

  it('course not in catalog — invalid if credits > 6; caps at 6', () => {
    const result = validatePriorCredit('transfer_credit', 'ZZZZ9999', 9, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/not in the TTU catalog/i)
    expect(result.correctedCredits).toBe(6)
  })
})

describe('validatePriorCredit — Rule 3 (dual_enrollment)', () => {
  it('valid when dual_enrollment credits_awarded equals catalog hours', () => {
    const result = validatePriorCredit('dual_enrollment', 'CSC1300', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
  })

  it('invalid when dual_enrollment credits exceed catalog hours', () => {
    const result = validatePriorCredit('dual_enrollment', 'CSC1300', 6, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.correctedCredits).toBe(3)
  })
})

// ── Empty / missing inputs ────────────────────────────────────────────────────

describe('validatePriorCredit — empty/missing inputs', () => {
  it('handles empty testEquivalencies gracefully for scored exam type', () => {
    const result = validatePriorCredit('ap_credit', 'MATH1910', 4, [], CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/no ap_credit equivalency/i)
  })

  it('handles null testEquivalencies gracefully', () => {
    const result = validatePriorCredit('ap_credit', 'MATH1910', 4, null, CATALOG)
    expect(result.valid).toBe(false)
  })

  it('handles empty courseCatalog gracefully for transfer_credit', () => {
    // Course not in catalog → cap at 6
    const result = validatePriorCredit('transfer_credit', 'MATH1910', 3, TEST_EQ, {})
    expect(result.valid).toBe(true)  // 3 ≤ 6 cap
  })

  it('handles null courseCatalog gracefully', () => {
    const result = validatePriorCredit('transfer_credit', 'MATH1910', 3, TEST_EQ, null)
    expect(result.valid).toBe(true)  // 3 ≤ 6 cap
  })
})

// ── Rule 2: act_credit — scored exam validation ───────────────────────────────

describe('validatePriorCredit — Rule 2 (act_credit)', () => {
  it('valid when act_credit matches test_equivalencies with correct credits', () => {
    // ACT English score 27 → ENGL1010 (3 cr)
    const result = validatePriorCredit('act_credit', 'ENGL1010', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
    expect(result.correctedCredits).toBeNull()
  })

  it('invalid when act_credit credits_awarded does not match; returns correctedCredits', () => {
    // ENGL1010 via ACT awards 3 cr; student claimed 6
    const result = validatePriorCredit('act_credit', 'ENGL1010', 6, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/credits awarded must be 3/i)
    expect(result.correctedCredits).toBe(3)
  })

  it('invalid when act_credit placement_only row has credits_awarded > 0', () => {
    // ACT Math equivalency has credits_awarded = 0 (placement only)
    // Submitting credits_awarded = 3 must be rejected; correctedCredits = 0
    const result = validatePriorCredit('act_credit', 'MATH1910', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.correctedCredits).toBe(0)
  })

  it('invalid when course has no act_credit entry in test_equivalencies', () => {
    // CSC1300 has no ACT equivalency in TEST_EQ
    const result = validatePriorCredit('act_credit', 'CSC1300', 3, TEST_EQ, CATALOG)
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/no act_credit equivalency found/i)
    expect(result.correctedCredits).toBeNull()
  })
})
