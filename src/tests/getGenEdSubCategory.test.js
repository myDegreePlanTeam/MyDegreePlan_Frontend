// getGenEdSubCategory.test.js
//
// Covers the BUG-43 helper that maps a GEN_ED course code to its sub-category
// (History / Humanities / Social) and the corresponding display label.

import { describe, it, expect } from 'vitest'
import { getGenEdSubCategory } from '../lib/poolResolver'

describe('getGenEdSubCategory', () => {
  it('returns null for null / undefined / empty input', () => {
    expect(getGenEdSubCategory(null)).toBeNull()
    expect(getGenEdSubCategory(undefined)).toBeNull()
    expect(getGenEdSubCategory('')).toBeNull()
  })

  it('maps a History code to the History sub-category', () => {
    expect(getGenEdSubCategory('HIST2010')).toEqual({
      category: 'History',
      label:    'History',
    })
  })

  it('maps a Humanities code to the Humanities & Arts sub-category', () => {
    expect(getGenEdSubCategory('PHIL2250')).toEqual({
      category: 'Humanities',
      label:    'Humanities & Arts',
    })
  })

  it('maps a Social Science code to the Social Science sub-category', () => {
    expect(getGenEdSubCategory('ECON2020')).toEqual({
      category: 'Social',
      label:    'Social Science',
    })
  })

  it('returns null for a code outside the GEN_ED pool', () => {
    expect(getGenEdSubCategory('CSC1300')).toBeNull()
    expect(getGenEdSubCategory('MATH1910')).toBeNull()
  })
})
