import { describe, it, expect } from 'vitest'
import {
  yearStart, academicYearOf, compareCatalogYears, planForYear, isProgramOpen, availablePrograms,
  groupByMajor, degreeTitle, catalogYearForProfile,
  NEW_CURRICULUM_YEAR, termAvailable, termChoices, latestCatalogYear, splitByOffering, isApproximateFit, approximatePlanOf,
} from '../lib/catalogYears'
import { getGenEdProgram } from '../lib/flightFoundations'
import catalog from '../data/catalog.json'

const programs = catalog.tables.concentrations
const plans = catalog.tables.degree_plans
const id = code => programs.find(p => p.code === code).id

describe('yearStart / academicYearOf / compareCatalogYears', () => {
  it('reads a catalog year, and refuses anything that is not two consecutive years', () => {
    expect(yearStart('2026-2027')).toBe(2026)
    for (const bad of ['2026-2028', '2026', '26-27', '2027-2026', '', null, undefined]) expect(yearStart(bad)).toBeNull()
  })
  it('puts Fall in the year it starts and Spring and Summer in the year before', () => {
    expect(academicYearOf('Fall', 2026)).toBe('2026-2027')
    expect(academicYearOf('Spring', 2027)).toBe('2026-2027')
    expect(academicYearOf('Summer', 2026)).toBe('2025-2026')
    expect(academicYearOf('Fall', '2030')).toBe('2030-2031')
  })
  it('has no year for an incomplete term', () => {
    expect(academicYearOf('', 2026)).toBeNull()
    expect(academicYearOf('Fall', '')).toBeNull()
    expect(academicYearOf(null, null)).toBeNull()
    expect(academicYearOf('Winter', 2026)).toBeNull()
  })
  it('orders years', () => {
    expect(compareCatalogYears('2025-2026', '2026-2027')).toBeLessThan(0)
    expect(compareCatalogYears('2027-2028', '2026-2027')).toBeGreaterThan(0)
    expect(compareCatalogYears('2026-2027', '2026-2027')).toBe(0)
  })
})

// ── planForYear on a small, explicit set of plans ────────────────────────────

const P = [
  { concentration_id: 1, catalog_year: '2025-2026', gened_program: 'legacy', covers_earlier: true },
  { concentration_id: 1, catalog_year: '2027-2028', gened_program: 'flight_foundations', covers_earlier: false },
  { concentration_id: 1, catalog_year: '2026-2027', gened_program: 'flight_foundations', covers_earlier: false },
  { concentration_id: 2, catalog_year: '2026-2027', gened_program: 'flight_foundations', covers_earlier: false },
]

describe('planForYear', () => {
  it('is the latest plan not newer than the entry year', () => {
    expect(planForYear(P, 1, '2026-2027').catalog_year).toBe('2026-2027')
    expect(planForYear(P, 1, '2027-2028').catalog_year).toBe('2027-2028')
    expect(planForYear(P, 1, '2030-2031').catalog_year).toBe('2027-2028')   // a year with no revision keeps the last one
    expect(planForYear(P, 1, '2025-2026').catalog_year).toBe('2025-2026')
  })
  it('gives a student who entered before the first plan that plan when it covers earlier years', () => {
    expect(planForYear(P, 1, '2016-2017').catalog_year).toBe('2025-2026')
  })
  it('offers nothing before a first plan that does not cover earlier years', () => {
    expect(planForYear(P, 2, '2025-2026')).toBeNull()
  })
  it('offers nothing for an unknown program or an unusable year', () => {
    expect(planForYear(P, 9, '2026-2027')).toBeNull()
    expect(planForYear(P, 1, null)).toBeNull()
    expect(planForYear(P, 1, 'soon')).toBeNull()
    expect(planForYear(undefined, 1, '2026-2027')).toBeNull()
  })
  it('does not depend on the order the rows arrive in', () => {
    expect(planForYear([...P].reverse(), 1, '2026-2027').catalog_year).toBe('2026-2027')
  })
})

describe('isProgramOpen', () => {
  it('is open when there is no last year, and through the last year when there is one', () => {
    expect(isProgramOpen({ last_catalog_year: null }, '2040-2041')).toBe(true)
    expect(isProgramOpen({ last_catalog_year: '2025-2026' }, '2025-2026')).toBe(true)
    expect(isProgramOpen({ last_catalog_year: '2025-2026' }, '2016-2017')).toBe(true)
    expect(isProgramOpen({ last_catalog_year: '2025-2026' }, '2026-2027')).toBe(false)
    expect(isProgramOpen({ last_catalog_year: '2025-2026' }, null)).toBe(false)
  })
})

