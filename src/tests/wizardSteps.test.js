import { describe, it, expect } from 'vitest'
import { previousStep } from '../lib/wizardSteps'

describe('previousStep (PriorCreditWizard Back button)', () => {
  it('goes back one step for a credit type that asks for a score', () => {
    expect(previousStep(4, true)).toBe(3)
    expect(previousStep(3, true)).toBe(2)
    expect(previousStep(2, true)).toBe(1)
  })

  it('skips the score step from the confirmation for a type without one (transfer credit, Cambridge)', () => {
    expect(previousStep(4, false)).toBe(2)
    expect(previousStep(2, false)).toBe(1)
  })

  it('stays on step 1 at the start', () => {
    expect(previousStep(1, true)).toBe(1)
    expect(previousStep(1, false)).toBe(1)
  })
})
