import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DndContext } from '@dnd-kit/core'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Semester from '../components/Semester'
import StatusChip from '../components/shell/StatusChip'
import { STATUS_TONES } from '../components/shell/statusTones'
import { DragEnabledContext, PHONE_QUERY } from '../lib/dragEnabled'

// A render test: the semester card to HTML, for the states the plan view puts it in (the server renderer shows a component's
// first render only: no effects, no clicks). It would have caught a variable used before it was defined, which lint did not.
//
// Redesign Phase 3b: the header says where the semester stands (Now, In progress, Planned, Done) and its hours; a row says nothing about
// status unless it is an exception (Blocked, Needs attention) or an open pick ("Pick a course").

const slots = [
  { id: 1, class_code: 'CSC1300', is_pool: false, semester_number: 1 },
  { id: 2, class_code: 'HUMANITIES', is_pool: true, semester_number: 1 },
]
const courseMap = { CSC1300: { code: 'CSC1300', name: 'Programming I', credits: 4 } }

const render = props => renderToStaticMarkup(
  <DndContext>
    <Semester
      semesterNumber={1} slots={slots} courseMap={courseMap} planSlots={{ 2: 'HIST2010' }}
      onSelectSlot={() => {}} onSelectFreeAdd={() => {}} onSelectRemainder={() => {}} onAddCourse={() => {}} onNoteSave={() => {}}
      termLabel="Fall 2024" {...props}
    />
  </DndContext>
)
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const css = readFileSync(fileURLToPath(new URL('../components/shell/AppShell.css', import.meta.url)), 'utf8').replace(/\r\n/g, '\n')

describe('Semester card', () => {
  it('a past semester with nothing flagged is Done', () => {
    const html = render({ isPast: true })
    expect(text(html)).toContain('Done')
    expect(html).toContain('ds-chip-done')
    expect(html).toContain('ds-sem-done')
  })

  it('a past semester with an issue, or an unchosen pool course, is not Done', () => {
    expect(render({ isPast: true, issueCount: 1 })).not.toContain('ds-chip-done')
    expect(render({ isPast: true, planSlots: {} })).not.toContain('ds-chip-done')
  })

  it('a semester that is not over is never Done', () => {
    expect(render({ isPast: false })).not.toContain('ds-chip-done')
  })

  it('has no completion buttons: nothing is marked, the calendar decides', () => {
    for (const props of [{ isPast: true }, { isPast: false }, { isCurrent: true }]) {
      const html = render({ isExpanded: true, ...props })
      expect(html).not.toContain('Mark complete')
      expect(html).not.toContain('Undo complete')
    }
  })

  it('names the current semester with a marker and In progress, and the graduation semester', () => {
    const html = render({ isCurrent: true, isGraduation: true })
    expect(html).toContain('ds-sem-now')
    expect(text(html)).toMatch(/Fall 2024 Now .*In progress/)
    expect(text(html)).toContain('Graduation')
  })

  it('says Planned on an open later semester, and nothing on a collapsed one', () => {
    expect(text(render({ isExpanded: true }))).toContain('Planned')
    expect(text(render({ isExpanded: false }))).not.toContain('Planned')
  })

  it('shows a removable semester only when it is empty', () => {
    expect(render({ isExpanded: true, slots: [], onDelete: () => {} })).toContain('Remove semester')
    expect(render({ isExpanded: true, onDelete: () => {} })).not.toContain('Remove semester')
  })

  it('says hours, never cr, in the header and on a row', () => {
    const t = text(render({ isExpanded: true }))
    expect(t).toMatch(/\d+ hours/)
    expect(t).toContain('4 hours')
    expect(t).not.toMatch(/\bcr\b/)
  })

  it('writes a course code as the catalog does, with its title', () => {
    const t = text(render({ isExpanded: true }))
    expect(t).toContain('CSC 1300')
    expect(t).toContain('Programming I')
  })

  it('has no status dot, no all-caps flag and no plus sign on its buttons', () => {
    const html = render({ isExpanded: true, flags: { picks: 1, needed: null, blocked: 0, advice: 0 } })
    expect(html).not.toContain('ds-dot')
    expect(html).not.toContain('ds-sem-flag')
    expect(text(html)).toContain('Add course')
    expect(text(html)).toContain('Add a note')
    expect(text(html)).not.toContain('+ Add')
  })

  it('collapsed, a semester is one line: no rows, but still its picks', () => {
    const html = render({ isExpanded: false, flags: { picks: 2, needed: null, blocked: 0, advice: 0 } })
    expect(html).not.toContain('ds-row')
    expect(html).not.toContain('ds-sem-foot')
    expect(text(html)).toContain('2 picks to make')
    expect(html).toContain('aria-expanded="false"')
  })
})

