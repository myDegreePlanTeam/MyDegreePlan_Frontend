// planExportModel.test.js
//
// Tests for buildPlanExportModel / buildPlanExportFilename — the pure shaping
// step behind the PDF export. The @react-pdf document renders this model, so
// everything that decides what an advisor reads is asserted here without
// generating a PDF.
//
// The rule these tests protect: the printed page must say the same thing the
// grid says. Per-semester credit arithmetic mirrors Semester.jsx's
// calculateCredits (pool slots fall back to flex_credits, then 3), archived
// slots never arrive because DegreePlan strips them from semesterMap, and
// course order is source order, not re-sorted.

import { describe, it, expect } from 'vitest'
import {
  buildPlanExportModel,
  buildPlanExportFilename,
  formatCourseCode,
  deriveCatalogYear,
} from '../lib/planExportModel'

// ── Shared fixtures ──────────────────────────────────────────────────────────

const COURSES = {
  CSC1300:  { name: 'Introduction to Problem Solving and Programming', credits: 4 },
  MATH1910: { name: 'Calculus I',                                      credits: 4 },
  ENGL1010: { name: 'English Composition I',                           credits: 3 },
  PHIL1030: { name: 'Introduction to Philosophy',                      credits: 3 },
  CHEM1110: { name: 'General Chemistry I',                             credits: 4 },
  MUS1030:  { name: 'Introduction to Music',                           credits: 3 },
}

const SLOT_CSC1300  = { id: 1, class_code: 'CSC1300',  is_pool: false, semester_number: 1 }
const SLOT_MATH1910 = { id: 2, class_code: 'MATH1910', is_pool: false, semester_number: 1 }
const SLOT_GENED    = { id: 3, class_code: 'GEN_ED',   is_pool: true,  semester_number: 1 }
const SLOT_SCIENCE  = { id: 4, class_code: 'SCIENCE',  is_pool: true,  semester_number: 2, flex_credits: 4 }

const PROFILE = {
  start_season: 'Fall',
  start_year:   2026,
  concentrations: { name: 'Data Science & AI', total_hours: 120 },
}

const TERMS = {
  1: { season: 'Fall',   year: 2026 },
  2: { season: 'Spring', year: 2027 },
}

const GENERATED_AT = new Date(2026, 8, 17)   // 17 September 2026

function baseInput(overrides = {}) {
  return {
    semesterNumbers:   [1, 2],
    semesterMap:       { 1: [SLOT_CSC1300, SLOT_MATH1910, SLOT_GENED], 2: [SLOT_SCIENCE] },
    freeAddBySemester: {},
    planSlots:         { 3: 'PHIL1030', 4: 'CHEM1110' },
    courses:           COURSES,
    semesterTerms:     TERMS,
    profile:           PROFILE,
    graduation:        { season: 'Spring', year: 2030 },
    generatedAt:       GENERATED_AT,
    ...overrides,
  }
}

// ── Document header ──────────────────────────────────────────────────────────

describe('buildPlanExportModel — document header', () => {
  it('carries the concentration, start term, graduation and generation date', () => {
    const model = buildPlanExportModel(baseInput())

    expect(model.concentrationName).toBe('Data Science & AI')
    expect(model.totalHours).toBe(120)
    expect(model.startLabel).toBe('Fall 2026')
    expect(model.graduationLabel).toBe('Spring 2030')
    expect(model.generatedOn).toBe('September 17, 2026')
  })

  it('omits a graduation label when no graduation term is resolved', () => {
    const model = buildPlanExportModel(baseInput({ graduation: null }))
    expect(model.graduationLabel).toBeNull()
  })

  it('survives a profile that has not loaded', () => {
    const model = buildPlanExportModel(baseInput({ profile: null }))

    expect(model.concentrationName).toBeNull()
    expect(model.totalHours).toBeNull()
    expect(model.startLabel).toBeNull()
    expect(model.semesters).toHaveLength(2)
  })

  it('returns an empty plan rather than throwing on no input at all', () => {
    const model = buildPlanExportModel()

    expect(model.semesters).toEqual([])
    expect(model.plannedCredits).toBe(0)
  })
})

// ── Semester labelling ───────────────────────────────────────────────────────

