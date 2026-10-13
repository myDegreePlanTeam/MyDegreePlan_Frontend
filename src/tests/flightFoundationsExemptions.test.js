// flightFoundationsExemptions.test.js
//
// The catalog excuses six engineering majors from American History (Historical Foundations, HIST 2010 + 2020). An exempt major owes
// no hours in the category and its Flight Foundations total is 35, not 41; Computer SCIENCE is not exempt. The audit and the gen-ed
// panel read it, so a wrong list or a wrong total tells a student they can skip a course they cannot, or demands one they need not take.

import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import {
  FF_EXEMPT_MAJORS, getFlightFoundationsExemptions, evaluateFlightFoundations, getFlightFoundationsStatus,
  FF_TOTAL_HOURS,
} from '../lib/flightFoundations.js'
import { fetchMajorCode } from '../lib/requirementSlots.js'
import { buildGenEdPanel } from '../lib/genEdPanel.js'
import { buildDegreeAudit } from '../lib/degreeAudit.js'

describe('getFlightFoundationsExemptions', () => {
  it('excuses the six engineering majors the catalog names from Historical Foundations', () => {
    for (const major of ['chemical_engineering', 'civil_engineering', 'computer_engineering', 'electrical_engineering', 'general_engineering', 'mechanical_engineering']) {
      expect(getFlightFoundationsExemptions(major), major).toEqual(['HIST'])
    }
  })

  it('does not excuse Computer Science, Nuclear Engineering, or an unknown or missing major', () => {
    for (const major of ['computer_science', 'artificial_intelligence', 'nuclear_engineering', 'engineering_technology', 'nursing', 'nope', '', null, undefined]) {
      expect(getFlightFoundationsExemptions(major), String(major)).toEqual([])
    }
  })

  it('names only major codes that exist in the catalog, so a typo cannot silently exempt nobody', () => {
    const codes = new Set(catalog.tables.concentrations.map(p => p.major_code))
    for (const major of FF_EXEMPT_MAJORS.HIST) expect(codes.has(major), major).toBe(true)
  })
})

describe('evaluateFlightFoundations with an exempt category', () => {
  // Every category at its minimum, plus the 4 flexible hours in Humanities: 41 hours with History, 35 without.
  const courses = code => ({ code, credits: 3 })
  const everyOtherCategory = [
    ...['ENGL1010', 'ENGL1020'].map(courses),
    ...['COMM2025'].map(courses),
    courses('MATH1710'),
    ...['ECON2010', 'PSY1030'].map(courses),
    ...['ART1035', 'ART2000', 'ENGL2130'].map(courses),                 // 9 hrs Humanities (6 + 3 flex)
    { code: 'BIOL1010', credits: 4 }, { code: 'CHEM1010', credits: 4 },  // 8 hrs Scientific Reasoning
    courses('CSC2570'),
  ]
  const history = ['HIST2010', 'HIST2020'].map(courses)

  it('lowers what is required from 41 to 35 and gives the category no range', () => {
    const ev = evaluateFlightFoundations([], { exempt: ['HIST'] })
    expect(ev.totalRequired).toBe(FF_TOTAL_HOURS - 6)
    expect(ev.totalRequired).toBe(35)
    const hist = ev.categories.find(c => c.code === 'HIST')
    expect(hist).toMatchObject({ exempt: true, min: 0, max: 0, earned: 0, remaining: 0, satisfied: true })
    expect(ev.categories.filter(c => c.exempt).map(c => c.code)).toEqual(['HIST'])
  })

  it('leaves the flexible hours alone: the exemption removes fixed hours, not flex', () => {
    const plain = evaluateFlightFoundations([])
    const exempt = evaluateFlightFoundations([], { exempt: ['HIST'] })
    expect(exempt.flex.total).toBe(plain.flex.total)
  })

  it('is satisfied without any history course, which the same courses are not for a student who owes it', () => {
    expect(evaluateFlightFoundations(everyOtherCategory, { exempt: ['HIST'] })).toMatchObject({ satisfied: true, totalEarned: 35 })
    expect(evaluateFlightFoundations(everyOtherCategory)).toMatchObject({ satisfied: false, totalEarned: 35, totalRemaining: 6 })
  })

  it('a history course taken anyway counts toward the degree, not toward Flight Foundations', () => {
    const ev = evaluateFlightFoundations([...everyOtherCategory, ...history], { exempt: ['HIST'] })
    const hist = ev.categories.find(c => c.code === 'HIST')
    expect(hist).toMatchObject({ raw: 6, earned: 0, excess: 6 })
    expect(ev.totalEarned).toBe(35)
    expect(ev.satisfied).toBe(true)
  })

  it('the plan status carries the exemption through to its rows', () => {
    const slots = [{ id: 1, class_code: 'ENGL1010', is_pool: false }]
    const status = getFlightFoundationsStatus({}, [], slots, {}, [], {}, { exempt: ['HIST'] })
    expect(status.totalRequired).toBe(35)
    expect(status.categories.find(c => c.category === 'HIST')).toMatchObject({ exempt: true, required: 0, max: 0, catalogMin: 6 })
    expect(getFlightFoundationsStatus({}, [], slots, {}).totalRequired).toBe(41)
  })
})

