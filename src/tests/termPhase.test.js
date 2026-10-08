import { describe, it, expect } from 'vitest'
import { termOrder, termPhase, statusForPhase, semesterPhases, splitCreditsByPhase } from '../lib/termPhase'
import { computeSemesterTerms } from '../lib/semesterTerms'

const day = (y, m, d) => new Date(y, m - 1, d)

describe('termOrder', () => {
  it('sorts Spring, Summer, Fall within a year, and years in order', () => {
    const order = [['Fall', 2025], ['Spring', 2026], ['Summer', 2026], ['Fall', 2026], ['Spring', 2027]]
      .map(([season, year]) => termOrder({ season, year }))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(new Set(order).size).toBe(order.length)
  })
  it('is null for a term that is missing or unknown', () => {
    expect(termOrder(null)).toBeNull()
    expect(termOrder({ season: 'Winter', year: 2026 })).toBeNull()
    expect(termOrder({ season: 'Fall' })).toBeNull()
  })
})

describe('termPhase', () => {
  const fall26 = { season: 'Fall', year: 2026 }
  it('is past before the term, current during it, future after', () => {
    expect(termPhase(fall26, day(2026, 7, 31))).toBe('future')    // July is Summer
    expect(termPhase(fall26, day(2026, 8, 1))).toBe('current')
    expect(termPhase(fall26, day(2026, 12, 31))).toBe('current')
    expect(termPhase(fall26, day(2027, 1, 1))).toBe('past')       // Spring 2027 began
  })
  it('treats Summer as its own term between Spring and Fall', () => {
    const spring = { season: 'Spring', year: 2027 }
    expect(termPhase(spring, day(2027, 5, 31))).toBe('current')
    expect(termPhase(spring, day(2027, 6, 1))).toBe('past')
    expect(termPhase({ season: 'Fall', year: 2027 }, day(2027, 6, 15))).toBe('future')
  })
  it('never assumes a term it cannot place is passed', () => {
    expect(termPhase(null, day(2030, 1, 1))).toBe('future')
  })
  it('maps a phase to a status', () => {
    expect(['past', 'current', 'future'].map(statusForPhase)).toEqual(['completed', 'in_progress', 'planned'])
  })
})

describe('semesterPhases', () => {
  it('phases a four-year plan from the start term', () => {
    const terms = computeSemesterTerms('Fall', 2024, [1, 2, 3, 4, 5])   // Fall 24, Spring 25, Fall 25, Spring 26, Fall 26
    expect(semesterPhases(terms, day(2026, 10, 8))).toEqual({ 1: 'past', 2: 'past', 3: 'past', 4: 'past', 5: 'current' })
    expect(semesterPhases(terms, day(2024, 3, 1))).toEqual({ 1: 'future', 2: 'future', 3: 'future', 4: 'future', 5: 'future' })
  })
})

describe('splitCreditsByPhase', () => {
  const phases = { 1: 'past', 2: 'current', 3: 'future' }
  const breakdown = [
    { courseCode: 'ENGL1010', credits: 3, source: 'transfer' },
    { courseCode: 'CSC1300', credits: 4, source: 'slot', slotId: 10 },
    { courseCode: 'MATH1910', credits: 4, source: 'slot', slotId: 11 },
    { courseCode: 'PSY1030', credits: 3, source: 'free_add', freeAddId: 7 },
    { courseCode: 'CSC2400', credits: 3, source: 'slot', slotId: 12 },
  ]
  const semesterOf = item => ({ 10: 1, 11: 2, 12: 3 }[item.slotId] ?? ({ 7: 1 }[item.freeAddId]))

  it('counts prior credit and courses in past semesters as earned, the rest as ahead', () => {
    expect(splitCreditsByPhase(breakdown, semesterOf, phases)).toEqual({ completed: 3 + 4 + 3, planned: 4 + 3 })
  })
  it('counts a course with no semester as ahead', () => {
    expect(splitCreditsByPhase([{ source: 'slot', slotId: 99, credits: 3 }], semesterOf, phases)).toEqual({ completed: 0, planned: 3 })
  })
})
