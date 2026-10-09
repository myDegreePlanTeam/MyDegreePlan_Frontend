// platform.test.js
//
// The app is one bundle on three platforms (web, the Windows app, the Docker install). These cover which platform a page load is,
// and that the words that differ by platform are complete and right for each: a desktop student must never be told their plan is in
// "this browser" or to "refresh the page", and a web student must never be told it is on "this computer".

import { describe, it, expect } from 'vitest'
import { PLATFORMS, platformOf, platformWords } from '../lib/platform'

describe('platformOf', () => {
  it('is the desktop app whenever its bridge is present, whatever the backend', () => {
    expect(platformOf({ backend: 'local', win: { mdpDesktop: { isDesktop: true } } })).toBe('desktop')
    expect(platformOf({ backend: 'remote', win: { mdpDesktop: { isDesktop: true } } })).toBe('desktop')
  })

  it('is the Docker install on the remote backend, and the web otherwise', () => {
    expect(platformOf({ backend: 'remote', win: {} })).toBe('docker')
    expect(platformOf({ backend: 'local', win: {} })).toBe('web')
    expect(platformOf({ backend: 'local' })).toBe('web')
    expect(platformOf()).toBe('web')
  })

  it('does not treat a bridge that is not the desktop app as the desktop app', () => {
    expect(platformOf({ backend: 'local', win: { mdpDesktop: {} } })).toBe('web')
    expect(platformOf({ backend: 'local', win: { mdpDesktop: { isDesktop: false } } })).toBe('web')
  })
})

describe('platformWords', () => {
  const keys = Object.keys(platformWords('web'))

  it('has every word for every platform (a missing one would show "undefined" to a student)', () => {
    for (const p of PLATFORMS) {
      expect(Object.keys(platformWords(p)).sort(), p).toEqual([...keys].sort())
      for (const k of keys) expect(typeof platformWords(p)[k], `${p}.${k}`).toBe('string')
    }
  })

  it('falls back to the web words for an unknown platform', () => {
    expect(platformWords('nope')).toEqual(platformWords('web'))
  })

  it('never calls the desktop app a browser, a page, a site or a tab, and never mentions a phone', () => {
    const all = Object.values(platformWords('desktop')).join(' | ')
    expect(all).not.toMatch(/browser|\bpage\b|\bsite\b|\btab\b|phone/i)
  })

  it('says where the plan lives, correctly, on each platform', () => {
    expect(platformWords('web').where).toBe('this browser')
    expect(platformWords('desktop').where).toBe('this computer')
    expect(platformWords('docker').where).toBe('this install')
    expect(platformWords('desktop').storedMeta).toMatch(/computer/)
  })

  it('tells a student on every platform how to recover from a failed reload', () => {
    expect(platformWords('web').reloadHint).toMatch(/refresh the page/i)
    expect(platformWords('desktop').reloadHint).toMatch(/reopen MyDegreePlan/)
    expect(platformWords('docker').reloadHint).toMatch(/refresh the page/i)
  })

  it('the Docker backup text names the other two versions a backup can come from', () => {
    expect(platformWords('docker').backupText).toMatch(/web version/)
    expect(platformWords('docker').backupText).toMatch(/desktop app/)
  })
})
