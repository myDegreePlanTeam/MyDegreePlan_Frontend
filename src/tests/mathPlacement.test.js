import { describe, it, expect } from 'vitest'
import {
  MATH_PLACEMENT, tierForAct, tierForSat, resolveMathPlacement, getActMathThreshold, getSatMathThreshold,
  equivalentSubstitutes, validateSatMath,
} from '../lib/mathPlacement'
import { resolveMathPlacementRow, resolveActMathPlacement } from '../lib/actScoreResolver'
import { buildRequirementMap, REQUIREMENT_SUBSTITUTES } from '../lib/requirementMap'
import { checkPrereqs } from '../lib/prereqChecker'

// The 2026-27 placement table, from the College of Engineering and the Math Department:
//   ACT Math 29+  (SAT 680+)     MATH 1910 Calculus I
//   ACT Math 27+  (SAT 640+)     MATH 1904 Extended Calculus
//   ACT Math 25+  (SAT 590+)     MATH 1845 Technical Calculus (Engineering Technology only) / MATH 1730 Pre-Calculus
//   ACT Math 19-24 (SAT 510-580) MATH 1710 Pre-Calculus Algebra
//   ACT Math 18 or less, SAT 500 or less, or no score    MATH 1000 Transitional Algebra
//   MATH 1710 with a C or higher                          MATH 1720 Pre-Calculus Trigonometry
//   MATH 1730 is equivalent to MATH 1710 + MATH 1720

describe('the 2026-27 table, ACT side', () => {
  const cases = [
    [36, 'MATH1910'], [29, 'MATH1910'],
    [28, 'MATH1904'], [27, 'MATH1904'],
    [26, 'MATH1730'], [25, 'MATH1730'],
    [24, 'MATH1710'], [19, 'MATH1710'],
    [18, 'MATH1000'], [1, 'MATH1000'],
  ]
  it.each(cases)('ACT Math %i places into %s', (score, course) => {
    expect(tierForAct(score).course).toBe(course)
    expect(resolveMathPlacement({ act: score }).course).toBe(course)
  })
})

describe('the 2026-27 table, SAT side', () => {
  const cases = [
    [800, 'MATH1910'], [680, 'MATH1910'],
    [670, 'MATH1904'], [640, 'MATH1904'],
    [630, 'MATH1730'], [590, 'MATH1730'],
    [580, 'MATH1710'], [510, 'MATH1710'],
    [500, 'MATH1000'], [200, 'MATH1000'],
  ]
  it.each(cases)('SAT Math %i places into %s', (score, course) => {
    expect(tierForSat(score).course).toBe(course)
    expect(resolveMathPlacement({ sat: score }).course).toBe(course)
  })
})

describe('resolveMathPlacement', () => {
  it('no score, or a score that is not a number, starts in MATH1000', () => {
    for (const scores of [{}, { act: null, sat: null }, { act: '', sat: '' }, { act: 0 }, { act: 'x' }, undefined]) {
      expect(resolveMathPlacement(scores)).toEqual({ course: 'MATH1000', source: 'none', score: null })
    }
  })
  it('reports which score decided it', () => {
    expect(resolveMathPlacement({ act: 27 })).toEqual({ course: 'MATH1904', source: 'act', score: 27 })
    expect(resolveMathPlacement({ sat: 700 })).toEqual({ course: 'MATH1910', source: 'sat', score: 700 })
  })
  it('takes the higher placement when both scores are on file', () => {
    expect(resolveMathPlacement({ act: 20, sat: 700 }).course).toBe('MATH1910')
    expect(resolveMathPlacement({ act: 30, sat: 520 }).course).toBe('MATH1910')
    expect(resolveMathPlacement({ act: 26, sat: 520 }).course).toBe('MATH1730')
  })
  it('prefers the ACT when both place equally', () => {
    expect(resolveMathPlacement({ act: 27, sat: 650 }).source).toBe('act')
  })
})

