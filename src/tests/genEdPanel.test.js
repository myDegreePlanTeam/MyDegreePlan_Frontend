// genEdPanel.test.js
//
// buildGenEdPanel feeds the general-education progress panel. It must report the same numbers
// the slot picker's evaluators do, in one shape for both programs, and stay silent for a plan
// with no gen-ed slots (a panel that read "0 of 18" there would be wrong).

import { describe, it, expect } from 'vitest'
import { buildGenEdPanel, formatRange, hasGenEdSlots } from '../lib/genEdPanel.js'

const courses = {
  ENGL1010: { credits: 3 }, ENGL1020: { credits: 3 },
  HIST2010: { credits: 3 }, HIST2020: { credits: 3 },
  HIST2310: { credits: 3 }, HIST2320: { credits: 3 },
  ECON2010: { credits: 3 }, PSY1030: { credits: 3 },
  PHIL1030: { credits: 3 },
}

// ── Legacy plan: six GEN_ED pool slots ───────────────────────────────────────
const LEGACY_SLOTS = [
  ...[1, 2, 3, 4, 5, 6].map(id => ({ id, is_pool: true, class_code: 'GEN_ED' })),
  { id: 99, is_pool: false, class_code: 'CSC1300' },
]

describe('buildGenEdPanel — legacy program', () => {
  it('reports three rows and 18 required hours', () => {
    const panel = buildGenEdPanel({ genedProgram: 'legacy', slots: LEGACY_SLOTS, courses })
    expect(panel.program).toBe('legacy')
    expect(panel.rows.map(r => r.key)).toEqual(['History', 'Humanities', 'Social'])
    expect(panel.required).toBe(18)
    expect(panel.earned).toBe(0)
    expect(panel.satisfied).toBe(false)
  })

  it('counts placed courses and prior credit', () => {
    const panel = buildGenEdPanel({
      genedProgram: 'legacy',
      slots: LEGACY_SLOTS,
      courses,
      planSlots: { 1: 'HIST2010', 2: 'HIST2020' },
      priorCredits: [{ id: 'a', satisfies_course_code: 'ECON2010', credits_awarded: 3 }],
    })
    const row = key => panel.rows.find(r => r.key === key)
    // prior credit is earned; the History picks have no term, so they are ahead
    expect(row('History')).toMatchObject({ earned: 6, done: 0, planned: 6, state: 'planned' })
    expect(row('Social')).toMatchObject({ earned: 3, done: 3, state: 'open' })
    expect(panel.earned).toBe(9)
  })

  it('flags a row at risk when open slots cannot cover what is left', () => {
    // Four of five seats hold History and Humanities picks; Social still needs 6 hours but one seat is 3.
    const planSlots = { 1: 'HIST2010', 2: 'HIST2020', 3: 'HIST2310', 4: 'HIST2320' }
    const slots = LEGACY_SLOTS.filter(s => s.id <= 5 || s.id === 99)   // only five GEN_ED seats exist
    const panel = buildGenEdPanel({ genedProgram: 'legacy', slots, courses, planSlots })
    expect(panel.rows.find(r => r.key === 'Social').state).toBe('risk')
  })

  it('caps a row at its requirement so the total never exceeds 18', () => {
    const planSlots = { 1: 'HIST2010', 2: 'HIST2020', 3: 'HIST2310', 4: 'HIST2320' }
    const panel = buildGenEdPanel({
      genedProgram: 'legacy', slots: LEGACY_SLOTS, courses, planSlots,
      priorCredits: [{ id: 'a', satisfies_course_code: 'HIST2010', credits_awarded: 3 }],
    })
    expect(panel.rows.every(r => r.earned <= r.min)).toBe(true)
  })

  it('does not count a slot archived by prior credit as open capacity or as a pick', () => {
    const planArchived = { 1: 'prior_credit' }
    const panel = buildGenEdPanel({
      genedProgram: 'legacy', slots: LEGACY_SLOTS, courses, planSlots: { 1: 'HIST2010' }, planArchived,
    })
    expect(panel.rows.find(r => r.key === 'History').earned).toBe(0)
  })
})

