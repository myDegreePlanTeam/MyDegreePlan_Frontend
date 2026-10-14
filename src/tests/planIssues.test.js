// planIssues.test.js
//
// buildPlanIssues feeds the Issues tab and the "⚠ n" flag on each semester
// card. It is pure, so every warning source can be exercised directly with
// hand-built warning maps — no React, no Supabase.

import { describe, it, expect } from 'vitest'
import { buildPlanIssues, countIssuesBySemester } from '../lib/planIssues'

function sem(semNum, label, items, credits = 15, completed = false) {
  return { semNum, label, credits, completed, items }
}

describe('buildPlanIssues', () => {
  it('returns no issues for a clean plan', () => {
    const issues = buildPlanIssues({
      semesters: [sem(1, 'Fall 2025', [{ key: 1, code: 'CSC1300' }])],
    })
    expect(issues).toEqual([])
  })

  it('reports an unmet prerequisite as a blocker in its term', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(2, 'Spring 2026', [{ key: 7, code: 'CSC2100' }])],
      prereqWarnings: { 7: ['CSC1310'] },
    })
    expect(issue.severity).toBe('blocker')
    expect(issue.title).toBe('CSC 2100 is missing a prerequisite')
    expect(issue.where).toBe('Spring 2026')
    expect(issue.semNum).toBe(2)
    expect(issue.key).toBe(7)
    expect(issue.body).toBe('CSC 2100 needs CSC 1310 in an earlier semester. Move CSC 2100 to a later semester, or take what it needs sooner.')
  })

  it('reports unmet corequisites as blockers', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(1, 'Fall 2025', [{ key: 'fa_3', code: 'PHYS2110' }])],
      coreqWarnings: { fa_3: ['MATH1910'] },
    })
    expect(issue.severity).toBe('blocker')
    expect(issue.title).toBe('PHYS 2110 is missing a corequisite')
    expect(issue.body).toBe('PHYS 2110 needs MATH 1910 in the same semester or an earlier one. Move one of them so they line up.')
  })

  it('reports standing as info and names the course in `where`', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(3, 'Fall 2026', [{ key: 9, code: 'CSC3040' }])],
      standingWarnings: { 9: 'junior' },
    })
    expect(issue.severity).toBe('info')
    expect(issue.title).toBe('CSC 3040 needs junior standing')
    expect(issue.where).toBe('CSC 3040 · Fall 2026')
    expect(issue.body).toContain('needs 60 hours earned before the semester starts')
  })

  it('reports both science warning types', () => {
    const issues = buildPlanIssues({
      semesters: [sem(1, 'Fall 2025', [
        { key: 1, code: 'BIOL1010' },
        { key: 2, code: 'CHEM1110' },
      ])],
      scienceWarnings: {
        1: { type: 'incomplete', sequenceName: 'Biology' },
        2: { type: 'conflict' },
      },
    })
    expect(issues.map(i => i.title)).toEqual([
      'Complete your Biology sequence',
      'Science sequence conflict',
    ])
    expect(issues.every(i => i.severity === 'warning')).toBe(true)
  })

  it('flags under- and over-loaded terms, but not empty or completed ones', () => {
    const issues = buildPlanIssues({
      semesters: [
        sem(1, 'Fall 2025',   [{ key: 1, code: 'A' }], 10),
        sem(2, 'Spring 2026', [{ key: 2, code: 'B' }], 21),
        sem(3, 'Fall 2026',   [], 0),
        sem(4, 'Spring 2027', [{ key: 4, code: 'D' }], 9, true),
        sem(5, 'Fall 2027',   [{ key: 5, code: 'E' }], 12),
        sem(6, 'Spring 2028', [{ key: 6, code: 'F' }], 20),
        sem(7, 'Fall 2028',   [{ key: 7, code: 'G' }], 19),
      ],
    })
    expect(issues.map(i => [i.semNum, i.title])).toEqual([
      [1, 'Below full-time enrollment'],
      [2, 'Heavy course load'],
    ])
  })

  it('orders blockers before warnings before info, then by term', () => {
    const issues = buildPlanIssues({
      semesters: [
        sem(1, 'Fall 2025',   [{ key: 1, code: 'A' }], 9),
        sem(2, 'Spring 2026', [{ key: 2, code: 'B' }, { key: 3, code: 'C' }]),
      ],
      prereqWarnings:   { 2: ['X'] },
      standingWarnings: { 3: 'senior' },
    })
    expect(issues.map(i => i.severity)).toEqual(['blocker', 'warning', 'info'])
    expect(issues[0].semNum).toBe(2)
    expect(issues[1].semNum).toBe(1)
  })
})

