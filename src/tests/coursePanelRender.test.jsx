import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CoursePanel from '../components/CoursePanel'

// The course panel's info view for a course in a past, the current and a later term (see semesterRender.test.jsx for why
// this is a server render): the status follows the term, and nothing offers to change it.

const course = { code: 'CSC1300', name: 'Programming I', credits: 4, description: 'Intro.' }
const render = props => renderToStaticMarkup(
  <CoursePanel
    eyebrow="Fall 2024" title="CSC1300" subtitle="Programming I · 4 cr" course={course} courseMap={{ CSC1300: course }}
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
