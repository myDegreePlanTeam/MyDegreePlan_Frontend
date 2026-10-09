// platformBranches.test.js
//
// MyDegreePlan runs on three platforms from ONE bundle (web, the Windows app, the Docker install), and they must offer the same
// features. The only legitimate differences are listed in parity/platform-branches.json. This fails when a source file starts to
// branch on the platform or backend without being listed (an unreviewed divergence), or when a listed file no longer does
// (a stale entry that hides where the real divergences are).

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORMS } from '../lib/platform'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const registry = JSON.parse(readFileSync(join(ROOT, 'parity', 'platform-branches.json'), 'utf8'))

// What it looks like when code behaves differently per platform or backend.
const SIGNALS = /\b(isLocalBackend|platformOf|platformWords|mdpDesktop|desktopUpdates|updateSupported|chooseBackend)\b|__MDP_CONFIG__/

function sourceFiles(dir = join(ROOT, 'src'), out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      // src/data holds the generated catalog JSON; src/lib/data is real code (the backends) and must be scanned.
      if (!['tests', '__tests__'].includes(name) && path !== join(ROOT, 'src', 'data')) sourceFiles(path, out)
    } else if (/\.(js|jsx)$/.test(name)) out.push(path)
  }
  return out
}

const branching = () => sourceFiles()
  .filter(file => readFileSync(file, 'utf8').split(/\r?\n/).some(line => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line) && SIGNALS.test(line)))
  .map(file => relative(ROOT, file).split(sep).join('/'))
  .sort()

describe('platform branches are registered', () => {
  it('every source file that branches on the platform is listed in parity/platform-branches.json', () => {
    const unlisted = branching().filter(file => !(file in registry.branches))
    expect(unlisted, 'add each to parity/platform-branches.json with a reason and the platforms that differ, or remove the branch').toEqual([])
  })

  it('every listed file still branches on the platform (no stale entries)', () => {
    const live = new Set(branching())
    const stale = Object.keys(registry.branches).filter(file => !live.has(file))
    expect(stale, 'remove these from parity/platform-branches.json').toEqual([])
  })

  it('each entry says what kind of difference it is, why, and which platforms', () => {
    for (const [file, entry] of Object.entries(registry.branches)) {
      expect(['words', 'feature', 'infrastructure'], `${file}.kind`).toContain(entry.kind)
      expect(entry.why?.length, `${file}.why`).toBeGreaterThan(10)
      expect(entry.platforms?.length, `${file}.platforms`).toBeGreaterThan(0)
      for (const p of entry.platforms) expect(PLATFORMS, `${file}: ${p}`).toContain(p)
    }
  })

  it('named features point at files that exist, on known platforms', () => {
    for (const [name, feature] of Object.entries(registry.features)) {
      expect(feature.platforms.length, name).toBeGreaterThan(0)
      for (const p of feature.platforms) expect(PLATFORMS, `${name}: ${p}`).toContain(p)
      for (const file of feature.files) expect(existsSync(join(ROOT, file)), `${name}: ${file}`).toBe(true)
    }
  })

  it('a platform-exclusive feature is not exclusive to every platform (that would be no difference at all)', () => {
    for (const [name, feature] of Object.entries(registry.features)) expect(feature.platforms.length, name).toBeLessThan(PLATFORMS.length)
  })
})