// ── the real catalog ─────────────────────────────────────────────────────────

describe('programs available in the real catalog', () => {
  const codes = year => availablePrograms(programs, plans, year).map(p => p.code)
  const ENGINEERING = ['me', 'me_aero', 'me_mechatronics', 'me_vehicle', 'ne']
  const CSC = ['core', 'cybersecurity', 'dsai', 'hpc', 'ai']
  const csc = year => codes(year).filter(c => CSC.includes(c))

  it('offers Data Science & AI only to students who entered through 2025-2026, and the AI major only from 2026-2027', () => {
    expect(csc('2025-2026')).toEqual(['core', 'cybersecurity', 'dsai', 'hpc'])
    expect(csc('2018-2019')).toEqual(['core', 'cybersecurity', 'dsai', 'hpc'])
    expect(csc('2026-2027')).toEqual(['core', 'cybersecurity', 'hpc', 'ai'])
    expect(csc('2030-2031')).toEqual(['core', 'cybersecurity', 'hpc', 'ai'])
  })
  it('offers the engineering programs to earlier entrants too: their first plan (2026-2027) stands in for every earlier year', () => {
    for (const year of ['2018-2019', '2025-2026', '2026-2027', '2030-2031']) {
      expect(codes(year).filter(c => ENGINEERING.includes(c)), year).toEqual(ENGINEERING)
    }
  })
  it('a program whose first plan is Flight Foundations follows it for an entrant before it: the fit is approximate, and tells', () => {
    const me = programs.find(p => p.code === 'me')
    const plan = planForYear(plans, me.id, '2022-2023')
    expect(plan.catalog_year).toBe('2026-2027')
    expect(plan.gened_program).toBe('flight_foundations')
    expect(plan.covers_earlier).toBe(true)
  })
  it('keeps a student\'s own program visible even after it closes', () => {
    expect(availablePrograms(programs, plans, '2026-2027', { currentId: id('dsai') }).map(p => p.code)).toContain('dsai')
  })
  it('hands every program the plan its entry year implies', () => {
    expect(planForYear(plans, id('core'), '2025-2026').gened_program).toBe('legacy')
    expect(planForYear(plans, id('core'), '2026-2027').gened_program).toBe('flight_foundations')
    expect(planForYear(plans, id('dsai'), '2025-2026').gened_program).toBe('legacy')
    expect(planForYear(plans, id('dsai'), '2026-2027').catalog_year).toBe('2025-2026')   // closed, but the nearest plan if asked
  })
})

// The rule this replaces: Fall 2026 or later is Flight Foundations, anything earlier is legacy. Every entry term
// from 2016 to 2032 must resolve to the same gen-ed program for every program that is open to it.
describe('plan resolution agrees with the old entry-term rule', () => {
  const seasons = ['Fall', 'Spring', 'Summer']
  it('for every entry term from 2016 to 2032', () => {
    const disagreements = []
    for (let year = 2016; year <= 2032; year++) {
      for (const season of seasons) {
        const entry = academicYearOf(season, year)
        const old = getGenEdProgram(season, year)
        for (const p of availablePrograms(programs, plans, entry)) {
          const plan = planForYear(plans, p.id, entry)
          // a program whose first plan is Flight Foundations covers entrants before it (approximately): that is the one
          // place an entry term and its plan's gen-ed program may disagree
          const approximate = plan.covers_earlier && plan.gened_program === 'flight_foundations' && yearStart(plan.catalog_year) > yearStart(entry)
          if (plan.gened_program !== old && !approximate) disagreements.push(`${season} ${year} ${p.code}: ${plan.gened_program} vs ${old}`)
          if (approximate) expect(plan.gened_program, `${p.code} ${entry}`).toBe('flight_foundations')
        }
      }
    }
    expect(disagreements).toEqual([])
  })
})