describe('buildPlanExportModel — semester labels', () => {
  it('labels each semester with its real term and its ordinal position', () => {
    const model = buildPlanExportModel(baseInput())

    expect(model.semesters[0].termLabel).toBe('Fall 2026')
    expect(model.semesters[0].ordinalLabel).toBe('Semester 1')
    expect(model.semesters[1].termLabel).toBe('Spring 2027')
    expect(model.semesters[1].ordinalLabel).toBe('Semester 2')
  })

  it('numbers ordinals by grid position, not by semester_number', () => {
    // Semesters 3 and 7 are all that is left once prior credit archives the
    // rest — the printed document still reads "Semester 1", "Semester 2".
    const model = buildPlanExportModel(baseInput({
      semesterNumbers: [3, 7],
      semesterMap:     { 3: [SLOT_CSC1300], 7: [SLOT_MATH1910] },
      semesterTerms:   { 3: { season: 'Fall', year: 2027 }, 7: { season: 'Fall', year: 2029 } },
    }))

    expect(model.semesters.map(s => s.ordinalLabel)).toEqual(['Semester 1', 'Semester 2'])
    expect(model.semesters.map(s => s.semesterNumber)).toEqual([3, 7])
  })

  it('leaves termLabel null when no term is known, so the document can fall back', () => {
    const model = buildPlanExportModel(baseInput({ semesterTerms: {} }))

    expect(model.semesters[0].termLabel).toBeNull()
    expect(model.semesters[0].ordinalLabel).toBe('Semester 1')
  })
})

// ── Course rows ──────────────────────────────────────────────────────────────

describe('buildPlanExportModel — course rows', () => {
  it('prints a required course with its catalog title and credits', () => {
    const model = buildPlanExportModel(baseInput())
    const row   = model.semesters[0].courses[0]

    expect(row).toEqual({
      code:        'CSC1300',
      title:       'Introduction to Problem Solving and Programming',
      credits:     4,
      kind:        'required',
      requirement: null,
      footnote:    null,
    })
  })

  it('prints a filled pool slot as the chosen course, tagged with the requirement it satisfies', () => {
    const model = buildPlanExportModel(baseInput())
    const row   = model.semesters[0].courses[2]

    expect(row).toEqual({
      code:        'PHIL1030',
      title:       'Introduction to Philosophy',
      credits:     3,
      kind:        'pool',
      requirement: 'General Education',
      poolCode:    'GEN_ED',
      footnote:    null,
    })
  })

  it('prints an unfilled pool slot as the requirement, never as a course', () => {
    const model = buildPlanExportModel(baseInput({ planSlots: {} }))
    const row   = model.semesters[0].courses[2]

    expect(row.kind).toBe('pool-empty')
    expect(row.code).toBeNull()
    expect(row.title).toBe('General Education')
    expect(row.requirement).toBe('General Education')
  })

  it('uses flex_credits for an unfilled pool slot that declares them', () => {
    const model = buildPlanExportModel(baseInput({ planSlots: {} }))
    expect(model.semesters[1].courses[0].credits).toBe(4)   // SCIENCE, flex_credits: 4
  })

  it('falls back to 3 credits for an unfilled pool slot with no flex_credits', () => {
    const model = buildPlanExportModel(baseInput({ planSlots: {} }))
    expect(model.semesters[0].courses[2].credits).toBe(3)   // GEN_ED, no flex_credits
  })

  it('keeps student-added courses in the same semester, marked as free-add', () => {
    const model = buildPlanExportModel(baseInput({
      freeAddBySemester: { 1: [{ id: 91, course_code: 'MUS1030', semester_number: 1 }] },
    }))
    const rows = model.semesters[0].courses

    expect(rows).toHaveLength(4)
    expect(rows[3]).toEqual({
      code:        'MUS1030',
      title:       'Introduction to Music',
      credits:     3,
      kind:        'free-add',
      requirement: null,
      footnote:    null,
    })
  })

  it('preserves source order — template slots as the grid lists them, additions after', () => {
    const model = buildPlanExportModel(baseInput({
      freeAddBySemester: { 1: [{ id: 91, course_code: 'MUS1030' }] },
    }))

    expect(model.semesters[0].courses.map(c => c.code))
      .toEqual(['CSC1300', 'MATH1910', 'PHIL1030', 'MUS1030'])
  })

  it('renders a course missing from the catalog without inventing a title or credits', () => {
    const model = buildPlanExportModel(baseInput({
      semesterMap: { 1: [{ id: 9, class_code: 'CSC9999', is_pool: false }], 2: [] },
    }))
    const row = model.semesters[0].courses[0]

    expect(row.code).toBe('CSC9999')
    expect(row.title).toBeNull()
    expect(row.credits).toBeNull()
  })

  it('reports an empty semester as empty rather than dropping it', () => {
    const model = buildPlanExportModel(baseInput({
      semesterNumbers: [1, 2, 3],
      semesterMap:     { 1: [SLOT_CSC1300], 2: [SLOT_SCIENCE] },
      semesterTerms:   { ...TERMS, 3: { season: 'Fall', year: 2027 } },
    }))

    expect(model.semesters).toHaveLength(3)
    expect(model.semesters[2].courses).toEqual([])
    expect(model.semesters[2].credits).toBe(0)
  })
})

