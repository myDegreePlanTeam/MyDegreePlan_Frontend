// redesignCleanup.test.js
//
// Redesign Phase 9: what the earlier phases left behind is gone, and stays gone. Every stylesheet reads the design tokens in index.css
// and nothing else; the old colour names (--gold, --navy, --bg, --white, --muted, --danger, --status-*, the *-rgb splits, the shell's
// --ds-* extras) are not defined and not used; no text is set under 13 px; nothing is set in all-caps; the code face is for codes.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function files(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (!['tests', '__tests__'].includes(name) && path !== join(SRC, 'data')) files(path, out)
    } else if (/\.(css|js|jsx)$/.test(name)) out.push(path)
  }
  return out
}
const rel = path => relative(SRC, path).split(sep).join('/')
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const all = files()
const sheets = all.filter(f => f.endsWith('.css'))

const OLD = '(gold|gold-light|navy|navy-mid|navy-light|white|muted|bg|bg-mid|bg-light|text|text-muted|danger|danger-light|status-[a-z-]+|[a-z-]+-rgb|ds-(header|card|hover|overlay|accent-bg|accent-bg-hover|on-accent|hairline|quiet-border|dashed|pill|pill-rgb|issue-rgb))'

describe('the old colour names', () => {
  it('are used nowhere: not in a stylesheet, not in a component (with or without a fallback value)', () => {
    const use = new RegExp(`var\\(--${OLD}\\s*[,)]`)
    const hits = []
    for (const file of all) {
      read(file).split('\n').forEach((line, i) => { if (use.test(line)) hits.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`) })
    }
    expect(hits, 'use a --c-* token from index.css').toEqual([])
  })

  it('are defined nowhere', () => {
    const define = new RegExp(`^\\s*--${OLD}\\s*:`)
    const hits = []
    for (const file of sheets) {
      read(file).split('\n').forEach((line, i) => { if (define.test(line)) hits.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`) })
    }
    expect(hits).toEqual([])
  })

  it('leave index.css with the fonts and the design tokens only', () => {
    const css = read(join(SRC, 'index.css'))
    const names = [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(m => m[1])
    expect(names.length).toBeGreaterThan(40)
    for (const name of names) expect(name, name).toMatch(/^--(c|fs|lh|sp|r|font)-|^--target$/)
    expect(css).toMatch(/body \{\s*background: var\(--c-page\);\s*color: var\(--c-text\);\s*font-family: var\(--font-ui\);/)
  })
})

describe('type, in every stylesheet', () => {
  it('is never under 13 px', () => {
    const hits = []
    for (const file of sheets) {
      for (const m of read(file).matchAll(/font-size:\s*([0-9]*\.?[0-9]+)(px|rem)\b/g)) {
        const px = Number(m[1]) * (m[2] === 'rem' ? 16 : 1)
        if (px < 13) hits.push(`${rel(file)}: ${m[0]}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('is never set in all-caps', () => {
    expect(sheets.filter(f => /text-transform:\s*uppercase/.test(read(f))).map(rel)).toEqual([])
  })

  it('uses the code face only where the rule names a code', () => {
    const hits = []
    for (const file of sheets) {
      for (const m of read(file).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim()
        if (/font-family:\s*var\(--font-mono\)/.test(m[2]) && !/code|mono|kbd|count|strong/.test(selector)) hits.push(`${rel(file)}: ${selector.slice(0, 80)}`)
      }
    }
    expect(hits).toEqual([])
  })
})

describe('dead styles', () => {
  it('the old first-run, semester-card and prior-credit rules are gone from Dashboard.css', () => {
    const css = read(join(SRC, 'components', 'Dashboard.css'))
    for (const cls of ['onboarding-card', 'onboarding-eyebrow', 'concentration-card', 'semester-card', 'degreeplan-header', 'prior-credits-panel', 'credit-bar-track', 'gen-ed-chip']) {
      expect(css, cls).not.toContain(`.${cls}`)
    }
    expect(css.split('\n').length).toBeLessThan(1200)
  })

  it('the old picker stylesheet is gone, and nothing imports it', () => {
    expect(all.map(rel)).not.toContain('components/ProgramPicker.css')
    expect(all.filter(f => /ProgramPicker\.css/.test(read(f))).map(rel)).toEqual([])
  })
})
