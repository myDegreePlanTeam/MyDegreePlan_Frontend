// poolResolver.test.js
//
// Tests for resolvePool, resolveScience, and resolveFreeElective.
//
// Why these three functions specifically?
//
// resolvePool:       Controls which courses appear in a slot's selection modal.
//                    A wrong filter means a student gets shown courses they
//                    can't actually use, or valid courses go missing entirely.
//
// resolveScience:    Drives the science sequence logic — the most complex
//                    branching in the app.  A wrong autofill silently pairs
//                    GEOL1040 with PHYS2020, or fails to enter narrow mode
//                    for BIOL1113, leaving the student confused about why
//                    their biology slots won't fill properly.
//
// resolveFreeElective: Splits the open course list into "suggested" (subjects
//                    already in the plan) vs "other".  A wrong partition means
//                    relevant courses are buried.
//
// All three are pure functions — no DB, no React, no async.  Tests run
// in milliseconds and prove the logic independently of the UI.

import { describe, it, expect } from 'vitest'
import {
  resolvePool,
  resolveScience,
  resolveFreeElective,
  resolveSatisfiesPool,
  getScienceWarnings,
  POOL_COURSES,
} from '../poolResolver'

// ── Test helpers ─────────────────────────────────────────────────────────────

// Build a minimal course object from a code.
// subject_code is derived by stripping the trailing digits (e.g. 'CHEM1110' → 'CHEM').
function makeCourse(code, credits = 3) {
  const subject_code = code.replace(/\d.*$/, '')
  return { code, name: `${code} Name`, credits, subject_code }
}

// Build a courseMap that contains every course listed in POOL_COURSES.
// Used wherever we need a realistic "full catalog."
function makeFullCourseMap() {
  const map = {}
  for (const codes of Object.values(POOL_COURSES)) {
    if (!codes) continue          // FREE_ELECTIVE is null
    for (const code of codes) {
      map[code] = makeCourse(code)
    }
  }
  return map
}

// Two science slots — the shape DegreePlan passes to resolveScience.
const SCIENCE_SLOTS = [
  { id: 'sci1', is_pool: true, class_code: 'SCIENCE' },
  { id: 'sci2', is_pool: true, class_code: 'SCIENCE' },
]

// ── resolvePool ───────────────────────────────────────────────────────────────

describe('resolvePool', () => {

  it('returns null for FREE_ELECTIVE (signals open-search mode to the modal)', () => {
    expect(resolvePool('FREE_ELECTIVE', {})).toBeNull()
  })

  it('returns an empty array for an unknown pool code', () => {
    expect(resolvePool('TOTALLY_UNKNOWN', {})).toEqual([])
  })

  it('returns course objects for every code in ENG_LIT when all are in courseMap', () => {
    const courseMap = makeFullCourseMap()
    const result = resolvePool('ENG_LIT', courseMap)

    // Should return one object per code in the pool definition
    expect(result).toHaveLength(POOL_COURSES.ENG_LIT.length)
    // Every returned item should have a code string
    expect(result.every(c => typeof c.code === 'string')).toBe(true)
  })

  it('filters out pool codes that are missing from courseMap', () => {
    // Only one of the three ENG_LIT courses is in the map — simulates a
    // catalog that hasn't been fully seeded yet.
    const courseMap = { ENGL2130: makeCourse('ENGL2130') }
    const result = resolvePool('ENG_LIT', courseMap)

    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('ENGL2130')
  })

  it('returns an empty array when none of the pool codes are in courseMap', () => {
    const result = resolvePool('ENG_LIT', {})
    expect(result).toEqual([])
  })

  it('resolves MATH_STATS pool correctly', () => {
    const courseMap = makeFullCourseMap()
    const result = resolvePool('MATH_STATS', courseMap)
    const codes = result.map(c => c.code)
    expect(codes).toContain('MATH3070')
    expect(codes).toContain('MATH3470')
  })

  it('resolves CSC_HPC_ELECTIVE pool correctly', () => {
    const courseMap = makeFullCourseMap()
    const result = resolvePool('CSC_HPC_ELECTIVE', courseMap)
    const codes = result.map(c => c.code)
    expect(codes).toContain('CSC4040')
    expect(codes).toContain('CSC4710')
  })
})

