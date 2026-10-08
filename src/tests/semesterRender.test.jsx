import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DndContext } from '@dnd-kit/core'
import Semester from '../components/Semester'

// A render test: the semester card to HTML, for the states the plan view puts it in (the server renderer shows a component's
// first render only: no effects, no clicks). It would have caught a variable used before it was defined, which lint did not.

const slots = [
  { id: 1, class_code: 'CSC1300', is_pool: false, semester_number: 1 },
  { id: 2, class_code: 'HUMANITIES', is_pool: true, semester_number: 1 },
]
const courseMap = { CSC1300: { code: 'CSC1300', name: 'Programming I', credits: 4 } }

const render = props => renderToStaticMarkup(
  <DndContext>
    <Semester
      semesterNumber={1} slots={slots} courseMap={courseMap} planSlots={{ 2: 'HIST2010' }} planStatuses={{}}
      onSelectSlot={() => {}} onSelectFreeAdd={() => {}} onSelectRemainder={() => {}} onAddCourse={() => {}} onNoteSave={() => {}}
      termLabel="Fall 2024" {...props}
    />
  </DndContext>
)

describe('Semester card', () => {
  it('a past semester with nothing flagged is Done', () => {
    const html = render({ isPast: true })
    expect(html).toContain('Done ✓')
    expect(html).toContain('ds-sem-done')
  })

  it('a past semester with an issue, or an unchosen pool course, is not Done', () => {
    expect(render({ isPast: true, issueCount: 1 })).not.toContain('Done ✓')
    expect(render({ isPast: true, planSlots: {} })).not.toContain('Done ✓')
  })

  it('a semester that is not over is never Done', () => {
    expect(render({ isPast: false })).not.toContain('Done ✓')
  })

  it('has no completion buttons: nothing is marked, the calendar decides', () => {
    for (const props of [{ isPast: true }, { isPast: false }, { isCurrent: true }]) {
      const html = render({ isExpanded: true, ...props })
      expect(html).not.toContain('Mark complete')
      expect(html).not.toContain('Undo complete')
    }
  })

  it('names the current and the graduation semester, and shows the issue count', () => {
    const html = render({ isCurrent: true, isGraduation: true, issueCount: 2 })
    expect(html).toContain('Fall 2024 · Now · Graduate')
    expect(html).toContain('⚠ 2')
  })

  it('shows a removable semester only when it is empty', () => {
    expect(render({ isExpanded: true, slots: [], onDelete: () => {} })).toContain('Remove semester')
    expect(render({ isExpanded: true, onDelete: () => {} })).not.toContain('Remove semester')
  })
})
