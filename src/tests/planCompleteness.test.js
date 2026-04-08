// planCompleteness.test.js
//
// Tests for computePlanCompleteness — the pure function inside usePlanCompleteness.
//
// Why test this?
// The completeness check gates the "Plan Complete" banner.  A silent bug here
// could show the banner when the plan is actually incomplete (false positive)
// or hide it when everything is filled (false negative).  The function is pure,
// so every scenario can be exercised without spinning up React or Supabase.
//
// Slot fixture shapes:
//   Non-pool:    { id, is_pool: false, class_code: 'CSC1300' }
//   Pool:        { id, is_pool: true,  class_code: 'GEN_ED'  }
//   Free elec:   { id, is_pool: true,  class_code: 'FREE_ELECTIVE' }
//
// genEdStatus fixture shape (output of getGenEdStatus):
//   [{ category, label, filled, required, satisfied, atRisk }, ...]
//   — three items, one per sub-category.

import { describe, it, expect } from 'vitest'
import { computePlanCompleteness } from '../lib/usePlanCompleteness'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeNonPool(id, classCode = 'CSC1300') {
  return { id, is_pool: false, class_code: classCode, flex_credits: null }
}

function makePool(id, classCode = 'GEN_ED') {
  return { id, is_pool: true, class_code: classCode, flex_credits: null }
}

function makeFreeElective(id) {
  return { id, is_pool: true, class_code: 'FREE_ELECTIVE', flex_credits: 3 }
}

// Three-item genEdStatus array, all satisfied by default.
function satisfiedGenEd() {
  return [
    { category: 'History',    label: 'History',           filled: 6, required: 6, satisfied: true,  atRisk: false },
    { category: 'Humanities', label: 'Humanities & Arts', filled: 6, required: 6, satisfied: true,  atRisk: false },
    { category: 'Social',     label: 'Social Science',    filled: 6, required: 6, satisfied: true,  atRisk: false },
  ]
}

// Three-item genEdStatus where History is not yet satisfied.
function partialGenEd() {
  return [
    { category: 'History',    label: 'History',           filled: 0, required: 6, satisfied: false, atRisk: false },
    { category: 'Humanities', label: 'Humanities & Arts', filled: 6, required: 6, satisfied: true,  atRisk: false },
    { category: 'Social',     label: 'Social Science',    filled: 6, required: 6, satisfied: true,  atRisk: false },
  ]
}

// ── Empty / loading state ─────────────────────────────────────────────────────

describe('empty/loading state', () => {
  it('returns isComplete: false and 0 counts when slots is empty', () => {
    const result = computePlanCompleteness([], {}, satisfiedGenEd())
    expect(result).toEqual({ isComplete: false, totalSlots: 0, filledSlots: 0, genEdSatisfied: false })
  })

  it('returns isComplete: false when slots is null', () => {
    const result = computePlanCompleteness(null, {}, satisfiedGenEd())
    expect(result).toEqual({ isComplete: false, totalSlots: 0, filledSlots: 0, genEdSatisfied: false })
  })
})

// ── Non-pool slots ────────────────────────────────────────────────────────────

describe('non-pool (required) slots', () => {
  it('counts non-pool slots as always filled', () => {
    const slots = [makeNonPool(1), makeNonPool(2)]
    const result = computePlanCompleteness(slots, {}, [])
    expect(result.totalSlots).toBe(2)
    expect(result.filledSlots).toBe(2)
  })

  it('is complete when only non-pool slots exist and no GEN_ED slots', () => {
    const slots = [makeNonPool(1), makeNonPool(2)]
    const result = computePlanCompleteness(slots, {}, [])
    expect(result.isComplete).toBe(true)
    expect(result.genEdSatisfied).toBe(true) // no GEN_ED slots → not a blocker
  })
})

// ── Pool slots ────────────────────────────────────────────────────────────────

