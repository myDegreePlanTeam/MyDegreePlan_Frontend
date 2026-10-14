// firstPlan.test.js
//
// lib/firstPlan.js builds the plan first run shows on "Your plan is ready" before anything is saved, and the rows that are written when
// the student opens it. Built here from the real catalog, for the sample CSC Cybersecurity student (ACT Math 29, starting Fall 2026).

import { describe, it, expect } from 'vitest'
import { T, freshStudent } from './support/realStudent.js'
import { buildFirstPlan, summarizeFirstPlan } from '../lib/firstPlan.js'
import { planHasMathChain } from '../lib/mathPlacement.js'

const program = T.concentrations.find(p => p.code === 'cybersecurity')
const plan = T.degree_plans.find(d => d.concentration_id === program.id && d.catalog_year === '2026-2027')
const slots = T.requirement_slots.filter(s => s.concentration_id === program.id && s.catalog_year === plan.catalog_year)

const build = (over = {}) => buildFirstPlan({
  profileId: 7, program, plan, slots,
  courses: T.courses, prereqs: T.prerequisite_entries, coreqs: T.corequisite_entries,
  actScores: { math: '29', english: '', science: '', reading: '', composite: '', satMath: '' },
  priorCreditRecords: [], startSeason: 'Fall', startYear: 2026, studentType: 'incoming_freshman',
  ...over,
})
const summarize = (built, over = {}) => summarizeFirstPlan({
  plan, slots, courseMap: built.courseMap, assignments: built.assignments, actFields: built.actFields,
  startSeason: 'Fall', startYear: 2026, today: new Date(2026, 9, 13), hasMathChain: planHasMathChain(slots),
  prereqMap: built.prereqMap, coreqMap: built.coreqMap, records: built.records, ...over,
})

describe('buildFirstPlan', () => {
  const built = build()

  it('places the same plan the degree builder gives a fresh student', () => {
    expect(built.assignments).toEqual(freshStudent('cybersecurity', 29).assignments)
  })

  it('carries the profile columns, with the plan year and gen-ed program apart (an older database lacks them)', () => {
    expect(built.profileFields).toMatchObject({ concentration_id: program.id, start_season: 'Fall', start_year: 2026, student_type: 'incoming_freshman', act_math: 29, sat_math: null })
    expect(built.extraProfileFields).toEqual({ gened_program: plan.gened_program, catalog_year: '2026-2027' })
  })

  it('always records the math placement, and ACT English credit before it when the score earns it', () => {
    expect(built.records).toHaveLength(1)
    expect(built.records[0]).toMatchObject({ credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0 })
    const withEnglish = build({ actScores: { math: '29', english: '30', science: '', reading: '', composite: '', satMath: '' } })
    expect(withEnglish.records.length).toBeGreaterThan(1)
    expect(withEnglish.records[withEnglish.records.length - 1].credit_type).toBe('act_placement')
    expect(withEnglish.records[0].credit_type).toBe('act_credit')
  })

  it('puts the student\'s own credits last, and archives the slot one of them covers', () => {
    const credit = { credit_type: 'ap_credit', satisfies_course_code: 'HIST2010', satisfies_pool: null, note: 'AP US History', credits_awarded: 3 }
    const withCredit = build({ priorCreditRecords: [credit] })
    expect(withCredit.records[withCredit.records.length - 1]).toEqual(credit)
    const hist = slots.find(s => s.class_code === 'HIST2010')
    const row = withCredit.planSlotRows.find(r => r.requirement_slot_id === hist.id)
    expect(row).toMatchObject({ archived: true, archive_reason: 'prior_credit', semester_number: null, position_source: null })
  })

  it('writes one row per placed or archived slot, a pool slot with no course chosen', () => {
    const placed = built.planSlotRows.filter(r => !r.archived)
    expect(placed.every(r => r.student_id === 7 && r.position_source === 'algorithm' && r.semester_number >= 1)).toBe(true)
    expect(new Set(built.planSlotRows.map(r => r.requirement_slot_id)).size).toBe(built.planSlotRows.length)
    const pool = slots.find(s => s.is_pool && built.assignments[s.id] != null)
    expect(built.planSlotRows.find(r => r.requirement_slot_id === pool.id).selected_course_code).toBeNull()
    const fixed = slots.find(s => !s.is_pool && built.assignments[s.id] != null)
    expect(built.planSlotRows.find(r => r.requirement_slot_id === fixed.id).selected_course_code).toBe(fixed.class_code)
  })

  it('writes nothing itself: it has no database', () => {
    expect(Object.keys(built).sort()).toEqual(['actFields', 'archived', 'assignments', 'coreqMap', 'courseMap', 'extraProfileFields', 'planSlotRows', 'prereqMap', 'profileFields', 'records'])
  })
})

describe('summarizeFirstPlan', () => {
  const built = build()
  const s = summarize(built)

  it('says when the student finishes, in how many semesters and hours', () => {
    expect(s).toMatchObject({ finish: 'Spring 2030', semesterCount: 8, totalHours: 120 })
  })

  it('describes the semester under way', () => {
    expect(s.now).toEqual({ label: 'Fall 2026', phase: 'current', hours: 15, courses: 5 })
  })

  it('describes the first semester when the plan has not started', () => {
    expect(summarize(built, { today: new Date(2026, 3, 1) }).now).toMatchObject({ label: 'Fall 2026', phase: 'future', hours: 15 })
  })

  it('opens on the first semester that is not over, and on none when all are', () => {
    expect(summarize(built, { today: new Date(2028, 0, 20) }).now).toMatchObject({ label: 'Spring 2028', phase: 'current' })
    expect(summarize(built, { today: new Date(2040, 0, 1) }).now).toBeNull()
  })

  it('says where math starts and why, with the code written as the catalog does', () => {
    expect(s.math).toEqual({ course: 'MATH1910', name: 'Calculus I', sentence: 'ACT Math 29 places you into MATH 1910.' })
    const sat = build({ actScores: { math: '', english: '', science: '', reading: '', composite: '', satMath: '700' } })
    expect(summarize(sat).math.sentence).toMatch(/^SAT Math 700 places you into MATH [0-9]{4}\.$/)
    const none = build({ actScores: { math: '', english: '', science: '', reading: '', composite: '', satMath: '' } })
    expect(summarize(none).math.sentence).toBe('With no ACT or SAT Math score, math starts in MATH 1000.')
  })

  it('leaves math out for a plan with no math chain', () => {
    expect(summarize(built, { hasMathChain: false }).math).toBeNull()
  })

  it('counts the picks still to make: the 12 of the sample plan', () => {
    expect(s.picks).toBe(12)
  })

  // The same pick the plan's Plan check strip starts with once the plan is open (planCheck.test.js: Communications, which CSC 3040 needs).
  it('names the pick to start with: the earliest one a later course depends on', () => {
    expect(s.firstPick).toEqual({ label: 'Communications', dependents: ['CSC3040'], term: 'Fall 2027' })
  })

  it('names no pick when it is not given the requisites to check', () => {
    expect(summarize(built, { prereqMap: undefined }).firstPick).toBeNull()
  })
})
