import { describe, it, expect } from 'vitest'
import { getGenEdStatus } from '../lib/poolResolver.js'

// Minimal slot fixtures — just enough shape for getGenEdStatus
const SLOT_GEN_ED = id => ({ id, is_pool: true, class_code: 'GEN_ED' })
const SLOT_OTHER  = id => ({ id, is_pool: false, class_code: 'ENGL1301' })

// 6 GEN_ED pool slots (two per sub-pool capacity)
const GEN_ED_SLOTS = [1, 2, 3, 4, 5, 6].map(SLOT_GEN_ED)
const ALL_SLOTS    = [...GEN_ED_SLOTS, SLOT_OTHER(99)]

// Minimal courseMap: 3 hr per course
const courseMap = {
  HIST2010: { credits: 3 }, HIST2020: { credits: 3 },   // History
  HIST2310: { credits: 3 }, HIST2320: { credits: 3 },   // Humanities
  ECON2010: { credits: 3 },                              // Social
}

function pc(id, code, credits) {
  return { id, satisfies_course_code: code, credits_awarded: credits, satisfies_pool: 'GEN_ED' }
}

describe('getGenEdStatus — prior credits', () => {
  it('no prior credits, no plan slots → all zeros', () => {
    const result = getGenEdStatus({}, ALL_SLOTS, courseMap)
    expect(result.find(r => r.category === 'History').filled).toBe(0)
    expect(result.find(r => r.category === 'Humanities').filled).toBe(0)
    expect(result.find(r => r.category === 'Social').filled).toBe(0)
  })

  it('History prior credits sum correctly', () => {
    const priorCredits = [pc(1, 'HIST2010', 3), pc(2, 'HIST2020', 3)]
    const result = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits)
    expect(result.find(r => r.category === 'History').filled).toBe(6)
    expect(result.find(r => r.category === 'History').satisfied).toBe(true)
  })

  it('Humanities prior credits (HIST2310 + HIST2320) sum correctly', () => {
    const priorCredits = [pc(1, 'HIST2310', 3), pc(2, 'HIST2320', 3)]
    const result = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits)
    expect(result.find(r => r.category === 'Humanities').filled).toBe(6)
    expect(result.find(r => r.category === 'Humanities').satisfied).toBe(true)
  })

  it('Social prior credit sums correctly', () => {
    const priorCredits = [pc(1, 'ECON2010', 3)]
    const result = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits)
    expect(result.find(r => r.category === 'Social').filled).toBe(3)
  })

  it('plan-slot credits and prior-credit credits combine without double-counting', () => {
    // Slot 1 filled with HIST2010 (plan), prior credit for HIST2020 (prior)
    const planSlots    = { 1: 'HIST2010' }
    const priorCredits = [pc(1, 'HIST2020', 3)]
    const result = getGenEdStatus(planSlots, ALL_SLOTS, courseMap, priorCredits)
    expect(result.find(r => r.category === 'History').filled).toBe(6)
  })

  it('prior credits with credits_awarded = 0 are not counted', () => {
    const priorCredits = [pc(1, 'HIST2010', 0)]
    const result = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits)
    expect(result.find(r => r.category === 'History').filled).toBe(0)
  })

  it('prior credits for non-GEN_ED courses are not counted', () => {
    // ENGL1301 is not in GEN_ED_CATEGORIES
    const priorCredits = [{ id: 1, satisfies_course_code: 'ENGL1301', credits_awarded: 3 }]
    const result = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits)
    expect(result.find(r => r.category === 'History').filled).toBe(0)
    expect(result.find(r => r.category === 'Humanities').filled).toBe(0)
    expect(result.find(r => r.category === 'Social').filled).toBe(0)
  })

  it('omitting priorCredits argument (default []) behaves identically to old 3-arg signature', () => {
    const planSlots = { 1: 'HIST2010' }
    const withDefault  = getGenEdStatus(planSlots, ALL_SLOTS, courseMap)
    const withExplicit = getGenEdStatus(planSlots, ALL_SLOTS, courseMap, [])
    expect(withDefault).toEqual(withExplicit)
  })

  it('prior credits with missing satisfies_course_code are ignored', () => {
    const priorCredits = [{ id: 1, satisfies_course_code: null, credits_awarded: 3 }]
    const result = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits)
    expect(result.find(r => r.category === 'History').filled).toBe(0)
  })
})

// ── BUG-54: archived slots are not remaining capacity ────────────────────────
// A slot archived by a prior credit is gone from the grid. Counting it as an
// open seat overstates how much GEN_ED room is left, which silenced the
// at-risk warning for the student whose prior credits saturate two sub-pools.
describe('getGenEdStatus — archived slots (BUG-54)', () => {
  it('archived GEN_ED slots do not count as remaining capacity', () => {
    // Humanities + Social satisfied by prior credits; History still needs 6 hrs.
    const priorCredits = [
      pc(1, 'HIST2310', 3), pc(2, 'HIST2320', 3),   // Humanities 6
      pc(3, 'ECON2010', 3), pc(4, 'GEOG1012', 3),   // Social 6
    ]
    // Those four credits archived four of the six GEN_ED slots.
    const planArchived = { 1: 'prior_credit', 2: 'prior_credit', 3: 'prior_credit', 4: 'prior_credit' }

    const result = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits, planArchived)
    const history = result.find(r => r.category === 'History')

    // Two live slots × 3 hrs exactly covers the 6-hr History shortfall.
    expect(history.filled).toBe(0)
    expect(history.satisfied).toBe(false)
    expect(history.atRisk).toBe(false)
  })

  it('flags at risk when archiving leaves too few slots for the shortfall', () => {
    // Same student, but a template with only five GEN_ED slots: four archived
    // leaves one seat for a 6-hr History requirement.
    const FIVE_SLOTS = [[1, 2, 3, 4, 5].map(SLOT_GEN_ED), SLOT_OTHER(99)].flat()
    const priorCredits = [
      pc(1, 'HIST2310', 3), pc(2, 'HIST2320', 3),
      pc(3, 'ECON2010', 3), pc(4, 'GEOG1012', 3),
    ]
    const planArchived = { 1: 'prior_credit', 2: 'prior_credit', 3: 'prior_credit', 4: 'prior_credit' }

    const result = getGenEdStatus({}, FIVE_SLOTS, courseMap, priorCredits, planArchived)
    const history = result.find(r => r.category === 'History')

    expect(history.satisfied).toBe(false)
    expect(history.atRisk).toBe(true)
  })

  it('does not count a preserved selection on an archived slot', () => {
    // BUG-42 preserves the student's pick on an archived slot's DB row so an
    // unarchive restores it — but the course is not in the plan any more.
    const planSlots    = { 1: 'HIST2310' }             // Humanities pick, slot archived
    const planArchived = { 1: 'prior_credit' }
    const result = getGenEdStatus(planSlots, ALL_SLOTS, courseMap, [], planArchived)
    expect(result.find(r => r.category === 'Humanities').filled).toBe(0)
  })

  it('omitting planArchived (default {}) behaves identically to the 4-arg signature', () => {
    const priorCredits = [pc(1, 'HIST2010', 3)]
    const withDefault  = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits)
    const withExplicit = getGenEdStatus({}, ALL_SLOTS, courseMap, priorCredits, {})
    expect(withDefault).toEqual(withExplicit)
  })
})
