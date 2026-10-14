// semesterDefaults.test.js
//
// Which semesters start open (redesign Phase 3b): the first one that is not over and the one after it. Everything else is one line.

import { describe, it, expect } from 'vitest'
import { defaultOpenSemesters } from '../lib/semesterDefaults'
import { semesterPhases } from '../lib/termPhase'
import { computeSemesterTerms } from '../lib/semesterTerms'

const terms = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, { season: i % 2 === 0 ? 'Fall' : 'Spring', year: 2026 + Math.ceil(i / 2) }]))
const openOf = (map) => Object.entries(map).filter(([, v]) => v).map(([k]) => Number(k))

describe('defaultOpenSemesters', () => {
  it('opens the current semester and the next, and nothing else', () => {
    const phases = semesterPhases(terms(8), new Date(2026, 9, 13))   // Fall 2026 is under way
    expect(openOf(defaultOpenSemesters([1, 2, 3, 4, 5, 6, 7, 8], phases))).toEqual([1, 2])
  })

  it('leaves finished semesters closed and opens from the first one that is not over', () => {
    const phases = semesterPhases(terms(8), new Date(2028, 0, 20))   // Spring 2028 is under way: semesters 1 to 3 are past
    expect(openOf(defaultOpenSemesters([1, 2, 3, 4, 5, 6, 7, 8], phases))).toEqual([4, 5])
  })

  it('opens the first two when the whole plan is still ahead', () => {
    const phases = semesterPhases(terms(8), new Date(2026, 3, 1))
    expect(openOf(defaultOpenSemesters([1, 2, 3, 4, 5, 6, 7, 8], phases))).toEqual([1, 2])
  })

  it('opens only the last semester when it is the only one left', () => {
    const phases = semesterPhases(terms(4), new Date(2028, 0, 20))   // semesters 1 and 2 past... Spring 2028 under way = semester 4
    const open = openOf(defaultOpenSemesters([1, 2, 3, 4], phases))
    expect(open[open.length - 1]).toBe(4)
    expect(open.length).toBeLessThanOrEqual(2)
  })

  it('opens nothing when every semester is over', () => {
    const phases = semesterPhases(terms(4), new Date(2035, 0, 1))
    expect(openOf(defaultOpenSemesters([1, 2, 3, 4], phases))).toEqual([])
  })

  it('treats a semester with no term as ahead, never as over', () => {
    expect(openOf(defaultOpenSemesters([1, 2, 3], {}))).toEqual([1, 2])
  })

  it('gives every semester an entry', () => {
    expect(Object.keys(defaultOpenSemesters([1, 2, 3], {}))).toEqual(['1', '2', '3'])
    expect(defaultOpenSemesters([], {})).toEqual({})
  })

  it('works with the terms the planner really computes', () => {
    const real = computeSemesterTerms('Fall', 2026, [1, 2, 3, 4, 5, 6, 7, 8])
    const phases = semesterPhases(real, new Date(2026, 9, 13))
    expect(openOf(defaultOpenSemesters([1, 2, 3, 4, 5, 6, 7, 8], phases))).toEqual([1, 2])
  })
})