// ── Flight Foundations plan ──────────────────────────────────────────────────
const FF_SLOTS = [
  { id: 1,  class_code: 'ENGL1010',      is_pool: false },
  { id: 2,  class_code: 'ENGL1020',      is_pool: false },
  { id: 3,  class_code: 'HIST2010',      is_pool: false },
  { id: 4,  class_code: 'HIST2020',      is_pool: false },
  { id: 5,  class_code: 'FF_SOCIAL',     is_pool: true },
  { id: 6,  class_code: 'FF_SOCIAL',     is_pool: true },
  { id: 7,  class_code: 'FF_HUMANITIES', is_pool: true },
  { id: 8,  class_code: 'FF_HUMANITIES', is_pool: true },
]

describe('buildGenEdPanel — Flight Foundations', () => {
  it('reports one row per category against the 41-hour total', () => {
    const panel = buildGenEdPanel({ genedProgram: 'flight_foundations', slots: FF_SLOTS, courses })
    expect(panel.program).toBe('flight_foundations')
    expect(panel.required).toBe(41)
    expect(panel.rows.map(r => r.key)).toEqual(
      expect.arrayContaining(['COMM_COMP', 'COMM_ORAL', 'QR', 'HIST', 'SOC', 'HUM', 'SCI', 'LIT']),
    )
    expect(panel.rows).toHaveLength(8)
  })

  it('counts fixed slots and chosen pool courses', () => {
    const panel = buildGenEdPanel({
      genedProgram: 'flight_foundations', slots: FF_SLOTS, courses,
      planSlots: { 5: 'ECON2010', 6: 'PSY1030' },
    })
    const row = key => panel.rows.find(r => r.key === key)
    expect(row('COMM_COMP')).toMatchObject({ earned: 6, state: 'planned' })
    expect(row('HIST')).toMatchObject({ earned: 6, state: 'planned' })
    expect(row('SOC')).toMatchObject({ earned: 6, state: 'planned' })
    expect(row('HUM').state).toBe('open')
  })

  it('shows a ranged category as a range and a fixed one as a single number', () => {
    const panel = buildGenEdPanel({ genedProgram: 'flight_foundations', slots: FF_SLOTS, courses })
    const hum = panel.rows.find(r => r.key === 'HUM')
    const soc = panel.rows.find(r => r.key === 'SOC')
    expect(formatRange(soc)).toBe('6')
    expect(hum.max).toBeGreaterThanOrEqual(hum.min)
    expect(formatRange({ min: 6, max: 9 })).toBe('6–9')
  })

  it('reads the same hours as the slot picker (getFlightFoundationsStatus)', async () => {
    const { getFlightFoundationsStatus } = await import('../lib/flightFoundations.js')
    const args = { planSlots: { 5: 'ECON2010', 7: 'PHIL1030' }, priorCredits: [], slots: FF_SLOTS, courses }
    const panel = buildGenEdPanel({ genedProgram: 'flight_foundations', ...args })
    const status = getFlightFoundationsStatus(args.planSlots, [], FF_SLOTS, courses)
    expect(panel.earned).toBe(status.totalEarned)
    for (const c of status.categories) {
      expect(panel.rows.find(r => r.key === c.category).earned).toBe(c.filled)
    }
  })
})

// ── No gen-ed slots ──────────────────────────────────────────────────────────
describe('buildGenEdPanel — plans without gen-ed slots', () => {
  const slots = [{ id: 1, is_pool: false, class_code: 'CSC1300' }, { id: 2, is_pool: true, class_code: 'CSC_ELECTIVE' }]

  it('returns null for both programs', () => {
    expect(buildGenEdPanel({ genedProgram: 'legacy', slots, courses })).toBeNull()
    expect(buildGenEdPanel({ genedProgram: 'flight_foundations', slots, courses })).toBeNull()
  })

  it('returns null while the plan is still loading', () => {
    expect(buildGenEdPanel({ genedProgram: 'legacy', slots: [], courses })).toBeNull()
    expect(hasGenEdSlots(undefined)).toBe(false)
  })
})

