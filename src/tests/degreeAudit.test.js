// degreeAudit.test.js
//
// buildDegreeAudit feeds the Requirements tab. What matters: a requirement's state follows the calendar and the
// slot's current semester (a drag override wins), prior credit reads as done and off the grid, a fixed slot is a
// requirement and a pool slot a choice, the blocks are the ones a student expects, and the hour totals agree with the
// plan header (computePlanCredits + splitCreditsByPhase), so the two screens cannot show different numbers.

import { describe, it, expect } from 'vitest'
import { buildDegreeAudit, homeOf, ownSubject } from '../lib/degreeAudit.js'
import { computePlanCredits } from '../lib/transferCredits.js'
import { splitCreditsByPhase } from '../lib/termPhase.js'
import { POOL_COURSES } from '../lib/poolResolver.js'

// semester 1 is over, 2 is under way, 3 and 4 are ahead
const semesterPhase = { 1: 'past', 2: 'current', 3: 'future', 4: 'future' }
const semesterLabels = { 1: 'Fall 2025', 2: 'Spring 2026', 3: 'Fall 2026', 4: 'Spring 2027' }

const courses = {
  CSC1300: { credits: 3 }, CSC2400: { credits: 3 }, CSC3100: { credits: 3 }, MATH1910: { credits: 4 },
  ENGL1010: { credits: 3 }, HIST2010: { credits: 3 }, ART1035: { credits: 3 },
  BIOL1010: { credits: 4 }, CHEM1010: { credits: 4 }, PSY1030: { credits: 3 },
}

const slot = (id, class_code, semester_number, extra = {}) => ({ id, class_code, semester_number, is_pool: false, flex_credits: null, ...extra })
const pool = (id, class_code, semester_number, extra = {}) => ({ id, class_code, semester_number, is_pool: true, flex_credits: null, ...extra })

function audit(overrides = {}) {
  return buildDegreeAudit({ courses, semesterPhase, semesterLabels, totalHours: 30, ...overrides })
}
const rowOf = (result, key) => result.blocks.flatMap(b => b.rows).find(r => r.key === key)

describe('buildDegreeAudit: requirement state follows the calendar', () => {
  const slots = [slot(1, 'CSC1300', 1), slot(2, 'CSC2400', 2), slot(3, 'CSC3100', 3)]

  it('reads a past, current and later term as done, in progress and planned', () => {
    const result = audit({ slots })
    expect(rowOf(result, 1)).toMatchObject({ state: 'done', term: 'Fall 2025', required: true, code: 'CSC1300' })
    expect(rowOf(result, 2)).toMatchObject({ state: 'in_progress', term: 'Spring 2026' })
    expect(rowOf(result, 3)).toMatchObject({ state: 'planned', term: 'Fall 2026' })
  })

  it('follows a drag: the override semester wins over the template', () => {
    const result = audit({ slots, planSemesterOverrides: { 1: 4 } })
    expect(rowOf(result, 1)).toMatchObject({ state: 'planned', semNum: 4, term: 'Spring 2027' })
  })

  it('never assumes a course with no semester was passed', () => {
    const result = audit({ slots: [slot(1, 'CSC1300', null)] })
    expect(rowOf(result, 1).state).toBe('planned')
  })
})

describe('buildDegreeAudit: choices', () => {
  const science = pool(10, 'SCIENCE', 3)

  it('an empty pool is not placed and says how many courses it offers', () => {
    const row = rowOf(audit({ slots: [science] }), 10)
    expect(row).toMatchObject({ state: 'not_placed', required: false, code: null, choose: `Choose 1 of ${POOL_COURSES.SCIENCE.length}` })
    expect(row.hours).toBeGreaterThan(0)
  })

  it('a pool with a pick reads by the pick\'s term, and the row shows the course', () => {
    const row = rowOf(audit({ slots: [science], planSlots: { 10: 'BIOL1010' } }), 10)
    expect(row).toMatchObject({ state: 'planned', code: 'BIOL1010', label: 'BIOL1010', choose: null, hours: 4 })
  })

  it('a pool slot is a choice, a fixed slot a requirement', () => {
    const result = audit({ slots: [slot(1, 'CSC1300', 1), science], planSlots: { 10: 'BIOL1010' } })
    expect(rowOf(result, 1).required).toBe(true)
    expect(rowOf(result, 10).required).toBe(false)
  })
})

