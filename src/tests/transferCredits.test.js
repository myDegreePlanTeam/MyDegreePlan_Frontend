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

  it('archives a non-pool slot even when planSlots has an entry for it', () => {
    // planSlots[1] = 'ENGL1010' means the student has a student_plan_slots row
    // (e.g. from a semester drag). For non-pool slots this is just the fixed class_code
    // re-stored; it does NOT mean the slot is already satisfied.
    const result = resolveTransferCredits([AP_ENGL], { 1: 'ENGL1010' }, [SLOT_ENGL1010])
    expect(result[1]).toBe(true)
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

  it('satisfies a FREE_ELECTIVE pool slot when satisfies_pool = "FREE_ELECTIVE"', () => {
    // All pool types (including FREE_ELECTIVE) are now in SATISFIABLE_POOLS so
    // drag-to-prior-credit and wizard entries can archive any pool slot.
    const freeSlot = { id: 7, class_code: 'FREE_ELECTIVE', is_pool: true }
    const creditWithFreePool = {
      id: 'pc-8',
      credit_type: 'transfer_credit',
      satisfies_course_code: 'SOME1000',
      satisfies_pool: 'FREE_ELECTIVE',
      credits_awarded: 3,
    }
    const result = resolveTransferCredits([creditWithFreePool], {}, [freeSlot])
    expect(result[7]).toBe(true)
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

// ── Pool archiving for specific courses (Session B regression tests) ─────────

describe('resolveTransferCredits — pool archiving for specific courses', () => {
  const SLOT_GEN_ED   = { id: 20, class_code: 'GEN_ED',  is_pool: true }
  const SLOT_SCIENCE  = { id: 21, class_code: 'SCIENCE',  is_pool: true }
  const SLOT_SCIENCE2 = { id: 22, class_code: 'SCIENCE',  is_pool: true }

  it('ECON2020 with satisfies_pool = "GEN_ED" archives the GEN_ED pool slot', () => {
    const econ2020 = {
      id: 'pc-s1',
      credit_type: 'ap_credit',
      satisfies_course_code: 'ECON2020',
      satisfies_pool: 'GEN_ED',
      credits_awarded: 3,
    }
    const result = resolveTransferCredits([econ2020], {}, [SLOT_GEN_ED])
    expect(result[20]).toBe(true)
  })

  it('BIOL1113 with satisfies_pool = "SCIENCE" archives a SCIENCE pool slot', () => {
    const biol1113 = {
      id: 'pc-s2',
      credit_type: 'ap_credit',
      satisfies_course_code: 'BIOL1113',
      satisfies_pool: 'SCIENCE',
      credits_awarded: 4,
    }
    const result = resolveTransferCredits([biol1113], {}, [SLOT_SCIENCE])
    expect(result[21]).toBe(true)
  })

  it('two science credits (BIOL1113 + BIOL1123) each archive one SCIENCE pool slot', () => {
    const biol1113 = {
      id: 'pc-s3',
      credit_type: 'ap_credit',
      satisfies_course_code: 'BIOL1113',
      satisfies_pool: 'SCIENCE',
      credits_awarded: 4,
    }
    const biol1123 = {
      id: 'pc-s4',
      credit_type: 'ap_credit',
      satisfies_course_code: 'BIOL1123',
      satisfies_pool: 'SCIENCE',
      credits_awarded: 4,
    }
    const result = resolveTransferCredits([biol1113, biol1123], {}, [SLOT_SCIENCE, SLOT_SCIENCE2])
    expect(result[21]).toBe(true)
    expect(result[22]).toBe(true)
  })

  it('BIOL1113 with satisfies_pool = null does NOT archive a SCIENCE pool slot (Rule 2)', () => {
    const biol1113NoPool = {
      id: 'pc-s5',
      credit_type: 'ap_credit',
      satisfies_course_code: 'BIOL1113',
      satisfies_pool: null,   // pool not set — should not archive SCIENCE slot
      credits_awarded: 4,
    }
    const result = resolveTransferCredits([biol1113NoPool], {}, [SLOT_SCIENCE])
    expect(result[21]).toBeUndefined()
  })

  it('ECON2020 with satisfies_pool = null does NOT archive a GEN_ED pool slot (Rule 2)', () => {
    const econ2020NoPool = {
      id: 'pc-s6',
      credit_type: 'transfer_credit',
      satisfies_course_code: 'ECON2020',
      satisfies_pool: null,   // pool not explicitly set — archives nothing
      credits_awarded: 3,
    }
    const result = resolveTransferCredits([econ2020NoPool], {}, [SLOT_GEN_ED])
    expect(result[20]).toBeUndefined()
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

// ── BUG-23 regression: onboarding archival parity ────────────────────────────
//
// Prior credits inserted during onboarding bypass the add/remove handler that
// normally calls syncArchivedSlots.  The pure resolver must still report the
// correct archival set so the one-shot load-time sync in DegreePlan.jsx can
// detect and repair the mismatch.  These tests lock in the expectation that
// resolveTransferCredits returns a non-empty archival set for the exact kinds
// of entries the onboarding wizard produces (AP exams with satisfies_course_code).

describe('resolveTransferCredits — BUG-23 onboarding archival parity', () => {
  it('archives a required slot for an AP credit added with empty planSlots (fresh onboarding)', () => {
    // Fresh onboarding state: no student_plan_slots rows yet, just the
    // prior_credit row written by Onboarding.handleComplete.
    const result = resolveTransferCredits([AP_CALC], {}, [SLOT_MATH1910])
    expect(result[SLOT_MATH1910.id]).toBe(true)
  })

  it('archives every covered required slot when multiple AP credits enter at onboarding', () => {
    const result = resolveTransferCredits(
      [AP_ENGL, AP_CALC],
      {},
      [SLOT_ENGL1010, SLOT_MATH1910, SLOT_CSC1300]
    )
    expect(result[SLOT_ENGL1010.id]).toBe(true)
    expect(result[SLOT_MATH1910.id]).toBe(true)
    expect(result[SLOT_CSC1300.id]).toBeUndefined()
  })

  it('reports no archival for placement-only onboarding entries (credits_awarded = 0)', () => {
    // ACT placement entries must never archive anything — guards the sync
    // effect against accidentally flipping archived=true on a covered slot.
    const result = resolveTransferCredits([PLACEMENT_ONLY], {}, [SLOT_ENGL1010, SLOT_MATH1910])
    expect(result).toEqual({})
  })
})

// ── BUG-24 regression: duplicate prior credits archive at most one slot ──────
//
// The drag-to-transfer handler in DegreePlan.jsx now dedups against
// priorCredits before inserting.  The pure resolver's "first match wins"
// guarantee is the backstop: even if a duplicate row slips into the DB
// (e.g. via direct API call or legacy data), only one slot is reported
// as archived, preventing phantom double-coverage in the UI.

describe('resolveTransferCredits — BUG-24 duplicate prior credit resilience', () => {
  it('a second prior credit for the same course does NOT double-archive the slot', () => {
    const duplicate = { ...AP_CALC, id: 'pc-dup' }
    const result = resolveTransferCredits([AP_CALC, duplicate], {}, [SLOT_MATH1910])
    expect(Object.keys(result)).toEqual([String(SLOT_MATH1910.id)])
    expect(result[SLOT_MATH1910.id]).toBe(true)
  })

  it('duplicates in the priorCredits array do not archive additional slots', () => {
    // Only one MATH1910 slot exists; two AP_CALC entries must still archive
    // just that single slot — and the extra credit becomes an unmatched
    // Rule 3 entry (still valid; archives nothing).
    const duplicate = { ...AP_CALC, id: 'pc-dup' }
    const result = resolveTransferCredits(
      [AP_CALC, duplicate],
      {},
      [SLOT_MATH1910, SLOT_ENGL1010, SLOT_CSC1300]
    )
    expect(result[SLOT_MATH1910.id]).toBe(true)
    expect(result[SLOT_ENGL1010.id]).toBeUndefined()
    expect(result[SLOT_CSC1300.id]).toBeUndefined()
  })
})
