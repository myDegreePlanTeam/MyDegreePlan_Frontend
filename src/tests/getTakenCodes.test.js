// getTakenCodes.test.js
//
// BUG-34: AddCourseModal must not let students add a course already covered
// by the plan template, a pool selection, a prior free-add, or a credit-bearing
// prior_credit row. The takenCodes Set is the single source of truth for the
// "already in plan" rule, mirroring the dedup keyspace in computePlanCredits.
//
// Tests cover each source independently, the placement-only carve-out
// (act_placement / credits_awarded === 0 must not block), and the combined
// Set semantics.

import { describe, it, expect } from 'vitest'
import { getTakenCodes } from '../lib/transferCredits'

// ── Test helpers ─────────────────────────────────────────────────────────────

function nonPoolSlot(id, classCode) {
  return { id, is_pool: false, class_code: classCode }
}

function poolSlot(id, poolCode) {
  return { id, is_pool: true, class_code: poolCode }
}

function priorCredit({ id = 'pc', satisfies_course_code = null, credits_awarded = 3, credit_type = 'ap_credit' } = {}) {
  return { id, satisfies_course_code, credits_awarded, credit_type }
}

function freeAdd(id, courseCode) {
  return { id, course_code: courseCode }
}

// ── Empty inputs ─────────────────────────────────────────────────────────────

describe('getTakenCodes', () => {

  it('returns an empty Set when every input is empty', () => {
    const result = getTakenCodes({}, [], [], [])
    expect(result).toBeInstanceOf(Set)
    expect(result.size).toBe(0)
  })

  it('handles undefined optional priorCredits and freeAddSlots', () => {
    // computePlanCredits accepts these as undefined; getTakenCodes must too.
    const result = getTakenCodes({}, [nonPoolSlot('s1', 'CSC1300')], undefined, undefined)
    expect(result.has('CSC1300')).toBe(true)
  })

  // ── Plan slots ─────────────────────────────────────────────────────────────

  it('includes the class_code of every non-pool slot', () => {
    const slots = [
      nonPoolSlot('s1', 'CSC1300'),
      nonPoolSlot('s2', 'MATH1910'),
    ]
    const result = getTakenCodes({}, slots, [], [])
    expect([...result].sort()).toEqual(['CSC1300', 'MATH1910'])
  })

  it('includes the selection of every filled pool slot', () => {
    const slots = [poolSlot('p1', 'GEN_ED'), poolSlot('p2', 'MATH_STATS')]
    const planSlots = { p1: 'HIST2010', p2: 'MATH3070' }
    const result = getTakenCodes(planSlots, slots, [], [])
    expect([...result].sort()).toEqual(['HIST2010', 'MATH3070'])
  })

  it('does not include unfilled pool slots', () => {
    const slots = [poolSlot('p1', 'GEN_ED'), poolSlot('p2', 'GEN_ED')]
    const planSlots = { p1: 'HIST2010' }    // p2 unfilled
    const result = getTakenCodes(planSlots, slots, [], [])
    expect(result.size).toBe(1)
    expect(result.has('HIST2010')).toBe(true)
  })

  // ── Free-add slots ─────────────────────────────────────────────────────────

  it('includes the course_code of every free-add slot', () => {
    const freeAdds = [freeAdd('f1', 'CSC4990'), freeAdd('f2', 'MATH4310')]
    const result = getTakenCodes({}, [], [], freeAdds)
    expect([...result].sort()).toEqual(['CSC4990', 'MATH4310'])
  })

  it('skips free-add rows with no course_code', () => {
    // Defensive: a malformed row (e.g. mid-insert null) shouldn't crash or
    // pollute the Set with undefined.
    const freeAdds = [freeAdd('f1', 'CSC4990'), { id: 'f2', course_code: null }]
    const result = getTakenCodes({}, [], [], freeAdds)
    expect(result.size).toBe(1)
    expect(result.has('CSC4990')).toBe(true)
  })

  // ── Prior credits ──────────────────────────────────────────────────────────

  it('includes credit-bearing prior credits with a satisfies_course_code', () => {
    const priorCredits = [
      priorCredit({ id: 'pc1', satisfies_course_code: 'MATH1910', credits_awarded: 4 }),
    ]
    const result = getTakenCodes({}, [], priorCredits, [])
    expect(result.has('MATH1910')).toBe(true)
  })

  it('does NOT include placement-only prior credits (credits_awarded === 0)', () => {
    // act_placement entries gate prereqs but do not contribute credit, so they
    // mirror computePlanCredits Pass 1 — skipped, do not block free-add.
    const priorCredits = [
      priorCredit({
        id: 'pc1',
        credit_type: 'act_placement',
        satisfies_course_code: 'MATH1910',
        credits_awarded: 0,
      }),
    ]
    const result = getTakenCodes({}, [], priorCredits, [])
    expect(result.size).toBe(0)
  })

  it('does NOT include prior credits with null satisfies_course_code', () => {
    // E.g. an unmatched transfer credit (Rule 3) or a pool-targeted credit
    // — neither blocks free-add of a specific course code.
    const priorCredits = [
      priorCredit({ id: 'pc1', satisfies_course_code: null, credits_awarded: 3 }),
    ]
    const result = getTakenCodes({}, [], priorCredits, [])
    expect(result.size).toBe(0)
  })

  // ── Combined sources + Set semantics ───────────────────────────────────────

  it('dedups across all four sources', () => {
    const slots    = [nonPoolSlot('s1', 'CSC1300'), poolSlot('p1', 'GEN_ED')]
    const planSlots = { p1: 'HIST2010' }
    const priorCredits = [
      priorCredit({ id: 'pc1', satisfies_course_code: 'MATH1910', credits_awarded: 4 }),
      // Same code as a non-pool slot — Set semantics dedup naturally.
      priorCredit({ id: 'pc2', satisfies_course_code: 'CSC1300', credits_awarded: 3 }),
    ]
    const freeAdds = [freeAdd('f1', 'CSC4990')]

    const result = getTakenCodes(planSlots, slots, priorCredits, freeAdds)
    expect([...result].sort()).toEqual([
      'CSC1300', 'CSC4990', 'HIST2010', 'MATH1910',
    ])
  })
})