describe('buildDegreeAudit: prior credit and slots that are not requirements', () => {
  it('a slot archived by prior credit is done, off the grid, and says what covered it', () => {
    const slots = [slot(1, 'ENGL1010', 1)]
    const priorCredits = [{ id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }]
    const row = rowOf(audit({ slots, priorCredits, planArchived: { 1: 'prior_credit' } }), 1)
    expect(row).toMatchObject({ state: 'done', source: 'prior_credit', sourceLabel: 'AP', semNum: null, term: null })
  })

  it('leaves out a not-applicable slot (the math chain below the student\'s placement)', () => {
    const result = audit({ slots: [slot(1, 'MATH1910', 1), slot(2, 'CSC1300', 1)], planArchived: { 1: 'not_applicable' } })
    expect(rowOf(result, 1)).toBeUndefined()
    expect(rowOf(result, 2)).toBeDefined()
  })
})

// A Computer Science-shaped Flight Foundations plan: the plan's own subject is CSC.
const FF = 'flight_foundations'
const ffSlots = [
  slot(1, 'CSC1300', 1), slot(2, 'CSC2400', 2), slot(3, 'CSC2570', 3),           // major; CSC2570 also counts for Digital Literacy
  slot(4, 'ENGL1010', 1), slot(5, 'ENGL1020', 3), slot(6, 'HIST2010', 3),         // gen-ed, fixed
  slot(7, 'MATH1910', 2),                                                         // Quantitative Reasoning (not the plan's subject)
  pool(8, 'FF_SOCIAL', 3), pool(9, 'FF_SOCIAL', 4), pool(10, 'FF_HUMANITIES', 4),
  pool(11, 'COMM_REQ', 3), pool(12, 'SCIENCE', 3),                                // pools whose members all sit in one category
  pool(13, 'MATH_STATS', 4),                                                      // a required choice outside gen-ed
  pool(14, 'CSC_ELECTIVE', 4), pool(15, 'CSC_ELECTIVE', 4),
  pool(16, 'FREE_ELECTIVE', 4, { flex_credits: 6 }),
]

describe('homeOf and ownSubject', () => {
  it('the plan own subject is the one most of its fixed, non-gen-ed courses carry', () => {
    expect(ownSubject(ffSlots)).toBe('CSC')
    expect(ownSubject([])).toBeNull()
    expect(ownSubject([slot(1, 'ME1010', 1), slot(2, 'ME1020', 1), slot(3, 'CEE2110', 1)])).toBe('ME')
  })

  it('files a slot under the major, a gen-ed category, or electives', () => {
    const home = s => homeOf(s, 'CSC')
    expect(home(slot(1, 'CSC1300', 1))).toMatchObject({ block: 'major', category: null })
    expect(home(slot(1, 'ENGL1010', 1))).toMatchObject({ block: 'gened', category: 'COMM_COMP' })
    expect(home(slot(1, 'MATH1910', 1))).toMatchObject({ block: 'gened', category: 'QR' })
    expect(home(pool(1, 'FF_SOCIAL', 1))).toMatchObject({ block: 'gened', category: 'SOC' })
    expect(home(pool(1, 'FF_LITERACY', 1))).toMatchObject({ block: 'gened', category: 'LIT' })
    expect(home(pool(1, 'COMM_REQ', 1))).toMatchObject({ block: 'gened', category: 'COMM_ORAL' })
    expect(home(pool(1, 'SCIENCE', 1))).toMatchObject({ block: 'gened', category: 'SCI' })
    expect(home(pool(1, 'MATH_STATS', 1))).toMatchObject({ block: 'major' })
    expect(home(pool(1, 'CSC_ELECTIVE', 1))).toMatchObject({ block: 'electives' })
    expect(home(pool(1, 'CSC_HPC_ELECTIVE_2026', 1))).toMatchObject({ block: 'electives' })
    expect(home(pool(1, 'ME_ELECTIVE', 1))).toMatchObject({ block: 'electives' })
    expect(home(pool(1, 'FREE_ELECTIVE', 1))).toMatchObject({ block: 'electives' })
  })

  it('keeps a course of the plan own subject in the major even when it counts for a category', () => {
    expect(homeOf(slot(1, 'CSC2570', 1), 'CSC')).toMatchObject({ block: 'major', alsoCounts: 'LIT' })
    expect(homeOf(slot(1, 'CSC2570', 1), 'ME')).toMatchObject({ block: 'gened', category: 'LIT' })
  })
})

