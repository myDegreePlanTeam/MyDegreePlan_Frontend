// computePlanCredits.test.js
//
// Tests for computePlanCredits — the deduplicating credit-hour calculator.
//
// Rule under test:
//   A course code may only contribute its credit hours ONCE to the plan total,
//   regardless of how many times it appears across prior_credits and plan_slots.
//   Prior credits win if both tables contain the same code.
//
// computePlanCredits(planSlots, priorCredits, slots, courses)
//   → { totalEarned: number, breakdown: Array }
//
// breakdown item: { courseCode, credits, source: 'slot'|'transfer', slotId? }

import { describe, it, expect } from 'vitest'
import { computePlanCredits } from '../lib/transferCredits'

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Courses
const COURSES = {
  ENGL1010: { code: 'ENGL1010', credits: 3, name: 'English Comp I' },
  MATH1910: { code: 'MATH1910', credits: 4, name: 'Calculus I' },
  HIST2010: { code: 'HIST2010', credits: 3, name: 'US History I' },
  CSC1300:  { code: 'CSC1300',  credits: 3, name: 'Intro to Programming' },
  BIOL1010: { code: 'BIOL1010', credits: 4, name: 'Biology I' },
}

// Slots (requirement_slots rows)
const SLOT_ENGL1010 = { id: 1, class_code: 'ENGL1010', is_pool: false }
const SLOT_MATH1910 = { id: 2, class_code: 'MATH1910', is_pool: false }
const SLOT_HIST2010 = { id: 3, class_code: 'HIST2010', is_pool: false }
const SLOT_CSC1300  = { id: 4, class_code: 'CSC1300',  is_pool: false }
const SLOT_GENED_1  = { id: 5, class_code: 'GEN_ED',   is_pool: true, flex_credits: 3 }
const SLOT_GENED_2  = { id: 6, class_code: 'GEN_ED',   is_pool: true, flex_credits: 3 }

// Prior credit entries
const AP_ENGL = {
  id: 'pc-1', credit_type: 'ap_credit',
  satisfies_course_code: 'ENGL1010', credits_awarded: 3,
}
const AP_CALC = {
  id: 'pc-2', credit_type: 'ap_credit',
  satisfies_course_code: 'MATH1910', credits_awarded: 4,
}
const TRANSFER_HIST = {
  id: 'pc-3', credit_type: 'transfer_credit',
  satisfies_course_code: 'HIST2010', credits_awarded: 3,
}
const PLACEMENT_ONLY = {
  id: 'pc-4', credit_type: 'act_placement',
  satisfies_course_code: null, credits_awarded: 0,
}

// ── Empty inputs ──────────────────────────────────────────────────────────────

describe('computePlanCredits — empty inputs', () => {
  it('returns zero totalEarned when everything is empty', () => {
    const { totalEarned } = computePlanCredits({}, [], [], {})
    expect(totalEarned).toBe(0)
  })

  it('returns empty breakdown when no credits or slots', () => {
    const { breakdown } = computePlanCredits({}, [], [], {})
    expect(breakdown).toEqual([])
  })

  it('handles null/undefined gracefully', () => {
    const { totalEarned } = computePlanCredits(null, null, null, null)
    expect(totalEarned).toBe(0)
  })
})

// ── Placement-only prior credits ───────────────────────────────────────────────

describe('computePlanCredits — placement-only entries', () => {
  it('ignores prior credits with credits_awarded = 0', () => {
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [PLACEMENT_ONLY], [SLOT_ENGL1010], COURSES
    )
    // ENGL1010 is a required slot → 3 cr from slot
    expect(totalEarned).toBe(3)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].source).toBe('slot')
  })
})

// ── Course only in prior_credits ──────────────────────────────────────────────