// ── resolveScience ────────────────────────────────────────────────────────────
//
// Modes:
//   normal   — no science selected yet (or unknown code) → full SCIENCE pool
//   autofill — one half of a known sequence selected → return the partner course
//   narrow   — BIOL1113 selected (can pair with BIOL1123 OR BIOL2310) →
//              return only those two options
//
// The function signature: resolveScience(planSlots, slots, courseMap)
// planSlots maps slot id → course code; missing key = nothing selected.

describe('resolveScience', () => {

  const courseMap = makeFullCourseMap()

  it('returns normal mode when no science courses are selected', () => {
    const result = resolveScience({}, SCIENCE_SLOTS, courseMap)
    expect(result).toEqual({ mode: 'normal' })
  })

  // ── Chemistry sequence ───────────────────────────────────────────────────

  it('autofills CHEM1120 when CHEM1110 is selected', () => {
    const result = resolveScience({ sci1: 'CHEM1110' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('CHEM1120')
  })

  it('autofills CHEM1110 when CHEM1120 is selected', () => {
    const result = resolveScience({ sci1: 'CHEM1120' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('CHEM1110')
  })

  // ── Physics (Algebra) sequence ───────────────────────────────────────────

  it('autofills PHYS2020 when PHYS2010 is selected', () => {
    const result = resolveScience({ sci1: 'PHYS2010' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('PHYS2020')
  })

  it('autofills PHYS2010 when PHYS2020 is selected', () => {
    const result = resolveScience({ sci1: 'PHYS2020' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('PHYS2010')
  })

  // ── Physics (Calculus) sequence ──────────────────────────────────────────

  it('autofills PHYS2120 when PHYS2110 is selected', () => {
    const result = resolveScience({ sci1: 'PHYS2110' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('PHYS2120')
  })

  it('autofills PHYS2110 when PHYS2120 is selected', () => {
    const result = resolveScience({ sci1: 'PHYS2120' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('PHYS2110')
  })

  // ── Geology sequence (no strict order — both directions should work) ──────

  it('autofills GEOL1045 when GEOL1040 is selected', () => {
    const result = resolveScience({ sci1: 'GEOL1040' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('GEOL1045')
  })

  it('autofills GEOL1040 when GEOL1045 is selected', () => {
    const result = resolveScience({ sci1: 'GEOL1045' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('GEOL1040')
  })

  // ── Biology — BIOL1123 and BIOL2310 autofill to BIOL1113 ─────────────────
  // BIOL1123 is the second-semester biology lab; BIOL2310 is microbiology.
  // Either can pair with BIOL1113 (intro biology), so selecting either
  // should autofill the partner to BIOL1113.

  it('autofills BIOL1113 when BIOL1123 is selected', () => {
    const result = resolveScience({ sci1: 'BIOL1123' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('BIOL1113')
  })

  it('autofills BIOL1113 when BIOL2310 is selected', () => {
    const result = resolveScience({ sci1: 'BIOL2310' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('BIOL1113')
  })

  // ── Biology — BIOL1113 narrows to the two valid partners ──────────────────
  // BIOL1113 is special: it can pair with EITHER BIOL1123 OR BIOL2310.
  // When BIOL1113 is already selected, the modal should narrow to only those
  // two options rather than autofilling one arbitrarily.

  it('returns narrow mode with BIOL1123 and BIOL2310 when BIOL1113 is selected', () => {
    const result = resolveScience({ sci1: 'BIOL1113' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('narrow')
    expect(result.courses).toHaveLength(2)
    const codes = result.courses.map(c => c.code)
    expect(codes).toContain('BIOL1123')
    expect(codes).toContain('BIOL2310')
  })

  it('narrow mode only includes courses present in courseMap', () => {
    // Simulate a partial catalog where BIOL2310 is missing
    const partialMap = makeFullCourseMap()
    delete partialMap['BIOL2310']

    const result = resolveScience({ sci1: 'BIOL1113' }, SCIENCE_SLOTS, partialMap)
    expect(result.mode).toBe('narrow')
    expect(result.courses).toHaveLength(1)
    expect(result.courses[0].code).toBe('BIOL1123')
  })

  // ── Unknown/non-sequence science course ───────────────────────────────────

  it('returns normal mode when the selected science course is not in any known sequence', () => {
    // This could happen if someone manually inserted an unexpected science code
    const result = resolveScience({ sci1: 'FAKE9999' }, SCIENCE_SLOTS, courseMap)
    expect(result).toEqual({ mode: 'normal' })
  })

  // ── Selection from second slot works the same way ─────────────────────────

  it('detects science selection from the second slot (sci2) correctly', () => {
    // planSlots has sci2 filled but sci1 empty
    const result = resolveScience({ sci2: 'CHEM1110' }, SCIENCE_SLOTS, courseMap)
    expect(result.mode).toBe('autofill')
    expect(result.course.code).toBe('CHEM1120')
  })
})

// ── getScienceWarnings ────────────────────────────────────────────────────────
//
// Surfaces "incomplete" warnings on an empty SCIENCE slot when the partner
// slot is filled, and "conflict" warnings on both filled slots when the pair
// is not a valid TTU sequence. BUG-10 (label-equality vs sequence-membership)
// regression coverage lives here: BIOL1123 + BIOL2310 share the 'Biology'
// label but are NOT a valid pair, so they must produce a conflict warning.

describe('getScienceWarnings', () => {

  it('returns no warnings when both slots are empty', () => {
    expect(getScienceWarnings({}, SCIENCE_SLOTS)).toEqual({})
  })

  it('returns no warnings when there are fewer than two SCIENCE slots', () => {
    const oneSlot = [{ id: 'sci1', is_pool: true, class_code: 'SCIENCE' }]
    expect(getScienceWarnings({ sci1: 'CHEM1110' }, oneSlot)).toEqual({})
  })

  it('warns incomplete on the empty slot when the other is filled', () => {
    const result = getScienceWarnings({ sci1: 'CHEM1110' }, SCIENCE_SLOTS)
    expect(result).toEqual({
      sci2: { type: 'incomplete', sequenceName: 'Chemistry' },
    })
  })

  it('warns incomplete on sci1 when sci2 is the filled slot', () => {
    const result = getScienceWarnings({ sci2: 'PHYS2110' }, SCIENCE_SLOTS)
    expect(result).toEqual({
      sci1: { type: 'incomplete', sequenceName: 'Physics (Calculus)' },
    })
  })

  it('returns no warnings for a valid Chemistry pair', () => {
    const result = getScienceWarnings(
      { sci1: 'CHEM1110', sci2: 'CHEM1120' },
      SCIENCE_SLOTS,
    )
    expect(result).toEqual({})
  })

  it('returns no warnings for BIOL1113 + BIOL1123 (valid biology pair)', () => {
    const result = getScienceWarnings(
      { sci1: 'BIOL1113', sci2: 'BIOL1123' },
      SCIENCE_SLOTS,
    )
    expect(result).toEqual({})
  })

  it('returns no warnings for BIOL1113 + BIOL2310 (valid biology pair)', () => {
    const result = getScienceWarnings(
      { sci1: 'BIOL1113', sci2: 'BIOL2310' },
      SCIENCE_SLOTS,
    )
    expect(result).toEqual({})
  })

  it('flags conflict for BIOL1123 + BIOL2310 (BUG-10 regression)', () => {
    // Both share the 'Biology' label but neither pair is in SCIENCE_SEQUENCES
    // — both must pair with BIOL1113, not each other.
    const result = getScienceWarnings(
      { sci1: 'BIOL1123', sci2: 'BIOL2310' },
      SCIENCE_SLOTS,
    )
    expect(result).toEqual({
      sci1: { type: 'conflict' },
      sci2: { type: 'conflict' },
    })
  })

  it('flags conflict for codes from different sequences', () => {
    const result = getScienceWarnings(
      { sci1: 'CHEM1110', sci2: 'PHYS2010' },
      SCIENCE_SLOTS,
    )
    expect(result).toEqual({
      sci1: { type: 'conflict' },
      sci2: { type: 'conflict' },
    })
  })

  it('does not flag conflict when an unknown code is involved', () => {
    // FAKE9999 isn't a known science code; we cannot prove it's an invalid
    // pair, so no warning rather than a false positive.
    const result = getScienceWarnings(
      { sci1: 'CHEM1110', sci2: 'FAKE9999' },
      SCIENCE_SLOTS,
    )
    expect(result).toEqual({})
  })

  // ── BUG-18 regression: ≥3 SCIENCE slots ──────────────────────────────────
  // Templates today have exactly two SCIENCE slots. These tests use a synthetic
  // three-slot configuration to confirm the pairwise iteration generalizes
  // correctly past the original `[slotA, slotB]` destructure.

  const THREE_SCIENCE_SLOTS = [
    { id: 'sci1', is_pool: true, class_code: 'SCIENCE' },
    { id: 'sci2', is_pool: true, class_code: 'SCIENCE' },
    { id: 'sci3', is_pool: true, class_code: 'SCIENCE' },
  ]

  it('returns no warnings for three empty SCIENCE slots', () => {
    expect(getScienceWarnings({}, THREE_SCIENCE_SLOTS)).toEqual({})
  })

  it('warns incomplete on every empty slot when one of three is filled', () => {
    const result = getScienceWarnings({ sci1: 'CHEM1110' }, THREE_SCIENCE_SLOTS)
    expect(result).toEqual({
      sci2: { type: 'incomplete', sequenceName: 'Chemistry' },
      sci3: { type: 'incomplete', sequenceName: 'Chemistry' },
    })
  })

  it('flags conflict on filled slots and warns the empty slot when two of three are mismatched', () => {
    // sci1 (CHEM1110) and sci2 (BIOL1123) conflict; sci3 is empty and gets
    // an incomplete warning (first match wins — pair (sci1, sci3)).
    const result = getScienceWarnings(
      { sci1: 'CHEM1110', sci2: 'BIOL1123' },
      THREE_SCIENCE_SLOTS,
    )
    expect(result.sci1).toEqual({ type: 'conflict' })
    expect(result.sci2).toEqual({ type: 'conflict' })
    expect(result.sci3).toEqual({ type: 'incomplete', sequenceName: 'Chemistry' })
  })
})

// ── resolveFreeElective ───────────────────────────────────────────────────────
//
// The function groups all courses in courseMap into two buckets:
//   suggested — subject_code matches a subject already present in the plan
//   other     — subject_code not yet represented in the plan
//
// Subject codes come from two sources:
//   1. Non-pool (required) slots — their course's subject_code is always included
//   2. planSlots (selected pool courses) — subject_code of the selected course

describe('resolveFreeElective', () => {

  it('places courses in suggested when their subject matches a required slot', () => {
    const courseMap = {
      CSC1300:  makeCourse('CSC1300'),   // subject: CSC
      CSC2010:  makeCourse('CSC2010'),   // subject: CSC
      MATH1910: makeCourse('MATH1910'),  // subject: MATH
      HIST2010: makeCourse('HIST2010'),  // subject: HIST
    }
    // One required (non-pool) slot for CSC1300 → CSC becomes a known subject
    const slots = [
      { id: 's1', is_pool: false, class_code: 'CSC1300' },
    ]
    const { suggested, other } = resolveFreeElective(courseMap, slots, {})

    const suggestedCodes = suggested.map(c => c.code)
    const otherCodes     = other.map(c => c.code)

    // CSC courses should be suggested (same subject as the required slot)
    expect(suggestedCodes).toContain('CSC1300')
    expect(suggestedCodes).toContain('CSC2010')
    // Unrelated subjects go to other
    expect(otherCodes).toContain('MATH1910')
    expect(otherCodes).toContain('HIST2010')
  })

  it('also marks courses suggested when their subject matches a selected pool course', () => {
    const courseMap = {
      CSC1300:  makeCourse('CSC1300'),   // subject: CSC
      MATH1910: makeCourse('MATH1910'),  // subject: MATH
      MATH3070: makeCourse('MATH3070'),  // subject: MATH
    }
    // One pool slot with MATH3070 selected → MATH becomes a known subject
    const slots    = [{ id: 's1', is_pool: true, class_code: 'MATH_STATS' }]
    const planSlots = { s1: 'MATH3070' }

    const { suggested, other } = resolveFreeElective(courseMap, slots, planSlots)
    const suggestedCodes = suggested.map(c => c.code)

    expect(suggestedCodes).toContain('MATH1910')
    expect(suggestedCodes).toContain('MATH3070')
    // CSC has no representation in the plan yet
    expect(other.map(c => c.code)).toContain('CSC1300')
  })

  it('returns all courses in other when no slots and no planSlots exist', () => {
    const courseMap = {
      ART1035: makeCourse('ART1035'),
      PSY1030: makeCourse('PSY1030'),
    }
    const { suggested, other } = resolveFreeElective(courseMap, [], {})

    expect(suggested).toHaveLength(0)
    expect(other).toHaveLength(2)
  })

  it('returns all courses in suggested when every course subject is in the plan', () => {
    const courseMap = {
      CSC1300: makeCourse('CSC1300'),
      CSC2010: makeCourse('CSC2010'),
    }
    const slots = [{ id: 's1', is_pool: false, class_code: 'CSC1300' }]
    const { suggested, other } = resolveFreeElective(courseMap, slots, {})

    expect(other).toHaveLength(0)
    expect(suggested).toHaveLength(2)
  })

  it('does not include subjects from pool slots that have nothing selected', () => {
    const courseMap = {
      CSC1300:  makeCourse('CSC1300'),
      MATH1910: makeCourse('MATH1910'),
    }
    // Pool slot exists but nothing is selected → MATH_STATS subject not added
    const slots    = [{ id: 's1', is_pool: true, class_code: 'MATH_STATS' }]
    const planSlots = {}  // nothing selected

    const { suggested, other } = resolveFreeElective(courseMap, slots, planSlots)

    // Neither CSC nor MATH has a presence → everything goes to other
    expect(suggested).toHaveLength(0)
    expect(other).toHaveLength(2)
  })

  it('returns both buckets sorted alphabetically by course code', () => {
    const courseMap = {
      CSC4780: makeCourse('CSC4780'),
      CSC1300: makeCourse('CSC1300'),
      ART2000: makeCourse('ART2000'),
      ART1035: makeCourse('ART1035'),
    }
    const slots = [
      { id: 's1', is_pool: false, class_code: 'CSC1300' },
    ]
    const { suggested, other } = resolveFreeElective(courseMap, slots, {})

    // CSC courses are suggested — should come back sorted
    expect(suggested.map(c => c.code)).toEqual(['CSC1300', 'CSC4780'])
    // ART courses are in other — should come back sorted
    expect(other.map(c => c.code)).toEqual(['ART1035', 'ART2000'])
  })
})

// ── resolveSatisfiesPool (BUG-4) ─────────────────────────────────────────────
//
// Transfer credits must archive a pool slot only when the target pool
// actually exists on the active concentration's plan.  CSC2220 lives in
// both CSC_LOWER_ELECTIVE (Core) and CSC_ELECTIVE (Cybersecurity/DSAI),
// so a concentration-agnostic scan over POOL_COURSES would always pick the
// first match and miss the real slot on other concentrations.

describe('resolveSatisfiesPool', () => {

  // Cybersecurity plans have CSC_ELECTIVE slots but no CSC_LOWER_ELECTIVE.
  const cyberSlots = [
    { id: 1, is_pool: false, class_code: 'CSC1200' },
    { id: 2, is_pool: true,  class_code: 'CSC_ELECTIVE' },
    { id: 3, is_pool: true,  class_code: 'CSC_ELECTIVE' },
    { id: 4, is_pool: true,  class_code: 'GEN_ED' },
  ]

  // Core plans have CSC_LOWER_ELECTIVE + CSC_UPPER_ELECTIVE.
  const coreSlots = [
    { id: 1, is_pool: true, class_code: 'CSC_LOWER_ELECTIVE' },
    { id: 2, is_pool: true, class_code: 'CSC_UPPER_ELECTIVE' },
    { id: 3, is_pool: true, class_code: 'GEN_ED' },
  ]

  it('resolves CSC2220 to CSC_ELECTIVE on a Cybersecurity plan (BUG-4 regression)', () => {
    expect(resolveSatisfiesPool('CSC2220', cyberSlots)).toBe('CSC_ELECTIVE')
  })

  it('resolves CSC2220 to CSC_LOWER_ELECTIVE on a Core plan', () => {
    expect(resolveSatisfiesPool('CSC2220', coreSlots)).toBe('CSC_LOWER_ELECTIVE')
  })

  it('returns null when no pool on the active plan contains the course', () => {
    expect(resolveSatisfiesPool('CSC2220', [
      { id: 1, is_pool: true, class_code: 'GEN_ED' },
    ])).toBeNull()
  })

  it('ignores non-pool slots when scanning', () => {
    const slots = [
      { id: 1, is_pool: false, class_code: 'CSC_ELECTIVE' }, // sentinel — not a pool
    ]
    expect(resolveSatisfiesPool('CSC2220', slots)).toBeNull()
  })

  it('returns null for a null courseCode', () => {
    expect(resolveSatisfiesPool(null, cyberSlots)).toBeNull()
  })
})
