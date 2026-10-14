// planCheck.test.js
//
// lib/planCheck.js groups the plan's issues into the course picks still to make and the real problems, and words them for the Plan check
// strip. The fixture is the shape of the sample CSC Cybersecurity plan the owner looked at: 12 issues, every one an unfinished pick,
// 11 of them `info` and 1 a `warning` because CSC 3040 leans on the empty Communications slot.

import { describe, it, expect } from 'vitest'
import { buildPlanIssues } from '../lib/planIssues'
import { summarizePlanCheck, picksText, problemLines } from '../lib/planCheck'
import { creditsInPhase, semesterPhases } from '../lib/termPhase'

// [semNum, label, [pick label, ...]] — the open picks per semester of the sample plan
const SAMPLE = [
  [1, 'Fall 2026', []],
  [2, 'Spring 2027', ['Humanities & Cultural Expression']],
  [3, 'Fall 2027', ['Communications']],
  [4, 'Spring 2028', ['CSC Elective', 'Natural Science']],
  [5, 'Fall 2028', ['CSC Elective', 'Social & Behavioral Sciences']],
  [6, 'Spring 2029', ['Free Elective', 'Humanities & Cultural Expression']],
  [7, 'Fall 2029', ['Social & Behavioral Sciences', 'Statistics']],
  [8, 'Spring 2030', ['CSC Elective', 'Natural Science']],
]

function sampleIssues(extra = {}) {
  const incompleteSlots = {}
  const semesters = SAMPLE.map(([semNum, label, picks]) => {
    const items = picks.map((pick, i) => {
      const key = `s${semNum}p${i}`
      incompleteSlots[key] = { label: pick, dependents: pick === 'Communications' ? ['CSC3040'] : [] }
      return { key, code: pick }
    })
    return { semNum, label, credits: 15, completed: false, items: [...items, ...(extra.items?.[semNum] ?? [])] }
  })
  return buildPlanIssues({ semesters, incompleteSlots, ...extra.warnings })
}

describe('summarizePlanCheck on the sample plan', () => {
  const issues = sampleIssues()
  const summary = summarizePlanCheck(issues)

  it('has 12 issues, all of them picks: 11 information and 1 warning', () => {
    expect(issues).toHaveLength(12)
    expect(issues.filter(i => i.severity === 'info')).toHaveLength(11)
    expect(issues.filter(i => i.severity === 'warning')).toHaveLength(1)
    expect(summary.pickCount).toBe(12)
    expect(summary.total).toBe(12)
  })

  it('has no real problems', () => {
    expect(summary.blockers).toEqual([])
    expect(summary.advice).toEqual([])
    expect(problemLines(summary)).toEqual([])
  })

  it('names the pick a later course depends on, and starts there', () => {
    expect(summary.dependentPick).toMatchObject({ label: 'Communications', dependents: ['CSC3040'], where: 'Fall 2027' })
    expect(summary.firstPick).toBe(summary.dependentPick)
  })

  it('says how many picks are left and where to start', () => {
    expect(picksText(summary)).toEqual({
      headline: '12 course picks still to make',
      detail: 'Start with Communications: CSC 3040 depends on it.',
    })
  })
})

describe('a plan where nothing depends on the open picks', () => {
  const issues = buildPlanIssues({
    semesters: [
      { semNum: 1, label: 'Fall 2026', credits: 15, completed: false, items: [{ key: 'a', code: 'Natural Science' }] },
      { semNum: 2, label: 'Spring 2027', credits: 15, completed: false, items: [{ key: 'b', code: 'CSC Elective' }, { key: 'c', code: 'Free Elective' }] },
    ],
    incompleteSlots: { a: { label: 'Natural Science', dependents: [] }, b: { label: 'CSC Elective', dependents: [] }, c: { label: 'Free Elective', dependents: [] } },
  })
  const summary = summarizePlanCheck(issues)

  it('starts at the earliest pick and says nothing waits on them', () => {
    expect(summary.dependentPick).toBeNull()
    expect(summary.firstPick.label).toBe('Natural Science')
    expect(picksText(summary).detail).toBe('Nothing in your plan depends on them.')
  })

  it('uses the singular for one pick', () => {
    const one = summarizePlanCheck(issues.slice(0, 1))
    expect(picksText(one)).toEqual({ headline: '1 course pick still to make', detail: 'Nothing in your plan depends on it.' })
  })
})

