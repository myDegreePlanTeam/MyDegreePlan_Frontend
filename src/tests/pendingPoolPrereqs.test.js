// pendingPoolPrereqs.test.js
//
// A required course whose prerequisite can only come from a requirement pool
// (CSC3040 → COMM2025 or PC2500, offered by the Communications slot) must read
// an unfilled pool slot in an earlier term as provisionally meeting it, and
// the Issues tab reports the empty slot as an "incomplete selection".

import { describe, it, expect } from 'vitest'
import { checkPrereqs } from '../lib/prereqChecker'
import { buildPlanIssues } from '../lib/planIssues'
import { POOL_COURSES, REQUIREMENT_POOLS } from '../lib/poolResolver'

// CSC3040: (COMM2025 or PC2500) AND CSC1310
const PREREQ_MAP = {
  CSC3040: {
    0: { logic: 'OR',  codes: ['COMM2025', 'PC2500'] },
    1: { logic: 'AND', codes: ['CSC1310'] },
  },
  // Two requirements, both only a science slot can meet
  CHEM1120: {
    0: { logic: 'AND', codes: ['CHEM1110'] },
    1: { logic: 'OR',  codes: ['PHYS2010', 'BIOL1123'] },
  },
}

const commSlot    = (key = 'comm') => ({ key, codes: POOL_COURSES.COMM_REQ })
const scienceSlot = key => ({ key, codes: POOL_COURSES.SCIENCE })

describe('checkPrereqs — unfilled pool slots', () => {
  it('still reports the prereq when no pending slot is supplied', () => {
    const result = checkPrereqs('CSC3040', PREREQ_MAP, new Set(['CSC1310']))
    expect(result).toEqual({ satisfied: false, missing: ['(COMM2025 or PC2500)'] })
  })

  it('treats an earlier unfilled Communications slot as meeting the OR group', () => {
    const result = checkPrereqs(
      'CSC3040', PREREQ_MAP, new Set(['CSC1310']), [], {}, {}, [commSlot()]
    )
    expect(result).toEqual({ satisfied: true, relyingOn: ['comm'] })
  })

  it('does not accept a pending slot whose pool cannot supply the course', () => {
    const result = checkPrereqs(
      'CSC3040', PREREQ_MAP, new Set(['CSC1310']), [], {}, {}, [{ key: 'stats', codes: POOL_COURSES.MATH_STATS }]
    )
    expect(result.satisfied).toBe(false)
    expect(result.missing).toEqual(['(COMM2025 or PC2500)'])
  })

  it('does not paper over a different unmet prerequisite', () => {
    const result = checkPrereqs('CSC3040', PREREQ_MAP, new Set(), [], {}, {}, [commSlot()])
    expect(result).toEqual({ satisfied: false, missing: ['CSC1310'] })
  })

  it('does not claim a slot when a chosen course already meets the group', () => {
    const result = checkPrereqs(
      'CSC3040', PREREQ_MAP, new Set(['CSC1310', 'PC2500']), [], {}, {}, [commSlot()]
    )
    expect(result).toEqual({ satisfied: true })
  })

  it('lets one slot cover only one requirement', () => {
    // Both groups need a science course; a single science slot can't serve both.
    const one = checkPrereqs('CHEM1120', PREREQ_MAP, new Set(), [], {}, {}, [scienceSlot('s1')])
    expect(one.satisfied).toBe(false)

    const two = checkPrereqs('CHEM1120', PREREQ_MAP, new Set(), [], {}, {}, [scienceSlot('s1'), scienceSlot('s2')])
    expect(two.satisfied).toBe(true)
    expect([...two.relyingOn].sort()).toEqual(['s1', 's2'])
  })

  it('keeps the default of no pending slots for existing six-argument callers', () => {
    expect(checkPrereqs('CSC3040', PREREQ_MAP, new Set(['CSC1310']), [], {}, {}))
      .toEqual({ satisfied: false, missing: ['(COMM2025 or PC2500)'] })
  })
})

describe('REQUIREMENT_POOLS', () => {
  it('includes Communications and leaves out elective pools', () => {
    expect(REQUIREMENT_POOLS.has('COMM_REQ')).toBe(true)
    expect(REQUIREMENT_POOLS.has('CSC_ELECTIVE')).toBe(false)
    expect(REQUIREMENT_POOLS.has('FREE_ELECTIVE')).toBe(false)
  })
})

// ── Issues tab ────────────────────────────────────────────────────────────────

function sem(semNum, label, items) {
  return { semNum, label, credits: 15, completed: false, items }
}

describe('buildPlanIssues — incomplete selection', () => {
  it('flags an empty pool slot a course depends on as a warning naming the dependent', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(2, 'Spring 2026', [{ key: 5, code: 'Communications' }])],
      incompleteSlots: { 5: { label: 'Communications', dependents: ['CSC3040'] } },
    })
    expect(issue.severity).toBe('warning')
    expect(issue.title).toBe('Incomplete selection: Communications')
    expect(issue.key).toBe(5)
    expect(issue.semNum).toBe(2)
    expect(issue.body).toContain('CSC3040 depends on it')
  })

  it('flags other empty pool slots as info', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(1, 'Fall 2025', [{ key: 3, code: 'General Education' }])],
      incompleteSlots: { 3: { label: 'General Education', dependents: [] } },
    })
    expect(issue.severity).toBe('info')
    expect(issue.body).not.toContain('depend')
  })

  it('pluralises several dependents', () => {
    const [issue] = buildPlanIssues({
      semesters: [sem(1, 'Fall 2025', [{ key: 3, code: 'Natural Science' }])],
      incompleteSlots: { 3: { label: 'Natural Science', dependents: ['CHEM1120', 'PHYS2020'] } },
    })
    expect(issue.body).toContain('CHEM1120, PHYS2020 depend on it to meet their prerequisite')
  })

  it('reports nothing when every slot is filled', () => {
    expect(buildPlanIssues({
      semesters: [sem(1, 'Fall 2025', [{ key: 3, code: 'COMM2025' }])],
    })).toEqual([])
  })
})
