import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { POOL_COURSES, POOL_CREDIT_ESTIMATES, resolvePool } from '../lib/poolResolver.js'
import {
  FF_CATEGORIES, evaluateFlightFoundationsForPlan, getFlightFoundationsStatus, isFlightFoundationsCourse,
} from '../lib/flightFoundations.js'

// These read the seed files in the sibling MyDegreePlan_Prototype repo — the
// same JSON seed.js loads — so a template edit that breaks Flight Foundations
// fails here.  The repo is not present in every checkout (e.g. a frontend-only
// build), so the suite skips itself when it is missing.

const PROTO = fileURLToPath(new URL('../../../MyDegreePlan_Prototype/', import.meta.url))
const HAVE_SEEDS = existsSync(`${PROTO}courses.json`) && existsSync(`${PROTO}degree_plans.json`)

const readJson = name => JSON.parse(readFileSync(`${PROTO}${name}`, 'utf8'))

// Concentration → [legacy template, Flight Foundations template]
const CONCENTRATIONS = {
  core:          ['core:legacy',          'core:flight_foundations'],
  cybersecurity: ['cybersecurity:legacy', 'cybersecurity:flight_foundations'],
  hpc:           ['hpc:legacy',           'hpc:flight_foundations'],
}

// MATH1000 was once inserted by migration_math1000.sql; courses.json (the full Coursedog catalog) has it now.
const NOT_IN_PROTOTYPE_JSON = new Set(['MATH1000'])

// What a student picks for each pool, in slot order — a plan the department
// would sign off on: the sequence science, CSC2220 as the gateway/literacy
// course where the template has one.
const PICKS = {
  FF_SOCIAL:          ['ECON2010', 'PSY1030'],
  FF_HUMANITIES:      ['ART1035', 'ENGL2130'],
  FF_LITERACY:        ['DS2810'],
  ENG_LIT:            ['ENGL2130'],
  COMM_REQ:           ['COMM2025'],
  SCIENCE:            ['CHEM1110', 'CHEM1120'],
  MATH_STATS:         ['MATH3070'],
  CSC_LOWER_ELECTIVE: ['CSC2220', 'CSC2770'],
  CSC_UPPER_ELECTIVE: ['CSC3020', 'CSC3100', 'CSC3220'],
  CSC_ELECTIVE:       ['CSC2010', 'CSC3230'],
  CSC_HPC_ELECTIVE:   ['CSC4040'],
}

// A template is a program's degree plan for a gen-ed program, from degree_plans.json (generated from the
// prototype repo's degree-specs/). `id` is "program:genedProgram".
function loadTemplate(id, courses) {
  const [program, genedProgram] = id.split(':')
  const plan = readJson('degree_plans.json').plans.find(p => p.program === program && p.genedProgram === genedProgram)
  const data = {
    hours: plan.hours,
    courses: plan.slots.map(s => (s.credits != null ? { classCode: s.classCode, credits: s.credits } : { classCode: s.classCode })),
  }
  const slots = data.courses.map((c, i) => ({
    id: i + 1, class_code: c.classCode, is_pool: c.classCode in POOL_COURSES || c.classCode === 'FREE_ELECTIVE',
    flex_credits: c.credits ?? null,
  }))
  const hours = slots.reduce((sum, s) => sum + (s.flex_credits
    ?? (s.is_pool ? POOL_CREDIT_ESTIMATES[s.class_code] ?? 3 : courses[s.class_code]?.credits ?? 0)), 0)
  return { data, slots, hours }
}

function fillPlan(slots) {
  const next = {}
  const planSlots = {}
  for (const s of slots) {
    if (!s.is_pool) continue
    const picks = PICKS[s.class_code]
    if (!picks) continue
    const i = next[s.class_code] ?? 0
    planSlots[s.id] = picks[i]
    next[s.class_code] = i + 1
  }
  return planSlots
}

