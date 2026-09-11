import { describe, it, expect } from 'vitest'
import { creditsBeforeSemester } from '../lib/transferCredits'

// ── Fixture ──────────────────────────────────────────────────────────────────
// Positions live in planSemesterOverrides (flat templates: semester_number is
// NULL on every requirement slot).

const courses = {
  ENGL1010: { credits: 3 },
  MATH1910: { credits: 4 },
  MATH1720: { credits: 3 },
  CSC1300:  { credits: 4 },
  CSC1310:  { credits: 4 },
  HIST2010: { credits: 3 },
  CHEM1110: { credits: 4 },
  PSY2010:  { credits: 3 },
}

const slots = [
  { id: 1, class_code: 'ENGL1010', is_pool: false, semester_number: null },
  { id: 2, class_code: 'MATH1910', is_pool: false, semester_number: null },
  { id: 3, class_code: 'CSC1300',  is_pool: false, semester_number: null },
  { id: 4, class_code: 'CSC1310',  is_pool: false, semester_number: null },
  { id: 5, class_code: 'GEN_ED',   is_pool: true,  semester_number: null },
  { id: 6, class_code: 'SCIENCE',  is_pool: true,  semester_number: null },
  { id: 7, class_code: 'FREE_ELECTIVE', is_pool: true, semester_number: null, flex_credits: 5 },
  { id: 8, class_code: 'MATH1720', is_pool: false, semester_number: null },
]

const base = {
  slots,
  courses,
  planSlots: {},
  planSemesterOverrides: { 1: 1, 2: 1, 3: 1, 4: 2, 5: 1, 6: 2, 7: 2 },
  planArchived: {},
  priorCredits: [],
  freeAddSlots: [],
}

describe('creditsBeforeSemester', () => {
  it('counts only slots in strictly earlier semesters', () => {
    // Semester 1: ENGL1010 3 + MATH1910 4 + CSC1300 4 + GEN_ED (unfilled) 3
    expect(creditsBeforeSemester(2, base)).toBe(14)
    expect(creditsBeforeSemester(1, base)).toBe(0)
  })

  it('counts an unfilled pool slot at its expected hours', () => {
    // Semester 2 adds CSC1310 4 + SCIENCE (unfilled, est. 4) + FREE_ELECTIVE (flex 5)
    expect(creditsBeforeSemester(3, base)).toBe(14 + 4 + 4 + 5)
  })

  it('counts a filled pool slot at the chosen course\'s credits', () => {
    const plan = { ...base, planSlots: { 5: 'HIST2010', 6: 'CHEM1110' } }
    expect(creditsBeforeSemester(3, plan)).toBe(14 + 4 + 4 + 5)
  })

  it('skips archived slots even though their semester is null', () => {
    // MATH1720 (id 8) is a not_applicable math-chain slot with no semester.
    const plan = { ...base, planArchived: { 8: 'not_applicable' } }
    expect(creditsBeforeSemester(2, plan)).toBe(14)
  })

  it('does not treat an unplaced slot as earlier than everything', () => {
    // id 8 is active but has no semester — it must not count.
    expect(creditsBeforeSemester(5, base)).toBe(14 + 4 + 4 + 5)
  })

  it('counts a prior credit once, not again for its archived slot', () => {
    const plan = {
      ...base,
      planArchived: { 1: 'prior_credit' },
      priorCredits: [{ id: 'ap', credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }],
    }
    expect(creditsBeforeSemester(2, plan)).toBe(14)
  })

  it('dedups a course code across prior credits and plan slots', () => {
    const plan = {
      ...base,
      priorCredits: [
        { id: 'ap',  credit_type: 'ap_credit', satisfies_course_code: 'CSC1300', credits_awarded: 4 },
        { id: 'ib',  credit_type: 'ib_credit', satisfies_course_code: 'CSC1300', credits_awarded: 4 },
      ],
    }
    expect(creditsBeforeSemester(2, plan)).toBe(14)
  })

  it('counts prior credits with no course code but skips placement-only rows', () => {
    const plan = {
      ...base,
      priorCredits: [
        { id: 't1',  credit_type: 'transfer_credit', satisfies_course_code: null, credits_awarded: 3 },
        { id: 'act', credit_type: 'act_placement',   satisfies_course_code: 'MATH1910', credits_awarded: 0 },
      ],
    }
    expect(creditsBeforeSemester(1, plan)).toBe(3)
  })

  it('counts free-add courses in earlier semesters only', () => {
    const plan = {
      ...base,
      freeAddSlots: [
        { id: 1, course_code: 'PSY2010', semester_number: 1 },
        { id: 2, course_code: 'HIST2010', semester_number: 2 },
      ],
    }
    expect(creditsBeforeSemester(2, plan)).toBe(14 + 3)
  })

  it('returns only prior credits when the target has no semester', () => {
    const plan = {
      ...base,
      priorCredits: [{ id: 'ap', credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }],
    }
    expect(creditsBeforeSemester(null, plan)).toBe(3)
    expect(creditsBeforeSemester(undefined, plan)).toBe(3)
  })
})