describe('computePlanCredits — course only in prior_credits', () => {
  it('counts credits from a prior credit when no matching slot exists', () => {
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [AP_CALC], [], COURSES
    )
    expect(totalEarned).toBe(4)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0]).toMatchObject({
      courseCode: 'MATH1910', credits: 4, source: 'transfer',
    })
    expect(breakdown[0].slotId).toBeUndefined()
  })
})

// ── Course only in plan_slots ─────────────────────────────────────────────────

describe('computePlanCredits — course only in plan_slots', () => {
  it('counts credits from a required slot when no prior credit covers it', () => {
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [], [SLOT_ENGL1010], COURSES
    )
    expect(totalEarned).toBe(3)
    expect(breakdown[0]).toMatchObject({
      courseCode: 'ENGL1010', credits: 3, source: 'slot', slotId: 1,
    })
  })

  it('counts credits from a filled pool slot', () => {
    const planSlots = { 5: 'HIST2010' }  // pool slot 5 has HIST2010 selected
    const { totalEarned, breakdown } = computePlanCredits(
      planSlots, [], [SLOT_GENED_1], COURSES
    )
    expect(totalEarned).toBe(3)
    expect(breakdown[0]).toMatchObject({ courseCode: 'HIST2010', credits: 3, source: 'slot' })
  })

  it('skips unfilled pool slots', () => {
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [], [SLOT_GENED_1], COURSES
    )
    expect(totalEarned).toBe(0)
    expect(breakdown).toHaveLength(0)
  })
})

// ── Bug 2: Same course in both prior_credits AND plan_slots ───────────────────
// Core deduplication requirement: counted exactly once, transfer wins.

describe('computePlanCredits — deduplication (Bug 2)', () => {
  it('counts ENGL1010 once when it is in both AP credit and required slot', () => {
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [AP_ENGL], [SLOT_ENGL1010], COURSES
    )
    expect(totalEarned).toBe(3)              // 3 from AP, NOT 6
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].source).toBe('transfer')
  })

  it('prior credit wins and slot entry is dropped from breakdown', () => {
    const { breakdown } = computePlanCredits(
      {}, [AP_ENGL], [SLOT_ENGL1010], COURSES
    )
    const slotEntry = breakdown.find(b => b.source === 'slot' && b.courseCode === 'ENGL1010')
    expect(slotEntry).toBeUndefined()
  })

  it('counts MATH1910 once even with AP credit + required slot', () => {
    const { totalEarned } = computePlanCredits(
      {}, [AP_CALC], [SLOT_MATH1910], COURSES
    )
    expect(totalEarned).toBe(4)              // 4 from AP, NOT 8
  })

  it('two distinct courses from two distinct prior credits are both counted', () => {
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [AP_ENGL, AP_CALC], [SLOT_ENGL1010, SLOT_MATH1910], COURSES
    )
    expect(totalEarned).toBe(7)              // 3 + 4 — each counted once
    expect(breakdown).toHaveLength(2)
    expect(breakdown.every(b => b.source === 'transfer')).toBe(true)
  })

  it('slots not covered by prior credits are still counted', () => {
    // AP covers ENGL1010; CSC1300 is in plan_slots only
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [AP_ENGL], [SLOT_ENGL1010, SLOT_CSC1300], COURSES
    )
    expect(totalEarned).toBe(6)              // 3 (transfer) + 3 (slot)
    const sources = breakdown.map(b => b.source).sort()
    expect(sources).toEqual(['slot', 'transfer'])
  })
})

// ── Gen ed slot satisfied by transfer (Bug 3 context) ────────────────────────
// A prior credit that covers a GEN_ED pool slot: the pool slot credits count
// once, not twice, even if the same course code appears in a filled pool slot.

