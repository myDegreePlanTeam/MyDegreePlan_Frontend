import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ProgramPicker from '../components/ProgramPicker'

// A render smoke test for the picker's first screen (the server renderer shows a component's initial state: no clicks).
// The behavior behind the clicks is in programBrowser.test.js and catalogYears.test.js; this covers that the component renders
// the levels it should for the programs it is given, and fails loudly where it must (a loading skeleton, an error).

const program = (id, code, name, over = {}) => ({
  id, code, name, major_name: over.major_name ?? name, degree: 'B.S.', department: 'CSC', college: 'engineering', major_code: over.major_name ? over.major_name.toLowerCase().replace(/\W+/g, '_') : code,
  is_base: false, description: `About ${name}`, last_catalog_year: null, aliases: null, ...over,
})
const plans = [1, 2, 3, 4, 5].map(id => ({ id, concentration_id: id, catalog_year: '2026-2027', covers_earlier: false }))
const render = props => renderToStaticMarkup(<ProgramPicker programs={[]} plans={plans} value={null} onChange={() => {}} {...props} />)

describe('ProgramPicker', () => {
  it('with one college, skips the college level and lists the majors', () => {
    const html = render({ programs: [program(1, 'cs', 'Computer Science', { is_base: true }), program(2, 'me', 'Mechanical Engineering', { is_base: true })] })
    expect(html).not.toContain('program-college')
    expect(html).toContain('Majors')
    expect(html).toContain('Computer Science, B.S.')
    expect(html).toContain('no concentrations')
    expect(html).toContain('Search majors and concentrations')
  })

  it('with several colleges, lists them first with their number of majors, and no majors until one is chosen', () => {
    const html = render({ programs: [
      program(1, 'cs', 'Computer Science', { is_base: true }),
      program(2, 'bio_bot', 'Botany', { major_name: 'Biology', college: 'cas' }),
      program(3, 'bio_zool', 'Zoology', { major_name: 'Biology', college: 'cas' }),
    ] })
    expect(html).toContain('program-college')
    expect(html).toContain('Arts &amp; Sciences')
    expect(html).toContain('1 major')
    expect(html).toContain('Engineering')
    expect(html).not.toContain('program-major')
  })

  it('shows the selection as a path, and the concentrations of a selected major', () => {
    const programs = [program(1, 'cs', 'Computer Science', { is_base: true, major_name: 'Computer Science', major_code: 'cs_major' }), program(2, 'cyber', 'CSC Cybersecurity', { major_name: 'Computer Science', major_code: 'cs_major' })]
    const html = render({ programs, value: 'cyber' })
    expect(html).toContain('Your program')
    expect(html).toContain('Engineering › Computer Science › CSC Cybersecurity')
    expect(html).toContain('Concentration (optional)')
    expect(html).toContain('No concentration')
    expect(html).toContain('aria-pressed="true"')
  })

  it('grays out a major that is not ready, with a Coming soon tag, and leaves a ready one clickable', () => {
    const html = render({ programs: [program(1, 'cs', 'Computer Science', { is_base: true }), program(2, 'me', 'Mechanical Engineering', { is_base: true, department: 'MNE' })] })
    const buttons = html.match(/<button[^>]*program-major[^>]*>/g)
    expect(buttons).toHaveLength(2)
    expect(buttons.filter(b => b.includes('disabled'))).toHaveLength(1)
    expect(html).toContain('Coming soon')
    expect(html.match(/<button[^>]*program-major[^>]*>(?:(?!<\/button>).)*Computer Science(?:(?!<\/button>).)*<\/button>/)[0]).not.toContain('Coming soon')
  })

  it('dims a college with no ready major but keeps it open to browse', () => {
    const html = render({ programs: [
      program(1, 'cs', 'Computer Science', { is_base: true }),
      program(2, 'bio', 'Biology', { is_base: true, college: 'cas', department: 'BIOL' }),
    ] })
    const colleges = html.match(/<button[^>]*program-college[^>]*>/g)
    expect(colleges).toHaveLength(2)
    expect(colleges.filter(b => b.includes('program-soon'))).toHaveLength(1)
    expect(colleges.some(b => b.includes('disabled'))).toBe(false)
  })

  it('a major whose concentrations are all required says so', () => {
    const programs = [program(1, 'bot', 'Botany', { major_name: 'Biology', major_code: 'biology', college: 'cas' }), program(2, 'zool', 'Zoology', { major_name: 'Biology', major_code: 'biology', college: 'cas' })]
    expect(render({ programs, value: 'zool' })).toContain('Choose your concentration')
  })

  it('keeps a closed program behind a disclosure, unless it is the selection', () => {
    const programs = [program(1, 'new', 'New Program', { is_base: true }), program(2, 'old', 'Old Program', { is_base: true, last_catalog_year: '2025-2026' })]
    const oldPlans = [{ id: 1, concentration_id: 1, catalog_year: '2026-2027' }, { id: 2, concentration_id: 2, catalog_year: '2025-2026' }]
    const hidden = render({ programs, plans: oldPlans })
    expect(hidden).toContain('Show closed programs')
    expect(hidden).not.toContain('Old Program')
    const chosen = render({ programs, plans: oldPlans, value: 'old' })
    expect(chosen).not.toContain('Show closed programs')
    expect(chosen).toContain('Old Program')
  })

  it('drops a program that has no plan, and shows a skeleton while loading and the error when it fails', () => {
    expect(render({ programs: [program(9, 'noplan', 'No Plan Yet')] })).not.toContain('No Plan Yet')
    expect(render({ loading: true })).toContain('sk-pulse')
    expect(render({ error: 'boom' })).toContain('Could not load programs: boom')
  })
})