describe.skipIf(!HAVE_SEEDS)('Flight Foundations seed templates', () => {
  const courseList = HAVE_SEEDS ? readJson('courses.json').courses : []
  const courses = Object.fromEntries(courseList.map(c => [c.code, c]))

  it('has every Flight Foundations course in the seeded catalog', () => {
    const all = FF_CATEGORIES.flatMap(c => c.courses)
    expect(all.filter(code => !courses[code])).toEqual([])
  })

  it('resolves every Flight Foundations pool in full against the seeded catalog', () => {
    for (const pool of ['FF_SOCIAL', 'FF_HUMANITIES', 'FF_LITERACY']) {
      expect(resolvePool(pool, courses), pool).toHaveLength(POOL_COURSES[pool].length)
    }
  })

  it('carries the catalog credits for the courses added with Flight Foundations', () => {
    expect(courses.POLS1100.credits).toBe(3)
    expect(courses.CHEM1010.credits).toBe(4)
    expect(courses.BIOL2020.credits).toBe(4)
  })

  it('encodes the unambiguous prerequisites of the added courses', () => {
    expect(courses.BIOL2020.prerequisites).toEqual(['BIOL2010'])
    expect(courses.CHEM1020.prerequisites).toEqual(['CHEM1010'])
    expect(courses.ENGL2400.corequisites).toEqual(['ENGL1020'])
  })

  it('declares the same pools, with the same credit estimates, as the app', () => {
    // pools.json (the specs) and POOL_CREDIT_ESTIMATES (poolResolver.js) describe one list; this keeps them one.
    expect(readJson('degree_plans.json').pools).toEqual(POOL_CREDIT_ESTIMATES)
  })

  it('keeps courses.json codes unique and sorted', () => {
    const codes = courseList.map(c => c.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes).toEqual([...codes].sort())
  })

  describe.each(Object.entries(CONCENTRATIONS))('%s', (_name, [legacyFile, ffFile]) => {
    const legacy = () => loadTemplate(legacyFile, courses)
    const ff     = () => loadTemplate(ffFile, courses)

    it('totals the same hours as its legacy template', () => {
      expect(ff().hours).toBe(legacy().hours)
      expect(ff().data.hours).toBe(legacy().data.hours)
    })

    it('uses no GEN_ED slots', () => {
      expect(ff().slots.filter(s => s.class_code === 'GEN_ED')).toHaveLength(0)
    })

    it('fixes Historical Foundations as HIST2010 and HIST2020', () => {
      const fixed = ff().slots.filter(s => !s.is_pool).map(s => s.class_code)
      expect(fixed).toContain('HIST2010')
      expect(fixed).toContain('HIST2020')
    })

    it('has only known slot codes', () => {
      for (const s of ff().slots) {
        const known = s.is_pool || courses[s.class_code] || NOT_IN_PROTOTYPE_JSON.has(s.class_code)
        expect(known, s.class_code).toBeTruthy()
      }
    })

    it('keeps the legacy template untouched: still six GEN_ED slots and its ENG_LIT slot', () => {
      expect(legacy().slots.filter(s => s.class_code === 'GEN_ED')).toHaveLength(6)
      expect(legacy().slots.filter(s => s.class_code === 'ENG_LIT')).toHaveLength(1)
    })

    it('has no separate English Literature slot: Humanities is two FF_HUMANITIES slots', () => {
      const { slots } = ff()
      expect(slots.filter(s => s.class_code === 'ENG_LIT')).toHaveLength(0)
      expect(slots.filter(s => s.class_code === 'FF_HUMANITIES')).toHaveLength(2)
    })

    it('reads as a fixed range: Humanities 6, Science 8, Literacy 3, no flex left', () => {
      const { slots } = ff()
      const status = getFlightFoundationsStatus({}, [], slots, courses)
      const by = code => status.categories.find(c => c.category === code)
      expect([by('HUM').required, by('HUM').max]).toEqual([6, 6])
      expect([by('SCI').required, by('SCI').max]).toEqual([8, 8])
      expect([by('LIT').required, by('LIT').max]).toEqual([3, 3])
      expect(status.flex.total).toBe(0)
      expect(status.totalRequired).toBe(41)
    })

    it('counts a literature course toward Humanities', () => {
      const { slots } = ff()
      const plan = fillPlan(slots)
      const ev = evaluateFlightFoundationsForPlan(plan, [], slots, courses)
      const hum = ev.categories.find(c => c.code === 'HUM')
      expect(hum.courses.map(c => c.code)).toContain('ENGL2130')
      expect(hum.earned).toBe(6)
    })

    it('satisfies all 41 Flight Foundations hours with a normal selection', () => {
      const { slots } = ff()
      const ev = evaluateFlightFoundationsForPlan(fillPlan(slots), [], slots, courses)
      const by = code => ev.categories.find(c => c.code === code)
      expect(ev.satisfied).toBe(true)
      expect(ev.totalEarned).toBe(41)
      expect(by('HUM').earned).toBe(6)
      expect(by('SCI').earned).toBe(8)
      expect(by('LIT').earned).toBe(3)
      expect(ev.flex.remaining).toBe(0)
    })

    it('is short exactly the literacy hours (and nothing else) when no literacy course is chosen', () => {
      const { slots } = ff()
      const plan = fillPlan(slots)
      // Drop every course that counts toward Literacy.
      const literacy = new Set(FF_CATEGORIES.find(c => c.code === 'LIT').courses)
      for (const s of slots) if (literacy.has(plan[s.id])) plan[s.id] = undefined
      const fixedLiteracy = slots.some(s => !s.is_pool && literacy.has(s.class_code))
      const ev = evaluateFlightFoundationsForPlan(plan, [], slots, courses)
      if (fixedLiteracy) {
        expect(ev.satisfied).toBe(true)   // Cybersecurity: CSC2570 is a fixed requirement
      } else {
        expect(ev.categories.find(c => c.code === 'LIT').remaining).toBeGreaterThan(0)
        expect(ev.satisfied).toBe(false)
      }
    })
  })

  it('Core reaches Literacy through its two lower electives, whichever two of three a student picks', () => {
    const { slots } = loadTemplate('core:flight_foundations', courses)
    const lower = slots.filter(s => s.class_code === 'CSC_LOWER_ELECTIVE')
    expect(lower).toHaveLength(2)
    const gateway = ['CSC2220', 'CSC2570', 'CSC2770']
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        const plan = { ...fillPlan(slots), [lower[0].id]: gateway[a], [lower[1].id]: gateway[b] }
        const ev = evaluateFlightFoundationsForPlan(plan, [], slots, courses)
        expect(ev.categories.find(c => c.code === 'LIT').satisfied, `${gateway[a]}+${gateway[b]}`).toBe(true)
      }
    }
  })

  it('HPC needs its literacy slot: CSC2770 alone does not satisfy Literacy', () => {
    const { slots } = loadTemplate('hpc:flight_foundations', courses)
    expect(slots.filter(s => s.class_code === 'FF_LITERACY')).toHaveLength(1)
    expect(slots.some(s => s.class_code === 'CSC2770')).toBe(true)
    expect(isFlightFoundationsCourse('CSC2770')).toBe(false)
  })

  it('Core and Cybersecurity move the freed 3 hours to free electives; HPC converts them to literacy', () => {
    const free = file => loadTemplate(file, courses).slots.find(s => s.class_code === 'FREE_ELECTIVE').flex_credits
    expect(free('core:flight_foundations') - free('core:legacy')).toBe(3)
    expect(free('cybersecurity:flight_foundations') - free('cybersecurity:legacy')).toBe(3)
    expect(free('hpc:flight_foundations')).toBe(free('hpc:legacy'))
  })
})
