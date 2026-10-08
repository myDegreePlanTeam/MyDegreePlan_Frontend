import { describe, it, expect } from 'vitest'
import { scoreLabels } from '../lib/scoreLabels'

describe('scoreLabels (AP)', () => {
  it('a single threshold keeps its plus', () => {
    expect(scoreLabels([3], 'ap_credit')).toEqual({ 3: '3+' })
  })
  it('the highest of several carries the plus, the ones below it are exact', () => {
    expect(scoreLabels([3, 4], 'ap_credit')).toEqual({ 3: '3', 4: '4+' })
  })
  it('a top score of 5 has no plus', () => {
    expect(scoreLabels([4, 5], 'ap_credit')).toEqual({ 4: '4', 5: '5' })
    expect(scoreLabels([5], 'ap_credit')).toEqual({ 5: '5' })
    expect(scoreLabels([3, 4, 5], 'ap_credit')).toEqual({ 3: '3', 4: '4', 5: '5' })
  })
  it('a gap between thresholds is written as a range', () => {
    expect(scoreLabels([3, 5], 'ap_credit')).toEqual({ 3: '3–4', 5: '5' })
  })
  it('ignores order and repeats', () => {
    expect(scoreLabels([4, 3, 4], 'ap_credit')).toEqual({ 3: '3', 4: '4+' })
  })
})

describe('scoreLabels (other exams)', () => {
  it('keeps a plain N+ for every threshold', () => {
    expect(scoreLabels([5, 6], 'ib_credit')).toEqual({ 5: '5+', 6: '6+' })
    expect(scoreLabels([50, 59], 'test_out')).toEqual({ 50: '50+', 59: '59+' })
  })
})
