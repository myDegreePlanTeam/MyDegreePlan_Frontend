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
    expect(issue.title).toBe('CSC2100 prerequisite unmet')
    expect(issue.where).toBe('Spring 2026')
    expect(issue.semNum).toBe(2)
    expect(issue.key).toBe(7)
    expect(issue.body).toContain('CSC1310')
  })

  it('reports unmet corequisites as blockers', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(1, 'Fall 2025', [{ key: 'fa_3', code: 'PHYS2110' }])],
      coreqWarnings: { fa_3: ['MATH1910'] },
    })
    expect(issue.severity).toBe('blocker')
    expect(issue.title).toBe('PHYS2110 corequisite unmet')
  })

  it('reports standing as info and names the course in `where`', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(3, 'Fall 2026', [{ key: 9, code: 'CSC3040' }])],
      standingWarnings: { 9: 'junior' },
    })
    expect(issue.severity).toBe('info')
    expect(issue.title).toBe('Junior standing required')
    expect(issue.where).toBe('CSC3040 · Fall 2026')
    expect(issue.body).toContain('60+')
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
        sem(2, 'Spring 2026', [{ key: 2, code: 'B' }], 19),
        sem(3, 'Fall 2026',   [], 0),
        sem(4, 'Spring 2027', [{ key: 4, code: 'D' }], 9, true),
        sem(5, 'Fall 2027',   [{ key: 5, code: 'E' }], 12),
        sem(6, 'Spring 2028', [{ key: 6, code: 'F' }], 18),
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
