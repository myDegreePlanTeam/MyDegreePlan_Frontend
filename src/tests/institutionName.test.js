// institutionName.test.js
//
// MyDegreePlan names no institution. The product is "MyDegreePlan"; the words around the app come from lib/brand.js (which an install can
// override), and nothing else we write may name a school: not the UI, the page title, a message, a comment, a CSS variable or a test.
//
// Not covered, on purpose: src/data. The bundled catalog is the university's own published content (its course titles and descriptions,
// and its colleges' web addresses), which is source data, not wording we wrote; it is regenerated from the catalog by `npm run build:catalog`.
//
// The patterns are assembled from pieces so that this file does not contain the words it forbids.

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

const FORBIDDEN = [
  new RegExp(['tenn', 'essee\\s+tech'].join(''), 'i'),     // the name in full, including "...Technological University"
  new RegExp(['\\b', 'tt', 'u\\b'].join(''), 'i'),          // its abbreviation, as a word
  new RegExp(['tn', 'tech'].join(''), 'i'),                 // its web domain
  new RegExp(['\\bT-', 'Number\\b'].join('')),              // its student-ID term (the PDF says "Student ID")
]

// What we ship or run, as paths relative to the Frontend root. Directories are scanned recursively.
const SCAN = ['src', 'index.html', 'public', 'scripts', 'parity', 'vite.config.js', 'eslint.config.js', 'package.json', 'README.md', '.github']
const SKIP_DIRS = new Set(['node_modules', 'out', 'dist'])
const SKIP_FILES = new Set(['package-lock.json'])
const TEXT = /\.(js|jsx|mjs|cjs|css|html|json|md|yml|yaml|svg|txt)$/

function files(path, out = []) {
  const full = join(ROOT, path)
  if (!existsSync(full)) return out
  if (statSync(full).isFile()) { if (TEXT.test(path) && !SKIP_FILES.has(path)) out.push(full); return out }
  for (const name of readdirSync(full)) {
    const child = join(path, name)
    if (statSync(join(ROOT, child)).isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      if (child === join('src', 'data')) continue          // the bundled catalog: see the header
      files(child, out)
    } else if (TEXT.test(name) && !SKIP_FILES.has(name)) out.push(join(ROOT, child))
  }
  return out
}

describe('the app names no institution', () => {
  it('nothing we write mentions a school (UI text, messages, comments, identifiers, tests, tooling)', () => {
    const hits = []
    for (const file of SCAN.flatMap(path => files(path))) {
      read(file).split(/\r?\n/).forEach((line, i) => {
        if (FORBIDDEN.some(pattern => pattern.test(line))) hits.push(`${relative(ROOT, file).split(sep).join('/')}:${i + 1}: ${line.trim().slice(0, 100)}`)
      })
    }
    expect(hits, 'say MyDegreePlan, "the university" or "your university"; per-install wording belongs in lib/brand.js').toEqual([])
  })

  it('the scan really covers the code (it would catch a mention in a component)', () => {
    const scanned = SCAN.flatMap(path => files(path)).map(file => relative(ROOT, file).split(sep).join('/'))
    expect(scanned).toContain('src/components/Onboarding.jsx')
    expect(scanned).toContain('src/lib/brand.js')
    expect(scanned).toContain('index.html')
    expect(scanned).not.toContain('src/data/catalog.json')
  })

  it('the page is titled MyDegreePlan', () => {
    expect(read(join(ROOT, 'index.html'))).toMatch(/<title>MyDegreePlan<\/title>/)
  })
})

function read(path) { return readFileSync(path, 'utf8') }
