// terminology.test.js
//
// Source scans that keep the app's wording right across its three platforms. The Frontend has no DOM test environment, so these
// read the source. Each rule exists because the wrong wording shipped once; a failure says what to use instead.
//
//   1. Words that are only true on one platform live in lib/platform.js, nowhere else.
//   2. The Settings dialog switches among ALL degree programs (other majors too), so it never calls them "concentrations".
//   3. The institution's name comes from lib/brand.js where a brand string exists for it.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      // src/data holds the generated catalog JSON; src/lib/data is real code and is scanned.
      if (!['tests', '__tests__'].includes(name) && path !== join(SRC, 'data')) sourceFiles(path, out)
    } else if (/\.(js|jsx)$/.test(name)) out.push(path)
  }
  return out
}

const rel = path => relative(SRC, path).split(sep).join('/')
const read = path => readFileSync(path, 'utf8')

// A line that is only a comment is documentation, not wording a student reads.
const isComment = line => /^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line)

describe('platform words live in lib/platform.js', () => {
  // Only true on some platforms: use platformWords(platform) instead.
  const PLATFORM_ONLY = [
    [/this browser/i, "say where the plan lives with platformWords(platform).where (the desktop app is not a browser)"],
    [/this site'?s? data/i, 'use platformWords(platform).backupText'],
    [/refresh the page/i, 'use platformWords(platform).reloadHint (the desktop app has no page to refresh)'],
    [/reload(ing)? the page|Reload page/, 'use platformWords(platform).errorReload / reloadButton'],
    [/another phone/i, 'use platformWords(platform).backupText'],
  ]

  it('no other file hard-codes them', () => {
    const hits = []
    for (const file of sourceFiles()) {
      if (rel(file) === 'lib/platform.js') continue
      read(file).split(/\r?\n/).forEach((line, i) => {
        if (isComment(line)) return
        for (const [pattern, fix] of PLATFORM_ONLY) if (pattern.test(line)) hits.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}  -> ${fix}`)
      })
    }
    expect(hits).toEqual([])
  })
})

describe('Settings says "degree program", never "concentration", for the thing a student changes', () => {
  // What may still contain the word in SettingsView.jsx: identifiers, database names, and the search box that lists both kinds.
  const ALLOWED = [
    /onOpenConcentration/, /ConcentrationModal/, /concentration_id/, /from\('concentrations'\)/, /profile\.concentrations/,
    /majors and concentrations/,
  ]

  it('SettingsView.jsx has no generic "concentration" wording', () => {
    const hits = []
    read(join(SRC, 'components/shell/SettingsView.jsx')).split(/\r?\n/).forEach((line, i) => {
      if (isComment(line) || !/concentration/i.test(line)) return
      if (!ALLOWED.some(pattern => pattern.test(line))) hits.push(`SettingsView.jsx:${i + 1}: ${line.trim().slice(0, 100)}`)
    })
    expect(hits, 'use "degree program" (the dialog also switches between majors)').toEqual([])
  })

  it('the dialog and its button are worded "degree program"', () => {
    const text = read(join(SRC, 'components/shell/SettingsView.jsx'))
    expect(text).toContain('Change degree program')
    expect(text).toContain("'Choose a degree program'")
    expect(text).toContain('Degree program</span>')
    expect(text).not.toMatch(/\bnoun\b/)
  })
})

describe('the institution name comes from lib/brand.js', () => {
  it('no error message hard-codes "the TTU catalog" (the neutral brand says "course catalog")', () => {
    const hits = []
    for (const file of sourceFiles()) {
      if (rel(file) === 'lib/brand.js') continue
      read(file).split(/\r?\n/).forEach((line, i) => {
        if (!isComment(line) && /the TTU catalog/.test(line)) hits.push(`${rel(file)}:${i + 1}`)
      })
    }
    expect(hits, 'use getBrand().catalogName').toEqual([])
  })
})
