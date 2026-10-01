import { describe, it, expect } from 'vitest'
import { chooseBackend } from '../lib/data/backend'

describe('chooseBackend', () => {
  it('uses the remote API inside the Docker stack, which announces itself with __MDP_CONFIG__', () => {
    expect(chooseBackend({ supabaseUrl: 'http://localhost:8080', supabaseAnonKey: 'k' }, {})).toBe('remote')
  })
  it('keeps Docker on the remote API even if a build flag asks for local', () => {
    expect(chooseBackend({ supabaseUrl: 'x' }, { VITE_DATA_BACKEND: 'local' })).toBe('remote')
  })
  it('defaults to the local-first backend, so a plain Vercel build needs no settings', () => {
    expect(chooseBackend(undefined, {})).toBe('local')
    expect(chooseBackend(undefined)).toBe('local')
  })
  it('does not switch to remote just because Supabase keys are present in the environment', () => {
    expect(chooseBackend(undefined, { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toBe('local')
  })
  it('allows the developer opt-in', () => {
    expect(chooseBackend(undefined, { VITE_DATA_BACKEND: 'remote' })).toBe('remote')
  })
})
