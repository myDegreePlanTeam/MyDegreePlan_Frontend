import { describe, it, expect } from 'vitest'
import { balancePlan } from '../lib/planBalancer.js'

// ── Fixture helpers ──────────────────────────────────────────────────────────

function makeSlot(id, semNum, classCode, { isPool = false } = {}) {
  return { id, semester_number: semNum, class_code: classCode, is_pool: isPool, flex_credits: 0 }
}

function makeCourse(code, credits = 3) {
  return { code, credits, description: '', name: code }
}

// Builds the courses map for a list of course codes (all 3 credits unless overridden).
function makeCourses(...codesOrPairs) {
  const map = {}
  for (const entry of codesOrPairs) {
    if (typeof entry === 'string') {
      map[entry] = makeCourse(entry, 3)
    } else {
      map[entry.code] = makeCourse(entry.code, entry.credits)
    }
  }
  return map
}

// ── Default empty params ──────────────────────────────────────────────────────
const EMPTY = {
  planSlots: {},
  planSemesterOverrides: {},
  planArchived: {},
  priorCredits: [],
  prereqMap: {},
  coreqMap: {},
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('balancePlan', () => {

  // 1. No moves when every semester is already at or above 15 credits.
  it('returns empty object when all semesters are ≥ 15 credits', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),
      makeSlot(4, 1, 'CSC1330'),
      makeSlot(5, 1, 'CSC1340'),   // sem1 = 5 × 3 = 15
      makeSlot(6, 2, 'CSC2010'),
      makeSlot(7, 2, 'CSC2020'),
      makeSlot(8, 2, 'CSC2030'),
      makeSlot(9, 2, 'CSC2040'),
      makeSlot(10, 2, 'CSC2050'),  // sem2 = 5 × 3 = 15
    ]
    const courses = makeCourses(
      'CSC1300','CSC1310','CSC1320','CSC1330','CSC1340',
      'CSC2010','CSC2020','CSC2030','CSC2040','CSC2050',
    )
    const result = balancePlan({ ...EMPTY, slots, courses })
    expect(result).toEqual({})
  })

  // 2. Moves one slot from semester 2 to semester 1 when sem1 is under 12 credits
  //    and the slot has no prereqs.
  it('moves one slot from sem2 to sem1 when sem1 is under 12 credits and slot has no prereqs', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),  // sem1 = 9 credits (under 12)
      makeSlot(4, 2, 'CSC2010'),
      makeSlot(5, 2, 'CSC2020'),
      makeSlot(6, 2, 'CSC2030'),  // sem2 = 9 credits
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','CSC2010','CSC2020','CSC2030')
    const result = balancePlan({ ...EMPTY, slots, courses })
    // At least one slot should move from sem2 (id 4,5,6) to sem1.
    // Both passes can fire (pass 1 fills to 12, pass 2 fills to 15),
    // so up to 2 slots may move — all must target sem1.
    expect(Object.keys(result).length).toBeGreaterThanOrEqual(1)
    expect(Object.values(result).every(v => v === 1)).toBe(true)
    expect(Object.keys(result).map(Number).every(id => [4, 5, 6].includes(id))).toBe(true)
  })

  // 3. Does not move a slot when its prereq is only satisfied in its current semester.
  //    Slot B (prereq: CSC1300 which is in sem1) cannot move to sem1
  //    because sem1's content would not be "strictly prior" to itself.
  it('does not move a slot when its prereq is not satisfied before the target semester', () => {
    // sem1: CSC1300 (9 credits total) — under 12
    // sem2: CSC2010 (needs CSC1300), CSC2020 (no prereqs)
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),  // sem1 = 9
      makeSlot(4, 2, 'CSC2010'),  // prereq: CSC1300 (only in sem1, not before sem1)
      makeSlot(5, 2, 'CSC2020'),  // no prereq — eligible
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','CSC2010','CSC2020')
    const prereqMap = {
      CSC2010: { 0: { logic: 'AND', codes: ['CSC1300'] } },
    }
    const result = balancePlan({ ...EMPTY, slots, courses, prereqMap })
    // CSC2020 (slot 5) should move; CSC2010 (slot 4) should not.
    expect(result[5]).toBe(1)
    expect(result[4]).toBeUndefined()
  })

  // 4a. Moves a science pair together when both are eligible.
  it('moves a science pair together when both members are eligible', () => {
    // sem1: 1 slot (3 credits, under 12)
    // sem2: CHEM1110 + CHEM1120 pool slots (form a SCIENCE_SEQUENCES pair), no prereqs
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),  // sem1 = 9 credits
      makeSlot(4, 2, 'SCIENCE', { isPool: true }),   // CHEM1110
      makeSlot(5, 2, 'SCIENCE', { isPool: true }),   // CHEM1120
    ]
    const planSlots = { 4: 'CHEM1110', 5: 'CHEM1120' }
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','CHEM1110','CHEM1120')
    const result = balancePlan({ ...EMPTY, slots, planSlots, courses })
    // Both pair members should move to sem1.
    expect(result[4]).toBe(1)
    expect(result[5]).toBe(1)
  })

  // 4b. Does not move just one member of a science pair — neither moves if only
  //     one is eligible.
  it('does not move either science pair member when one cannot move', () => {
    // sem1: 3 slots (9 credits, under 12)
    // sem2: CHEM1110 + CHEM1120 pool slots
    //   CHEM1120 has prereq CHEM1110 — not satisfied before sem1 (empty prior set)
    //   CHEM1110 is individually eligible but blocked by pair rule.
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),  // sem1 = 9 credits
      makeSlot(4, 2, 'SCIENCE', { isPool: true }),  // CHEM1110
      makeSlot(5, 2, 'SCIENCE', { isPool: true }),  // CHEM1120 — prereq blocks it
    ]
    const planSlots = { 4: 'CHEM1110', 5: 'CHEM1120' }
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','CHEM1110','CHEM1120')
    const prereqMap = {
      CHEM1120: { 0: { logic: 'AND', codes: ['CHEM1110'] } },
    }
    const result = balancePlan({ ...EMPTY, slots, planSlots, courses, prereqMap })
    // Neither member should move (CHEM1120's prereq is not satisfied before sem1).
    expect(result[4]).toBeUndefined()
    expect(result[5]).toBeUndefined()
  })

  // 5. Pass 2 moves a slot when the semester is between 12 and 15 credits.
  //    (Pass 1 target = 12, Pass 2 target = 15)
  it('pass 2 fills a semester that is between 12 and 15 credits', () => {
    // sem1: exactly 12 credits (4 × 3) — skipped by pass 1, targeted by pass 2
    // sem2: one slot (3 credits) that has no prereqs
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),
      makeSlot(4, 1, 'CSC1330'),  // sem1 = 12 credits exactly
      makeSlot(5, 2, 'CSC2010'),  // should move in pass 2
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','CSC1330','CSC2010')
    const result = balancePlan({ ...EMPTY, slots, courses })
    expect(result[5]).toBe(1)
  })

  // 6. Idempotency — running balancePlan twice on the result of the first run
  //    produces no further moves.
  it('is idempotent — a second run on the balanced plan makes no further moves', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),  // sem1 = 6 credits
      makeSlot(3, 2, 'CSC2010'),
      makeSlot(4, 2, 'CSC2020'),
      makeSlot(5, 2, 'CSC2030'),  // sem2 = 9 credits
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC2010','CSC2020','CSC2030')

    // First run
    const first = balancePlan({ ...EMPTY, slots, courses })
    expect(Object.keys(first).length).toBeGreaterThan(0)

    // Apply the moves as overrides for the second run
    const updatedOverrides = { ...first }
    const second = balancePlan({
      ...EMPTY,
      slots,
      courses,
      planSemesterOverrides: updatedOverrides,
    })
    expect(second).toEqual({})
  })

  // 7. Skips unfilled pool slots.
  it('skips pool slots that have no selected course code', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),  // sem1 = 6 credits
      makeSlot(3, 2, 'GEN_ED', { isPool: true }),   // unfilled pool — no planSlots entry
      makeSlot(4, 2, 'CSC2010'),                    // non-pool — eligible
    ]
    const planSlots = {}  // pool slot 3 has no selection
    const courses = makeCourses('CSC1300','CSC1310','CSC2010')
    const result = balancePlan({ ...EMPTY, slots, planSlots, courses })
    // Slot 4 (CSC2010) should move; slot 3 (unfilled pool) should not appear.
    expect(result[4]).toBe(1)
    expect(result[3]).toBeUndefined()
  })

  // 8. Math placement — cleared: student has act_placement for MATH1910;
  //    MATH1910 in sem2 is moved to sem1 when sem1 is under 12 credits.
  it('moves MATH1910 to sem1 when student is cleared for MATH1910 (mathLevel ≥ 5)', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),  // sem1 = 9 credits
      makeSlot(4, 2, 'MATH1910'),
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','MATH1910')
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0 },
    ]
    const result = balancePlan({ ...EMPTY, slots, courses, priorCredits })
    expect(result[4]).toBe(1)
  })

  // 9. Math placement — not cleared: student placed into MATH1730 (index 3);
  //    MATH1910 (index 5) must not move even when sem1 is under 12 credits.
  it('does not move MATH1910 when student is only placed into MATH1730', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),  // sem1 = 9 credits
      makeSlot(4, 2, 'MATH1910'),
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','MATH1910')
    const priorCredits = [
      { credit_type: 'act_placement', satisfies_course_code: 'MATH1730', credits_awarded: 0 },
    ]
    const result = balancePlan({ ...EMPTY, slots, courses, priorCredits })
    expect(result[4]).toBeUndefined()
  })

  // 10. Math placement — missing: no act_placement entries at all;
  //     no MATH_SEQUENCE course is moved regardless of credit gaps.
  it('does not move any MATH_SEQUENCE course when there are no act_placement records', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),
      makeSlot(3, 1, 'CSC1320'),  // sem1 = 9 credits
      makeSlot(4, 2, 'MATH1910'),
      makeSlot(5, 2, 'MATH1000'),
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC1320','MATH1910','MATH1000')
    // priorCredits is empty — no placement records
    const result = balancePlan({ ...EMPTY, slots, courses, priorCredits: [] })
    expect(result[4]).toBeUndefined()
    expect(result[5]).toBeUndefined()
  })

  // 11. Archived slots are excluded from balancing entirely.
  it('does not move or consider archived slots', () => {
    const slots = [
      makeSlot(1, 1, 'CSC1300'),
      makeSlot(2, 1, 'CSC1310'),  // sem1 = 6 credits
      makeSlot(3, 2, 'CSC2010'),  // archived — must be ignored
      makeSlot(4, 2, 'CSC2020'),  // active — eligible to move
    ]
    const courses = makeCourses('CSC1300','CSC1310','CSC2010','CSC2020')
    const planArchived = { 3: true }
    const result = balancePlan({ ...EMPTY, slots, courses, planArchived })
    expect(result[3]).toBeUndefined()
    expect(result[4]).toBe(1)
  })

})