describe('Semester rows', () => {
  const open = props => render({ isExpanded: true, ...props })

  it('an ordinary course has no chip and no Pick a course', () => {
    const html = open({ planSlots: { 2: 'HIST2010' } })
    expect(html).not.toContain('ds-chip-blocked')
    expect(html).not.toContain('ds-chip-attention')
    expect(html).not.toContain('Pick a course')
  })

  it('an open pick says Pick a course, in the requirement\'s own name', () => {
    const html = open({ planSlots: {} })
    expect(text(html)).toContain('Pick a course')
    expect(html).toContain('ds-row-code-pool')
  })

  it('an open pick that a later course depends on says so, in the attention colour', () => {
    const html = open({ planSlots: {}, pickNeeds: { 2: ['CSC3040'] } })
    expect(text(html)).toContain('CSC 3040 needs this first')
    expect(html).toContain('ds-row-note-attention')
  })

  it('an unmet prerequisite is Blocked, with the reason', () => {
    const html = open({ prereqWarnings: { 1: ['CSC1300'] } })
    expect(html).toContain('ds-chip-blocked')
    expect(text(html)).toMatch(/Needs .* in an earlier term/)
  })

  it('a science conflict needs attention', () => {
    const html = open({ scienceWarnings: { 1: { type: 'conflict' } } })
    expect(html).toContain('ds-chip-attention')
    expect(text(html)).toContain('Science sequence conflict')
  })

  it('a problem outranks an empty pick: it is never hidden behind Pick a course', () => {
    const html = open({ planSlots: {}, prereqWarnings: { 2: ['CSC1300'] } })
    expect(html).toContain('ds-chip-blocked')
    expect(text(html)).not.toContain('Pick a course')
  })

  it('names the programs a course serves, when the plan follows several', () => {
    const html = open({ programTags: { 1: ['CSC', 'MATH'] } })
    expect(html).toContain('aria-label="Counts toward CSC and MATH"')
  })
})

describe('the header flags', () => {
  const head = flags => text(render({ isExpanded: false, flags }))

  it('says how many picks, and why when a later course depends on one', () => {
    expect(head({ picks: 1, needed: ['CSC3040'], blocked: 0, advice: 0 })).toContain('1 pick to make, needed for CSC 3040')
    expect(head({ picks: 3, needed: null, blocked: 0, advice: 0 })).toContain('3 picks to make')
    expect(head({ picks: 3, needed: null, blocked: 0, advice: 0 })).not.toContain('needed for')
  })

  it('shows Blocked for an unmet requisite, and Needs attention for other advice', () => {
    const blocked = render({ isExpanded: false, flags: { picks: 0, needed: null, blocked: 1, advice: 2 } })
    expect(blocked).toContain('ds-chip-blocked')
    expect(blocked).not.toContain('ds-chip-attention')
    expect(render({ isExpanded: false, flags: { picks: 0, needed: null, blocked: 0, advice: 2 } })).toContain('ds-chip-attention')
  })

  it('says nothing when there are no flags', () => {
    const html = render({ isExpanded: false, flags: null })
    expect(html).not.toContain('ds-sem-picks')
    expect(html).not.toContain('ds-chip-blocked')
  })
})

describe('StatusChip', () => {
  it('draws five tones, each with an icon and a word', () => {
    expect(STATUS_TONES).toEqual(['done', 'progress', 'planned', 'attention', 'blocked'])
    for (const tone of STATUS_TONES) {
      const html = renderToStaticMarkup(<StatusChip tone={tone} />)
      expect(html).toContain(`ds-chip-${tone}`)
      expect(html).toContain('<svg')
      expect(html).toContain('aria-hidden="true"')
      expect(text(html).length).toBeGreaterThan(3)
    }
  })

  it('renders nothing for an unknown tone', () => {
    expect(renderToStaticMarkup(<StatusChip tone="nope" />)).toBe('')
  })
})

describe('the semester card stylesheet', () => {
  // two stretches: the card itself, and its footer (other phases' rules, such as the what-if lines, sit between them)
  const block = css.slice(css.indexOf('/* -- Semester card (redesign Phase 3b)'), css.indexOf('.ds-row-dim'))
    + css.slice(css.indexOf('.ds-sem-noteedit {'), css.indexOf('.ds-add-sem:hover'))

  it('reads the redesign tokens and the interface font, not the old gold', () => {
    expect(block).toContain('var(--c-surface)')
    expect(block).toContain('var(--font-ui)')
    expect(block).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted|status-[a-z]+|danger)\b/)
  })

  it('sets no text under 13 px and makes the header and the pick look 44 px or more', () => {
    for (const m of block.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
    expect(block).toMatch(/\.ds-sem-head \{[^}]*min-height: 64px/)
    expect(block).toMatch(/\.ds-row-pick \{[^}]*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-sem-foot button \{[^}]*min-height: var\(--target\)/)
  })

  it('draws the plan as one column of semesters', () => {
    expect(css).toMatch(/\.ds-grid \{ display: flex; flex-direction: column;/)
    expect(css).not.toMatch(/\.ds-grid \{[^}]*grid-template-columns/)
  })

  it('colours the five chips with a status colour on its own tint', () => {
    for (const s of ['done', 'progress', 'planned', 'attention', 'blocked']) {
      expect(block).toMatch(new RegExp(`\\.ds-chip-${s}\\s+\\{[^}]*background: var\\(--c-${s}-bg\\)[^}]*color: var\\(--c-${s}\\)`))
    }
  })
})

describe('Semester drag on a phone', () => {
  it('has a phone breakpoint and a drag context to render under', () => {
    expect(PHONE_QUERY).toContain('760px')
    const html = renderToStaticMarkup(
      <DragEnabledContext.Provider value={false}>
        <DndContext>
          <Semester
            semesterNumber={1} slots={slots} courseMap={courseMap} planSlots={{ 2: 'HIST2010' }} isExpanded
            onSelectSlot={() => {}} onSelectFreeAdd={() => {}} onSelectRemainder={() => {}} onAddCourse={() => {}} onNoteSave={() => {}}
            termLabel="Fall 2024"
          />
        </DndContext>
      </DragEnabledContext.Provider>,
    )
    expect(html).toContain('ds-row')
  })
})
