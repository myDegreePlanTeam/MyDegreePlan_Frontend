// transferCredits.test.js
//
// Tests for the resolveTransferCredits pure helper.
//
// resolveTransferCredits(priorCredits, planSlots, slots) returns
//   { [slotId]: true } for every slot that a prior credit satisfies.
//
// It must be pure: same inputs → same outputs, no DB calls, no side effects.

import { describe, it, expect } from 'vitest'
import { resolveTransferCredits } from '../lib/transferCredits'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const SLOT_ENGL1010 = { id: 1, class_code: 'ENGL1010', is_pool: false }
const SLOT_MATH1910 = { id: 2, class_code: 'MATH1910', is_pool: false }
const SLOT_GENED_1  = { id: 3, class_code: 'GEN_ED',   is_pool: true  }
const SLOT_GENED_2  = { id: 4, class_code: 'GEN_ED',   is_pool: true  }
const SLOT_ENG_LIT  = { id: 5, class_code: 'ENG_LIT',  is_pool: true  }
const SLOT_CSC1300  = { id: 6, class_code: 'CSC1300',  is_pool: false }

const AP_ENGL = {
  id: 'pc-1',
  credit_type: 'ap_credit',
  satisfies_course_code: 'ENGL1010',
  credits_awarded: 3,
}

const AP_CALC = {
  id: 'pc-2',
  credit_type: 'ap_credit',
  satisfies_course_code: 'MATH1910',
  credits_awarded: 4,
}

const PLACEMENT_ONLY = {
  id: 'pc-3',
  credit_type: 'act_placement',
  satisfies_course_code: null,
  credits_awarded: 0,
}

const HIST_TRANSFER = {
  id: 'pc-4',
  credit_type: 'transfer_credit',
  satisfies_course_code: 'HIST2010',
  credits_awarded: 3,
}

// ── No prior credits ─────────────────────────────────────────────────────────

describe('resolveTransferCredits — no prior credits', () => {
  it('returns empty object when priorCredits is empty', () => {
    const result = resolveTransferCredits([], {}, [SLOT_ENGL1010])
    expect(result).toEqual({})
  })

  it('returns empty object when priorCredits is null/undefined', () => {
    expect(resolveTransferCredits(null,      {}, [SLOT_ENGL1010])).toEqual({})
    expect(resolveTransferCredits(undefined, {}, [SLOT_ENGL1010])).toEqual({})
  })

  it('returns empty object when all prior credits are placement-only (credits_awarded = 0)', () => {
    const result = resolveTransferCredits([PLACEMENT_ONLY], {}, [SLOT_ENGL1010])
    expect(result).toEqual({})
  })
})

// ── Required (non-pool) slots ────────────────────────────────────────────────

describe('resolveTransferCredits — required course slots', () => {
  it('marks a required slot satisfied when prior credit code matches', () => {
    const result = resolveTransferCredits([AP_ENGL], {}, [SLOT_ENGL1010])
    expect(result[1]).toBe(true)
  })

  it('does NOT mark a slot when prior credit code does not match', () => {
    const result = resolveTransferCredits([AP_ENGL], {}, [SLOT_MATH1910])
    expect(result[2]).toBeUndefined()
  })

  it('marks the correct slot when multiple required slots are present', () => {
    const result = resolveTransferCredits(
      [AP_ENGL, AP_CALC],
      {},
      [SLOT_ENGL1010, SLOT_MATH1910, SLOT_CSC1300]
    )
    expect(result[1]).toBe(true)   // ENGL1010 matched
    expect(result[2]).toBe(true)   // MATH1910 matched
    expect(result[6]).toBeUndefined() // CSC1300 not matched
  })

  it('does NOT override a slot the student has already filled', () => {
    // planSlots[1] = 'ENGL1010' means the student already picked ENGL1010
    const result = resolveTransferCredits([AP_ENGL], { 1: 'ENGL1010' }, [SLOT_ENGL1010])
    expect(result[1]).toBeUndefined()
  })
})

// ── Pool slots ───────────────────────────────────────────────────────────────

describe('resolveTransferCredits — pool slots', () => {
  it('satisfies a GEN_ED pool slot with any credit-bearing prior credit', () => {
    const result = resolveTransferCredits([HIST_TRANSFER], {}, [SLOT_GENED_1])
    expect(result[3]).toBe(true)
  })

  it('satisfies an ENG_LIT pool slot with a credit-bearing prior credit', () => {
    const lit = {
      id: 'pc-5', credit_type: 'ap_credit',
      satisfies_course_code: 'ENGL1010', credits_awarded: 3,
    }
    const result = resolveTransferCredits([lit], {}, [SLOT_ENG_LIT])
    expect(result[5]).toBe(true)
  })

  it('one prior credit satisfies at most ONE pool slot (not duplicated)', () => {
    // Two GEN_ED slots but only one prior credit — only the first should be filled
    const result = resolveTransferCredits(
      [HIST_TRANSFER],
      {},
      [SLOT_GENED_1, SLOT_GENED_2]
    )
    const filledCount = Object.values(result).filter(Boolean).length
    expect(filledCount).toBe(1)
  })

  it('two pool slots are each satisfied by two distinct prior credits', () => {
    const hist2 = {
      id: 'pc-6', credit_type: 'transfer_credit',
      satisfies_course_code: 'HIST2020', credits_awarded: 3,
    }
    const result = resolveTransferCredits(
      [HIST_TRANSFER, hist2],
      {},
      [SLOT_GENED_1, SLOT_GENED_2]
    )
    expect(result[3]).toBe(true)
    expect(result[4]).toBe(true)
  })

  it('does NOT satisfy a non-transferable pool slot (e.g. FREE_ELECTIVE)', () => {
    const freeSlot = { id: 7, class_code: 'FREE_ELECTIVE', is_pool: true }
    const result   = resolveTransferCredits([HIST_TRANSFER], {}, [freeSlot])
    expect(result[7]).toBeUndefined()
  })

  it('does NOT override a pool slot the student already selected', () => {
    const result = resolveTransferCredits(
      [HIST_TRANSFER],
      { 3: 'HIST2010' },   // student already filled slot 3
      [SLOT_GENED_1]
    )
    expect(result[3]).toBeUndefined()
  })
})

// ── Mixed required + pool ────────────────────────────────────────────────────

describe('resolveTransferCredits — mixed slots', () => {
  it('simultaneously satisfies required and pool slots from multiple prior credits', () => {
    const result = resolveTransferCredits(
      [AP_ENGL, HIST_TRANSFER],
      {},
      [SLOT_ENGL1010, SLOT_GENED_1, SLOT_MATH1910]
    )
    expect(result[1]).toBe(true)   // ENGL1010 required slot
    expect(result[3]).toBe(true)   // GEN_ED pool slot
    expect(result[2]).toBeUndefined() // MATH1910 not covered
  })
})

// ── Idempotency ──────────────────────────────────────────────────────────────

describe('resolveTransferCredits — idempotency', () => {
  it('returns the same result when called twice with the same inputs', () => {
    const args = [[AP_ENGL, HIST_TRANSFER], {}, [SLOT_ENGL1010, SLOT_GENED_1]]
    const first  = resolveTransferCredits(...args)
    const second = resolveTransferCredits(...args)
    expect(first).toEqual(second)
  })
})
