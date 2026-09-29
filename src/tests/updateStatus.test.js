// updateStatus.test.js
//
// The in-app update banner only exists in the local Docker build. These cover the pure
// decision logic: what to show for each updater state, and how calls fail. The
// component and hook are thin wrappers around this.

import { describe, it, expect } from 'vitest'
import {
  UPDATE_BASE, UpdateApiError, callUpdater, describeUpdate, phaseLabel, updateFinished, updateSupported,
} from '../lib/updateStatus'

const base = {
  state: 'idle', enabled: true, current: { version: '1.0.0', sequence: 10 },
  latest: null, updateAvailable: false, required: false, phase: null, target: null, lastResult: null,
}
const available = { ...base, state: 'available', latest: { version: '1.1.0', sequence: 20, notes: 'Fixes.' }, updateAvailable: true }

describe('updateSupported', () => {
  it('is only true where the Docker build injected its runtime config', () => {
    expect(updateSupported({ __MDP_CONFIG__: { supabaseUrl: 'x' } })).toBe(true)
    expect(updateSupported({})).toBe(false)          // hosted (Vercel) build
    expect(updateSupported(undefined)).toBe(false)
  })
})

describe('describeUpdate', () => {
  it('says nothing when there is no status, updates are disabled, or the app is current', () => {
    expect(describeUpdate(null).mode).toBe('none')
    expect(describeUpdate({ ...base, state: 'disabled' }).mode).toBe('none')
    expect(describeUpdate(base).mode).toBe('none')
  })

  it('offers an optional update, with the release notes', () => {
    const d = describeUpdate(available)
    expect(d.mode).toBe('available')
    expect(d.latest.notes).toBe('Fixes.')
  })

  it('does not re-offer a version the student already put off this session', () => {
    expect(describeUpdate(available, { availableSequence: 20 }).mode).toBe('none')
    expect(describeUpdate(available, { availableSequence: 15 }).mode).toBe('available')  // a newer one appears
  })

  it('a required update cannot be put off', () => {
    const req = { ...available, required: true }
    expect(describeUpdate(req).mode).toBe('required')
    expect(describeUpdate(req, { availableSequence: 20 }).mode).toBe('required')
  })

  it('shows progress with a plain-language label while working', () => {
    const d = describeUpdate({ ...available, state: 'applying', phase: 'backup', target: { version: '1.1.0', sequence: 20 } })
    expect(d.mode).toBe('working')
    expect(d.label).toBe('Backing up your plan')
    expect(d.target.sequence).toBe(20)
    expect(describeUpdate({ ...available, state: 'downloading', phase: 'downloading' }).mode).toBe('working')
  })

  it('reports a failed update once, and offers retry only if the update is still available', () => {
    const lastResult = { ok: false, at: 111, message: 'Restored the previous version.' }
    const d = describeUpdate({ ...available, lastResult })
    expect(d.mode).toBe('failed')
    expect(d.message).toMatch(/previous version/)
    expect(d.canRetry).toBe(true)
    expect(describeUpdate({ ...base, lastResult }).canRetry).toBe(false)
    expect(describeUpdate({ ...available, lastResult }, { failedAt: 111 }).mode).toBe('available')   // dismissed
  })

  it('a failed update outranks a required one so the student sees why it did not work', () => {
    const s = { ...available, required: true, lastResult: { ok: false, at: 5, message: 'x' } }
    expect(describeUpdate(s).mode).toBe('failed')
    expect(describeUpdate(s, { failedAt: 5 }).mode).toBe('required')
  })

  it('a successful earlier result is not shown', () => {
    expect(describeUpdate({ ...base, lastResult: { ok: true, at: 1, message: 'Updated.' } }).mode).toBe('none')
  })
})

describe('updateFinished', () => {
  const target = { version: '1.1.0', sequence: 20 }
  it('is true once the running version reaches the target and the updater is idle', () => {
    expect(updateFinished({ ...base, current: { sequence: 20 } }, target)).toBe(true)
    expect(updateFinished({ ...base, current: { sequence: 25 } }, target)).toBe(true)
  })
  it('is false while still on the old version, still working, or with nothing to wait for', () => {
    expect(updateFinished(base, target)).toBe(false)
    expect(updateFinished({ ...base, state: 'applying', current: { sequence: 20 } }, target)).toBe(false)
    expect(updateFinished(base, null)).toBe(false)
    expect(updateFinished(null, target)).toBe(false)
  })
})

describe('phaseLabel', () => {
  it('knows every phase the updater reports, with a safe default', () => {
    for (const p of ['downloading', 'stopping', 'backup', 'starting', 'verifying', 'rollback']) {
      expect(phaseLabel(p)).not.toBe('Updating')
    }
    expect(phaseLabel('mystery')).toBe('Updating')
  })
})

describe('callUpdater', () => {
  const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body })

  it('sends the login token, targets /_mdp/update, and never caches', async () => {
    let seen
    const fetchImpl = async (url, opts) => { seen = { url, opts }; return { ok: true, status: 200, json: async () => ({ a: 1 }) } }
    expect(await callUpdater('/status', { token: 'tok', fetchImpl })).toEqual({ a: 1 })
    expect(seen.url).toBe(`${UPDATE_BASE}/status`)
    expect(seen.opts.headers.authorization).toBe('Bearer tok')
    expect(seen.opts.cache).toBe('no-store')
    expect(seen.opts.body).toBeUndefined()
  })

  it('POSTs a JSON body when given one', async () => {
    let seen
    await callUpdater('/settings', { method: 'POST', token: 't', body: { auto: true }, fetchImpl: async (u, o) => { seen = o; return ok({})() } })
    expect(seen.method).toBe('POST')
    expect(seen.body).toBe('{"auto":true}')
    expect(seen.headers['content-type']).toBe('application/json')
  })

  it('turns HTTP errors into UpdateApiError carrying the updater\'s message', async () => {
    const fetchImpl = async () => ({ ok: false, status: 409, json: async () => ({ error: 'Already up to date.' }) })
    await expect(callUpdater('/apply', { method: 'POST', token: 't', fetchImpl })).rejects.toMatchObject({ status: 409, message: 'Already up to date.' })
  })

  it('tolerates non-JSON error pages (nginx while the stack restarts)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json') } })
    await expect(callUpdater('/status', { token: 't', fetchImpl })).rejects.toMatchObject({ status: 502 })
  })

  it('reports an unreachable app as status 0 so the caller can treat it as "restarting"', async () => {
    const fetchImpl = async () => { throw new TypeError('Failed to fetch') }
    const err = await callUpdater('/status', { token: 't', fetchImpl }).catch((e) => e)
    expect(err).toBeInstanceOf(UpdateApiError)
    expect(err.status).toBe(0)
  })
})
