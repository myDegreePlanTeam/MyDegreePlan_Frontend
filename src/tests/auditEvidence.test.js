// auditEvidence.test.js
//
// The Requirements tab must say where a category's hours come from and what did not count toward a requirement. A category that
// reads "3 of 6 hrs" from a course nobody can find, or hours that vanish above a limit, is the audit failing at its one job.

import { describe, it, expect } from 'vitest'
import { buildDegreeAudit } from '../lib/degreeAudit.js'

const FF = 'flight_foundations'
const course = (code, credits = 3, name = `${code} name`) => [code, { code, name, credits }]
const courses = Object.fromEntries([
  course('CSC1300', 4), course('CSC2570'), course('ENGL1010'), course('HIST2010'), course('HIST2020'),
  course('ECON2010'), course('PSY1030'), course('ART1035'), course('ART2000'), course('ENGL2130'), course('MUS1030'),
  course('PHIL1030'), course('SPAN1010'), course('FREN1010'), course('CSC1200'), course('MATH1910', 4),
])
const semesterPhase = { 1: 'past', 2: 'current', 3: 'future' }
const semesterLabels = { 1: 'Fall 2025', 2: 'Spring 2026', 3: 'Fall 2026' }

const fixed = (id, class_code, semester_number = 3) => ({ id, class_code, semester_number, is_pool: false, flex_credits: null })
const pool = (id, class_code, semester_number = 3, flex_credits = null) => ({ id, class_code, semester_number, is_pool: true, flex_credits })

function audit(extra = {}) {
  return buildDegreeAudit({
    courses, semesterPhase, semesterLabels, genedProgram: FF, totalHours: 120,
    slots: [fixed(1, 'CSC1300'), pool(2, 'FF_SOCIAL'), pool(3, 'FF_SOCIAL'), pool(4, 'FF_HUMANITIES'), pool(5, 'FF_HUMANITIES')],
    ...extra,
  })
}
const gened = a => a.blocks.find(b => b.id === 'gened')
const group = (a, id) => gened(a).groups.find(g => g.id === id)
const itemsOf = (a, kind) => a.notCounted.filter(i => i.kind === kind)

describe('where a category\'s hours come from', () => {
  it('lists an added course that counts toward a category, under that category', () => {
    const a = audit({ freeAddSlots: [{ id: 7, course_code: 'PSY1030', semester_number: 3 }] })
    const soc = group(a, 'SOC')
    expect(soc.progress.earned).toBe(3)
    expect(soc.refs).toHaveLength(1)
    expect(soc.refs[0]).toMatchObject({ kind: 'added', key: 'fa_7', code: 'PSY1030', hours: 3, term: 'Fall 2026', state: 'planned', label: 'Counted from a course you added' })
  })

  it('does not report that same course as unused', () => {
    const a = audit({ freeAddSlots: [{ id: 7, course_code: 'PSY1030', semester_number: 3 }] })
    expect(a.notCounted).toEqual([])
  })

  it('lists prior credit that counts toward a category but fills no slot, as done and not openable', () => {
    const priorCredits = [{ id: 'p1', credit_type: 'ap_credit', satisfies_course_code: 'PSY1030', credits_awarded: 3, note: 'AP Psychology, score 4' }]
    const soc = group(audit({ priorCredits }), 'SOC')
    expect(soc.refs[0]).toMatchObject({ kind: 'prior', key: null, code: 'PSY1030', state: 'done', sourceLabel: 'AP', note: 'AP Psychology, score 4' })
  })

  it('lists a pick from an elective pool that happens to count toward a category', () => {
    const slots = [fixed(1, 'CSC1300'), pool(2, 'CSC_ELECTIVE', 3), pool(3, 'FF_SOCIAL')]
    const a = audit({ slots, planSlots: { 2: 'CSC2570' } })    // CSC2570 is a Digital Literacy course
    expect(group(a, 'LIT').refs[0]).toMatchObject({ kind: 'electives', key: 2, code: 'CSC2570', label: 'Counted from your electives' })
  })

  it('does not point a category at a course that is one of its own rows', () => {
    const a = audit({ planSlots: { 2: 'ECON2010' } })
    expect(group(a, 'SOC').rows.some(r => r.code === 'ECON2010')).toBe(true)
    expect(group(a, 'SOC').refs).toEqual([])
  })

  it('a prior credit that covers a pool slot names its own course and note on the row', () => {
    const priorCredits = [{ id: 'p1', credit_type: 'ap_credit', satisfies_course_code: 'ECON2010', credits_awarded: 3, satisfies_pool: 'FF_SOCIAL', note: 'AP Macroeconomics, score 5' }]
    const a = audit({ priorCredits, planArchived: { 2: 'prior_credit' } })
    const row = group(a, 'SOC').rows.find(r => r.slotId === 2)
    expect(row).toMatchObject({ code: 'ECON2010', state: 'done', source: 'prior_credit', sourceLabel: 'AP', sourceNote: 'AP Macroeconomics, score 5', choose: null })
    expect(group(a, 'SOC').refs).toEqual([])
  })

  it('lists the courses spending a Free Elective\'s hours under Free electives', () => {
    const slots = [fixed(1, 'CSC1300'), pool(9, 'FREE_ELECTIVE', 3, 6)]
    const a = audit({ slots, planSlots: { 9: 'ART1035' }, freeAddSlots: [{ id: 4, course_code: 'MUS1030', semester_number: 3, fills_slot_id: 9 }] })
    const free = a.blocks.find(b => b.id === 'electives').groups.find(g => g.id === 'elective:FREE_ELECTIVE')
    expect(free.refs.map(r => r.code)).toEqual(['MUS1030'])
    expect(a.notCounted).toEqual([])
  })
})

