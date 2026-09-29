import { describe, it, expect } from 'vitest'
import { isConcentrationSelectable } from '../lib/concentrationAvailability'

describe('isConcentrationSelectable', () => {
  it.each(['core', 'cybersecurity', 'hpc'])('%s is open to every student type', code => {
    for (const type of ['incoming_freshman', 'transfer', 'returning', null]) {
      expect(isConcentrationSelectable(code, type)).toBe(true)
    }
  })

  it('hides DSAI from incoming freshmen and transfer students', () => {
    expect(isConcentrationSelectable('dsai', 'incoming_freshman')).toBe(false)
    expect(isConcentrationSelectable('dsai', 'transfer')).toBe(false)
  })

  it('hides DSAI when the student type is unknown', () => {
    expect(isConcentrationSelectable('dsai', null)).toBe(false)
    expect(isConcentrationSelectable('dsai', undefined)).toBe(false)
  })

  it('keeps DSAI open to returning students (started before Fall 2026)', () => {
    expect(isConcentrationSelectable('dsai', 'returning')).toBe(true)
  })

  it('keeps DSAI visible when it is the current concentration, whatever the type', () => {
    expect(isConcentrationSelectable('dsai', 'incoming_freshman', 'dsai')).toBe(true)
    expect(isConcentrationSelectable('dsai', null, 'dsai')).toBe(true)
  })

  it('does not let a different current concentration unlock DSAI', () => {
    expect(isConcentrationSelectable('dsai', 'transfer', 'core')).toBe(false)
  })
})
