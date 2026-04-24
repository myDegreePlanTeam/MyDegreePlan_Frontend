import { describe, it, expect } from 'vitest'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'

describe('groupAndSortPriorCredits', () => {
  it('returns an empty array when given no input', () => {
    expect(groupAndSortPriorCredits([])).toEqual([])
    expect(groupAndSortPriorCredits(null)).toEqual([])
    expect(groupAndSortPriorCredits(undefined)).toEqual([])
  })

  it('groups entries by credit_type and preserves input order within a group', () => {
    const input = [
      { id: 1, credit_type: 'ap_credit', satisfies_course_code: 'MATH1910' },
      { id: 2, credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010' },
      { id: 3, credit_type: 'transfer_credit', satisfies_course_code: 'CSC2220' },
    ]
    const result = groupAndSortPriorCredits(input)
    expect(result.map(g => g.type)).toEqual(['ap_credit', 'transfer_credit'])
    expect(result[0].entries.map(e => e.id)).toEqual([1, 2])
    expect(result[1].entries.map(e => e.id)).toEqual([3])
  })

  it('emits sections in canonical AP → IB → ACT → CLEP → Transfer → Cambridge → Other order', () => {
    const input = [
      { credit_type: 'cambridge' },
      { credit_type: 'transfer_credit' },
      { credit_type: 'test_out' },
      { credit_type: 'act_placement' },
      { credit_type: 'ib_credit' },
      { credit_type: 'ap_credit' },
    ]
    const result = groupAndSortPriorCredits(input)
    expect(result.map(g => g.type)).toEqual([
      'ap_credit', 'ib_credit', 'act', 'test_out', 'transfer_credit', 'cambridge',
    ])
  })

  it('merges act_placement and act_credit into a single "act" bucket', () => {
    const input = [
      { id: 1, credit_type: 'act_credit', satisfies_course_code: 'ENGL1010' },
      { id: 2, credit_type: 'act_placement', satisfies_course_code: null },
    ]
    const result = groupAndSortPriorCredits(input)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('act')
    expect(result[0].entries.map(e => e.id)).toEqual([1, 2])
  })

  it('bucketizes unknown credit_type values under "other" at the end', () => {
    const input = [
      { credit_type: 'ap_credit' },
      { credit_type: 'some_future_type' },
      { credit_type: null },
    ]
    const result = groupAndSortPriorCredits(input)
    expect(result.map(g => g.type)).toEqual(['ap_credit', 'other'])
    expect(result[1].entries).toHaveLength(2)
  })

  it('omits sections with no entries', () => {
    const input = [{ credit_type: 'ap_credit' }]
    const result = groupAndSortPriorCredits(input)
    expect(result.map(g => g.type)).toEqual(['ap_credit'])
  })

  it('each group has a human-readable label', () => {
    const input = [
      { credit_type: 'ap_credit' },
      { credit_type: 'transfer_credit' },
    ]
    const result = groupAndSortPriorCredits(input)
    expect(result[0].label).toBe('AP Exams')
    expect(result[1].label).toBe('Transfer Credit')
  })
})
