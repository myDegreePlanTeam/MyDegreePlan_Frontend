// theme.test.js
//
// lib/theme.js and public/theme-init.js decide the colour theme, and must always agree: the script runs before first paint, the module
// runs after. The Frontend has no DOM test environment, so both run here against fakes (the script in a node:vm sandbox).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import {
  THEME_KEY, readPreference, writePreference, resolveTheme, applyTheme, initTheme, setPreference,
} from '../lib/theme'

const INIT_SCRIPT = readFileSync(fileURLToPath(new URL('../../public/theme-init.js', import.meta.url)), 'utf8')

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: k => { delete data[k] },
  }
}

function fakeWindow(prefersLight) {
  const listeners = new Set()
  const query = {
    matches: prefersLight,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  }
  return {
    listeners,
    matchMedia: () => query,
    setDevice(light) { query.matches = light; for (const fn of [...listeners]) fn() },
  }
}

const fakeDoc = () => ({ documentElement: { dataset: {}, setAttribute(k, v) { this.dataset[k.replace(/^data-/, '')] = v } } })

describe('theme preference', () => {
  it('reads an explicit light or dark, and treats everything else as the device setting', () => {
    expect(readPreference(fakeStorage({ [THEME_KEY]: 'light' }))).toBe('light')
    expect(readPreference(fakeStorage({ [THEME_KEY]: 'dark' }))).toBe('dark')
    expect(readPreference(fakeStorage())).toBe('system')
    expect(readPreference(fakeStorage({ [THEME_KEY]: 'purple' }))).toBe('system')
    expect(readPreference(undefined)).toBe('system')
  })

  it('survives blocked storage', () => {
    const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
    expect(readPreference(blocked)).toBe('system')
    expect(() => writePreference(blocked, 'dark')).not.toThrow()
    expect(() => writePreference(blocked, 'system')).not.toThrow()
  })

  it('stores light and dark, and removes the key for system', () => {
    const storage = fakeStorage()
    writePreference(storage, 'light')
    expect(storage.data[THEME_KEY]).toBe('light')
    writePreference(storage, 'system')
    expect(THEME_KEY in storage.data).toBe(false)
  })

  it('resolves a preference against the device', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
})

describe('applying the theme', () => {
  it('sets data-theme on <html>', () => {
    const doc = fakeDoc()
    expect(applyTheme('light', doc)).toBe('light')
    expect(doc.documentElement.dataset.theme).toBe('light')
  })

  it('initTheme applies the stored choice, and follows the device only while the choice is system', () => {
    const doc = fakeDoc()
    const win = fakeWindow(true)
    const stop = initTheme({ storage: fakeStorage(), win, doc })
    expect(doc.documentElement.dataset.theme).toBe('light')
    win.setDevice(false)
    expect(doc.documentElement.dataset.theme).toBe('dark')
    stop()
    expect(win.listeners.size).toBe(0)

    const doc2 = fakeDoc()
    const win2 = fakeWindow(true)
    initTheme({ storage: fakeStorage({ [THEME_KEY]: 'dark' }), win: win2, doc: doc2 })
    expect(doc2.documentElement.dataset.theme).toBe('dark')
    win2.setDevice(true)
    expect(doc2.documentElement.dataset.theme).toBe('dark')
  })

  it('setPreference stores and applies, and system hands the choice back to the device', () => {
    const doc = fakeDoc()
    const storage = fakeStorage()
    const win = fakeWindow(true)
    expect(setPreference('dark', { storage, win, doc })).toBe('dark')
    expect(storage.data[THEME_KEY]).toBe('dark')
    expect(setPreference('system', { storage, win, doc })).toBe('light')
    expect(THEME_KEY in storage.data).toBe(false)
  })
})

describe('public/theme-init.js agrees with lib/theme.js', () => {
  function runInit({ stored, prefersLight, storageBlocked = false, noMatchMedia = false }) {
    const doc = fakeDoc()
    const sandbox = {
      document: doc,
      localStorage: storageBlocked
        ? { getItem() { throw new Error('blocked') } }
        : { getItem: () => (stored === undefined ? null : stored) },
      window: noMatchMedia ? {} : { matchMedia: () => ({ matches: prefersLight }) },
    }
    vm.runInNewContext(INIT_SCRIPT, sandbox)
    return doc.documentElement.dataset.theme
  }

  const cases = [
    { stored: 'light', prefersLight: false },
    { stored: 'dark', prefersLight: true },
    { stored: undefined, prefersLight: true },
    { stored: undefined, prefersLight: false },
    { stored: 'purple', prefersLight: true },
    { stored: 'purple', prefersLight: false },
  ]

  it.each(cases)('stored=$stored, device light=$prefersLight', ({ stored, prefersLight }) => {
    const fromModule = resolveTheme(readPreference(fakeStorage(stored === undefined ? {} : { [THEME_KEY]: stored })), prefersLight)
    expect(runInit({ stored, prefersLight })).toBe(fromModule)
  })

  it('falls back to dark when storage is blocked and the device has no preference API', () => {
    expect(runInit({ storageBlocked: true, noMatchMedia: true })).toBe('dark')
  })
})
