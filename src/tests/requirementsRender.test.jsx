// requirementsRender.test.jsx
//
// Redesign Phase 4: the Requirements screen. The audit and the projection behind it do not change (degreeAudit.test.js,
// requirementsReady.test.js); this pins how they are drawn: a "Requirements" title, sections with a count, a status as a chip,
// an open choice as "Pick a course", and hours written out.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import RequirementsView from '../components/shell/RequirementsView'
import { CategoryProgress } from '../components/shell/GenEdProgress'
import { freshStudent } from './support/realStudent.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const s = freshStudent('cybersecurity', 29)
const html = renderToStaticMarkup(<RequirementsView audit={s.audit} projection={s.projection} onOpenRow={() => {}} getOptions={() => null} />)
const t = text(html)

describe('the Requirements screen', () => {
  it('is titled Requirements, not Degree audit, with no all-caps eyebrow', () => {
    expect(html).toMatch(/<h2 class="ds-h2 ds-page-title">Requirements<\/h2>/)
    expect(t).not.toContain('Degree audit')
    expect(html).not.toContain('ds-eyebrow')
  })

  it('says how much of the degree is placed and how many picks are left', () => {
    const r = s.audit.summary.requirements
    const all = r.done + r.in_progress + r.planned + r.not_placed
    expect(t).toContain(`${all - r.not_placed} of ${all} requirements are done or placed in your plan`)
    expect(t).toContain(`${r.not_placed} course picks are still to make.`)
    expect(t).toContain(`${r.not_placed} to pick`)
  })

  it('gives every section a count', () => {
    for (const block of s.audit.blocks) {
      expect(t).toContain(block.title)
      if (block.total > 0) expect(t).toContain(`${block.counts.done} of ${block.total} done`)
    }
  })

  it('shows a placed requirement with a status chip and an open choice as Pick a course', () => {
    const rows = s.audit.blocks.flatMap(b => b.rows)
    const open = rows.filter(r => r.state === 'not_placed' && r.source !== 'prior_credit').length
    expect(open).toBeGreaterThan(0)
    expect(html.match(/class="ds-row-pick"/g)).toHaveLength(open)
    expect(html).toMatch(/ds-chip-(planned|progress|done)/)
    expect(html).not.toContain('ds-audit-mark')
    expect(t).not.toContain('Choose ›')
    expect(t).not.toContain('View ›')
  })

  it('writes hours out and codes as the catalog does', () => {
    expect(t).not.toMatch(/\bhrs\b/)
    expect(t).not.toMatch(/\bcr\b/)
    expect(t).toMatch(/\d hours/)
    expect(t).toContain('CSC 1300')
    expect(html).not.toMatch(/>CSC1300</)
  })

  it('leads the finish with a headline', () => {
    expect(html).toMatch(/<h3 class="ds-finish-big">/)
    expect(html).toContain('aria-label="When you finish"')
  })
})

describe('a general-education category', () => {
  it('says N of M hours and its state in words', () => {
    const row = { label: 'Humanities', earned: 3, done: 0, inProgress: 0, planned: 3, min: 6, max: 6, state: 'open' }
    const out = text(renderToStaticMarkup(<CategoryProgress row={row} />))
    expect(out).toContain('3 of 6 hours')
    expect(out).toContain('Not covered')
  })
})

describe('the Requirements stylesheet', () => {
  const css = read('../components/shell/AppShell.css')
  const block = css.slice(css.indexOf('/* -- Requirements (redesign Phase 4)'), css.indexOf('/* A phone does not drag'))
    + css.slice(css.indexOf('/* evidence: where a count comes from'), css.indexOf('/* the two Advisement documents'))

  it('reads the redesign tokens only', () => {
    expect(block).toContain('var(--c-surface)')
    expect(block).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted|text|status-[a-z-]+|danger|ds-hover)\)/)
  })

  it('sets no text under 13 px, and makes a row and its controls 44 px or more', () => {
    for (const m of block.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
    expect(block).toMatch(/\.ds-audit-line \{[^}]*min-height: 64px/)
    expect(block).toMatch(/\.ds-audit-options-toggle \{[^}]*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-finish-step \{[^}]*min-height: var\(--target\)/)
  })

  it('has no all-caps labels', () => {
    expect(block).not.toContain('text-transform: uppercase')
  })
})