describe('pool slots', () => {
  it('counts a pool slot as unfilled when planSlots has no entry', () => {
    const slots = [makePool(1, 'ENG_LIT')]
    const result = computePlanCompleteness(slots, {}, [])
    expect(result.filledSlots).toBe(0)
    expect(result.isComplete).toBe(false)
  })

  it('counts a pool slot as filled when planSlots has an entry', () => {
    const slots = [makePool(1, 'ENG_LIT')]
    const result = computePlanCompleteness(slots, { 1: 'ENGL2130' }, [])
    expect(result.filledSlots).toBe(1)
  })

  it('counts FREE_ELECTIVE pool slots as always filled', () => {
    const slots = [makeFreeElective(1)]
    const result = computePlanCompleteness(slots, {}, [])
    expect(result.filledSlots).toBe(1)
    expect(result.totalSlots).toBe(1)
  })

  it('is not complete when one pool slot (non-FREE_ELECTIVE) is unfilled', () => {
    const slots = [makeNonPool(1), makePool(2, 'SCIENCE')]
    const result = computePlanCompleteness(slots, {}, [])
    expect(result.isComplete).toBe(false)
    expect(result.totalSlots).toBe(2)
    expect(result.filledSlots).toBe(1) // only the non-pool slot
  })

  it('is complete when all pool slots are filled and no GEN_ED slots', () => {
    const slots = [makeNonPool(1), makePool(2, 'SCIENCE'), makePool(3, 'COMM_REQ')]
    const planSlots = { 2: 'PHYS2010', 3: 'COMM2025' }
    const result = computePlanCompleteness(slots, planSlots, [])
    expect(result.isComplete).toBe(true)
    expect(result.totalSlots).toBe(3)
    expect(result.filledSlots).toBe(3)
  })
})

// ── GEN_ED sub-category satisfaction ─────────────────────────────────────────

describe('genEdSatisfied', () => {
  it('is true when the plan has no GEN_ED slots (not a blocker)', () => {
    const slots = [makeNonPool(1)]
    const result = computePlanCompleteness(slots, {}, satisfiedGenEd())
    expect(result.genEdSatisfied).toBe(true)
  })

  it('is true when all GEN_ED sub-categories are satisfied', () => {
    const slots = [makePool(1, 'GEN_ED'), makePool(2, 'GEN_ED')]
    const planSlots = { 1: 'HIST2010', 2: 'HIST2020' }
    const result = computePlanCompleteness(slots, planSlots, satisfiedGenEd())
    expect(result.genEdSatisfied).toBe(true)
  })

  it('is false when at least one GEN_ED sub-category is unsatisfied', () => {
    const slots = [makePool(1, 'GEN_ED'), makePool(2, 'GEN_ED')]
    const planSlots = { 1: 'HIST2010', 2: 'HIST2020' }
    const result = computePlanCompleteness(slots, planSlots, partialGenEd())
    expect(result.genEdSatisfied).toBe(false)
  })

  it('is false when genEdStatus is an empty array but GEN_ED slots exist', () => {
    const slots = [makePool(1, 'GEN_ED')]
    const result = computePlanCompleteness(slots, { 1: 'HIST2010' }, [])
    // [] means getGenEdStatus returned nothing — treat as not satisfied
    expect(result.genEdSatisfied).toBe(false)
  })
})

// ── isComplete end-to-end ─────────────────────────────────────────────────────

describe('isComplete end-to-end', () => {
  it('is true when all slots are filled and all GEN_ED categories are satisfied', () => {
    const slots = [
      makeNonPool(1, 'CSC1300'),
      makePool(2, 'GEN_ED'),
      makePool(3, 'GEN_ED'),
      makePool(4, 'SCIENCE'),
      makeFreeElective(5),
    ]
    const planSlots = { 2: 'HIST2010', 3: 'HIST2020', 4: 'PHYS2010' }
    const result = computePlanCompleteness(slots, planSlots, satisfiedGenEd())
    expect(result.isComplete).toBe(true)
  })

  it('is false when all slots are filled but a GEN_ED sub-category is unsatisfied', () => {
    const slots = [
      makeNonPool(1),
      makePool(2, 'GEN_ED'),
      makePool(3, 'GEN_ED'),
    ]
    const planSlots = { 2: 'HIST2010', 3: 'HIST2020' }
    const result = computePlanCompleteness(slots, planSlots, partialGenEd())
    expect(result.isComplete).toBe(false)
  })

  it('is false when GEN_ED is satisfied but some pool slots are empty', () => {
    const slots = [makePool(1, 'SCIENCE'), makePool(2, 'COMM_REQ')]
    const planSlots = { 1: 'PHYS2010' } // slot 2 is empty
    const result = computePlanCompleteness(slots, planSlots, satisfiedGenEd())
    expect(result.isComplete).toBe(false)
  })

  it('returns correct counts for a mixed plan', () => {
    const slots = [
      makeNonPool(1),           // always filled
      makePool(2, 'GEN_ED'),    // filled
      makePool(3, 'SCIENCE'),   // EMPTY
      makeFreeElective(4),      // always filled
    ]
    const planSlots = { 2: 'HIST2010' }
    const result = computePlanCompleteness(slots, planSlots, satisfiedGenEd())
    expect(result.totalSlots).toBe(4)
    expect(result.filledSlots).toBe(3) // slots 1, 2, 4 are filled; slot 3 is empty
    expect(result.isComplete).toBe(false)
  })
})