describe('groupByMajor / degreeTitle', () => {
  it('puts the CSC concentrations under one major, in id order, and Artificial Intelligence under its own', () => {
    const groups = groupByMajor(programs.filter(p => p.department === 'CSC'))
    expect(groups.map(g => g.majorName)).toEqual(['Computer Science', 'Artificial Intelligence'])
    expect(degreeTitle(groups[0])).toBe('Computer Science, B.S.')
    expect(groups[0].programs.map(p => p.code)).toEqual(['core', 'cybersecurity', 'dsai', 'hpc'])
    expect(degreeTitle(groups[1])).toBe('Artificial Intelligence, B.S.')
    expect(groups[1].programs.map(p => p.code)).toEqual(['ai'])
  })
  it('puts Mechanical Engineering and its three concentrations under one major, and Nuclear Engineering under its own', () => {
    const groups = groupByMajor(programs.filter(p => p.department === 'MNE'))
    expect(groups.map(g => g.majorName)).toEqual(['Mechanical Engineering', 'Nuclear Engineering'])
    expect(groups[0].programs.map(p => p.code)).toEqual(['me', 'me_aero', 'me_mechatronics', 'me_vehicle'])
    expect(degreeTitle(groups[1])).toBe('Nuclear Engineering, B.S.N.E.')
  })
  it('keeps separate majors separate, a major with no concentrations being a group of one', () => {
    const rows = [
      { id: 1, name: 'CSC Core', major_name: 'Computer Science', degree: 'B.S.' },
      { id: 2, name: 'Artificial Intelligence', major_name: 'Artificial Intelligence', degree: 'B.S.' },
      { id: 3, name: 'CSC HPC', major_name: 'Computer Science', degree: 'B.S.' },
    ]
    const groups = groupByMajor(rows)
    expect(groups.map(g => g.majorName)).toEqual(['Computer Science', 'Artificial Intelligence'])
    expect(groups[0].programs.map(p => p.id)).toEqual([1, 3])
  })
  it('falls back to the program name when a row has no major', () => {
    expect(groupByMajor([{ id: 1, name: 'X' }])[0].majorName).toBe('X')
  })
})

describe('termChoices: the start terms a program can be started in', () => {
  const years = c => c.map(x => x.year)
  const find = (c, y) => c.find(x => x.year === y)?.seasons

  it('without a program, offers what the student type allows: returning before the 2026 switch, new from it', () => {
    const returning = termChoices('returning')
    expect(years(returning)).toEqual(Array.from({ length: 11 }, (_, i) => 2016 + i))
    expect(find(returning, NEW_CURRICULUM_YEAR)).toEqual(['Spring', 'Summer'])
    expect(find(returning, 2020)).toEqual(['Fall', 'Spring', 'Summer'])
    const fresh = termChoices('incoming_freshman')
    expect(years(fresh)).toEqual(Array.from({ length: 7 }, (_, i) => 2026 + i))
    expect(find(fresh, NEW_CURRICULUM_YEAR)).toEqual(['Fall'])
    expect(termChoices('transfer')).toEqual(fresh)
  })

  it('a program whose first plan covers earlier entrants is open to returning students too', () => {
    const core = programs.find(p => p.code === 'core')
    expect(years(termChoices('returning', { program: core, plans }))).toHaveLength(11)
    expect(years(termChoices('incoming_freshman', { program: core, plans }))).toHaveLength(7)
  })

  it('a program that starts with the 2026-2027 catalog and does not cover earlier entrants has no returning student, and says so by having no terms', () => {
    const ai = programs.find(p => p.code === 'ai')
    expect(termChoices('returning', { program: ai, plans })).toEqual([])
    expect(find(termChoices('incoming_freshman', { program: ai, plans }), 2026)).toEqual(['Fall'])
  })

  it('a program whose first plan covers earlier entrants offers returning students every year (the fit is approximate)', () => {
    const me = programs.find(p => p.code === 'me')
    expect(years(termChoices('returning', { program: me, plans }))).toHaveLength(11)
  })

  it('a program closed to a catalog year has no new student after it', () => {
    const dsai = programs.find(p => p.code === 'dsai')
    expect(termChoices('incoming_freshman', { program: dsai, plans })).toEqual([])
    expect(termChoices('returning', { program: dsai, plans }).length).toBeGreaterThan(0)
  })

  it('a term is available only with a plan for its catalog year and an open program', () => {
    const ai = programs.find(p => p.code === 'ai')
    expect(termAvailable(ai, plans, 'Fall', 2026)).toBe(true)
    expect(termAvailable(ai, plans, 'Spring', 2027)).toBe(true)
    expect(termAvailable(ai, plans, 'Summer', 2026)).toBe(false)   // 2025-2026: no plan
    expect(termAvailable(ai, plans, '', 2026)).toBe(false)
  })
})

