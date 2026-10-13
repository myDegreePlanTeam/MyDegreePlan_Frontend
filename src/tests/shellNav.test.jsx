// shellNav.test.jsx
//
// Redesign Phase 2 (docs/claude/plans/PLAN_redesign.md): the shell has four destinations (Plan, Requirements, Advising, Settings), Issues
// is the Plan check list reached from the plan, and the rail is drawn with the new tokens at a size a thumb can hit. The Frontend has no DOM
// test environment: components render to static markup and the stylesheet is read as text.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Sidebar from '../components/shell/Sidebar'
import IssuesView from '../components/shell/IssuesView'
import { NAV_TABS } from '../components/shell/navTabs'

const css = readFileSync(fileURLToPath(new URL('../components/shell/AppShell.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const sidebarCss = css.slice(css.indexOf('/* -- Sidebar:'), css.indexOf('/* ── Main column'))
const phoneCss = css.slice(css.indexOf('@media (max-width: 760px) {'), css.indexOf('/* ── General-education progress'))

const render = props => renderToStaticMarkup(<Sidebar view="plan" onNavigate={() => {}} lastSavedAt={null} {...props} />)
const labelsOf = html => [...html.matchAll(/class="ds-tab-label">([^<]+)</g)].map(m => m[1])

describe('the rail', () => {
  it('has four destinations, in this order', () => {
    expect(NAV_TABS.map(t => t.label)).toEqual(['Plan', 'Requirements', 'Advising', 'Settings'])
    expect(labelsOf(render())).toEqual(['Plan', 'Requirements', 'Advising', 'Settings'])
  })

  it('has no Issues or Advisement tab and no count badge', () => {
    const html = render()
    expect(html).not.toContain('>Issues<')
    expect(html).not.toContain('Advisement')
    expect(html).not.toContain('ds-tab-badge')
  })

  it('marks the current destination for assistive technology', () => {
    const html = render({ view: 'settings' })
    expect([...html.matchAll(/aria-current="page"/g)].length).toBe(1)
    expect(html.split('<button').find(c => c.includes('aria-current="page"'))).toContain('>Settings<')
  })

  it('keeps the Plan tab marked while the Plan check list is open', () => {
    const html = render({ view: 'issues' })
    expect(html.split('<button').find(c => c.includes('aria-current="page"'))).toContain('>Plan<')
  })

  it('names the brand and says where the plan lives, with no avatar', () => {
    const html = render()
    expect(html).toContain('ds-brand-title')
    expect(html).toContain('On this device')
    expect(html).toContain('Changes save automatically')
    expect(html).not.toContain('ds-avatar')
  })

  it('says when it last saved', () => {
    const html = render({ lastSavedAt: new Date(2026, 9, 13, 14, 14) })
    expect(html).toMatch(/Saved at \d{1,2}:\d{2}/)
  })

  it('draws every destination with an SVG icon, never a glyph character', () => {
    const html = render()
    expect([...html.matchAll(/<svg[^>]*class="ds-tab-icon"[^>]*aria-hidden="true"/g)].length).toBe(4)
    for (const glyph of ['▤', '☑', '⚠', '◇', '◎']) expect(html).not.toContain(glyph)
  })
})

describe('the rail stylesheet', () => {
  it('reads colours from the redesign tokens, not the old ones', () => {
    expect(sidebarCss).toContain('var(--c-surface)')
    expect(sidebarCss).toContain('var(--c-tint)')
    expect(sidebarCss).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted)\b/)
  })

  it('sets the interface font, and no text under 13 px', () => {
    expect(sidebarCss).toContain('var(--font-ui)')
    for (const m of (sidebarCss + phoneCss).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
  })

  it('makes a tab at least 44 px tall, and a phone tab at least 52', () => {
    expect(sidebarCss).toMatch(/\.ds-sidebar \.ds-tab \{[^}]*min-height: var\(--target\)/)
    expect(phoneCss).toMatch(/\.ds-sidebar \.ds-tab \{[^}]*min-height: 52px/)
  })

  it('becomes a bottom bar on a phone and keeps the page clear of it', () => {
    expect(phoneCss).toMatch(/\.ds-sidebar \{[^}]*position: fixed[^}]*bottom: 0/)
    expect(phoneCss).toMatch(/\.ds-main \{ padding-bottom: calc\(64px \+ env\(safe-area-inset-bottom\)\)/)
  })

  it('draws the Plan check line and its button with the redesign tokens, the button readable and 44 px tall', () => {
    expect(css).toMatch(/\.ds-plancheck \{[^}]*background: var\(--c-tint\)/)
    expect(css).toMatch(/\.ds-plancheck \.ds-btn-ghost \{[^}]*min-height: var\(--target\)[^}]*color: var\(--c-link\)[^}]*border: 2px solid var\(--c-border-strong\)/)
  })

  it('draws a focus ring on every control for a keyboard user', () => {
    expect(css).toMatch(/\.ds-app :focus-visible \{ outline: 3px solid var\(--c-focus\)/)
  })
})

describe('Plan check (the list that used to be the Issues tab)', () => {
  const issues = [
    { id: 'a', severity: 'warning', title: 'Incomplete selection: Communications', where: 'FALL 2027', body: 'Choose a course.' },
    { id: 'b', severity: 'info', title: 'Incomplete selection: Natural Science', where: 'SPRING 2028', body: 'Choose a course.' },
  ]

  it('is named Plan check and counts things to review', () => {
    const html = renderToStaticMarkup(<IssuesView issues={issues} onOpenIssue={() => {}} onBack={() => {}} />)
    expect(html).toContain('Plan check')
    expect(html).toContain('2 things to review')
    expect(html).not.toContain('Validation')
    const visible = html.replace(/<[^>]+>/g, ' ')
    expect(visible).not.toMatch(/\bissues?\b/i)
  })

  it('says what needs fixing when something is blocked', () => {
    const html = renderToStaticMarkup(<IssuesView issues={[{ ...issues[0], severity: 'blocker' }]} onOpenIssue={() => {}} onBack={() => {}} />)
    expect(html).toContain('1 thing to review')
    expect(html).toContain('1 needs fixing')
  })

  it('offers a way back to the plan, and an all-clear when there is nothing', () => {
    const html = renderToStaticMarkup(<IssuesView issues={[]} onOpenIssue={() => {}} onBack={() => {}} />)
    expect(html).toContain('Back to plan')
    expect(html).toContain('Nothing to review')
    expect(html).toContain('All clear')
  })
})