describe('computePlanCredits — gen ed slot satisfied by transfer', () => {
  it('counts gen-ed pool slot once when satisfied by a prior credit', () => {
    // HIST2010 satisfies a GEN_ED slot; student has not selected anything in that slot
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [TRANSFER_HIST], [SLOT_GENED_1], COURSES
    )
    // HIST2010 counted via transfer (3 cr), pool slot is unfilled → not counted again
    expect(totalEarned).toBe(3)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].source).toBe('transfer')
  })

  it('does not double count when pool slot is filled with same code as prior credit', () => {
    // Student selected HIST2010 in a GEN_ED slot AND has HIST2010 as a transfer credit
    const planSlots = { 5: 'HIST2010' }
    const { totalEarned, breakdown } = computePlanCredits(
      planSlots, [TRANSFER_HIST], [SLOT_GENED_1], COURSES
    )
    expect(totalEarned).toBe(3)              // counted once via transfer
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].source).toBe('transfer')
  })

  it('counts two gen-ed slots filled by two distinct prior credits', () => {
    const planSlots = { 5: 'HIST2010', 6: 'BIOL1010' }
    const bioCredit = {
      id: 'pc-5', credit_type: 'transfer_credit',
      satisfies_course_code: 'BIOL1010', credits_awarded: 4,
    }
    const { totalEarned } = computePlanCredits(
      planSlots, [TRANSFER_HIST, bioCredit], [SLOT_GENED_1, SLOT_GENED_2], COURSES
    )
    // HIST2010 (3) + BIOL1010 (4) = 7, each counted once
    expect(totalEarned).toBe(7)
  })
})

// ── Multiple slots, mixed sources ─────────────────────────────────────────────

describe('computePlanCredits — mixed scenario', () => {
  it('handles a realistic plan with prior credits and regular slots', () => {
    // AP English covers ENGL1010 (required slot)
    // AP Calc covers MATH1910 (required slot)
    // HIST2010 is a required slot with no prior credit
    // CSC1300 is a required slot with no prior credit
    const { totalEarned, breakdown } = computePlanCredits(
      {},
      [AP_ENGL, AP_CALC],
      [SLOT_ENGL1010, SLOT_MATH1910, SLOT_HIST2010, SLOT_CSC1300],
      COURSES
    )
    // Transfer: ENGL1010=3, MATH1910=4
    // Slots:    HIST2010=3, CSC1300=3
    expect(totalEarned).toBe(13)
    expect(breakdown).toHaveLength(4)

    const transferItems = breakdown.filter(b => b.source === 'transfer')
    const slotItems     = breakdown.filter(b => b.source === 'slot')
    expect(transferItems).toHaveLength(2)
    expect(slotItems).toHaveLength(2)
  })

  it('slotId is present for slot-source items and absent for transfer items', () => {
    const { breakdown } = computePlanCredits(
      {}, [AP_ENGL], [SLOT_ENGL1010, SLOT_HIST2010], COURSES
    )
    const transferItem = breakdown.find(b => b.source === 'transfer')
    const slotItem     = breakdown.find(b => b.source === 'slot')
    expect(transferItem.slotId).toBeUndefined()
    expect(slotItem.slotId).toBeDefined()
    expect(slotItem.slotId).toBe(3)  // SLOT_HIST2010.id = 3
  })
})

// ── Idempotency ───────────────────────────────────────────────────────────────

describe('computePlanCredits — idempotency', () => {
  it('returns the same result when called twice with the same inputs', () => {
    const args = [{}, [AP_ENGL, AP_CALC], [SLOT_ENGL1010, SLOT_MATH1910], COURSES]
    const first  = computePlanCredits(...args)
    const second = computePlanCredits(...args)
    expect(first.totalEarned).toBe(second.totalEarned)
    expect(first.breakdown).toEqual(second.breakdown)
  })
})

// ── BUG-6: free-add slots are first-class plan data ───────────────────────────
//
// Pre-fix: computePlanCredits ignored student_free_add_slots entirely, so a
// course the student added outside the template never contributed to the
// total or breakdown.  Callers worked around it by adding free-add credits
// in a separate loop, which broke dedup if the same code also lived in
// prior_credits or plan_slots.
//
// Post-fix: a third pass over freeAddSlots dedups against the shared `seen`
// set.  Source 'free_add' carries freeAddId + status so the UI can split
// completed vs planned without re-querying.

