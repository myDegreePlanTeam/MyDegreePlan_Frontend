import { describe, it, expect } from 'vitest'
import PdfTitleBlock from '../components/PdfTitleBlock.jsx'

// The element tree the component returns, as text: enough to read which labels a printed heading carries.
const labels = props => JSON.stringify(PdfTitleBlock({ title: 'Degree map', catalogYear: '2026-2027', degree: 'B.S.', major: 'Computer Science', concentration: null, ...props }))

describe('the printed heading names the primary major', () => {
  it('says MAJOR for a student with one major', () => {
    expect(labels({})).toContain('"MAJOR"')
    expect(labels({})).not.toContain('PRIMARY MAJOR')
  })

  it('still says MAJOR when the only other program is a minor', () => {
    expect(labels({ alsoPrograms: [{ role: 'Minor', text: 'Mathematics' }] })).not.toContain('PRIMARY MAJOR')
  })

  it('says PRIMARY MAJOR, and lists the secondary major under it, once there is one', () => {
    const out = labels({ alsoPrograms: [{ role: 'Secondary major', text: 'Mechanical Engineering, B.S.M.E.' }] })
    expect(out).toContain('PRIMARY MAJOR')
    expect(out).toContain('Secondary major')
  })
})