// ── States follow the calendar ───────────────────────────────────────────────
// A category is "Complete" only when the hours are earned. Hours in the current term are in progress; hours in a later term
// are "covered by plan", never complete.
describe('buildGenEdPanel — done, in progress and planned', () => {
  const phases = { 1: 'past', 2: 'current', 3: 'future' }
  const slots = [
    { id: 1,  class_code: 'ENGL1010', is_pool: false, semester_number: 1 },
    { id: 2,  class_code: 'ENGL1020', is_pool: false, semester_number: 2 },
    { id: 3,  class_code: 'HIST2010', is_pool: false, semester_number: 3 },
    { id: 4,  class_code: 'HIST2020', is_pool: false, semester_number: 3 },
    { id: 5,  class_code: 'FF_SOCIAL', is_pool: true, semester_number: 1 },
    { id: 6,  class_code: 'FF_SOCIAL', is_pool: true, semester_number: 3 },
    { id: 7,  class_code: 'FF_HUMANITIES', is_pool: true, semester_number: 3 },
    { id: 8,  class_code: 'FF_HUMANITIES', is_pool: true, semester_number: 3 },
  ]
  const build = extra => buildGenEdPanel({
    genedProgram: 'flight_foundations', slots, courses, semesterPhase: phases,
    planSlots: { 5: 'ECON2010', 6: 'PSY1030' }, ...extra,
  })
  const row = (panel, key) => panel.rows.find(r => r.key === key)

  it('splits a category into hours earned, in progress and planned', () => {
    const panel = build()
    expect(row(panel, 'COMM_COMP')).toMatchObject({ done: 3, inProgress: 3, planned: 0, earned: 6, state: 'in_progress' })
    expect(row(panel, 'SOC')).toMatchObject({ done: 3, inProgress: 0, planned: 3, earned: 6, state: 'planned' })
  })

  it('does not call a category complete while any of its hours are still ahead', () => {
    const panel = build()
    expect(row(panel, 'HIST')).toMatchObject({ done: 0, planned: 6, state: 'planned' })
    expect(panel.rows.filter(r => r.state === 'done')).toEqual([])
  })

  it('is complete once every hour is in a past term', () => {
    const panel = build({ semesterPhase: { 1: 'past', 2: 'past', 3: 'past' } })
    expect(row(panel, 'COMM_COMP')).toMatchObject({ done: 6, inProgress: 0, planned: 0, state: 'done' })
    expect(row(panel, 'HIST').state).toBe('done')
  })

  it('treats prior credit as earned', () => {
    const priorCredits = [{ id: 'a', satisfies_course_code: 'HIST2010', credits_awarded: 3 }, { id: 'b', satisfies_course_code: 'HIST2020', credits_awarded: 3 }]
    const panel = build({ priorCredits, planArchived: { 3: 'prior_credit', 4: 'prior_credit' } })
    expect(row(panel, 'HIST')).toMatchObject({ done: 6, state: 'done' })
  })

  it('the three buckets add up to the hours counted, and the panel totals follow', () => {
    const panel = build()
    for (const r of panel.rows) expect(r.done + r.inProgress + r.planned).toBe(r.earned)
    expect(panel.done + panel.inProgress + panel.planned).toBe(panel.earned)
  })

  it('a drag override moves the hours to the term they now sit in', () => {
    const panel = build({ planSemesterOverrides: { 3: 1, 4: 1 } })
    expect(row(panel, 'HIST')).toMatchObject({ done: 6, state: 'done' })
  })

  it('the panel is only as far along as its least advanced category', () => {
    expect(build().state).toBe('open')
    const covered = build({ planSlots: { 5: 'ECON2010', 6: 'PSY1030', 7: 'PHIL1030', 8: 'ART1035' }, courses: { ...courses, ART1035: { credits: 3 } } })
    expect(['planned', 'in_progress', 'open']).toContain(covered.state)
  })

  it('keeps a category range stable: skipping future courses in a pass does not shrink what the plan commits to', () => {
    const early = build({ semesterPhase: { 1: 'past', 2: 'past', 3: 'past' } })
    const late = build()
    expect(row(late, 'HUM').min).toBe(row(early, 'HUM').min)
    expect(row(late, 'HUM').max).toBe(row(early, 'HUM').max)
  })

  it('legacy: a History pick in a future term is planned, one in a past term is complete', () => {
    const legacySlots = [1, 2].map(id => ({ id, is_pool: true, class_code: 'GEN_ED', semester_number: id === 1 ? 1 : 3 }))
    const panel = buildGenEdPanel({
      genedProgram: 'legacy', slots: legacySlots, courses, semesterPhase: phases, planSlots: { 1: 'HIST2010', 2: 'HIST2020' },
    })
    expect(panel.rows.find(r => r.key === 'History')).toMatchObject({ done: 3, planned: 3, earned: 6, state: 'planned' })
  })
})
