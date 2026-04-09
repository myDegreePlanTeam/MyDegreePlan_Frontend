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
import { checkCoreqs, checkPrereqs } from '../lib/prereqChecker'

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

// ── OR coreq groups — Bug 2 fix ──────────────────────────────────────────────
// MATH1910 and MATH1845 share the same group_index in corequisite_entries for
// CSC1300, with logic = 'OR'.  One member satisfying the group clears the whole
// group; the other member must not appear in missing[].
//
// The grouped coreqMap shape (produced by DegreePlan.jsx after the Bug 2 fix):
//   { [courseCode]: { [groupIndex]: { logic: 'AND'|'OR', codes: string[] } } }

describe('checkCoreqs — OR group short-circuit (Bug 2 fix)', () => {
  // CSC1300: MATH1910 OR MATH1845 must be co-enrolled (same group, logic = 'OR')
  const CSC1300_COREQ_MAP_GROUPED = {
    CSC1300: {
      0: { logic: 'OR', codes: ['MATH1910', 'MATH1845'] },
    },
  }

  it('OR group satisfied by MATH1910 alone — MATH1845 is not warned', () => {
    const result = checkCoreqs('CSC1300', CSC1300_COREQ_MAP_GROUPED, new Set(['MATH1910']))
    expect(result).toEqual({ satisfied: true })
  })

  it('OR group satisfied by MATH1845 alone — MATH1910 is not required', () => {
    const result = checkCoreqs('CSC1300', CSC1300_COREQ_MAP_GROUPED, new Set(['MATH1845']))
    expect(result).toEqual({ satisfied: true })
  })

  it('OR group not satisfied when neither MATH1910 nor MATH1845 is available', () => {
    const result = checkCoreqs('CSC1300', CSC1300_COREQ_MAP_GROUPED, new Set())
    expect(result.satisfied).toBe(false)
    expect(result.missing).toEqual(['(MATH1910 or MATH1845)'])
  })

  it('OR group: one member satisfied → other member absent from missing[]', () => {
    // MATH1910 is in same semester; MATH1845 is not enrolled at all.
    // The OR group clears; MATH1845 must not appear in missing[].
    const result = checkCoreqs('CSC1300', CSC1300_COREQ_MAP_GROUPED, new Set(['MATH1910']))
    expect(result).toEqual({ satisfied: true })
    // Confirm there is no missing array at all (satisfied: true has no missing key)
    expect(result.missing).toBeUndefined()
  })
})

// ── Prereq + coreq overlap — Bug 1 fix ──────────────────────────────────────
// CSC1300 has MATH1910 in BOTH prerequisite_entries and corequisite_entries.
// When MATH1910 is co-enrolled (same semester), checkCoreqs finds it in
// availableCodes and is satisfied.  checkPrereqs must not also fire a warning —
// it should defer to checkCoreqs by suppressing the prereq warning for MATH1910.
//
// The suppression is activated by passing coreqMap as the 6th optional arg to
// checkPrereqs.  When coreqMap is absent (legacy callers), behavior is unchanged.

describe('checkPrereqs — coreq overlap suppresses false prereq warning (Bug 1 fix)', () => {
  // CSC1300 prereq: MATH1910 required (AND group)
  const CSC1300_PREREQ_MAP = {
    CSC1300: {
      0: { logic: 'AND', codes: ['MATH1910'] },
    },
  }

  // CSC1300 coreq: MATH1910 OR MATH1845 (OR group — MATH1910 appears in both tables)
  const CSC1300_COREQ_MAP = {
    CSC1300: {
      0: { logic: 'OR', codes: ['MATH1910', 'MATH1845'] },
    },
  }

  it('CSC1300 + MATH1910 same semester → no prereq warning (coreq suppresses it)', () => {
    // MATH1910 is in the same semester — NOT in satisfiedCodes (prior semesters only).
    // Because MATH1910 is also a coreq, checkPrereqs defers and emits no warning.
    const result = checkPrereqs(
      'CSC1300',
      CSC1300_PREREQ_MAP,
      new Set(),          // MATH1910 not yet completed in a prior semester
      [],
      {},
      CSC1300_COREQ_MAP   // coreqMap passed → suppression active
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('CSC1300 + MATH1910 prior semester → no prereq warning (normal satisfied path)', () => {
    // MATH1910 completed in semester 1; CSC1300 in semester 2.
    // satisfiedCodes contains MATH1910 → prereq met in the normal path.
    const result = checkPrereqs(
      'CSC1300',
      CSC1300_PREREQ_MAP,
      new Set(['MATH1910']),
      [],
      {},
      CSC1300_COREQ_MAP
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('CSC1300 + MATH1845 same semester → prereq warning for MATH1910 suppressed', () => {
    // MATH1845 is the co-enrolled course (not MATH1910).
    // prereq still requires MATH1910 — but MATH1910 is a coreq, so checkPrereqs
    // suppresses its warning regardless of which coreq alternative is present.
    // checkCoreqs separately verifies MATH1845 satisfies the OR coreq group.
    const result = checkPrereqs(
      'CSC1300',
      CSC1300_PREREQ_MAP,
      new Set(),          // MATH1910 not in prior semesters
      [],
      {},
      CSC1300_COREQ_MAP
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('CSC1300 with no coreqMap → prereq warning fires for MATH1910 (legacy behavior)', () => {
    // When coreqMap is not passed (all existing callers), suppression is inactive.
    // MATH1910 missing from satisfiedCodes → prereq warning fires as before.
    const result = checkPrereqs(
      'CSC1300',
      CSC1300_PREREQ_MAP,
      new Set()
      // no priorCredits, courseMap, or coreqMap → defaults apply
    )
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('MATH1910')
  })

  it('CSC1300 with coreqMap but MATH1910 missing → prereq suppressed, coreq owns it', () => {
    // MATH1910 is not co-enrolled (not in same semester, not in prior semesters).
    // checkPrereqs still suppresses because MATH1910 is a coreq — checkCoreqs
    // will independently warn that neither MATH1910 nor MATH1845 is available.
    const result = checkPrereqs(
      'CSC1300',
      CSC1300_PREREQ_MAP,
      new Set(),
      [],
      {},
      CSC1300_COREQ_MAP
    )
    // checkPrereqs defers — no prereq warning; student gets only the coreq warning
    expect(result).toEqual({ satisfied: true })
  })
})