describe('what did not count toward a requirement', () => {
  it('lists an added course that fills nothing, openable, with its hours and term', () => {
    const a = audit({ freeAddSlots: [{ id: 8, course_code: 'CSC1200', semester_number: 2 }] })
    expect(a.notCounted).toHaveLength(1)
    expect(a.notCounted[0]).toMatchObject({ kind: 'extra', key: 'fa_8', code: 'CSC1200', hours: 3, term: 'Spring 2026' })
    expect(a.notCounted[0].reason).toMatch(/total hours/)
  })

  it('lists an added course that repeats one already counted, with no hours', () => {
    const a = audit({ freeAddSlots: [{ id: 8, course_code: 'CSC1300', semester_number: 3 }] })
    expect(a.notCounted[0]).toMatchObject({ kind: 'duplicate', code: 'CSC1300', hours: 0 })
  })

  it('counts a repeated added course once: the first is extra, the second a duplicate', () => {
    const a = audit({ freeAddSlots: [{ id: 8, course_code: 'CSC1200', semester_number: 3 }, { id: 9, course_code: 'CSC1200', semester_number: 3 }] })
    expect(a.notCounted.map(i => i.kind)).toEqual(['duplicate', 'extra'])
  })

  it('lists hours above a category\'s limit, as many as the evaluator says are over', () => {
    const humanities = ['ART1035', 'ART2000', 'ENGL2130', 'MUS1030', 'PHIL1030']
    const a = audit({
      planSlots: { 4: 'ART1035', 5: 'ART2000' },
      freeAddSlots: humanities.slice(2).map((code, i) => ({ id: 20 + i, course_code: code, semester_number: 3 })),
    })
    const hum = group(a, 'HUM').progress
    expect(hum.excess).toBeGreaterThan(0)
    const item = itemsOf(a, 'over_cap')[0]
    expect(item).toMatchObject({ name: 'Humanities and Cultural Expression', hours: hum.excess })
    expect(group(a, 'HUM').note).toMatch(new RegExp(`${hum.excess} hours above`))
  })

  it('lists introductory language beyond its cap once, not again as a category overflow', () => {
    const a = audit({ planSlots: { 4: 'SPAN1010', 5: 'FREN1010' } })
    const language = itemsOf(a, 'language_cap')
    expect(language).toHaveLength(1)
    expect(language[0].hours).toBe(3)
    const hum = group(a, 'HUM').progress
    expect(hum.excess).toBe(3)
    expect(itemsOf(a, 'over_cap').filter(i => i.name.startsWith('Humanities'))).toEqual([])
  })

  it('lists hours in a category the major is exempt from', () => {
    const a = audit({ genedExempt: ['HIST'], planSlots: {}, slots: [fixed(1, 'CSC1300'), fixed(2, 'HIST2010'), fixed(3, 'HIST2020'), pool(4, 'FF_SOCIAL')] })
    const item = itemsOf(a, 'exempt')[0]
    expect(item).toMatchObject({ name: 'Historical Foundations', hours: 6 })
    expect(item.reason).toMatch(/exempt/)
  })

  it('lists a prior credit that fills no requirement, one counted twice, and a placement that awarded no hours', () => {
    const priorCredits = [
      { id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'CSC1200', credits_awarded: 3 },
      { id: 'b', credit_type: 'transfer_credit', satisfies_course_code: 'CSC1200', credits_awarded: 3 },
      { id: 'c', credit_type: 'act_placement', satisfies_course_code: null, credits_awarded: 0, note: 'ACT Math 29' },
    ]
    const kinds = Object.fromEntries(audit({ priorCredits }).notCounted.map(i => [i.kind, i]))
    expect(kinds.extra).toMatchObject({ code: 'CSC1200', hours: 3 })
    expect(kinds.duplicate).toMatchObject({ code: 'CSC1200' })
    expect(kinds.placement).toMatchObject({ name: 'ACT Math 29', hours: 0 })
    expect(kinds.placement.reason).toMatch(/ACT Math 29/)
  })

  it('does not list a prior credit that covered a slot, or one that counts toward a category', () => {
    const priorCredits = [
      { id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'CSC1300', credits_awarded: 4 },
      { id: 'b', credit_type: 'ap_credit', satisfies_course_code: 'PSY1030', credits_awarded: 3 },
    ]
    expect(audit({ priorCredits, planArchived: { 1: 'prior_credit' } }).notCounted).toEqual([])
  })

  it('orders the list: over limits first, then repeats, extras, placements', () => {
    const priorCredits = [
      { id: 'c', credit_type: 'act_placement', satisfies_course_code: null, credits_awarded: 0, note: 'ACT Math 29' },
      { id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'CSC1200', credits_awarded: 3 },
    ]
    const a = audit({ priorCredits, planSlots: { 4: 'SPAN1010', 5: 'FREN1010' }, freeAddSlots: [{ id: 8, course_code: 'CSC1300', semester_number: 3 }] })
    expect(a.notCounted.map(i => i.kind)).toEqual(['language_cap', 'duplicate', 'extra', 'placement'])
  })

  it('is empty for a plan where everything counts', () => {
    expect(audit().notCounted).toEqual([])
  })
})

describe('a legacy plan', () => {
  const slots = [fixed(1, 'CSC1300'), pool(2, 'GEN_ED'), pool(3, 'GEN_ED')]

  it('keeps no course lists, so categories carry no references', () => {
    const a = buildDegreeAudit({ courses, slots, genedProgram: 'legacy', semesterPhase, semesterLabels, freeAddSlots: [{ id: 7, course_code: 'PSY1030', semester_number: 3 }] })
    for (const g of a.blocks.find(b => b.id === 'gened').groups) expect(g.refs).toEqual([])
  })

  it('does not call a prior credit unused when it counts toward History, Humanities or Social', () => {
    const priorCredits = [{ id: 'a', credit_type: 'ap_credit', satisfies_course_code: 'HIST2010', credits_awarded: 3 }]
    const a = buildDegreeAudit({ courses, slots, genedProgram: 'legacy', semesterPhase, semesterLabels, priorCredits })
    expect(a.notCounted).toEqual([])
  })
})
