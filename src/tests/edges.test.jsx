// edges.test.jsx
//
// Redesign Phase 8: the screens around the plan. The loading skeletons have the shape of what follows them, the "could not be loaded"
// screen is a real screen with a way out, and the sign-in, error and update stylesheets read the redesign tokens.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { OnboardingSkeleton, DegreeplanSkeleton } from '../components/Skeletons'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')

describe('the loading skeletons', () => {
  it('first run loads inside first run\'s own card, with four step segments', () => {
    const html = renderToStaticMarkup(<OnboardingSkeleton />)
    expect(html).toContain('class="fr-shell"')
    expect(html).toContain('class="fr-card"')
    expect(html.match(/fr-progress-seg/g)).toHaveLength(4)
    expect(html).not.toContain('onboarding-')
    expect(html).toContain('aria-busy="true"')
  })

  it('the plan loads as it opens: one column, the first two semesters open, the rest one line', () => {
    const html = renderToStaticMarkup(<DegreeplanSkeleton />)
    const cards = html.match(/<div class="ds-sem(?: ds-sem-open)?">/g)
    expect(cards).toHaveLength(8)
    expect(cards.filter(c => c.includes('ds-sem-open'))).toHaveLength(2)
    expect(html.match(/class="sk-row"/g)).toHaveLength(10)
    expect(html.match(/class="sk-foot"/g)).toHaveLength(2)
    expect(html).not.toContain('sk-row-dot')
    expect(html).toContain('ds-plancheck-block')
    expect(html).toContain('ds-summary')
  })

  it('sizes its bars like the real header, rows and footer', () => {
    const css = read('../components/shell/AppShell.css')
    const block = css.slice(css.indexOf('/* -- Loading skeleton'), css.indexOf('.sk-account-name {'))
    expect(block).toMatch(/[.]sk-head [{][^}]*min-height: 64px/)
    expect(block).toMatch(/[.]sk-row [{][^}]*min-height: 64px/)
    expect(block).toMatch(/[.]sk-dp-btn\s+[{] height: var[(]--target[)]/)
    expect(block).not.toMatch(/var[(]--(bg-light|ds-hairline|navy-light)[)]/)
  })
})

describe('the plan could not be loaded', () => {
  const src = read('../pages/Dashboard.jsx')

  it('is a screen with a title, the error as an alert, and a button to reload', () => {
    expect(src).toContain('Your plan could not be loaded')
    expect(src).toContain('<p className="fr-error" role="alert">{error}</p>')
    expect(src).toMatch(/onClick=[{][(][)] => window[.]location[.]reload[(][)][}]>[{]words[.]reloadButton[}]/)
    expect(src).not.toContain('dashboard-error')
  })

  it('takes its reload words from lib/platform.js, and is registered as a platform branch', () => {
    expect(src).toContain('platformWords(platform)')
    expect(src).toContain('{words.reloadHint}')
    const registry = JSON.parse(read('../../parity/platform-branches.json'))
    expect(registry.branches['src/pages/Dashboard.jsx']).toMatchObject({ kind: 'words' })
  })
})

describe('the error screen', () => {
  it('names its toggle in words and says whether it is open', () => {
    const src = read('../components/ErrorBoundary.jsx')
    expect(src).toContain("'Hide technical details' : 'Show technical details'")
    expect(src).toContain('aria-expanded={showDetails}')
    expect(src).not.toMatch(/[▲▼]/)
  })
})

describe.each([
  ['sign-in and create-account', '../pages/Auth.css'],
  ['error screen', '../components/ErrorBoundary.css'],
  ['update card and banner', '../components/UpdateBanner.css'],
])('the %s stylesheet', (_name, file) => {
  const css = read(file)

  it('reads the redesign tokens, not the old colour names', () => {
    expect(css).toContain('var(--c-')
    expect(css).not.toMatch(/var[(]--(gold|gold-light|navy|navy-mid|navy-light|white|muted|bg|bg-mid|bg-light|text-muted|text|danger|danger-light|status-[a-z-]+|[a-z-]+-rgb)[)]/)
  })

  it('has no text under 13 px, no all-caps and no monospace body text', () => {
    for (const m of css.matchAll(/font-size:\s*([0-9.]+)(px|rem)/g)) {
      const px = Number(m[1]) * (m[2] === 'rem' ? 16 : 1)
      expect(px, m[0]).toBeGreaterThanOrEqual(13)
    }
    expect(css).not.toContain('text-transform: uppercase')
    expect(css).not.toContain('font-family: var(--font-mono)')
  })

  it('makes its controls 44 px', () => {
    expect(css).toMatch(/min-height: var[(]--target[)]/)
  })
})