// ── Credit arithmetic ────────────────────────────────────────────────────────

describe('buildPlanExportModel — credit totals', () => {
  it('totals each semester the way the semester card does', () => {
    const model = buildPlanExportModel(baseInput())

    expect(model.semesters[0].credits).toBe(11)   // 4 + 4 + 3
    expect(model.semesters[1].credits).toBe(4)    // CHEM1110
  })

  it('counts a filled pool slot at the chosen course credits, not the pool estimate', () => {
    // SCIENCE declares flex_credits: 4; CHEM1110 is also 4, so use a 3-credit
    // pick to prove the course wins.
    const model = buildPlanExportModel(baseInput({ planSlots: { 3: 'PHIL1030', 4: 'MUS1030' } }))
    expect(model.semesters[1].credits).toBe(3)
  })

  it('includes student-added courses in the semester total', () => {
    const model = buildPlanExportModel(baseInput({
      freeAddBySemester: { 1: [{ id: 91, course_code: 'MUS1030' }] },
    }))
    expect(model.semesters[0].credits).toBe(14)   // 11 + 3
  })

  it('treats an uncatalogued course as zero credits rather than NaN', () => {
    const model = buildPlanExportModel(baseInput({
      semesterMap: { 1: [SLOT_CSC1300, { id: 9, class_code: 'CSC9999', is_pool: false }], 2: [] },
    }))

    expect(model.semesters[0].credits).toBe(4)
    expect(Number.isNaN(model.semesters[0].credits)).toBe(false)
  })

  it('sums plannedCredits across every semester', () => {
    const model = buildPlanExportModel(baseInput())
    expect(model.plannedCredits).toBe(15)
  })
})

// ── Degree-map layout ────────────────────────────────────────────────────────
//
// The export follows the department's Degree Map: year bands of two
// semesters, legend status per semester, numbered pool footnotes, and the
// header / score boxes an advisor reads first.

