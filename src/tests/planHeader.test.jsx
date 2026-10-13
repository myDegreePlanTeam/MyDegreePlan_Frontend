// planHeader.test.jsx
//
// Redesign Phase 3a (docs/claude/plans/PLAN_redesign.md): the plan opens with where the student finishes and how much of the degree is in
// the plan, then a Plan check strip that says how many picks are left and where to start. The Frontend has no DOM test environment:
// components render to static markup and the stylesheet is read as text.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import PlanSummary from '../components/shell/PlanSummary'
import PlanCheckStrip from '../components/shell/PlanCheckStrip'
import { summarizePlanCheck } from '../lib/planCheck'

const css = readFileSync(fileURLToPath(new URL('../components/shell/AppShell.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const block = css.slice(css.indexOf('/* -- Plan header, finish card and Plan check strip'))
const visible = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('the finish card', () => {
  const render = props => renderToStaticMarkup(
    <PlanSummary finish="Spring 2030" semesterCount={8} totalHours={120} hours={{ done: 0, inProgress: 15, planned: 68 }} {...props} />,
  )

  it('leads with where the student finishes', () => {
    const text = visible(render())
    expect(text).toContain('You finish Spring 2030')
    expect(text).toContain('8 semesters · 120 hours')
  })

  it('says how many hours are planned, as a sentence, and splits them', () => {
    const text = visible(render())
    expect(text).toContain('83 of 120 hours planned')
    expect(text).toMatch(/0 done/)
    expect(text).toMatch(/15 in progress/)
    expect(text).toMatch(/68 planned/)
    expect(text).toMatch(/37 in picks to make/)
  })

  it('describes the bar for assistive technology, in numbers', () => {
    expect(render()).toContain('aria-label="0 hours done, 15 in progress, 68 planned, 37 in picks still to make, of 120"')
  })

  it('leaves a zero out of the legend except done, and the picks line when nothing is left', () => {
    const text = visible(render({ hours: { done: 120, inProgress: 0, planned: 0 } }))
    expect(text).toContain('120 of 120 hours planned')
    expect(text).toMatch(/120 done/)
    expect(text).not.toMatch(/in progress|in picks to make/)
  })

  it('sizes the bar segments by hours and never past the whole', () => {
    const html = render({ hours: { done: 30, inProgress: 30, planned: 90 } })   // 150 hours in a 120 hour degree
    const widths = [...html.matchAll(/style="width:([\d.]+)%"/g)].map(m => Number(m[1]))
    expect(widths).toHaveLength(3)
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100.0001)
    expect(widths[0]).toBe(25)
  })

  it('says so when a degree has no finish date, and when other programs add hours', () => {
    const text = visible(render({ finish: null, extraNote: '18 more than CSC Cybersecurity alone' }))
    expect(text).toContain('No finish date yet')
    expect(text).toContain('(18 more than CSC Cybersecurity alone)')
  })

  it('uses the singular for one semester', () => {
    expect(visible(render({ semesterCount: 1 }))).toContain('1 semester ·')
  })
})

describe('the Plan check strip', () => {
  const pick = (label, dependents = [], order = 0) => ({ id: `p${label}`, kind: 'pick', label, dependents, severity: dependents.length ? 'warning' : 'info', title: `Incomplete selection: ${label}`, order })
  const render = (issues, props = {}) => renderToStaticMarkup(
    <PlanCheckStrip summary={summarizePlanCheck(issues)} onStart={() => {}} onOpenIssue={() => {}} onOpenList={() => {}} {...props} />,
  )

  it('says how many picks are left and where to start, with one filled button', () => {
    const html = render([pick('Communications', ['CSC3040']), pick('Natural Science', [], 1)])
    const text = visible(html)
    expect(text).toContain('2 course picks still to make')
    expect(text).toContain('Start with Communications: CSC 3040 depends on it.')
    expect([...html.matchAll(/ds-plancheck-start/g)]).toHaveLength(1)
    expect(text).toContain('See the list')
    expect(text).not.toMatch(/blocker|error|invalid/i)
  })

  it('is not an alarm: no problem line when everything flagged is a pick', () => {
    expect(render([pick('Communications', ['CSC3040'])])).not.toContain('ds-plancheck-problem')
  })

  it('puts a real problem on its own line above the picks, blockers first', () => {
    const html = render([
      { id: 'b', severity: 'blocker', title: 'CSC2310 prerequisite unmet', order: 0 },
      { id: 'a', severity: 'warning', title: 'Heavy course load', order: 1 },
      pick('Natural Science'),
    ])
    expect(html.indexOf('ds-plancheck-problem-blocker')).toBeLessThan(html.indexOf('ds-plancheck-problem-advice'))
    expect(html.indexOf('ds-plancheck-problem-advice')).toBeLessThan(html.indexOf('class="ds-plancheck"'))
    const text = visible(html)
    expect(text).toContain('1 needs fixing: CSC2310 prerequisite unmet')
    expect(text).toContain('Fix it')
    expect(text).toContain('1 to look at: Heavy course load')
  })

  it('with problems but no picks, still offers the list and no Start button', () => {
    const html = render([{ id: 'b', severity: 'blocker', title: 'CSC2310 prerequisite unmet', order: 0 }])
    expect(visible(html)).toContain('1 thing to review')
    expect(html).not.toContain('ds-plancheck-start')
    expect(visible(html)).toContain('See the list')
  })

  it('renders nothing when there is nothing to review', () => {
    expect(render([])).toBe('')
  })

  it('names the region for assistive technology', () => {
    expect(render([pick('Natural Science')])).toContain('role="region" aria-label="Plan check"')
  })
})

describe('the plan header stylesheet', () => {
  it('reads the redesign tokens and the interface font', () => {
    expect(block).toContain('var(--c-surface)')
    expect(block).toContain('var(--c-tint)')
    expect(block).toContain('var(--c-primary)')
    expect(block).toContain('var(--font-ui)')
    expect(block).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted)\b/)
  })

  it('sets no text under 13 px', () => {
    for (const m of block.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
  })

  it('makes every button in the strip at least 44 px tall', () => {
    for (const cls of ['.ds-plancheck-list', '.ds-plancheck-start', '.ds-plancheck-action']) {
      expect(block, cls).toMatch(new RegExp(`\\${cls} \\{[^}]*min-height: var\\(--target\\)`))
    }
  })

  it('colours the problem lines with a status colour on its own tint, so they pass the contrast test', () => {
    expect(block).toMatch(/\.ds-plancheck-problem-blocker \{[^}]*background: var\(--c-blocked-bg\)[^}]*color: var\(--c-blocked\)/)
    expect(block).toMatch(/\.ds-plancheck-problem-advice\s+\{[^}]*background: var\(--c-attention-bg\)[^}]*color: var\(--c-attention\)/)
  })

  it('keeps the page on the new background', () => {
    expect(css).toMatch(/\.ds-app \{[^}]*background: var\(--c-page\)/)
  })
})

describe('the interface font reaches the buttons', () => {
  it('overrides the app-wide monospace button rule for the strip, the credits row and the Plan check back link', () => {
    expect(css).toMatch(/\.ds-app button \{ font-family: var\(--font-mono\); \}/)
    const m = css.match(/(\.ds-app [^{]+)\{ font-family: var\(--font-ui\); \}/g) ?? []
    const rule = m.find(r => r.includes('.ds-plancheck-block button'))
    expect(rule).toBeTruthy()
    for (const sel of ['.ds-prior-head', '.ds-prior-add', '.ds-issues-back']) expect(rule).toContain(`.ds-app ${sel}`)
  })
})