describe('thresholds', () => {
  it('are the lowest score for each placement course', () => {
    expect(getActMathThreshold('MATH1910')).toBe(29)
    expect(getActMathThreshold('MATH1904')).toBe(27)
    expect(getActMathThreshold('MATH1730')).toBe(25)
    expect(getActMathThreshold('MATH1710')).toBe(19)
    expect(getSatMathThreshold('MATH1910')).toBe(680)
    expect(getSatMathThreshold('MATH1904')).toBe(640)
    expect(getSatMathThreshold('MATH1730')).toBe(590)
    expect(getSatMathThreshold('MATH1710')).toBe(510)
  })
  it('are null for a course that is not a placement course', () => {
    expect(getActMathThreshold('CSC1300')).toBeNull()
    expect(getSatMathThreshold('MATH2010')).toBeNull()
  })
})

describe('table notes', () => {
  it('MATH1845 is a same-score option for Engineering Technology majors only, never a CSC placement', () => {
    expect(MATH_PLACEMENT.alsoAt).toEqual([{ course: 'MATH1845', act: 25, sat: 590, onlyFor: 'Engineering Technology majors' }])
    expect(MATH_PLACEMENT.tiers.map(t => t.course)).not.toContain('MATH1845')
  })
  it('a C or higher in MATH1710 opens MATH1720', () => {
    expect(MATH_PLACEMENT.progression).toEqual([{ after: 'MATH1710', course: 'MATH1720' }])
  })
  it('says which year the table is for, because it is reassessed every year', () => {
    expect(MATH_PLACEMENT.effective).toBe('2026-2027')
  })
})

describe('the placement row written to prior_credits', () => {
  it('is an act_placement row (the ACT/SAT score gate) that awards no hours', () => {
    expect(resolveMathPlacementRow({ act: 29 })).toEqual({
      credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0, note: 'ACT Math: score 29',
    })
    expect(resolveMathPlacementRow({ sat: 600 })).toEqual({
      credit_type: 'act_placement', satisfies_course_code: 'MATH1730', credits_awarded: 0, note: 'SAT Math: score 600',
    })
  })
  it('is written even with no score, placing into MATH1000', () => {
    expect(resolveMathPlacementRow({})).toEqual({
      credit_type: 'act_placement', satisfies_course_code: 'MATH1000', credits_awarded: 0, note: 'No ACT or SAT Math score on file',
    })
  })
  it('the ACT-only form still returns null without a score', () => {
    expect(resolveActMathPlacement(null)).toBeNull()
    expect(resolveActMathPlacement(0)).toBeNull()
    expect(resolveActMathPlacement(27).satisfies_course_code).toBe('MATH1904')
  })
})

describe('validateSatMath', () => {
  it('accepts blank and whole numbers from 200 to 800', () => {
    for (const v of ['', null, undefined, 200, 800, '650']) expect(validateSatMath(v)).toBeNull()
  })
  it('rejects the rest', () => {
    for (const v of [199, 801, 600.5, 'abc', -1]) expect(validateSatMath(v)).toMatch(/between 200 and 800/)
  })
})

describe('MATH1730 is equivalent to MATH1710 + MATH1720', () => {
  it('turns the equivalence into requirement substitutes', () => {
    expect(equivalentSubstitutes()).toEqual({ MATH1710: ['MATH1730'], MATH1720: ['MATH1730'] })
    expect(REQUIREMENT_SUBSTITUTES.MATH1710).toEqual(['MATH1730'])
    expect(REQUIREMENT_SUBSTITUTES.MATH1720).toEqual(['MATH1730'])
    expect(REQUIREMENT_SUBSTITUTES.MATH1910).toEqual(['MATH1906'])      // the older substitute is still there
  })
  it('lets MATH1730 meet a requirement for either course', () => {
    const rows = [
      { course_code: 'MATH1720', group_index: 0, logic: 'AND', required_code: 'MATH1710' },
      { course_code: 'MATH3999', group_index: 0, logic: 'AND', required_code: 'MATH1720' },
    ]
    const map = buildRequirementMap(rows)
    expect(map.MATH1720[0]).toEqual({ logic: 'OR', codes: ['MATH1710', 'MATH1730'] })
    expect(map.MATH3999[0]).toEqual({ logic: 'OR', codes: ['MATH1720', 'MATH1730'] })
    expect(checkPrereqs('MATH3999', map, new Set(['MATH1730'])).satisfied).toBe(true)
    expect(checkPrereqs('MATH3999', map, new Set()).satisfied).toBe(false)
  })
})
