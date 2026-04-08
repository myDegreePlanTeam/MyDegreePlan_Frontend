// transferCredits.test.js
//
// Tests for the resolveTransferCredits pure helper.
//
// Bug 3 — strict matching rules:
//   Rule 1: satisfies_course_code = 'X' matches ONLY class_code = 'X' on non-pool
//           slots. NEVER falls through to pool slots.
//   Rule 2: A pool slot is satisfied ONLY by a prior_credit whose satisfies_pool
//           equals the pool's class_code. No automatic fallthrough.
//   Rule 3: Unmatched prior credits are valid — they archive nothing, but still
//           appear in Prior Coursework and count toward total hours.
//
// resolveTransferCredits(priorCredits, planSlots, slots) returns
//   { [slotId]: true } for every slot that a prior credit satisfies.

import { describe, it, expect } from 'vitest'
import { resolveTransferCredits } from '../lib/transferCredits'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const SLOT_ENGL1010 = { id: 1, class_code: 'ENGL1010', is_pool: false }
const SLOT_MATH1910 = { id: 2, class_code: 'MATH1910', is_pool: false }
const SLOT_GENED_1  = { id: 3, class_code: 'GEN_ED',   is_pool: true  }
const SLOT_GENED_2  = { id: 4, class_code: 'GEN_ED',   is_pool: true  }
const SLOT_ENG_LIT  = { id: 5, class_code: 'ENG_LIT',  is_pool: true  }
const SLOT_CSC1300  = { id: 6, class_code: 'CSC1300',  is_pool: false }

// Exact required-course credits
const AP_ENGL = {
  id: 'pc-1',
  credit_type: 'ap_credit',
  satisfies_course_code: 'ENGL1010',
  satisfies_pool: null,
  credits_awarded: 3,
}

const AP_CALC = {
  id: 'pc-2',
  credit_type: 'ap_credit',
  satisfies_course_code: 'MATH1910',
  satisfies_pool: null,
  credits_awarded: 4,
}

const PLACEMENT_ONLY = {
  id: 'pc-3',
  credit_type: 'act_placement',
  satisfies_course_code: null,
  satisfies_pool: null,
  credits_awarded: 0,
}

// Transfer credit for a course NOT in the degree plan — satisfies no required
// slot, and has NO satisfies_pool → archives nothing (Rule 3)
const HIST_TRANSFER_UNMATCHED = {
  id: 'pc-4',
  credit_type: 'transfer_credit',
  satisfies_course_code: 'HIST2010',
  satisfies_pool: null,   // no pool → Rule 3: no pool archiving
  credits_awarded: 3,
}

// Transfer credit with explicit pool satisfaction
const HIST_TRANSFER_GEN_ED = {
  id: 'pc-5',
  credit_type: 'transfer_credit',
  satisfies_course_code: 'HIST2010',
  satisfies_pool: 'GEN_ED',
  credits_awarded: 3,
}

