import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ProgramPicker from '../components/ProgramPicker'

// A render smoke test for each step of the picker (the server renderer shows a component's initial state: no clicks). Onboarding owns
// which step is showing and what is chosen; the behavior behind the clicks is in programPicker.test.js, programBrowser.test.js and
// catalogYears.test.js. This covers that each step draws the level it should for the programs it is given, and fails loudly where it
// must (a loading skeleton, an error).

const program = (id, code, name, over = {}) => ({
  id, code, name, major_name: over.major_name ?? name, degree: 'B.S.', department: 'CSC', college: 'engineering', major_code: over.major_name ? over.major_name.toLowerCase().replace(/\W+/g, '_') : code,
  is_base: false, description: `About ${name}`, last_catalog_year: null, aliases: null, ...over,
})
const plans = [1, 2, 3, 4, 5].map(id => ({ id, concentration_id: id, catalog_year: '2026-2027', covers_earlier: false }))
const render = props => renderToStaticMarkup(<ProgramPicker programs={[]} plans={plans} stage="major" value={null} {...props} />)

describe('ProgramPicker, the college step', () => {
  const programs = [
    program(1, 'cs', 'Computer Science', { is_base: true }),
    program(2, 'bio_bot', 'Botany', { major_name: 'Biology', college: 'cas' }),
    program(3, 'bio_zool', 'Zoology', { major_name: 'Biology', college: 'cas' }),
  ]

  it('lists the colleges with their number of majors, and no majors', () => {
    const html = render({ programs, stage: 'college', searchable: true })
    expect(html).toContain('program-college')
    expect(html).toContain('Arts &amp; Sciences')
    expect(html).toContain('1 major')
    expect(html).toContain('Engineering')
    expect(html).not.toContain('program-major')
    expect(html).not.toContain('program-concentrations')
    expect(html).toContain('Search majors and concentrations')
  })

  it('dims a college with no ready major but keeps it open to browse', () => {
    const html = render({ stage: 'college', programs: [program(1, 'cs', 'Computer Science', { is_base: true }), program(2, 'bio', 'Biology', { is_base: true, college: 'cas', department: 'BIOL' })] })
    const colleges = html.match(/<button[^>]*program-college[^>]*>/g)
    expect(colleges).toHaveLength(2)
    expect(colleges.filter(b => b.includes('program-soon'))).toHaveLength(1)
    expect(colleges.some(b => b.includes('disabled'))).toBe(false)
  })

  it('marks the chosen college', () => {
    const html = render({ programs, stage: 'college', collegeCode: 'cas' })
    expect(html.match(/<button[^>]*aria-pressed="true"[^>]*program-college[^>]*>|<button[^>]*program-college[^>]*aria-pressed="true"[^>]*>/g)).toHaveLength(1)
  })
})

describe('ProgramPicker, the major step', () => {
  it('with one college, lists the majors under "Majors"', () => {
    const html = render({ programs: [program(1, 'cs', 'Computer Science', { is_base: true }), program(2, 'me', 'Mechanical Engineering', { is_base: true })], searchable: true })
    expect(html).not.toContain('program-college')
    expect(html).toContain('Majors')
    expect(html).toContain('Computer Science, B.S.')
    expect(html).toContain('no concentrations')
  })

  it('with a college chosen among several, lists that college\'s majors only', () => {
    const programs = [program(1, 'cs', 'Computer Science', { is_base: true }), program(2, 'bio', 'Biology', { is_base: true, college: 'cas', department: 'BIOL' })]
    const html = render({ programs, collegeCode: 'cas' })
    expect(html).toContain('Majors in Arts &amp; Sciences')
    expect(html).toContain('Biology, B.S.')
    expect(html).not.toContain('Computer Science, B.S.')
    expect(html).not.toContain('Search majors')            // the search box is on the first step only
  })

  it('grays out a major that is not ready, with a Coming soon tag, and leaves a ready one clickable', () => {
    const html = render({ programs: [program(1, 'cs', 'Computer Science', { is_base: true }), program(2, 'me', 'Mechanical Engineering', { is_base: true, department: 'MNE' })] })
    const buttons = html.match(/<button[^>]*program-major[^>]*>/g)
    expect(buttons).toHaveLength(2)
    expect(buttons.filter(b => b.includes('disabled'))).toHaveLength(1)
    expect(html).toContain('Coming soon')
    expect(html.match(/<button[^>]*program-major[^>]*>(?:(?!<\/button>).)*Computer Science(?:(?!<\/button>).)*<\/button>/)[0]).not.toContain('Coming soon')
  })
})

describe('ProgramPicker, the concentration step', () => {
  const programs = [
    program(1, 'cs', 'Computer Science', { is_base: true, major_name: 'Computer Science', major_code: 'cs_major' }),
    program(2, 'cyber', 'CSC Cybersecurity', { major_name: 'Computer Science', major_code: 'cs_major' }),
  ]

  it('lists the concentrations of the chosen major, with "No concentration" for the base, and says the choice is optional', () => {
    const html = render({ programs, stage: 'concentration', majorKey: 'cs_major', value: 'cyber' })
    expect(html).toContain('Concentration (optional)')
    expect(html).toContain('No concentration')
    expect(html).toContain('CSC Cybersecurity')
    expect(html).toContain('aria-pressed="true"')
    expect(html).not.toContain('program-colleges')
  })

  it('shows the selection as a path', () => {
    const html = render({ programs, stage: 'concentration', majorKey: 'cs_major', value: 'cyber' })
    expect(html).toContain('Your program')
    expect(html).toContain('Engineering › Computer Science › CSC Cybersecurity')
  })

  it('a major whose concentrations are all required says so', () => {
    const bio = [program(1, 'bot', 'Botany', { major_name: 'Biology', major_code: 'biology', college: 'cas' }), program(2, 'zool', 'Zoology', { major_name: 'Biology', major_code: 'biology', college: 'cas' })]
    expect(render({ programs: bio, stage: 'concentration', majorKey: 'biology', value: 'zool' })).toContain('Choose your concentration')
  })
})

describe('ProgramPicker, whatever the step', () => {
  it('keeps a closed program behind a disclosure on the first step, unless it is the selection', () => {
    const programs = [program(1, 'new', 'New Program', { is_base: true }), program(2, 'old', 'Old Program', { is_base: true, last_catalog_year: '2025-2026' })]
    const oldPlans = [{ id: 1, concentration_id: 1, catalog_year: '2026-2027' }, { id: 2, concentration_id: 2, catalog_year: '2025-2026' }]
    const hidden = render({ programs, plans: oldPlans, searchable: true })
    expect(hidden).toContain('Show closed programs')
    expect(hidden).not.toContain('Old Program')
    const chosen = render({ programs, plans: oldPlans, value: 'old', searchable: true })
    expect(chosen).not.toContain('Show closed programs')
    expect(chosen).toContain('Old Program')
    expect(chosen).toContain('Hide closed programs')
    expect(hidden).not.toContain('Hide closed programs')
    // not offered on a later step, where it would only be noise
    expect(render({ programs, plans: oldPlans })).not.toContain('Show closed programs')
  })

  it('drops a program that has no plan, and shows a skeleton while loading and the error when it fails', () => {
    expect(render({ programs: [program(9, 'noplan', 'No Plan Yet')] })).not.toContain('No Plan Yet')
    expect(render({ loading: true })).toContain('sk-pulse')
    expect(render({ error: 'boom' })).toContain('Could not load programs: boom')
  })
})