describe('buildPlanExportModel — degree map', () => {
  it('pairs semesters into year bands in plan order', () => {
    const model = buildPlanExportModel(baseInput({
      semesterNumbers: [1, 2, 3],
      semesterMap:     { 1: [SLOT_CSC1300], 2: [], 3: [] },
    }))
    expect(model.years.map(y => y.label)).toEqual(['FIRST YEAR', 'SOPHOMORE YEAR'])
    expect(model.years[0].semesters.map(s => s.semesterNumber)).toEqual([1, 2])
    expect(model.years[1].semesters.map(s => s.semesterNumber)).toEqual([3])
  })

  it('keeps labelling years past the fourth instead of dropping semesters', () => {
    const nums = Array.from({ length: 10 }, (_, i) => i + 1)
    const model = buildPlanExportModel(baseInput({ semesterNumbers: nums, semesterMap: {} }))
    expect(model.years).toHaveLength(5)
    expect(model.years[4].label).toBe('FIFTH YEAR')
  })

  it('marks completed semesters and recommends the first incomplete one', () => {
    const model = buildPlanExportModel(baseInput({
      semesterNumbers:   [1, 2, 3],
      semesterMap:       { 1: [], 2: [], 3: [] },
      semesterCompleted: { 1: true },
    }))
    expect(model.semesters.map(s => s.status)).toEqual(['completed', 'recommended', null])
  })

  it('recommends the first semester when nothing is complete', () => {
    const model = buildPlanExportModel(baseInput())
    expect(model.semesters.map(s => s.status)).toEqual(['recommended', null])
  })

  it('numbers pool footnotes in first-appearance order, once per pool', () => {
    const model = buildPlanExportModel(baseInput({
      semesterMap: {
        1: [SLOT_CSC1300, { id: 5, class_code: 'ENG_LIT', is_pool: true }],
        2: [SLOT_SCIENCE, { id: 6, class_code: 'SCIENCE', is_pool: true, flex_credits: 4 }],
      },
      planSlots: {},
    }))
    expect(model.semesters[0].courses[0].footnote).toBeNull()
    expect(model.semesters[0].courses[1].footnote).toBe(1)
    expect(model.semesters[1].courses.map(c => c.footnote)).toEqual([2, 2])
    expect(model.footnotes[0]).toBe('English Literature: ENGL 2130, ENGL 2235, or ENGL 2330.')
    expect(model.footnotes[1]).toContain('GEOL 1040 and GEOL 1045')
  })

  it('gives large pools no footnote', () => {
    const model = buildPlanExportModel(baseInput())   // GEN_ED has 30+ options
    expect(model.semesters[0].courses[2].footnote).toBeNull()
  })

  it('carries header fields and ACT scores from the profile', () => {
    const model = buildPlanExportModel(baseInput({
      profile: { ...PROFILE, act_composite: 33, act_english: 35, act_math: 32, act_reading: 33, act_science: 34 },
    }))
    expect(model.degree).toBe('BS')
    expect(model.major).toBe('Computer Science')
    expect(model.catalogYear).toBe('2026-2027')
    expect(model.actScores).toEqual({ composite: 33, english: 35, math: 32, reading: 33, science: 34 })
  })

  it('leaves ACT scores null when the student never entered them', () => {
    const model = buildPlanExportModel(baseInput())
    expect(model.actScores.english).toBeNull()
    expect(model.actScores.composite).toBeNull()
  })

  it('lists credit-bearing prior credits and skips placement rows', () => {
    const model = buildPlanExportModel(baseInput({
      priorCredits: [
        { id: 'a', credit_type: 'ap_credit',     satisfies_course_code: 'ENGL1010', credits_awarded: 3 },
        { id: 'b', credit_type: 'act_placement', satisfies_course_code: null,       credits_awarded: 0 },
      ],
    }))
    expect(model.priorCredits).toEqual([
      { code: 'ENGL1010', title: 'English Composition I', credits: 3, source: 'AP' },
    ])
  })
})

describe('formatCourseCode / deriveCatalogYear', () => {
  it('spaces subject and number', () => {
    expect(formatCourseCode('CSC1300')).toBe('CSC 1300')
    expect(formatCourseCode('PC2500')).toBe('PC 2500')
    expect(formatCourseCode(null)).toBeNull()
  })

  it('derives the academic year from the start term', () => {
    expect(deriveCatalogYear('Fall', 2026)).toBe('2026-2027')
    expect(deriveCatalogYear('Spring', 2027)).toBe('2026-2027')
    expect(deriveCatalogYear('Summer', 2027)).toBe('2026-2027')
    expect(deriveCatalogYear(null, 2026)).toBeNull()
  })
})

// ── Filename ─────────────────────────────────────────────────────────────────

describe('buildPlanExportFilename', () => {
  it('slugs the concentration and stamps the date', () => {
    const model = buildPlanExportModel(baseInput())
    expect(buildPlanExportFilename(model, GENERATED_AT))
      .toBe('degree-plan-data-science-and-ai-2026-09-17.pdf')
  })

  it('zero-pads single-digit months and days', () => {
    const model = buildPlanExportModel(baseInput())
    expect(buildPlanExportFilename(model, new Date(2027, 0, 5)))
      .toBe('degree-plan-data-science-and-ai-2027-01-05.pdf')
  })

  it('falls back to a bare name when the concentration is unknown', () => {
    const model = buildPlanExportModel(baseInput({ profile: null }))
    expect(buildPlanExportFilename(model, GENERATED_AT))
      .toBe('degree-plan-2026-09-17.pdf')
  })
})