describe('real problems are kept apart from the picks', () => {
  const issues = sampleIssues({
    items: { 3: [{ key: 'x', code: 'CSC2310' }] },
    warnings: {
      prereqWarnings: { x: [{ code: 'CSC1300' }] },
      scienceWarnings: { s4p1: { type: 'conflict', sequenceName: 'Biology' } },
    },
  })
  const summary = summarizePlanCheck(issues)

  it('finds the blocker and the advice, and still counts every pick', () => {
    expect(summary.pickCount).toBe(12)
    expect(summary.blockers.map(i => i.id)).toEqual(['prereq:x'])
    expect(summary.advice.map(i => i.id)).toEqual(['science:s4p1'])
  })

  it('words one line per group, blockers first, naming the first and counting the rest', () => {
    const lines = problemLines(summary)
    expect(lines.map(l => l.tone)).toEqual(['blocker', 'advice'])
    expect(lines[0].text).toBe('1 needs fixing: CSC2310 prerequisite unmet')
    expect(lines[1].text).toBe('1 to look at: Science sequence conflict')
    expect(lines[0].issue.id).toBe('prereq:x')
  })

  it('says "and N more" for a longer group', () => {
    const two = summarizePlanCheck([
      { id: 'a', kind: undefined, severity: 'blocker', title: 'A', order: 0 },
      { id: 'b', kind: undefined, severity: 'blocker', title: 'B', order: 1 },
      { id: 'c', kind: undefined, severity: 'blocker', title: 'C', order: 2 },
    ])
    expect(problemLines(two)[0].text).toBe('3 need fixing: A and 2 more')
  })
})

describe('a plan with nothing to review', () => {
  it('has no text and no lines', () => {
    const summary = summarizePlanCheck([])
    expect(summary.total).toBe(0)
    expect(picksText(summary)).toBeNull()
    expect(problemLines(summary)).toEqual([])
    expect(summary.firstPick).toBeNull()
  })

  it('lists two dependents with "and", three with commas', () => {
    const mk = dependents => summarizePlanCheck([{ id: 'p', kind: 'pick', label: 'Oral Communication', dependents, severity: 'warning', order: 0 }])
    expect(picksText(mk(['CSC3040', 'CSC4100'])).detail).toBe('Start with Oral Communication: CSC 3040 and CSC 4100 depend on it.')
    expect(picksText(mk(['CSC3040', 'CSC4100', 'MATH2010'])).detail).toBe('Start with Oral Communication: CSC 3040, CSC 4100 and MATH 2010 depend on it.')
  })
})

describe('creditsInPhase', () => {
  const phases = semesterPhases({ 1: { season: 'Fall', year: 2026 }, 2: { season: 'Spring', year: 2027 } }, new Date(2026, 9, 13))
  const breakdown = [
    { source: 'slot', slotId: 'a', credits: 4 },
    { source: 'slot', slotId: 'b', credits: 3 },
    { source: 'free_add', freeAddId: 7, credits: 2 },
    { source: 'transfer', credits: 6 },
  ]
  const semesterOf = item => (item.slotId === 'a' ? 1 : item.slotId === 'b' ? 2 : item.freeAddId === 7 ? 1 : null)

  it('counts the hours under way this semester, and leaves out prior credit', () => {
    expect(creditsInPhase(breakdown, semesterOf, phases, 'current')).toBe(6)
    expect(creditsInPhase(breakdown, semesterOf, phases, 'future')).toBe(3)
    expect(creditsInPhase(breakdown, semesterOf, phases, 'past')).toBe(0)
  })

  it('treats an item with no semester as ahead, never as passed', () => {
    expect(creditsInPhase([{ source: 'slot', slotId: 'z', credits: 5 }], () => null, phases, 'future')).toBe(5)
  })
})
