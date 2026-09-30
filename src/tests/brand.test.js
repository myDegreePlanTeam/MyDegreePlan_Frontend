// brand.test.js
//
// The institution wording can be overridden by the Docker build's runtime config so public
// demo captures name no school. Normal installs must keep the defaults.

import { describe, it, expect } from 'vitest'
import { DEFAULT_BRAND, NEUTRAL_BRAND, getBrand } from '../lib/brand'

const withConfig = (cfg) => ({ __MDP_CONFIG__: cfg })

describe('getBrand', () => {
  it('returns the defaults on the hosted build and in a normal Docker install', () => {
    expect(getBrand(undefined)).toEqual(DEFAULT_BRAND)
    expect(getBrand({})).toEqual(DEFAULT_BRAND)
    expect(getBrand(withConfig({ supabaseUrl: 'x' }))).toEqual(DEFAULT_BRAND)
  })

  it("'neutral' names no institution in any string", () => {
    const brand = getBrand(withConfig({ brand: 'neutral' }))
    expect(brand).toEqual(NEUTRAL_BRAND)
    expect(JSON.stringify(brand)).not.toMatch(/tennessee|tntech|ttu/i)
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
