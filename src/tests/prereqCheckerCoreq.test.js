// prereqCheckerCoreq.test.js
//
// Tests for the checkCoreqs helper (Bug 4 fix).
//
// Why a separate file?
//   checkCoreqs operates on availableCodes (completedCodes + same-semester codes),
//   while checkPrereqs operates on completedCodes only.  Keeping the tests
//   separate makes the distinction explicit and keeps each file focused.
//
// coreqMap shape (built in DegreePlan.jsx from corequisite_entries rows):
//   { [courseCode]: string[] }   — flat list of required codes
//
// availableCodes: Set of codes the student has access to at the point of
//   validation — includes all earlier-semester codes plus all codes in the
//   same semester as the course being validated.
//
// Difference from prereqs:
//   Prerequisite:  must be in a COMPLETED (earlier) semester
//   Corequisite:   can be in the SAME semester (concurrent enrollment is fine)

import { describe, it, expect } from 'vitest'
import { checkCoreqs } from '../lib/prereqChecker'

// ── Shared fixtures ──────────────────────────────────────────────────────────

// MATH2110 (Calculus II) requires MATH1910 as a corequisite in some plans
const COREQ_MAP_MATH = {
  MATH2110: ['MATH1910'],
}

// CSC3220 (Computer Organization) requires a co-enrollment in MATH2110
const COREQ_MAP_CSC = {
  CSC3220: ['MATH2110'],
}

// A course with multiple corequisites
const COREQ_MAP_MULTI = {
  LAB9999: ['LECT9999', 'DISC9999'],
}

// ── No corequisites ──────────────────────────────────────────────────────────

describe('checkCoreqs — no corequisites', () => {
  it('returns satisfied: true when course has no entry in coreqMap', () => {
    const result = checkCoreqs('CSC1300', {}, new Set(['MATH1910']))
    expect(result).toEqual({ satisfied: true })
  })

  it('returns satisfied: true when coreqMap is null or undefined', () => {
    expect(checkCoreqs('CSC1300', null,      new Set())).toEqual({ satisfied: true })
    expect(checkCoreqs('CSC1300', undefined, new Set())).toEqual({ satisfied: true })
  })

  it('returns satisfied: true when the course has an empty coreq list', () => {
    const result = checkCoreqs('CSC1300', { CSC1300: [] }, new Set())
    expect(result).toEqual({ satisfied: true })
  })
})

// ── Single corequisite ───────────────────────────────────────────────────────

describe('checkCoreqs — single corequisite', () => {
  it('satisfied when the coreq code is in availableCodes', () => {
    // MATH1910 is in the same semester → available
    const result = checkCoreqs('MATH2110', COREQ_MAP_MATH, new Set(['MATH1910']))
    expect(result).toEqual({ satisfied: true })
  })

  it('not satisfied when the coreq code is absent from availableCodes', () => {
    const result = checkCoreqs('MATH2110', COREQ_MAP_MATH, new Set())
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('MATH1910')
  })

  it('satisfied when coreq code was completed in a prior semester (in availableCodes)', () => {
    // MATH1910 was in semester 1; MATH2110 is in semester 2.
    // availableCodes includes prior-semester codes, so MATH1910 is present.
    const available = new Set(['MATH1910', 'CSC1300'])  // prior + same semester
    const result = checkCoreqs('MATH2110', COREQ_MAP_MATH, available)
    expect(result).toEqual({ satisfied: true })
  })
})

// ── Key distinction: same-semester co-enrollment ─────────────────────────────
// This is the core of Bug 4: coreqs must check availableCodes (which includes
// the same semester), NOT completedCodes (which only has prior semesters).

describe('checkCoreqs — same-semester co-enrollment', () => {
  it('satisfied when the coreq is enrolled in the SAME semester (in availableCodes)', () => {
    // CSC3220 coreqs MATH2110.  Both are in Semester 3.
    // completedCodes (prior semesters) would NOT contain MATH2110.
    // availableCodes = completedCodes ∪ same-semester codes DOES contain MATH2110.
    const availableCodes = new Set(['CSC1300', 'MATH1910', 'MATH2110'])
    //                                 sem 1 codes         same-sem code
    const result = checkCoreqs('CSC3220', COREQ_MAP_CSC, availableCodes)
    expect(result).toEqual({ satisfied: true })
  })

  it('NOT satisfied when the coreq is only in a later semester (not yet available)', () => {
    // If MATH2110 is placed in semester 4 and CSC3220 is in semester 3,
    // MATH2110 is not in availableCodes for semester 3.
    const availableCodes = new Set(['CSC1300', 'MATH1910'])  // sem 3's available; MATH2110 absent
    const result = checkCoreqs('CSC3220', COREQ_MAP_CSC, availableCodes)
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('MATH2110')
  })
})

// ── Multiple corequisites ────────────────────────────────────────────────────

describe('checkCoreqs — multiple corequisites', () => {
  it('satisfied when all coreqs are available', () => {
    const available = new Set(['LECT9999', 'DISC9999'])
    const result = checkCoreqs('LAB9999', COREQ_MAP_MULTI, available)
    expect(result).toEqual({ satisfied: true })
  })

  it('not satisfied when one coreq is missing', () => {
    const available = new Set(['LECT9999'])  // DISC9999 missing
    const result = checkCoreqs('LAB9999', COREQ_MAP_MULTI, available)
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('DISC9999')
    expect(result.missing).not.toContain('LECT9999')
  })

  it('not satisfied when ALL coreqs are missing, reports all', () => {
    const result = checkCoreqs('LAB9999', COREQ_MAP_MULTI, new Set())
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('LECT9999')
    expect(result.missing).toContain('DISC9999')
    expect(result.missing).toHaveLength(2)
  })
})

// ── Prior credits satisfy coreqs ─────────────────────────────────────────────
// availableCodes must include prior_credit codes (the caller adds them).

describe('checkCoreqs — prior credits in availableCodes', () => {
  it('satisfied when coreq is covered by a prior credit (caller adds to availableCodes)', () => {
    // If MATH1910 was awarded via AP credit, the caller adds 'MATH1910' to
    // availableCodes before calling checkCoreqs.
    const available = new Set(['MATH1910'])  // added by caller from priorCredits
    const result = checkCoreqs('MATH2110', COREQ_MAP_MATH, available)
    expect(result).toEqual({ satisfied: true })
  })
})

// ── checkCoreqs is independent of checkPrereqs ───────────────────────────────
// Calling both for the same course does not interfere.

describe('checkCoreqs — independence from checkPrereqs', () => {
  it('a course can have unmet prereqs but met coreqs simultaneously', () => {
    // MATH2110 coreqs MATH1910 (met in same semester).
    // Suppose MATH2110 also prereqs MATH1730 (not met) — that is checkPrereqs' concern.
    // checkCoreqs only cares about coreqs.
    const available = new Set(['MATH1910'])
    const result = checkCoreqs('MATH2110', COREQ_MAP_MATH, available)
    expect(result).toEqual({ satisfied: true })
    // (checkPrereqs with empty completedCodes would report MATH1730 missing,
    //  but that is tested separately in prereqChecker.test.js)
  })
})