describe('buildDegreeAudit: blocks', () => {
  const result = audit({ slots: ffSlots, genedProgram: FF, majorLabel: 'CSC Cybersecurity', totalHours: 60 })
  const block = id => result.blocks.find(b => b.id === id)
  const keys = b => b.rows.map(r => r.key)

  it('has three blocks in a fixed order, the first named for the major', () => {
    expect(result.blocks.map(b => b.id)).toEqual(['major', 'gened', 'electives'])
    expect(block('major').title).toBe('CSC Cybersecurity')
    expect(audit({ slots: ffSlots }).blocks[0].title).toBe('Your major')
  })

  it('files every slot in exactly one block', () => {
    const all = result.blocks.flatMap(keys)
    expect([...all].sort((a, b) => a - b)).toEqual(ffSlots.map(s => s.id))
    expect(new Set(all).size).toBe(all.length)
  })

  it('puts the department courses and required choices in the major', () => {
    expect(keys(block('major'))).toEqual([1, 2, 3, 13])
  })

  it('puts everything that counts toward a gen-ed category in general education, even from Required or Choose-from lists', () => {
    expect([...keys(block('gened'))].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('puts elective pools and Free Elective hours in electives', () => {
    expect(keys(block('electives'))).toEqual([14, 15, 16])
  })

  it('groups general education by category, in the program order, with every category shown', () => {
    const groups = block('gened').groups
    expect(groups.map(g => g.id)).toEqual(['COMM_COMP', 'COMM_ORAL', 'QR', 'HIST', 'SOC', 'HUM', 'SCI', 'LIT'])
    expect(groups.find(g => g.id === 'SOC').rows.map(r => r.key)).toEqual([8, 9])
    expect(groups.find(g => g.id === 'COMM_ORAL').rows.map(r => r.key)).toEqual([11])
    expect(groups.find(g => g.id === 'SCI').rows.map(r => r.key)).toEqual([12])
    expect(groups.every(g => g.progress)).toBe(true)
  })

  it('points a category at a major course that counts for it, instead of listing the course twice', () => {
    const lit = block('gened').groups.find(g => g.id === 'LIT')
    expect(lit.rows).toEqual([])
    expect(lit.refs).toHaveLength(1)
    expect(lit.refs[0]).toMatchObject({ key: 3, code: 'CSC2570' })
    expect(lit.progress.earned).toBeGreaterThan(0)
    expect(block('major').rows.find(r => r.key === 3)).toMatchObject({ alsoCounts: 'Financial Literacy or Digital Literacy' })
    expect(block('gened').rows.some(r => r.code === 'CSC2570')).toBe(false)
  })

  it('groups the major into required courses and one group per required choice', () => {
    expect(block('major').groups.map(g => g.title)).toEqual(['Required courses', 'Statistics'])
  })

  it('groups electives by pool, Free Elective hours last', () => {
    expect(block('electives').groups.map(g => g.title)).toEqual(['CSC Elective', 'Free electives'])
  })

  it('counts each state and marks a block complete only when every row is done', () => {
    const r = audit({ slots: [slot(1, 'CSC1300', 1), slot(2, 'CSC2400', 2), slot(3, 'CSC3100', 3)] })
    const major = r.blocks[0]
    expect(major.counts).toEqual({ done: 1, in_progress: 1, planned: 1, not_placed: 0 })
    expect(major.total).toBe(3)
    expect(major.complete).toBe(false)
    expect(audit({ slots: [slot(1, 'CSC1300', 1)] }).blocks[0].complete).toBe(true)
  })

  it('omits a block with nothing in it', () => {
    expect(audit({ slots: [slot(1, 'CSC1300', 1)] }).blocks.map(b => b.id)).toEqual(['major'])
  })

  it('carries the gen-ed summary on the gen-ed block, and only there', () => {
    expect(block('gened').panel).toMatchObject({ program: FF, title: 'Flight Foundations' })
    expect(result.blocks.filter(b => b.panel).map(b => b.id)).toEqual(['gened'])
  })
})

describe('buildDegreeAudit: legacy general education', () => {
  const slots = [
    slot(1, 'CSC1300', 1), slot(2, 'ENGL1010', 1),
    pool(3, 'GEN_ED', 3), pool(4, 'GEN_ED', 3), pool(5, 'SCIENCE', 3), pool(6, 'ENG_LIT', 3),
  ]

  it('shows the three category rows of hours and one list of the student general-education courses', () => {
    const gened = audit({ slots, genedProgram: 'legacy' }).blocks.find(b => b.id === 'gened')
    expect(gened.groups.map(g => g.id)).toEqual(['History', 'Humanities', 'Social', 'picks'])
    expect(gened.groups.slice(0, 3).every(g => g.progress && g.rows.length === 0)).toBe(true)
    expect(gened.groups[3].rows.map(r => r.key)).toEqual([2, 3, 4, 5, 6])
    expect(gened.panel).toMatchObject({ program: 'legacy' })
  })
})

describe('buildDegreeAudit: Free Elective hours', () => {
  const free = pool(6, 'FREE_ELECTIVE', 4, { flex_credits: 8 })

  it('an unfilled bucket is one row for all its hours', () => {
    const rows = audit({ slots: [free] }).blocks[0].rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: 6, state: 'not_placed', hours: 8 })
  })

  it('a short pick leaves the open hours as a second row the plan can open', () => {
    const rows = audit({ slots: [free], planSlots: { 6: 'PSY1030' } }).blocks[0].rows
    expect(rows.map(r => r.key)).toEqual([6, 'rem_6'])
    expect(rows[0]).toMatchObject({ state: 'planned', code: 'PSY1030' })
    expect(rows[1]).toMatchObject({ state: 'not_placed', hours: 5 })
  })

  it('follow-up picks spend the open hours', () => {
    const freeAddSlots = [{ id: 1, course_code: 'ART1035', fills_slot_id: 6, semester_number: 4 }]
    const rows = audit({ slots: [free], planSlots: { 6: 'PSY1030' }, freeAddSlots }).blocks[0].rows
    expect(rows.find(r => r.key === 'rem_6').hours).toBe(2)
  })
})

describe('buildDegreeAudit: summary hours', () => {
  const slots = [slot(1, 'CSC1300', 1), slot(2, 'CSC2400', 2), slot(3, 'CSC3100', 3), pool(4, 'SCIENCE', 4)]
  const planSlots = { 4: 'BIOL1010' }

  it('splits done, in progress and planned hours and what remains of the degree', () => {
    const { summary } = audit({ slots, planSlots, totalHours: 30 })
    expect(summary).toMatchObject({ total: 30, done: 3, inProgress: 3, planned: 7, remaining: 17 })
  })

  it('counts prior credit as done', () => {
    const priorCredits = [{ id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }]
    const { summary } = audit({ slots, planSlots, priorCredits, totalHours: 30 })
    expect(summary.done).toBe(6)
  })

  it('agrees with the plan header: done equals splitCreditsByPhase().completed', () => {
    const priorCredits = [{ id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }]
    const { breakdown } = computePlanCredits(planSlots, priorCredits, slots, courses, [])
    const semOf = item => slots.find(s => s.id === item.slotId)?.semester_number
    const header = splitCreditsByPhase(breakdown, semOf, semesterPhase)
    const { summary } = audit({ slots, planSlots, priorCredits, totalHours: 30 })
    expect(summary.done).toBe(header.completed)
    expect(summary.inProgress + summary.planned).toBe(header.planned)
  })

  it('counts a course once however it is entered', () => {
    const priorCredits = [{ id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'CSC1300', credits_awarded: 3 }]
    const freeAddSlots = [{ id: 1, course_code: 'CSC1300', semester_number: 3 }]
    const { summary } = audit({ slots: [slot(1, 'CSC1300', 1)], priorCredits, freeAddSlots, totalHours: 30 })
    expect(summary.done + summary.inProgress + summary.planned).toBe(3)
  })

  it('stacks the bars within 100% when the plan holds more than the degree needs', () => {
    const { summary } = audit({ slots, planSlots, totalHours: 8 })
    expect(summary.remaining).toBe(0)
    expect(summary.donePct + summary.inProgressPct + summary.plannedPct).toBeLessThanOrEqual(100)
    expect(summary.inProgressPct).toBeGreaterThanOrEqual(0)
    expect(summary.plannedPct).toBeGreaterThanOrEqual(0)
  })

  it('uses the hours placed as the total when the program declares none', () => {
    const { summary } = audit({ slots, planSlots, totalHours: 0 })
    expect(summary.total).toBe(13)
    expect(summary.remaining).toBe(0)
  })

  it('is empty and safe with no slots', () => {
    const result = buildDegreeAudit({})
    expect(result.blocks).toEqual([])
    expect(result.summary).toMatchObject({ done: 0, inProgress: 0, planned: 0, remaining: 0 })
  })
})
