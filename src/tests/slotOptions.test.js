// slotOptions.test.js
//
// slotOptions is what both the slot picker and the Requirements tab read, so an option has one answer: which courses a slot
// offers, and whether each can go there now (available, locked by standing or a prerequisite, or already taken).

import { describe, it, expect } from 'vitest'
import { resolveSlotCourses, buildOptionContext, annotateOption, listSlotOptions } from '../lib/slotOptions.js'
import { POOL_COURSES } from '../lib/poolResolver.js'

const course = (code, credits = 3, extra = {}) => ({ code, name: `${code} name`, credits, ...extra })
const courseMap = {
  COMM2025: course('COMM2025'), PC2500: course('PC2500'), CSC1310: course('CSC1310'), CSC3040: course('CSC3040'),
  BIOL1113: course('BIOL1113', 4), BIOL1123: course('BIOL1123', 4), BIOL2310: course('BIOL2310', 4),
  CHEM1110: course('CHEM1110', 4), CHEM1120: course('CHEM1120', 4), PHYS2010: course('PHYS2010', 4),
}

// the slots: sem 1 = CSC1310 and a Communications pick, sem 3 = the slot under test
const slotAt = (id, class_code, semester_number, is_pool = true) => ({ id, class_code, semester_number, is_pool, flex_credits: null })

function inputs(extra = {}) {
  return {
    courseMap, slots: [], planSlots: {}, planArchived: {}, planSemesterOverrides: {}, priorCredits: [], freeAddSlots: [],
    prereqMap: {}, coreqMap: {}, ...extra,
  }
}

describe('resolveSlotCourses', () => {
  it('a pool offers its members that the catalog loaded', () => {
    const slot = slotAt(1, 'COMM_REQ', 3)
    const { courses, freeSections } = resolveSlotCourses(slot, { courseMap, slots: [slot], planSlots: {} })
    expect(courses.map(c => c.code).sort()).toEqual(POOL_COURSES.COMM_REQ.filter(c => courseMap[c]).sort())
    expect(freeSections).toBeNull()
  })

  it('a Free Elective offers the whole catalog, in sections', () => {
    const slot = slotAt(1, 'FREE_ELECTIVE', 3)
    const result = resolveSlotCourses(slot, { courseMap, slots: [slot], planSlots: {} })
    expect(result.freeSections).not.toBeNull()
  })

  it('a science slot narrows to the partners of a Biology course already chosen in another science slot', () => {
    const a = slotAt(1, 'SCIENCE', 2)
    const b = slotAt(2, 'SCIENCE', 3)
    const result = resolveSlotCourses(b, { courseMap, slots: [a, b], planSlots: { 1: 'BIOL1113' } })
    expect(result.courses.map(c => c.code).sort()).toEqual(['BIOL1123', 'BIOL2310'])
    expect(result.scienceNotice).toMatch(/Biology/)
  })

  it('a science slot autofills the partner of a Chemistry course chosen elsewhere', () => {
    const a = slotAt(1, 'SCIENCE', 2)
    const b = slotAt(2, 'SCIENCE', 3)
    const result = resolveSlotCourses(b, { courseMap, slots: [a, b], planSlots: { 1: 'CHEM1110' } })
    expect(result.autoFill?.code).toBe('CHEM1120')
  })

  it('ignores the slot\'s own pick when narrowing, so changing a pick still shows the options', () => {
    const a = slotAt(1, 'SCIENCE', 2)
    const result = resolveSlotCourses(a, { courseMap, slots: [a], planSlots: { 1: 'BIOL1113' } })
    expect(result.scienceNotice).toBeNull()
    expect(result.autoFill).toBeNull()
  })
})

describe('annotateOption', () => {
  const slot = slotAt(10, 'COMM_REQ', 3)
  const annotate = (code, extra = {}) => {
    const inp = inputs({ slots: [slot], ...extra })
    return annotateOption(courseMap[code], buildOptionContext(slot, inp))
  }

  it('is available when nothing stands in the way', () => {
    expect(annotate('COMM2025').status).toBe('available')
  })

  it('is taken when another slot already holds the course', () => {
    const other = slotAt(11, 'COMM_REQ', 4)
    expect(annotate('COMM2025', { slots: [slot, other], planSlots: { 11: 'COMM2025' } }).status).toBe('taken')
  })

  it('does not count the slot\'s own pick as taken', () => {
    expect(annotate('COMM2025', { planSlots: { 10: 'COMM2025' } }).status).toBe('available')
  })

  it('ignores a pick left on an archived slot', () => {
    const other = slotAt(11, 'COMM_REQ', 4)
    expect(annotate('COMM2025', { slots: [slot, other], planSlots: { 11: 'COMM2025' }, planArchived: { 11: 'not_applicable' } }).status).toBe('available')
  })

  it('is locked, with what is missing, when a prerequisite is not in an earlier term', () => {
    const prereqMap = { CSC3040: { 0: { logic: 'AND', codes: ['CSC1310'] } } }
    const result = annotate('CSC3040', { prereqMap })
    expect(result.status).toBe('locked')
    expect(result.missing).toEqual(['CSC1310'])
  })

  it('is available once the prerequisite sits in an earlier semester', () => {
    const prereqMap = { CSC3040: { 0: { logic: 'AND', codes: ['CSC1310'] } } }
    const early = slotAt(1, 'CSC1310', 1, false)
    expect(annotate('CSC3040', { prereqMap, slots: [early, slot] }).status).toBe('available')
  })

  it('is locked when the prerequisite is only in the same or a later semester', () => {
    const prereqMap = { CSC3040: { 0: { logic: 'AND', codes: ['CSC1310'] } } }
    const same = slotAt(1, 'CSC1310', 3, false)
    expect(annotate('CSC3040', { prereqMap, slots: [same, slot] }).status).toBe('locked')
  })

  it('is locked, with a hint, for a course that needs standing the plan has not reached by then', () => {
    const senior = course('CSC4999', 3, { standing_req: 'senior' })
    const result = annotateOption(senior, buildOptionContext(slot, inputs({ slots: [slot], courseMap: { ...courseMap, CSC4999: senior } })))
    expect(result.status).toBe('locked')
    expect(result.standingHint).toMatch(/senior standing/)
  })
})

describe('listSlotOptions', () => {
  it('orders available options first, then locked, then taken', () => {
    const slot = slotAt(10, 'COMM_REQ', 3)
    const other = slotAt(11, 'COMM_REQ', 4)
    const prereqMap = { PC2500: { 0: { logic: 'AND', codes: ['CSC1310'] } } }
    const result = listSlotOptions(slot, inputs({ slots: [slot, other], planSlots: { 11: 'COMM2025' }, prereqMap }))
    expect(result.open).toBe(false)
    expect(result.options.map(o => `${o.code}:${o.status}`)).toEqual(['PC2500:locked', 'COMM2025:taken'])
  })

  it('reports a slot that takes any catalog course as open, with no short list', () => {
    const slot = slotAt(10, 'FREE_ELECTIVE', 3)
    expect(listSlotOptions(slot, inputs({ slots: [slot] }))).toEqual({ open: true, options: [], notice: null })
  })

  it('carries the science notice so the list can say why it is short', () => {
    const a = slotAt(1, 'SCIENCE', 2)
    const b = slotAt(2, 'SCIENCE', 3)
    const result = listSlotOptions(b, inputs({ slots: [a, b], planSlots: { 1: 'BIOL1113' } }))
    expect(result.notice).toMatch(/Biology/)
    expect(result.options.map(o => o.code)).toEqual(['BIOL1123', 'BIOL2310'])
  })
})
