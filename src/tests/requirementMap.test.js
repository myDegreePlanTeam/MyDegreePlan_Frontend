import { describe, it, expect } from 'vitest'
import { buildRequirementMap, withSubstitutes } from '../lib/requirementMap'
import { checkPrereqs, checkCoreqs } from '../lib/prereqChecker'

// Rows as seed.js writes them to prerequisite_entries / corequisite_entries,
// for courses from the live catalog.
const row = (course_code, group_index, logic, required_code) =>
  ({ course_code, group_index, logic, required_code })

const PREREQ_ROWS = [
  row('MATH2010', 0, 'AND', 'MATH1910'),
  row('MATH3070', 0, 'OR', 'MATH1130'), row('MATH3070', 0, 'OR', 'MATH1710'), row('MATH3070', 0, 'OR', 'MATH1910'),
  row('CSC1300', 0, 'OR', 'CSC1200'), row('CSC1300', 0, 'OR', 'MATH1845'), row('CSC1300', 0, 'OR', 'MATH1910'),
  row('CSC1310', 0, 'AND', 'CSC1300'), row('CSC1310', 1, 'AND', 'MATH1910'),
  row('ENGL1020', 0, 'AND', 'ENGL1010'),
]

const COREQ_ROWS = [
  row('CSC1300', 0, 'OR', 'MATH1845'), row('CSC1300', 0, 'OR', 'MATH1910'),
  row('CSC1310', 0, 'AND', 'MATH1910'),
]

describe('buildRequirementMap — grouping', () => {
  it('groups rows by course and group_index, keeping logic', () => {
    const map = buildRequirementMap(PREREQ_ROWS)
    expect(map.ENGL1020).toEqual({ 0: { logic: 'AND', codes: ['ENGL1010'] } })
    expect(map.CSC1310[0]).toEqual({ logic: 'AND', codes: ['CSC1300'] })
  })

  it('returns an empty map for missing rows', () => {
    expect(buildRequirementMap(null)).toEqual({})
    expect(buildRequirementMap([])).toEqual({})
  })
})

describe('buildRequirementMap — MATH1906 substitutes for MATH1910', () => {
  const map = buildRequirementMap(PREREQ_ROWS)

  it('turns a lone MATH1910 requirement into MATH1910 or MATH1906', () => {
    expect(map.MATH2010).toEqual({ 0: { logic: 'OR', codes: ['MATH1910', 'MATH1906'] } })
    expect(map.CSC1310[1]).toEqual({ logic: 'OR', codes: ['MATH1910', 'MATH1906'] })
  })

  it('adds MATH1906 to OR groups that accept MATH1910', () => {
    expect(map.MATH3070[0].codes).toEqual(['MATH1130', 'MATH1710', 'MATH1910', 'MATH1906'])
    expect(map.CSC1300[0].codes).toEqual(['CSC1200', 'MATH1845', 'MATH1910', 'MATH1906'])
  })

  it('applies to corequisites too', () => {
    const coreqs = buildRequirementMap(COREQ_ROWS)
    expect(coreqs.CSC1300[0].codes).toEqual(['MATH1845', 'MATH1910', 'MATH1906'])
    expect(coreqs.CSC1310[0]).toEqual({ logic: 'OR', codes: ['MATH1910', 'MATH1906'] })
  })

  it('leaves groups without MATH1910 untouched', () => {
    expect(map.ENGL1020[0]).toEqual({ logic: 'AND', codes: ['ENGL1010'] })
  })

  it('does not duplicate a substitute already listed', () => {
    const m = withSubstitutes({ X: { 0: { logic: 'OR', codes: ['MATH1910', 'MATH1906'] } } })
    expect(m.X[0].codes).toEqual(['MATH1910', 'MATH1906'])
  })

  it('splits a multi-code AND group so the other members stay required', () => {
    const m = withSubstitutes({ X: { 0: { logic: 'AND', codes: ['CSC1300', 'MATH1910'] }, 1: { logic: 'AND', codes: ['CSC1310'] } } })
    expect(m.X).toEqual({
      0: { logic: 'AND', codes: ['CSC1300'] },
      1: { logic: 'AND', codes: ['CSC1310'] },
      2: { logic: 'OR',  codes: ['MATH1910', 'MATH1906'] },
    })
  })

  it('does not mutate the input map', () => {
    const input = { X: { 0: { logic: 'AND', codes: ['MATH1910'] } } }
    withSubstitutes(input)
    expect(input.X[0]).toEqual({ logic: 'AND', codes: ['MATH1910'] })
  })
})

describe('substituted maps with checkPrereqs / checkCoreqs', () => {
  const prereqMap = buildRequirementMap(PREREQ_ROWS)
  const coreqMap  = buildRequirementMap(COREQ_ROWS)

  it('MATH2010 is satisfied by MATH1906 in an earlier semester', () => {
    expect(checkPrereqs('MATH2010', prereqMap, new Set(['MATH1904', 'MATH1906']))).toEqual({ satisfied: true })
  })

  it('MATH2010 still needs calculus when neither course is done', () => {
    expect(checkPrereqs('MATH2010', prereqMap, new Set(['MATH1904'])).satisfied).toBe(false)
  })

  it('CSC1300 may take MATH1906 concurrently', () => {
    expect(checkCoreqs('CSC1300', coreqMap, new Set(['MATH1906']))).toEqual({ satisfied: true })
  })

  it('CSC1310 accepts MATH1906 for its MATH1910 prereq and coreq', () => {
    const done = new Set(['CSC1300', 'MATH1906'])
    expect(checkPrereqs('CSC1310', prereqMap, done, [], {}, coreqMap)).toEqual({ satisfied: true })
    expect(checkCoreqs('CSC1310', coreqMap, done)).toEqual({ satisfied: true })
  })
})