const AP_ENGL_LIT = {
  id: 'pc-6',
  credit_type: 'ap_credit',
  satisfies_course_code: 'ENGL2130',
  satisfies_pool: 'ENG_LIT',
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

// ── Rule 1: required (non-pool) slots — exact match only ─────────────────────

describe('resolveTransferCredits — Rule 1 (required course slots)', () => {
  it('marks a required slot satisfied when satisfies_course_code matches class_code', () => {
    const result = resolveTransferCredits([AP_ENGL], {}, [SLOT_ENGL1010])
    expect(result[1]).toBe(true)
  })

  it('does NOT mark a slot when satisfies_course_code does not match', () => {
    const result = resolveTransferCredits([AP_ENGL], {}, [SLOT_MATH1910])
    expect(result[2]).toBeUndefined()
  })

  it('marks the correct slots when multiple required slots are present', () => {
    const result = resolveTransferCredits(
      [AP_ENGL, AP_CALC],
      {},
      [SLOT_ENGL1010, SLOT_MATH1910, SLOT_CSC1300]
    )
    expect(result[1]).toBe(true)        // ENGL1010 matched
    expect(result[2]).toBe(true)        // MATH1910 matched
    expect(result[6]).toBeUndefined()   // CSC1300 not matched
  })

  it('does NOT override a slot the student has already filled', () => {
    const result = resolveTransferCredits([AP_ENGL], { 1: 'ENGL1010' }, [SLOT_ENGL1010])
    expect(result[1]).toBeUndefined()
  })

  it('one prior credit satisfies at most one required slot', () => {
    // Two different slots both have ENGL1010 as class_code (edge case)
    const slot1 = { id: 10, class_code: 'ENGL1010', is_pool: false }
    const slot2 = { id: 11, class_code: 'ENGL1010', is_pool: false }
    const result = resolveTransferCredits([AP_ENGL], {}, [slot1, slot2])
    const filled = Object.values(result).filter(Boolean).length
    expect(filled).toBe(1)
  })
})

// ── Rule 2: pool slots — explicit satisfies_pool only ────────────────────────

describe('resolveTransferCredits — Rule 2 (pool slots require explicit satisfies_pool)', () => {
  it('satisfies a GEN_ED pool slot when satisfies_pool = "GEN_ED"', () => {
    const result = resolveTransferCredits([HIST_TRANSFER_GEN_ED], {}, [SLOT_GENED_1])
    expect(result[3]).toBe(true)
  })

  it('satisfies an ENG_LIT pool slot when satisfies_pool = "ENG_LIT"', () => {
    const result = resolveTransferCredits([AP_ENGL_LIT], {}, [SLOT_ENG_LIT])
    expect(result[5]).toBe(true)
  })

  it('does NOT satisfy a pool slot when satisfies_pool is null (Rule 3 unmatched)', () => {
    // HIST_TRANSFER_UNMATCHED has satisfies_course_code = 'HIST2010' but satisfies_pool = null
    // It should NOT archive the GEN_ED pool slot
    const result = resolveTransferCredits([HIST_TRANSFER_UNMATCHED], {}, [SLOT_GENED_1])
    expect(result[3]).toBeUndefined()
  })

  it('does NOT satisfy a pool slot when satisfies_pool does not match the pool class_code', () => {
    const wrongPool = {
      id: 'pc-x',
      credit_type: 'ap_credit',
      satisfies_course_code: 'ENGL2130',
      satisfies_pool: 'COMM_REQ',   // wrong pool type for ENG_LIT slot
      credits_awarded: 3,
    }
    const result = resolveTransferCredits([wrongPool], {}, [SLOT_ENG_LIT])
    expect(result[5]).toBeUndefined()
  })

  it('one pool prior credit satisfies at most ONE pool slot (not duplicated)', () => {
    const result = resolveTransferCredits(
      [HIST_TRANSFER_GEN_ED],
      {},
      [SLOT_GENED_1, SLOT_GENED_2]
    )
    const filledCount = Object.values(result).filter(Boolean).length
    expect(filledCount).toBe(1)
  })

  it('two GEN_ED pool slots satisfied by two distinct pool prior credits', () => {
    const hist2_gen_ed = {
      id: 'pc-7',
      credit_type: 'transfer_credit',
      satisfies_course_code: 'HIST2020',
      satisfies_pool: 'GEN_ED',
      credits_awarded: 3,
    }
    const result = resolveTransferCredits(
      [HIST_TRANSFER_GEN_ED, hist2_gen_ed],
      {},
      [SLOT_GENED_1, SLOT_GENED_2]
    )
    expect(result[3]).toBe(true)
    expect(result[4]).toBe(true)
  })

  it('does NOT satisfy a non-satisfiable pool slot (e.g. FREE_ELECTIVE)', () => {
    const freeSlot = { id: 7, class_code: 'FREE_ELECTIVE', is_pool: true }
    const creditWithFreePool = {
      id: 'pc-8',
      credit_type: 'transfer_credit',
      satisfies_course_code: 'SOME1000',
      satisfies_pool: 'FREE_ELECTIVE',
      credits_awarded: 3,
    }
    const result = resolveTransferCredits([creditWithFreePool], {}, [freeSlot])
    expect(result[7]).toBeUndefined()
  })

  it('does NOT override a pool slot the student already selected', () => {
    const result = resolveTransferCredits(
      [HIST_TRANSFER_GEN_ED],
      { 3: 'HIST2010' },   // student already filled slot 3
      [SLOT_GENED_1]
    )
    expect(result[3]).toBeUndefined()
  })
})

// ── Rule 3: no fallthrough — unmatched credits archive nothing ────────────────

describe('resolveTransferCredits — Rule 3 (no pool fallthrough)', () => {
  it('prior credit with satisfies_course_code but no satisfies_pool does NOT archive pool slot', () => {
    // This is the key regression test: old code let HIST2010 fall through to GEN_ED.
    // New code: no pool archiving without explicit satisfies_pool.
    const result = resolveTransferCredits(
      [HIST_TRANSFER_UNMATCHED],
      {},
      [SLOT_GENED_1, SLOT_GENED_2, SLOT_ENGL1010]
    )
    expect(result[3]).toBeUndefined()   // GEN_ED slot not archived
    expect(result[4]).toBeUndefined()   // GEN_ED slot not archived
    expect(result[1]).toBeUndefined()   // ENGL1010 not archived (HIST2010 ≠ ENGL1010)
  })

  it('unmatched credit still returns empty object (does not throw)', () => {
    const result = resolveTransferCredits(
      [HIST_TRANSFER_UNMATCHED],
      {},
      [SLOT_CSC1300]
    )
    expect(result).toEqual({})
  })
})

// ── Mixed required + pool ────────────────────────────────────────────────────

describe('resolveTransferCredits — mixed slots', () => {
  it('simultaneously satisfies required and pool slots from separate prior credits', () => {
    const result = resolveTransferCredits(
      [AP_ENGL, HIST_TRANSFER_GEN_ED],
      {},
      [SLOT_ENGL1010, SLOT_GENED_1, SLOT_MATH1910]
    )
    expect(result[1]).toBe(true)        // ENGL1010 required slot — Rule 1
    expect(result[3]).toBe(true)        // GEN_ED pool slot — Rule 2 (satisfies_pool)
    expect(result[2]).toBeUndefined()   // MATH1910 not covered
  })

  it('required-slot credit does NOT also archive a pool slot (Rule 1 never touches pool)', () => {
    // AP_ENGL covers ENGL1010 required slot.
    // Even though ENGL1010 is a valid ENG_LIT pool course, the GEN_ED slot is NOT archived.
    const result = resolveTransferCredits(
      [AP_ENGL],
      {},
      [SLOT_ENGL1010, SLOT_GENED_1]
    )
    expect(result[1]).toBe(true)        // required ENGL1010 slot archived
    expect(result[3]).toBeUndefined()   // GEN_ED pool slot NOT archived
  })
})

// ── Idempotency ──────────────────────────────────────────────────────────────

describe('resolveTransferCredits — idempotency', () => {
  it('returns the same result when called twice with the same inputs', () => {
    const args = [[AP_ENGL, HIST_TRANSFER_GEN_ED], {}, [SLOT_ENGL1010, SLOT_GENED_1]]
    const first  = resolveTransferCredits(...args)
    const second = resolveTransferCredits(...args)
    expect(first).toEqual(second)
  })
})
