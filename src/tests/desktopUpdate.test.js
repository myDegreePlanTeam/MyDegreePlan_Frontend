// desktopUpdate.test.js
//
// The update card in the Windows desktop app. These cover the pure decision logic: whether the desktop
// bridge exists, and what to show for each state the desktop app reports. The component and hook are thin wrappers.

import { describe, it, expect } from 'vitest'
import { describeDesktopUpdate, desktopUpdates } from '../lib/desktopUpdate'

const noop = () => {}
const bridge = { state: noop, onChange: noop, check: noop, download: noop, install: noop }

describe('desktopUpdates', () => {
  it('is the bridge only inside the desktop app', () => {
    expect(desktopUpdates({ mdpDesktop: { updates: bridge } })).toBe(bridge)
    expect(desktopUpdates({})).toBeNull()                       // hosted build
    expect(desktopUpdates({ __MDP_CONFIG__: {} })).toBeNull()   // Docker install
    expect(desktopUpdates(undefined)).toBeNull()
  })

  it('ignores a bridge that lacks the calls the card needs', () => {
    expect(desktopUpdates({ mdpDesktop: { updates: { state: noop } } })).toBeNull()
    expect(desktopUpdates({ mdpDesktop: { isDesktop: true } })).toBeNull()
  })
})

describe('describeDesktopUpdate', () => {
  it('says nothing without a state, when disabled, idle or checking', () => {
    expect(describeDesktopUpdate(null).mode).toBe('none')
    for (const status of ['disabled', 'idle', 'checking', 'something-new']) {
      expect(describeDesktopUpdate({ status, current: '0.1.0' }).mode).toBe('none')
    }
  })

  it('offers an available update with its notes', () => {
    expect(describeDesktopUpdate({ status: 'available', version: '0.2.0', notes: 'Fixes.' }))
      .toEqual({ mode: 'available', version: '0.2.0', notes: 'Fixes.' })
    expect(describeDesktopUpdate({ status: 'available', version: '0.2.0' }).notes).toBe('')
  })

  it('does not re-offer a version put off, but offers a newer one', () => {
    const state = { status: 'available', version: '0.2.0' }
    expect(describeDesktopUpdate(state, { available: '0.2.0' }).mode).toBe('none')
    expect(describeDesktopUpdate({ ...state, version: '0.3.0' }, { available: '0.2.0' }).mode).toBe('available')
  })

  it('shows download progress, clamped to 0..100', () => {
    const at = (percent) => describeDesktopUpdate({ status: 'downloading', version: '0.2.0', percent })
    expect(at(41.6)).toEqual({ mode: 'downloading', version: '0.2.0', percent: 42 })
    expect(at(-5).percent).toBe(0)
    expect(at(250).percent).toBe(100)
    expect(at(undefined).percent).toBe(0)
  })

  it('shows progress even if "Later" was pressed earlier for that version', () => {
    expect(describeDesktopUpdate({ status: 'downloading', version: '0.2.0', percent: 5 }, { available: '0.2.0' }).mode).toBe('downloading')
  })

  it('offers the restart once downloaded, until put off', () => {
    const state = { status: 'ready', version: '0.2.0' }
    expect(describeDesktopUpdate(state)).toEqual({ mode: 'ready', version: '0.2.0' })
    expect(describeDesktopUpdate(state, { ready: '0.2.0' }).mode).toBe('none')
  })

  it('reports a failure in plain words, once dismissed it stays quiet', () => {
    const failed = describeDesktopUpdate({ status: 'error', message: 'Not now.' })
    expect(failed).toEqual({ mode: 'failed', message: 'Not now.' })
    expect(describeDesktopUpdate({ status: 'error' }).message).toMatch(/plan is unchanged/)
    expect(describeDesktopUpdate({ status: 'error', message: 'x' }, { error: true }).mode).toBe('none')
  })
})
