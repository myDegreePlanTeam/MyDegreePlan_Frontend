// prereqChecker.test.js
//
// Tests for the checkPrereqs pure function.
//
// Why test this specifically?
// checkPrereqs sits between the database (which stores prerequisite_entries rows)
// and the UI (which locks or warns when a student can't take a course yet).
// A bug here produces SILENT wrong answers — the modal would show a course as
// available when it shouldn't be, and a student could register for something
// they lack the prerequisites for.  A pure function test catches that instantly.
//
// The prereqMap shape (built in DegreePlan.jsx from the DB rows) is:
//   { [courseCode]: { [groupIndex]: { logic: 'AND'|'OR', codes: string[] } } }
//
// AND group: every code in codes must be in satisfiedCodes.
// OR  group: at least one code in codes must be in satisfiedCodes.
// All groups must pass — a course requires EVERY group.

import { describe, it, expect } from 'vitest'
import { checkPrereqs } from '../prereqChecker'

describe('checkPrereqs', () => {

  // ── No prerequisites ────────────────────────────────────────────────────────

  it('returns satisfied: true when the course has no entry in prereqMap', () => {
    // A course not present in the map at all — no prereqs on record
    const result = checkPrereqs('MATH1910', {}, new Set())
    expect(result).toEqual({ satisfied: true })
  })

  it('returns satisfied: true when prereqMap entry exists but has no groups', () => {
    // An empty object is treated the same as "no prereqs"
    const result = checkPrereqs('CSC1300', { CSC1300: {} }, new Set())
    expect(result).toEqual({ satisfied: true })
  })

  // ── Single AND group ────────────────────────────────────────────────────────

  it('returns satisfied: true when a single AND prereq is in satisfiedCodes', () => {
    const prereqMap = {
      CSC1310: {
        0: { logic: 'AND', codes: ['CSC1300'] },
      },
    }
    const result = checkPrereqs('CSC1310', prereqMap, new Set(['CSC1300', 'MATH1910']))
    expect(result).toEqual({ satisfied: true })
  })

  it('returns satisfied: false with the missing code when AND prereq is absent', () => {
    const prereqMap = {
      CSC1310: {
        0: { logic: 'AND', codes: ['CSC1300'] },
      },
    }
    // satisfiedCodes has something, but not CSC1300
    const result = checkPrereqs('CSC1310', prereqMap, new Set(['MATH1910']))
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('CSC1300')
  })

  it('reports ALL missing AND codes when multiple codes in the group are unmet', () => {
    // AND groups normally have one code in our schema, but the function
    // handles multi-code AND groups — make sure every missing code is reported.
    const prereqMap = {
      FAKE9999: {
        0: { logic: 'AND', codes: ['CSC1300', 'MATH1910'] },
      },
    }
    const result = checkPrereqs('FAKE9999', prereqMap, new Set())
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('CSC1300')
    expect(result.missing).toContain('MATH1910')
  })

  // ── Single OR group ─────────────────────────────────────────────────────────

  it('returns satisfied: true when ANY course in an OR group is met', () => {
    const prereqMap = {
      CSC2220: {
        0: { logic: 'OR', codes: ['CSC1310', 'CSC1300'] },
      },
    }
    // Only CSC1310 is satisfied — that's enough for an OR group
    const result = checkPrereqs('CSC2220', prereqMap, new Set(['CSC1310']))
    expect(result).toEqual({ satisfied: true })
  })

  it('returns satisfied: true when ALL OR options happen to be met', () => {
    const prereqMap = {
      CSC2220: {
        0: { logic: 'OR', codes: ['CSC1310', 'CSC1300'] },
      },
    }
    const result = checkPrereqs('CSC2220', prereqMap, new Set(['CSC1310', 'CSC1300']))
    expect(result).toEqual({ satisfied: true })
  })

  it('returns satisfied: false with a formatted group string when no OR option is met', () => {
    const prereqMap = {
      CSC2220: {
        0: { logic: 'OR', codes: ['CSC1310', 'CSC1300'] },
      },
    }
    const result = checkPrereqs('CSC2220', prereqMap, new Set(['MATH1910']))
    expect(result.satisfied).toBe(false)
    // missing entry for an OR group is formatted as "(A or B)"
    expect(result.missing).toEqual(['(CSC1310 or CSC1300)'])
  })

  // ── Mixed AND + OR groups ───────────────────────────────────────────────────
  // Real-world example: a 3000-level CSC course might require
  //   Group 0 (AND): CSC2100 must be taken
  //   Group 1 (OR):  one of CSC2220, CSC2570, or CSC2770 must be taken
  // Both groups must pass independently.

  it('satisfied when both an AND group and an OR group are met', () => {
    const prereqMap = {
      CSC3100: {
        0: { logic: 'AND', codes: ['CSC2100'] },
        1: { logic: 'OR',  codes: ['CSC2220', 'CSC2570', 'CSC2770'] },
      },
    }
    const result = checkPrereqs(
      'CSC3100',
      prereqMap,
      new Set(['CSC2100', 'CSC2570'])
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('not satisfied when AND group is met but OR group is not', () => {
    const prereqMap = {
      CSC3100: {
        0: { logic: 'AND', codes: ['CSC2100'] },
        1: { logic: 'OR',  codes: ['CSC2220', 'CSC2570', 'CSC2770'] },
      },
    }
    // CSC2100 present but none of the OR options
    const result = checkPrereqs('CSC3100', prereqMap, new Set(['CSC2100', 'MATH1910']))
    expect(result.satisfied).toBe(false)
    expect(result.missing).toEqual(['(CSC2220 or CSC2570 or CSC2770)'])
  })

  it('not satisfied when OR group is met but AND group is not', () => {
    const prereqMap = {
      CSC3100: {
        0: { logic: 'AND', codes: ['CSC2100'] },
        1: { logic: 'OR',  codes: ['CSC2220', 'CSC2570', 'CSC2770'] },
      },
    }
    // CSC2570 present (satisfies OR) but CSC2100 absent (AND fails)
    const result = checkPrereqs('CSC3100', prereqMap, new Set(['CSC2570']))
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('CSC2100')
  })

  it('not satisfied and reports all missing groups when both AND and OR are unmet', () => {
    const prereqMap = {
      CSC3100: {
        0: { logic: 'AND', codes: ['CSC2100'] },
        1: { logic: 'OR',  codes: ['CSC2220', 'CSC2570', 'CSC2770'] },
      },
    }
    const result = checkPrereqs('CSC3100', prereqMap, new Set())
    expect(result.satisfied).toBe(false)
    expect(result.missing).toContain('CSC2100')
    expect(result.missing).toContain('(CSC2220 or CSC2570 or CSC2770)')
  })
})