describe('latestCatalogYear / splitByOffering', () => {
  it('finds the newest catalog year', () => {
    expect(latestCatalogYear(plans)).toBe('2026-2027')
    expect(latestCatalogYear([])).toBeNull()
    expect(latestCatalogYear([{ catalog_year: 'junk' }])).toBeNull()
  })

  it('separates the programs closed to the newest year (DSAI) from the ones still open, and drops a program with no plan', () => {
    const { current, closed } = splitByOffering(programs, plans)
    expect(closed.map(p => p.code)).toEqual(['dsai'])
    expect(current.map(p => p.code)).toEqual(programs.filter(p => p.code !== 'dsai').map(p => p.code))
    expect(current.slice(0, 9).map(p => p.code)).toEqual(['core', 'cybersecurity', 'hpc', 'ai', 'me', 'me_aero', 'me_mechatronics', 'me_vehicle', 'ne'])
    expect(splitByOffering([{ id: 999999, code: 'x' }], plans)).toEqual({ current: [], closed: [] })
  })
})

describe('isApproximateFit / approximatePlanOf: a plan for a catalog the student did not enter under', () => {
  it('is approximate only for a Flight Foundations first plan covering an earlier entrant', () => {
    const base = { entryYear: '2022-2023', planYear: '2026-2027', genedProgram: 'flight_foundations', coversEarlier: true }
    expect(isApproximateFit(base)).toBe(true)
    expect(isApproximateFit({ ...base, entryYear: '2026-2027' })).toBe(false)             // entered under that catalog
    expect(isApproximateFit({ ...base, entryYear: '2027-2028' })).toBe(false)             // a later entrant of the same plan
    expect(isApproximateFit({ ...base, genedProgram: 'legacy', planYear: '2025-2026' })).toBe(false)   // the department's own coverage
    expect(isApproximateFit({ ...base, coversEarlier: false })).toBe(false)
    expect(isApproximateFit({ ...base, entryYear: null })).toBe(false)
  })

  it('reads a saved profile', () => {
    const profile = { start_season: 'Fall', start_year: 2022, catalog_year: '2026-2027', gened_program: 'flight_foundations' }
    expect(approximatePlanOf(profile)).toEqual({ entry: '2022-2023', plan: '2026-2027' })
    expect(approximatePlanOf({ ...profile, start_year: 2026 })).toBeNull()
    expect(approximatePlanOf({ ...profile, catalog_year: '2025-2026', gened_program: 'legacy' })).toBeNull()   // a CSC student on the 2025-2026 plan
    expect(approximatePlanOf({})).toBeNull()
    expect(approximatePlanOf(null)).toBeNull()
  })

  it('agrees with the real catalog: ME is approximate for a 2022 entrant and exact for a 2026 one; CSC Core is exact for both', () => {
    const fit = (code, season, year) => {
      const program = programs.find(p => p.code === code)
      const entry = academicYearOf(season, year)
      const plan = planForYear(plans, program.id, entry)
      return isApproximateFit({ entryYear: entry, planYear: plan.catalog_year, genedProgram: plan.gened_program, coversEarlier: plan.covers_earlier })
    }
    expect(fit('me', 'Fall', 2022)).toBe(true)
    expect(fit('me', 'Fall', 2026)).toBe(false)
    expect(fit('acct_bsba', 'Spring', 2024)).toBe(true)
    expect(fit('core', 'Fall', 2022)).toBe(false)
    expect(fit('core', 'Fall', 2026)).toBe(false)
  })
})

describe('catalogYearForProfile', () => {
  it('uses the stored year', () => {
    expect(catalogYearForProfile({ catalog_year: '2027-2028', gened_program: 'legacy' })).toBe('2027-2028')
  })
  it('reads a profile saved before catalog years by its gen-ed program', () => {
    expect(catalogYearForProfile({ gened_program: 'flight_foundations' })).toBe('2026-2027')
    expect(catalogYearForProfile({ gened_program: 'legacy' })).toBe('2025-2026')
    expect(catalogYearForProfile({})).toBe('2025-2026')
    expect(catalogYearForProfile(null)).toBe('2025-2026')
  })
})
