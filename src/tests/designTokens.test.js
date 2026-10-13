// designTokens.test.js
//
// Phase 1 of docs/claude/plans/PLAN_redesign.md. The redesign's colour tokens (`--c-*` in src/index.css) are measured here, so a later edit
// that makes text hard to read, or a border too faint to find, fails a test instead of reaching a student. It also keeps the fonts
// self-hosted: the Windows app and the Docker web container allow fonts only from the page's own origin (font-src 'self'), so a link to a
// font service silently falls back to system faces there.
//
// The Frontend has no DOM test environment, so this reads the source.

import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SRC = join(ROOT, 'src')
const css = readFileSync(join(SRC, 'index.css'), 'utf8').replace(/\r\n/g, '\n')

// ── WCAG 2 contrast ratio between two #rrggbb colours
const channel = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ── the `--c-*` tokens of the :root block (dark) and of :root[data-theme="light"]
function blockAfter(marker) {
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`index.css has no ${marker}`)
  const end = css.indexOf('\n}', start)
  return css.slice(start, end)
}
function tokens(block) {
  const out = {}
  for (const m of block.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2].toUpperCase()
  return out
}
const THEMES = { dark: tokens(blockAfter(':root {')), light: tokens(blockAfter(':root[data-theme="light"] {')) }

const TOKEN_NAMES = [
  'page', 'surface', 'surface-2', 'hairline', 'border-strong', 'text', 'text-2', 'text-3', 'primary', 'on-primary', 'link', 'focus',
  'done', 'done-bg', 'progress', 'progress-bg', 'planned', 'planned-bg', 'attention', 'attention-bg', 'blocked', 'blocked-bg', 'marker', 'on-marker',
]
const STATUSES = ['done', 'progress', 'planned', 'attention', 'blocked']

// [label, foreground token, background token, minimum ratio]. 4.5 is WCAG 1.4.3 for text; 3 is 1.4.11 for the border of a control and for a focus ring.
const PAIRS = [
  ['text on page',                  'text',          'page',       4.5],
  ['text on surface',               'text',          'surface',    4.5],
  ['text-2 on page',                'text-2',        'page',       4.5],
  ['text-2 on surface',             'text-2',        'surface',    4.5],
  ['text-3 on page',                'text-3',        'page',       4.5],
  ['text-3 on surface',             'text-3',        'surface',    4.5],
  ['text-3 on surface-2',           'text-3',        'surface-2',  4.5],
  ['label on the primary fill',     'on-primary',    'primary',    4.5],
  ['link on surface',               'link',          'surface',    4.5],
  ['link on page',                  'link',          'page',       4.5],
  ['label on the "now" marker',     'on-marker',     'marker',     4.5],
  ['input border on surface',       'border-strong', 'surface',    3],
  ['input border on page',          'border-strong', 'page',       3],
  ['focus ring on surface',         'focus',         'surface',    3],
  ['focus ring on page',            'focus',         'page',       3],
  ['primary fill on surface',       'primary',       'surface',    3],
  ...STATUSES.flatMap(s => [
    [`${s} text on its tint`,       s,               `${s}-bg`,    4.5],
    [`${s} text on surface`,        s,               'surface',    4.5],
    [`${s} text on page`,           s,               'page',       4.5],
  ]),
]

describe('redesign colour tokens', () => {
  for (const theme of ['dark', 'light']) {
    describe(theme, () => {
      it('defines every token as a six-digit hex', () => {
        for (const name of TOKEN_NAMES) expect(THEMES[theme][name], `--c-${name}`).toMatch(/^#[0-9A-F]{6}$/)
      })

      it.each(PAIRS)('%s', (label, fg, bg, min) => {
        const value = ratio(THEMES[theme][fg], THEMES[theme][bg])
        expect(value, `${label}: ${THEMES[theme][fg]} on ${THEMES[theme][bg]} is ${value.toFixed(2)}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min)
      })
    })
  }

  it('keeps gold out of the status colours: the marker is a fill, never one of the five statuses', () => {
    for (const theme of ['dark', 'light']) for (const s of STATUSES) expect(THEMES[theme][s]).not.toBe(THEMES[theme].marker)
  })
})

describe('type and space tokens', () => {
  it('has no type step under 13 px', () => {
    const sizes = [...css.matchAll(/--fs-[a-z]+:\s*(\d+)px/g)].map(m => Number(m[1]))
    expect(sizes.length).toBeGreaterThanOrEqual(6)
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(13)
  })

  it('makes the smallest control 44 px', () => {
    expect(css).toMatch(/--target:\s*44px/)
  })
})

describe('self-hosted fonts', () => {
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map(m => m[0])

  it('declares the three families', () => {
    const families = new Set(faces.map(f => f.match(/font-family:\s*'([^']+)'/)?.[1]))
    expect([...families].sort()).toEqual(['Atkinson Hyperlegible', 'DM Mono', 'DM Serif Display'])
  })

  it('points every @font-face at a woff2 file that exists and is one', () => {
    expect(faces.length).toBeGreaterThanOrEqual(6)
    for (const face of faces) {
      const url = face.match(/url\('([^']+)'\)/)?.[1]
      expect(url, face).toMatch(/^\/fonts\/.+\.woff2$/)
      const file = join(ROOT, 'public', url.slice(1))
      expect(existsSync(file), url).toBe(true)
      expect(readFileSync(file).subarray(0, 4).toString('latin1'), `${url} is not woff2`).toBe('wOF2')
      expect(face, url).toMatch(/font-display:\s*swap/)
    }
  })

  it('ships the SIL Open Font License for each family', () => {
    for (const name of ['AtkinsonHyperlegible', 'DMMono', 'DMSerifDisplay']) {
      const file = join(ROOT, 'public', 'fonts', 'licenses', `${name}-OFL.txt`)
      expect(existsSync(file), name).toBe(true)
      expect(readFileSync(file, 'utf8')).toContain('SIL OPEN FONT LICENSE Version 1.1')
    }
  })

  it('never loads a font from a font service', () => {
    const offenders = []
    const scan = path => {
      const text = readFileSync(path, 'utf8')
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net/.test(text)) offenders.push(relative(ROOT, path).split(sep).join('/'))
    }
    scan(join(ROOT, 'index.html'))
    const walk = dir => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) { if (name !== 'tests' && name !== '__tests__') walk(path) }
        else if (/\.(js|jsx|css|html)$/.test(name)) scan(path)
      }
    }
    walk(SRC)
    expect(offenders).toEqual([])
  })

  it('loads the early theme script from a file, not inline (the Windows app and the Docker web container refuse inline scripts)', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(html).toContain('<script src="/theme-init.js"></script>')
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].filter(m => m[1].trim())
    expect(inline.length).toBe(0)
    expect(html).not.toMatch(/\sonload=/)
  })
})
