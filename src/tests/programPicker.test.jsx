import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ProgramPicker from '../components/ProgramPicker'

// A render smoke test of the first screen of first run (redesign Phase 7; the server renderer shows a component's initial state: no
// clicks). Onboarding owns what is chosen; the behavior behind the clicks is in programPickerModel.test.js, programBrowser.test.js and
// catalogYears.test.js. This covers what the screen draws for the programs it is given: search first, colleges as chips, the supported
// majors by college, the chosen major's concentrations in place, and where it must fail loudly (a loading skeleton, an error).

const program = (id, code, name, over = {}) => ({
  id, code, name, major_name: over.major_name ?? name, degree: 'B.S.', department: 'CSC', college: 'engineering', major_code: over.major_name ? over.major_name.toLowerCase().replace(/\W+/g, '_') : code,
  is_base: false, description: `About ${name}`, last_catalog_year: null, aliases: null, ...over,
})
const plans = [1, 2, 3, 4, 5].map(id => ({ id, concentration_id: id, catalog_year: '2026-2027', covers_earlier: false }))
const render = props => renderToStaticMarkup(<ProgramPicker programs={[]} plans={plans} value={null} {...props} />)
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const majorButtons = html => html.match(/<button[^>]*class="fr-major[^"]*"[^>]*>/g) ?? []

describe('ProgramPicker: search, then colleges as chips', () => {
  const programs = [
    program(1, 'cs', 'Computer Science', { is_base: true }),
    program(2, 'bio_bot', 'Botany', { major_name: 'Biology', college: 'cas', major_code: 'biology' }),
    program(3, 'bio_zool', 'Zoology', { major_name: 'Biology', college: 'cas', major_code: 'biology' }),
  ]

  it('leads with a labelled search box', () => {
    const html = render({ programs })
    expect(html.indexOf('type="search"')).toBeGreaterThan(-1)
    expect(html.indexOf('type="search"')).toBeLessThan(html.indexOf('fr-chips'))
    expect(text(html)).toContain('Search majors and concentrations')
  })

  it('offers the colleges as filter chips, with All colleges chosen, and lists every supported major under its college', () => {
    const html = render({ programs })
    const chips = html.match(/<button[^>]*class="fr-chip[^"]*"[^>]*>[^<]+/g).map(c => c.replace(/<[^>]+>/, ''))
    expect(chips).toEqual(['All colleges', 'Arts &amp; Sciences', 'Engineering'])
    expect(html).toMatch(/class="fr-chip fr-chip-on" aria-pressed="true"[^>]*>All colleges|aria-pressed="true"[^>]*class="fr-chip fr-chip-on"[^>]*>All colleges/)
    expect(text(html)).toContain('Biology, B.S.')
    expect(text(html)).toContain('Computer Science, B.S.')
    expect(text(html)).toContain('2 concentrations')
  })

  it('has no chips with one college', () => {
    expect(render({ programs: [program(1, 'cs', 'Computer Science', { is_base: true })] })).not.toContain('fr-chips')
  })
})

describe('ProgramPicker: the majors the planner supports', () => {
  const programs = [program(1, 'cs', 'Computer Science', { is_base: true }), program(2, 'art', 'Art', { is_base: true, department: 'ART', college: 'cas' })]

  it('lists the supported ones and offers the rest', () => {
    const html = render({ programs })
    expect(text(html)).toContain('Showing majors the planner supports today.')
    expect(text(html)).toContain('Show the rest')
    expect(text(html)).toContain('Computer Science, B.S.')
    expect(text(html)).not.toContain('Art, B.S.')
    expect(majorButtons(html).some(b => b.includes('disabled'))).toBe(false)
  })

  it('says nothing about the rest when every major is supported', () => {
    expect(text(render({ programs: [programs[0]] }))).not.toContain('Show the rest')
  })
})

describe('ProgramPicker: a major and its concentrations', () => {
  const programs = [
    program(1, 'cs', 'Computer Science', { is_base: true, major_name: 'Computer Science', major_code: 'cs_major' }),
    program(2, 'cyber', 'CSC Cybersecurity', { major_name: 'Computer Science', major_code: 'cs_major' }),
  ]

  it('shows the concentrations of the opened major as radios, in place, with none chosen yet', () => {
    const html = render({ programs, majorKey: 'cs_major' })
    expect(html.match(/type="radio"/g)).toHaveLength(2)
    expect(html).not.toContain('checked=""')
    expect(text(html)).toContain('Concentration (optional)')
    expect(text(html)).toContain('No concentration. About Computer Science')
    expect(text(html)).toContain('Choose a concentration below')
    expect(html).toContain('aria-expanded="true"')
  })

  it('checks the chosen concentration and shows the choice as a path', () => {
    const html = render({ programs, value: 'cyber' })
    expect(html.match(/checked=""/g)).toHaveLength(1)
    expect(text(html)).toContain('Your major Engineering › Computer Science › CSC Cybersecurity')
  })

  it('a major whose concentrations are all required says Concentration, not optional', () => {
    const bio = [program(1, 'bot', 'Botany', { major_name: 'Biology', major_code: 'biology', college: 'cas', department: 'CSC' }), program(2, 'zool', 'Zoology', { major_name: 'Biology', major_code: 'biology', college: 'cas', department: 'CSC' })]
    const t = text(render({ programs: bio, majorKey: 'biology' }))
    expect(t).toContain('Concentration')
    expect(t).not.toContain('(optional)')
  })

  it('a major that is its own program has no radios', () => {
    expect(render({ programs: [programs[0]], value: 'cs' })).not.toContain('type="radio"')
  })
})

describe('ProgramPicker: closed programs, loading and errors', () => {
  it('keeps a closed program behind a disclosure, unless it is the selection', () => {
    const programs = [program(1, 'new', 'New Program', { is_base: true }), program(2, 'old', 'Old Program', { is_base: true, last_catalog_year: '2025-2026' })]
    const oldPlans = [{ id: 1, concentration_id: 1, catalog_year: '2026-2027' }, { id: 2, concentration_id: 2, catalog_year: '2025-2026' }]
    const hidden = render({ programs, plans: oldPlans })
    expect(hidden).toContain('Show closed programs')
    expect(hidden).not.toContain('Old Program')
    const chosen = render({ programs, plans: oldPlans, value: 'old' })
    expect(chosen).not.toContain('Show closed programs')
    expect(chosen).toContain('Old Program')
    expect(chosen).toContain('Hide closed programs')
    expect(hidden).not.toContain('Hide closed programs')
  })

  it('drops a program that has no plan, and shows a skeleton while loading and the error when it fails', () => {
    expect(render({ programs: [program(9, 'noplan', 'No Plan Yet')] })).not.toContain('No Plan Yet')
    expect(render({ loading: true })).toContain('sk-pulse')
    expect(render({ error: 'boom' })).toContain('Could not load the majors: boom')
  })
})
