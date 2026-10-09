// brand.test.js
//
// The app names no institution: the defaults say MyDegreePlan. An install can still override individual strings through its runtime
// config, and a config that says nothing useful leaves the defaults alone.

import { describe, it, expect } from 'vitest'
import { DEFAULT_BRAND, getBrand } from '../lib/brand'

const withConfig = (cfg) => ({ __MDP_CONFIG__: cfg })

describe('getBrand', () => {
  it('returns the defaults on the hosted build, the desktop app and a normal Docker install', () => {
    expect(getBrand(undefined)).toEqual(DEFAULT_BRAND)
    expect(getBrand({})).toEqual(DEFAULT_BRAND)
    expect(getBrand(withConfig({ supabaseUrl: 'x' }))).toEqual(DEFAULT_BRAND)
  })

  it('says MyDegreePlan and names no school or institution', () => {
    expect(DEFAULT_BRAND.authEyebrow).toBe('MyDegreePlan')
    expect(DEFAULT_BRAND.welcomeEyebrow).toBe('Welcome to MyDegreePlan')
    expect(DEFAULT_BRAND.emailPlaceholder).toBe('you@university.edu')
    expect(DEFAULT_BRAND.catalogName).toBe('course catalog')
  })

  it("the old 'neutral' preset still works: it is the default", () => {
    expect(getBrand(withConfig({ brand: 'neutral' }))).toEqual(DEFAULT_BRAND)
  })

  it('applies string overrides from an object and keeps defaults for the rest', () => {
    const brand = getBrand(withConfig({ brand: { authEyebrow: 'Example U' } }))
    expect(brand.authEyebrow).toBe('Example U')
    expect(brand.shellEyebrow).toBe(DEFAULT_BRAND.shellEyebrow)
  })

  it('ignores non-string values and unknown keys', () => {
    const brand = getBrand(withConfig({ brand: { authEyebrow: 42, extra: 'x' } }))
    expect(brand).toEqual(DEFAULT_BRAND)
  })

  it('ignores an unknown preset name', () => {
    expect(getBrand(withConfig({ brand: 'something-else' }))).toEqual(DEFAULT_BRAND)
  })
})
