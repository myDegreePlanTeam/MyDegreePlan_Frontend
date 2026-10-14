import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import CoursePanel from '../components/CoursePanel'
import MoveList from '../components/MoveList'

// The course panel's info view for a course in a past, the current and a later term (see semesterRender.test.jsx for why
// this is a server render): the status follows the term, and nothing offers to change it.

const course = { code: 'CSC1300', name: 'Programming I', credits: 4, description: 'Intro.' }
const render = props => renderToStaticMarkup(
  <CoursePanel
    eyebrow="Fall 2024" title="CSC1300" subtitle="Programming I · 4 hours" course={course} courseMap={{ CSC1300: course }}
    prereqMap={{}} coreqMap={{}} status="planned" phase="future" warnings={{}} countsToward="Computer Science core"
    moveTargets={[]} isPool={false} isFreeAdd={false} picker={() => null}
    onMove={() => {}} onRemove={() => {}} onClose={() => {}}
    {...props}
  />
)

describe('CoursePanel, info view', () => {
  it('a course in a past term reads Passed and says how to retake it', () => {
    const html = render({ status: 'completed', phase: 'past' })
    expect(html).toContain('Passed')
    expect(html).toContain('This term is over, so the course counts as passed.')
    expect(html).toContain('move it to a later term to retake it.')
    expect(html).not.toContain('or remove it')   // a required course can be moved, not removed
  })

  it('a pool pick or an added course in a past term can also be removed', () => {
    expect(render({ status: 'completed', phase: 'past', isPool: true })).toContain('or remove it')
    expect(render({ status: 'completed', phase: 'past', isFreeAdd: true })).toContain('or remove it')
  })

  it('the current term reads In progress, a later one Planned, with no note for a later one', () => {
    const current = render({ status: 'in_progress', phase: 'current' })
    expect(current).toContain('In progress')
    expect(current).toContain('You are taking this course this term.')
    const future = render({})
    expect(future).toContain('Planned')
    expect(future).not.toContain('counts as passed')
    expect(future).not.toContain('You are taking')
  })

  it('has no status buttons: the status is not chosen', () => {
    const html = render({ status: 'planned', phase: 'future' })
    expect(html).not.toContain('ds-status-picker')
    expect(html).not.toContain('>In progress</button>')
    expect(html).not.toContain('>Completed</button>')
  })

  it('a missing prerequisite reads Prerequisite unmet whatever the term', () => {
    expect(render({ warnings: { prereq: ['CSC1200'] } })).toContain('Prerequisite unmet')
  })
})

describe('CoursePanel, details (redesign Phase 3c)', () => {
  const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  it('leads with Move to… and says hours, never cr', () => {
    const html = render({})
    expect(html.indexOf('Move to…')).toBeGreaterThan(-1)
    expect(html.indexOf('Move to…')).toBeLessThan(html.indexOf('ds-facts'))
    expect(text(html)).toContain('4 hours')
    expect(text(html)).not.toMatch(/\bcr\b/)
  })

  it('lists its facts as a description list, with the status as a chip with an icon', () => {
    const html = render({ status: 'in_progress', phase: 'current' })
    expect(html).toContain('<dl class="ds-facts">')
    expect(html).toContain('ds-chip-progress')
    expect(render({ warnings: { prereq: ['CSC1200'] } })).toContain('ds-chip-blocked')
  })

  it('names a blocked prerequisite in the blocked colour, and a science conflict as needing attention', () => {
    expect(render({ warnings: { prereq: ['CSC1200'] } })).toContain('ds-panel-alert-blocked')
    expect(render({ warnings: { science: { type: 'conflict' } } })).toContain('ds-panel-alert-attention')
  })

  it('closes with a word, not only a cross, and is labelled', () => {
    const html = render({})
    expect(text(html)).toContain('Close')
    expect(html).toContain('aria-label="Course details"')
  })

  it('has no gold, no all-caps labels and no status pill', () => {
    const html = render({})
    expect(html).not.toContain('ds-pill')
    expect(html).not.toContain('ds-eyebrow')
  })
})

describe('MoveList', () => {
  const targets = [
    { semNum: 1, name: 'Fall 2026', note: 'here', tone: 'here', disabled: true, isHere: true },
    { semNum: 2, name: 'Spring 2027', note: '12 → 16 hours', tone: 'ok', disabled: false },
    { semNum: 3, name: 'Summer 2027', note: 'Fall only', tone: 'bad', disabled: true },
    { semNum: 4, name: 'Fall 2027', note: 'breaks a requisite', tone: 'bad', disabled: false, reason: 'CSC 1300 comes first' },
  ]
  const html = renderToStaticMarkup(<MoveList targets={targets} chosen={2} onChoose={() => {}} labelledBy="h" />)

  it('is a radio group with one radio per term', () => {
    expect(html).toContain('role="radiogroup"')
    expect(html.match(/type="radio"/g)).toHaveLength(4)
  })

  it('checks the term it is in and the one chosen, and disables a term the course cannot go to', () => {
    expect(html.match(/checked=""/g)).toHaveLength(2)
    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain('ds-move-chosen')
  })

  it('shows hours, never cr, and the reason on a term that breaks a requisite', () => {
    expect(html).toContain('12 → 16 hours')
    expect(html).toContain('title="CSC 1300 comes first"')
  })
})

describe('the details stylesheet', () => {
  const css = readFileSync(fileURLToPath(new URL('../components/shell/AppShell.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
  const block = css.slice(css.indexOf('/* -- Course details (redesign Phase 3c)'), css.indexOf('/* SlotModal rendered inside the panel'))

  it('reads the redesign tokens only', () => {
    expect(block).toContain('var(--c-surface)')
    expect(block).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted|status-[a-z]+|danger)\b/)
  })

  it('sets no text under 13 px and gives every control 44 px', () => {
    for (const m of block.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
    expect(block).toMatch(/\.ds-panel-close \{[^}]*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-panel \.ds-btn-primary \{[^}]*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-move \{[^}]*min-height: var\(--target\)/)
  })

  it('is a bottom sheet on a phone, above the tab bar', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 760px)'))
    expect(phone).toMatch(/\.ds-panel \{[^}]*bottom: calc\(56px/)
  })
})
