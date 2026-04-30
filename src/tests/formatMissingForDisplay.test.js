// formatMissingForDisplay.test.js
//
// Covers the BUG-37 display helper: collapsing pool-member OR groups in
// the `missing` array returned by checkPrereqs/checkCoreqs into a single
// pool label (e.g. "Communications" instead of "COMM2025, PC2500").

import { describe, it, expect } from 'vitest'
import { formatMissingForDisplay } from '../lib/poolResolver'

describe('formatMissingForDisplay — degenerate inputs', () => {
  it('returns "" for an empty array', () => {
    expect(formatMissingForDisplay([])).toBe('')
  })

  it('returns "" for null / undefined', () => {
    expect(formatMissingForDisplay(null)).toBe('')
    expect(formatMissingForDisplay(undefined)).toBe('')
  })
})

describe('formatMissingForDisplay — bare codes', () => {
  it('passes a single bare code through unchanged', () => {
    expect(formatMissingForDisplay(['CSC1300'])).toBe('CSC1300')
  })

  it('joins multiple bare codes with comma+space', () => {
    expect(formatMissingForDisplay(['CSC1300', 'MATH1910'])).toBe('CSC1300, MATH1910')
  })
})

describe('formatMissingForDisplay — OR groups, all pool members', () => {
  it('collapses a 2-member COMM_REQ OR group to "Communications"', () => {
    expect(formatMissingForDisplay(['(COMM2025 or PC2500)'])).toBe('Communications')
  })

  it('collapses a 3-member GEN_ED OR group to "General Education"', () => {
    expect(formatMissingForDisplay(['(HIST2010 or HIST2020 or POLS1030)'])).toBe('General Education')
  })
})

describe('formatMissingForDisplay — OR groups, mixed pool + individual', () => {
  it('collapses pool members and keeps the individual code', () => {
    expect(formatMissingForDisplay(['(COMM2025 or PC2500 or MATH1910)']))
      .toBe('(Communications or MATH1910)')
  })
})

describe('formatMissingForDisplay — collapse safeguards', () => {
  it('does NOT collapse a single pool member alone in an OR group', () => {
    // Only COMM2025 from COMM_REQ is present → not collapsed.
    expect(formatMissingForDisplay(['(COMM2025 or MATH1910)']))
      .toBe('(COMM2025 or MATH1910)')
  })

  it('does NOT collapse when codes come from two pools but no pool has 2+ members', () => {
    // One COMM_REQ + one ENG_LIT — neither pool reaches the 2-code threshold.
    expect(formatMissingForDisplay(['(COMM2025 or ENGL2130)']))
      .toBe('(COMM2025 or ENGL2130)')
  })
})

describe('formatMissingForDisplay — mixed input arrays', () => {
  it('formats each entry independently and joins with comma+space', () => {
    expect(formatMissingForDisplay(['CSC1300', '(COMM2025 or PC2500)']))
      .toBe('CSC1300, Communications')
  })

  it('handles a bare code, a pool-collapsed OR group, and a bare-passthrough OR group', () => {
    expect(formatMissingForDisplay([
      'CSC1300',
      '(COMM2025 or PC2500)',
      '(COMM2025 or MATH1910)',   // single pool member — passthrough
    ])).toBe('CSC1300, Communications, (COMM2025 or MATH1910)')
  })
})