describe('countIssuesBySemester', () => {
  it('counts issues per semester number', () => {
    expect(countIssuesBySemester([
      { semNum: 1 }, { semNum: 1 }, { semNum: 4 },
    ])).toEqual({ 1: 2, 4: 1 })
  })
})

describe('buildPlanIssues - an unchosen pool course in a past semester', () => {
  const incompleteSlots = { 7: { label: 'Humanities', dependents: [] } }
  const pastSem = (completed) => ({ semNum: 1, label: 'Fall 2024', credits: 15, completed, items: [{ key: 7, code: 'Humanities' }] })
  it('asks for the course the student took, once the semester is over', () => {
    const [issue] = buildPlanIssues({ semesters: [pastSem(true)], incompleteSlots })
    expect(issue.title).toBe('Pick a course for Humanities')
    expect(issue.body).toBe('This semester is over, so pick the course you took.')
  })
  it('keeps the plain wording for a semester that is not over', () => {
    const [issue] = buildPlanIssues({ semesters: [pastSem(false)], incompleteSlots })
    expect(issue.body).toBe('Nothing else in your plan depends on this pick.')
  })
})

// The redesign's vocabulary (plans/PLAN_redesign.md, "Wording"): every message the Plan check list can show, built once here.
describe('buildPlanIssues - the words a student reads', () => {
  const issues = buildPlanIssues({
    semesters: [
      sem(1, 'Fall 2026', [{ key: 1, code: 'CSC2100' }, { key: 2, code: 'PHYS2110' }, { key: 3, code: 'Communications' }, { key: 4, code: 'Humanities' }], 1),
      sem(2, 'Spring 2027', [{ key: 5, code: 'BIOL1010' }, { key: 6, code: 'CHEM1110' }, { key: 7, code: 'CSC3040' }, { key: 8, code: 'ME4020' }], 21),
      sem(3, 'Fall 2025', [{ key: 9, code: 'Free Elective' }], 15, true),
    ],
    prereqWarnings: { 1: ['CSC1310', '(COMM2025 or PC2500)'] },
    coreqWarnings: { 2: ['MATH1910'] },
    incompleteSlots: {
      3: { label: 'Communications', dependents: ['CSC3040', 'CSC4100', 'CSC4200'] },
      4: { label: 'Humanities', dependents: [] },
      9: { label: 'Free Elective', dependents: ['CSC3040'] },
    },
    scienceWarnings: { 5: { type: 'incomplete', sequenceName: 'Biology' }, 6: { type: 'conflict' } },
    standingWarnings: { 7: 'senior' },
    poolLimitWarnings: { 8: [{ label: 'Area of Emphasis', why: 'Only 6 hours may come from one list.', hours: 9, maxHours: 6 }] },
  })
  const texts = issues.flatMap(i => [i.title, i.body, i.where])

  it('covers every kind of message', () => {
    expect(new Set(issues.map(i => i.id.split(':')[0]))).toEqual(
      new Set(['prereq', 'coreq', 'incomplete', 'science', 'pool-limit', 'standing', 'load-low', 'load-high']))
  })

  it('never says slot, credits, term or selection', () => {
    for (const t of texts) expect(t).not.toMatch(/slot|credit|term|selection|unmet/i)
  })

  it('writes every course code with a space', () => {
    for (const t of texts) expect(t).not.toMatch(/[A-Z]{2,5}[0-9]{4}/)
  })

  it('says one hour, not one hours, and lists three codes with commas and an and', () => {
    expect(issues.find(i => i.id === 'load-low:1').body).toContain('This semester has 1 hour.')
    expect(issues.find(i => i.id === 'incomplete:3').body).toContain('CSC 3040, CSC 4100 and CSC 4200 depend on this pick')
    expect(issues.find(i => i.id === 'incomplete:9').body).toBe('This semester is over, so pick the course you took. CSC 3040 depends on this pick to meet its prerequisite, so make it first.')
  })
})