describe('fetchMajorCode', () => {
  // Just enough of the query chain: from().select().eq().single()
  const client = (respond) => ({
    from: () => ({ select: columns => ({ eq: () => ({ single: () => Promise.resolve(respond(columns)) }) }) }),
  })

  it('reads the program\'s major code', async () => {
    expect(await fetchMajorCode(client(() => ({ data: { id: 6, major_code: 'mechanical_engineering' }, error: null })), 6)).toBe('mechanical_engineering')
  })

  it('answers null for a database without the column, after retrying without it', async () => {
    const asked = []
    const db = client(columns => {
      asked.push(columns)
      return columns.includes('major_code')
        ? { data: null, error: { code: '42703', message: 'column concentrations.major_code does not exist' } }
        : { data: { id: 6 }, error: null }
    })
    expect(await fetchMajorCode(db, 6)).toBeNull()
    expect(asked).toEqual(['id, major_code', 'id'])
  })

  it('answers null when the program is not found', async () => {
    expect(await fetchMajorCode(client(() => ({ data: null, error: { code: 'PGRST116', message: 'no rows' } })), 99)).toBeNull()
  })
})

// ── The real plans ───────────────────────────────────────────────────────────
describe('the open programs', () => {
  const t = catalog.tables
  const programs = t.concentrations
  const audit = code => {
    const prog = programs.find(p => p.code === code)
    const plan = t.degree_plans.find(d => d.concentration_id === prog.id && d.gened_program === 'flight_foundations')
    const slots = t.requirement_slots.filter(s => s.concentration_id === prog.id && s.catalog_year === plan.catalog_year)
    const exempt = getFlightFoundationsExemptions(prog.major_code)
    return {
      panel: buildGenEdPanel({ genedProgram: plan.gened_program, slots, exempt }),
      audit: buildDegreeAudit({ slots, genedProgram: plan.gened_program, totalHours: plan.total_hours, genedExempt: exempt }),
    }
  }

  it('every Mechanical Engineering program is exempt, so its panel asks for 35 hours and History reads Exempt', () => {
    for (const code of ['me', 'me_aero', 'me_mechatronics', 'me_vehicle']) {
      const { panel, audit: a } = audit(code)
      expect(panel.required, code).toBe(35)
      expect(panel.exemptions, code).toEqual([{ key: 'HIST', label: 'Historical Foundations', hours: 6 }])
      const hist = a.blocks.find(b => b.id === 'gened').groups.find(g => g.id === 'HIST')
      expect(hist.progress, code).toMatchObject({ state: 'exempt', exempt: true })
    }
  })

  it('an exempt History row does not hold the whole panel at "not covered"', () => {
    const { panel } = audit('me')
    expect(panel.rows.find(r => r.key === 'HIST').state).toBe('exempt')
    expect(panel.state).not.toBe('exempt')
  })

  it('no Computer Science program is exempt: History is still 6 hours and HIST 2010 / 2020 are its rows', () => {
    for (const code of ['core', 'cybersecurity', 'hpc', 'ai']) {
      const { panel, audit: a } = audit(code)
      expect(panel.required, code).toBe(41)
      expect(panel.exemptions, code).toEqual([])
      const hist = a.blocks.find(b => b.id === 'gened').groups.find(g => g.id === 'HIST')
      expect(hist.progress.exempt, code).toBe(false)
      expect(hist.rows.map(r => r.code), code).toEqual(['HIST2010', 'HIST2020'])
    }
  })
})
