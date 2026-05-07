import { describe, it, expect } from 'vitest'
import { computeSemesterTerms, formatTermLabel, lastNonSummerTerm } from '../lib/semesterTerms'

describe('computeSemesterTerms — Fall start', () => {
  const terms = computeSemesterTerms('Fall', 2024, [1, 2, 3, 4])

  it('semester 1 is Fall 2024', () => {
    expect(terms[1]).toEqual({ season: 'Fall', year: 2024 })
  })
  it('semester 2 is Spring 2025', () => {
    expect(terms[2]).toEqual({ season: 'Spring', year: 2025 })
  })
  it('semester 3 is Fall 2025', () => {
    expect(terms[3]).toEqual({ season: 'Fall', year: 2025 })
  })
  it('semester 4 is Spring 2026', () => {
    expect(terms[4]).toEqual({ season: 'Spring', year: 2026 })
  })
})

describe('computeSemesterTerms — Spring start', () => {
  const terms = computeSemesterTerms('Spring', 2025, [1, 2, 3, 4])

  it('semester 1 is Spring 2025', () => {
    expect(terms[1]).toEqual({ season: 'Spring', year: 2025 })
  })
  it('semester 2 is Fall 2025', () => {
    expect(terms[2]).toEqual({ season: 'Fall', year: 2025 })
  })
  it('semester 3 is Spring 2026', () => {
    expect(terms[3]).toEqual({ season: 'Spring', year: 2026 })
  })
  it('semester 4 is Fall 2026', () => {
    expect(terms[4]).toEqual({ season: 'Fall', year: 2026 })
  })
})

describe('computeSemesterTerms — Summer start', () => {
  const terms = computeSemesterTerms('Summer', 2025, [1, 2])

  it('semester 1 is Summer 2025', () => {
    expect(terms[1]).toEqual({ season: 'Summer', year: 2025 })
  })
  it('semester 2 is Fall 2025 (same year)', () => {
    expect(terms[2]).toEqual({ season: 'Fall', year: 2025 })
  })
})

describe('computeSemesterTerms — extraTerms override', () => {
  it('extra semester term overwrites computed template term', () => {
    const terms = computeSemesterTerms('Fall', 2024, [1, 2], { 5: { season: 'Summer', year: 2026 } })
    expect(terms[5]).toEqual({ season: 'Summer', year: 2026 })
    expect(terms[1]).toEqual({ season: 'Fall', year: 2024 })
  })

  it('extraTerms entry with null season is ignored', () => {
    const terms = computeSemesterTerms('Fall', 2024, [1], { 9: { season: null, year: 2027 } })
    expect(terms[9]).toBeUndefined()
  })
})

describe('formatTermLabel', () => {
  it('returns "Fall 2025" for a fall term', () => {
    expect(formatTermLabel({ season: 'Fall', year: 2025 })).toBe('Fall 2025')
  })
  it('returns null for a null/undefined term', () => {
    expect(formatTermLabel(null)).toBeNull()
    expect(formatTermLabel(undefined)).toBeNull()
  })
})

describe('lastNonSummerTerm', () => {
  it('returns last non-Summer term', () => {
    const termMap = {
      1: { season: 'Fall',   year: 2024 },
      2: { season: 'Spring', year: 2025 },
      3: { season: 'Summer', year: 2025 },
    }
    expect(lastNonSummerTerm(termMap, [1, 2, 3])).toEqual({ season: 'Spring', year: 2025 })
  })

  it('skips Summer extras and returns the true last non-Summer semester', () => {
    const termMap = {
      1: { season: 'Fall',   year: 2024 },
      2: { season: 'Spring', year: 2025 },
      3: { season: 'Fall',   year: 2025 },
      4: { season: 'Summer', year: 2026 },
    }
    expect(lastNonSummerTerm(termMap, [1, 2, 3, 4])).toEqual({ season: 'Fall', year: 2025 })
  })

  it('returns null when all semesters are Summer', () => {
    const termMap = { 1: { season: 'Summer', year: 2025 } }
    expect(lastNonSummerTerm(termMap, [1])).toBeNull()
  })

  it('returns null for empty allSemNums', () => {
    expect(lastNonSummerTerm({}, [])).toBeNull()
  })
})