describe('computePlanCredits — free-add slots (BUG-6)', () => {
  it('counts a free-added course not present elsewhere', () => {
    const fa = { id: 'fa-1', course_code: 'BIOL1010', status: 'planned' }
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [], [], COURSES, [fa]
    )
    expect(totalEarned).toBe(4)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0]).toMatchObject({
      courseCode: 'BIOL1010',
      credits:    4,
      source:     'free_add',
      freeAddId:  'fa-1',
      status:     'planned',
    })
  })

  it('sums free-add credits alongside plan-slot and prior-credit credits', () => {
    const fa = { id: 'fa-1', course_code: 'BIOL1010', status: 'completed' }
    const { totalEarned, breakdown } = computePlanCredits(
      {},
      [AP_ENGL],            // ENGL1010 via transfer = 3
      [SLOT_MATH1910],      // MATH1910 via slot     = 4
      COURSES,
      [fa],                 // BIOL1010 via free-add = 4
    )
    expect(totalEarned).toBe(11)
    expect(breakdown.map(b => b.source).sort()).toEqual(['free_add', 'slot', 'transfer'])
  })

  it('skips a free-added course that is already accounted for via prior credit', () => {
    // Student has AP_ENGL (ENGL1010, 3cr) AND a free-add row for ENGL1010.
    // The dedup contract guarantees the credits are counted exactly once,
    // and prior credits win — so the free-add row contributes nothing here.
    const dupFa = { id: 'fa-dup', course_code: 'ENGL1010', status: 'completed' }
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [AP_ENGL], [], COURSES, [dupFa]
    )
    expect(totalEarned).toBe(3)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].source).toBe('transfer')
  })

  it('skips a free-added course that is already a non-pool plan slot', () => {
    // Pass 2 (plan slot) wins over Pass 3 (free-add) for the same course.
    const dupFa = { id: 'fa-dup', course_code: 'CSC1300', status: 'planned' }
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [], [SLOT_CSC1300], COURSES, [dupFa]
    )
    expect(totalEarned).toBe(3)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].source).toBe('slot')
  })

  it('handles empty / undefined freeAddSlots without throwing', () => {
    expect(() => computePlanCredits({}, [], [], COURSES, [])).not.toThrow()
    expect(() => computePlanCredits({}, [], [], COURSES, undefined)).not.toThrow()
    expect(() => computePlanCredits({}, [], [], COURSES)).not.toThrow()
  })

  it('skips free-add rows missing a course_code', () => {
    const garbage = { id: 'fa-bad', course_code: null, status: 'planned' }
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [], [], COURSES, [garbage]
    )
    expect(totalEarned).toBe(0)
    expect(breakdown).toEqual([])
  })

  it('uses 0 credits when the catalog has no entry for a free-add course code', () => {
    const fa = { id: 'fa-1', course_code: 'UNKNOWN1000', status: 'planned' }
    const { totalEarned, breakdown } = computePlanCredits(
      {}, [], [], {}, [fa]
    )
    expect(totalEarned).toBe(0)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0]).toMatchObject({ courseCode: 'UNKNOWN1000', credits: 0 })
  })

  it('preserves prior-credits-win-over-plan-slots ordering when free-add is present', () => {
    // ENGL1010 in all three sources.  Prior credit wins.
    const planSlots = { 99: 'ENGL1010' }
    const poolSlot  = { id: 99, class_code: 'GEN_ED', is_pool: true, flex_credits: 3 }
    const fa        = { id: 'fa-dup', course_code: 'ENGL1010', status: 'completed' }
    const { totalEarned, breakdown } = computePlanCredits(
      planSlots, [AP_ENGL], [poolSlot], COURSES, [fa]
    )
    expect(totalEarned).toBe(3)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].source).toBe('transfer')
  })
})
