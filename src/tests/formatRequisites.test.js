// formatRequisites.test.js
//
// The course panel lists prerequisites and corequisites one group per line.
// These helpers moved out of CourseDetailModal; the tests pin their wording.

import { describe, it, expect } from 'vitest'
import { formatPrereqs, formatCoreqs } from '../lib/formatRequisites'

const courseMap = {
  CSC1300: { name: 'Intro to Problem Solving' },
  MATH1910: { name: 'Calculus I' },
  MATH1920: { name: 'Calculus II' },
}

describe('formatPrereqs', () => {
  it('returns [] when a course has no prerequisites', () => {
    expect(formatPrereqs('CSC1300', {}, courseMap)).toEqual([])
  })

  it('lists AND groups one course per line, in group order', () => {
    const prereqMap = { CSC2100: {
      1: { logic: 'AND', codes: ['MATH1910'] },
      0: { logic: 'AND', codes: ['CSC1300'] },
    } }
    expect(formatPrereqs('CSC2100', prereqMap, courseMap)).toEqual([
      'CSC1300 – Intro to Problem Solving',
      'MATH1910 – Calculus I',
    ])
  })

  it('joins OR groups as "one of"', () => {
    const prereqMap = { X: { 0: { logic: 'OR', codes: ['MATH1910', 'MATH1920', 'ZZZ9999'] } } }
    expect(formatPrereqs('X', prereqMap, courseMap)).toEqual([
      'one of: MATH1910 – Calculus I, MATH1920 – Calculus II, or ZZZ9999',
    ])
  })
})

describe('formatCoreqs', () => {
  it('accepts the legacy flat-list shape', () => {
    expect(formatCoreqs('X', { X: ['MATH1910'] }, courseMap)).toEqual(['MATH1910 – Calculus I'])
  })

  it('accepts the grouped shape', () => {
    const coreqMap = { X: { 0: { logic: 'OR', codes: ['MATH1910'] } } }
    expect(formatCoreqs('X', coreqMap, courseMap)).toEqual(['MATH1910 – Calculus I'])
  })
})
