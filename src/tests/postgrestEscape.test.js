// postgrestEscape.test.js
//
// BUG-12: AddCourseModal and PriorCreditWizard interpolated raw user input
// into PostgREST .or() filters. Commas, parentheses, and double quotes in
// the input could break the query or alter the filter tree. The fix wraps
// each ilike value in double-quoted literal regions and strips any
// characters that would break out of those regions.

import { describe, it, expect } from 'vitest'
import { escapeIlikeValue } from '../lib/postgrestEscape'

describe('escapeIlikeValue', () => {

  it('returns plain alphanumeric input unchanged', () => {
    expect(escapeIlikeValue('MATH1910')).toBe('MATH1910')
    expect(escapeIlikeValue('Calculus II')).toBe('Calculus II')
  })

  it('preserves commas (safe inside double-quoted region)', () => {
    expect(escapeIlikeValue('History, US')).toBe('History, US')
  })

  it('preserves parentheses (safe inside double-quoted region)', () => {
    expect(escapeIlikeValue('Physics 1 (Algebra-Based)')).toBe('Physics 1 (Algebra-Based)')
  })

  it('strips double quotes (would break out of the literal region)', () => {
    expect(escapeIlikeValue('say "hi"')).toBe('say hi')
  })

  it('strips backslashes (would enable PostgREST escapes)', () => {
    expect(escapeIlikeValue('foo\\bar')).toBe('foobar')
  })

  it('neutralizes a crafted injection attempt', () => {
    // A user trying to escape the quoted region with `","name.eq."admin`
    // ends up with the dangerous chars stripped — the remaining comma stays
    // inside the quoted region, where it is a literal byte.
    const malicious = '","name.eq."admin'
    expect(escapeIlikeValue(malicious)).toBe(',name.eq.admin')
  })

  it('returns empty string for null/undefined input (defensive)', () => {
    expect(escapeIlikeValue(null)).toBe('')
    expect(escapeIlikeValue(undefined)).toBe('')
  })

  it('preserves whitespace verbatim (caller trims before passing)', () => {
    expect(escapeIlikeValue('  hi  ')).toBe('  hi  ')
  })
})
