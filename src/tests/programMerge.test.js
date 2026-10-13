import { describe, it, expect } from 'vitest'
import { mergePrograms, expandToShadows, genEdKey } from '../lib/programMerge.js'
import { resolveTransferCredits, computePlanCredits } from '../lib/transferCredits.js'
import { buildDegreePlan } from '../lib/degreeBuilder.js'
import { buildDegreeAudit } from '../lib/degreeAudit.js'
import { resolveMathPlacementRow } from '../lib/actScoreResolver.js'
import { T, courses, courseMap, prereqMap, coreqMap } from './support/realStudent.js'

let nextId = 1
const fixed = (code, extra = {}) => ({ id: nextId++, class_code: code, is_pool: false, flex_credits: null, gened_program: 'flight_foundations', ...extra })
const pool = (code, flex = null, extra = {}) => ({ id: nextId++, class_code: code, is_pool: true, flex_credits: flex, gened_program: 'flight_foundations', ...extra })
const crs = { ENGL1010: { credits: 3 }, MATH1910: { credits: 4 }, CSC1300: { credits: 3 }, MATH2110: { credits: 3 }, MATH3400: { credits: 3 }, PHYS2010: { credits: 4 } }
const reasonsOf = merged => merged.shadows.map(s => s.reason)

describe('mergePrograms: a fixed course named by two programs (D3)', () => {
  it('is one slot that serves both, and the other program keeps a shadow behind it', () => {
    const a = [fixed('ENGL1010'), fixed('CSC1300')]
    const b = [fixed('ENGL1010'), fixed('MATH2110')]
    const m = mergePrograms({ programId: 1, slots: a, totalHours: 120 }, [{ programId: 2, role: 'major', slots: b }], { courses: crs })
    expect(m.slots.map(s => s.class_code)).toEqual(['ENGL1010', 'CSC1300', 'MATH2110'])
    expect(m.slots[0]).toBe(a[0])
    expect(m.programsOf[a[0].id]).toEqual([1, 2])
    expect(m.programsOf[b[1].id]).toEqual([2])
    expect(m.shadows).toEqual([{ slotId: b[0].id, programId: 2, targetSlotId: a[0].id, reason: 'duplicate' }])
    expect(m.shadowOf).toEqual({ [b[0].id]: a[0].id })
  })

  it('collapses once per slot: two programs asking for a course twice keep two cards', () => {
    const a = [fixed('MATH1910')]
    const b = [fixed('MATH1910'), fixed('MATH1910')]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs })
    expect(m.slots.filter(s => s.class_code === 'MATH1910')).toHaveLength(2)
    expect(reasonsOf(m)).toEqual(['duplicate'])
  })

  it('a second added program collapses into the card the first one left, never into a shadow', () => {
    const a = [fixed('CSC1300')]
    const b = [fixed('MATH2110')]
    const c = [fixed('MATH2110'), fixed('CSC1300')]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }, { programId: 3, role: 'minor', slots: c }], { courses: crs })
    expect(m.slots.map(s => s.class_code)).toEqual(['CSC1300', 'MATH2110'])
    expect(m.programsOf[b[0].id]).toEqual([2, 3])
    expect(m.programsOf[a[0].id]).toEqual([1, 3])
  })

  it('overlapPolicy.shareCourses false keeps every program\'s own slot', () => {
    const a = [fixed('ENGL1010')]
    const b = [fixed('ENGL1010')]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs, overlapPolicy: { shareCourses: false } })
    expect(m.slots).toHaveLength(2)
    expect(m.shadows).toEqual([])
  })

  it('never collapses a pool: it is a choice', () => {
    const a = [pool('CSC_ELECTIVE'), pool('CSC_ELECTIVE')]
    const b = [pool('CSC_ELECTIVE')]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs })
    expect(m.slots).toHaveLength(3)
  })
})

describe('mergePrograms: a pool another program\'s course already satisfies', () => {
  it('is not asked a second time: the course on the grid stands behind it', () => {
    const csc1300 = fixed('CSC1300')
    const either = pool('OR_CSC1300_ENGR1120', 2)
    const m = mergePrograms({ programId: 1, slots: [csc1300] }, [{ programId: 2, slots: [either] }], { courses: crs })
    expect(m.slots).toEqual([csc1300])
    expect(m.shadows).toEqual([{ slotId: either.id, programId: 2, targetSlotId: csc1300.id, reason: 'satisfied' }])
    expect(m.shadowOf).toEqual({ [either.id]: csc1300.id })
    expect(m.programsOf[csc1300.id]).toEqual([1, 2])
    expect(m.freeElective.addedHours).toBe(0)
  })

  it('is satisfied by one course once per program: a second identical pool still has to be filled', () => {
    const csc1300 = fixed('CSC1300')
    const twice = [pool('OR_CSC1300_ENGR1120', 2), pool('OR_CSC1300_ENGR1120', 2)]
    const m = mergePrograms({ programId: 1, slots: [csc1300] }, [{ programId: 2, slots: twice }], { courses: crs })
    expect(m.slots.map(s => s.id)).toEqual([csc1300.id, twice[1].id])
  })

  it('is not satisfied by the added program\'s own course, nor by a course the pool does not list, nor when the pool is open', () => {
    const own = [fixed('CSC1300'), pool('OR_CSC1300_ENGR1120', 2)]
    expect(mergePrograms({ programId: 1, slots: [fixed('MATH2110')] }, [{ programId: 2, slots: own }], { courses: crs }).slots).toHaveLength(3)
    const unrelated = pool('OR_CSC1300_ENGR1120', 2)
    expect(mergePrograms({ programId: 1, slots: [fixed('MATH2110')] }, [{ programId: 2, slots: [unrelated] }], { courses: crs }).slots).toContain(unrelated)
    const open = pool('FOREIGN_LANGUAGE', 3)
    expect(mergePrograms({ programId: 1, slots: [fixed('CSC1300')] }, [{ programId: 2, slots: [open] }], { courses: crs }).slots).toContain(open)
  })

  it('a course the added program put on the grid satisfies a later program\'s pool', () => {
    const math = fixed('MATH2110')
    const either = pool('OR_MATH2010_MATH3810_MATH4210_MATH4510', 3)
    const m = mergePrograms({ programId: 1, slots: [fixed('CSC1300')] }, [{ programId: 2, slots: [fixed('MATH2010')] }, { programId: 3, role: 'minor', slots: [math, either] }], { courses: crs })
    expect(m.shadows.map(s => s.reason)).toEqual(['satisfied'])
    expect(m.programsOf[m.slots.find(s => s.class_code === 'MATH2010').id]).toEqual([2, 3])
  })
})

describe('mergePrograms: general education comes from the primary program (D4)', () => {
  it('pairs the added program\'s pools off against the primary\'s of the same category, spelled either way', () => {
    const a = [pool('SCIENCE', 4), pool('FF_SOCIAL', 3), pool('FF_SOCIAL', 3)]
    const b = [pool('FF_SCIENCE', 4), pool('FF_SOCIAL', 3), pool('FF_SOCIAL', 3)]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs })
    expect(m.slots).toEqual(a)
    expect(m.shadows.map(s => s.targetSlotId)).toEqual([a[0].id, a[1].id, a[2].id])
    expect(new Set(reasonsOf(m))).toEqual(new Set(['gen_ed']))
    expect(m.programsOf[a[1].id]).toEqual([1, 2])
  })

  it('keeps a pool the primary has no more of: the added program asks for it and dropping it would lose a requirement', () => {
    const a = [pool('FF_HUMANITIES', 3)]
    const b = [pool('FF_HUMANITIES', 3), pool('FF_HUMANITIES', 3), pool('FF_LITERACY', 3)]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs })
    expect(m.slots.map(s => s.class_code)).toEqual(['FF_HUMANITIES', 'FF_HUMANITIES', 'FF_LITERACY'])
    expect(m.programsOf[b[1].id]).toEqual([2])
    expect(m.shadows).toHaveLength(1)
  })

  it('drops the added program\'s gen-ed pools when it follows a different general-education program', () => {
    const a = [pool('GEN_ED', 3, { gened_program: 'legacy' })]
    const b = [pool('FF_SOCIAL', 3), pool('FF_HUMANITIES', 3)]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs })
    expect(m.slots).toEqual(a)
    expect(m.shadows.map(s => [s.reason, s.targetSlotId])).toEqual([['gen_ed', null], ['gen_ed', null]])
    expect(m.shadowOf).toEqual({})
  })

  it('knows the category of a pool, and not of a fixed course or a program pool', () => {
    expect(genEdKey(pool('FF_SCIENCE'))).toBe('SCI')
    expect(genEdKey(pool('SCIENCE'))).toBe('SCI')
    expect(genEdKey(pool('COMM_REQ'))).toBe('COMM_ORAL')
    expect(genEdKey(pool('CSC_ELECTIVE'))).toBeNull()
    expect(genEdKey(fixed('ENGL1010'))).toBeNull()
  })
})

describe('mergePrograms: Free Elective hours and the total (D5)', () => {
  it('spends the primary\'s open Free Elective hours on the added program\'s own courses first', () => {
    const fe = pool('FREE_ELECTIVE', 9)
    const a = [fixed('CSC1300'), fe]
    const b = [fixed('MATH2110'), fixed('MATH3400'), pool('FREE_ELECTIVE', 12)]
    const m = mergePrograms({ programId: 1, slots: a, totalHours: 120 }, [{ programId: 2, role: 'major', slots: b, totalHours: 120 }], { courses: crs })
    expect(m.freeElective).toEqual({ primaryHours: 9, addedHours: 6, absorbed: 6, extraHours: 0 })
    expect(m.slots.find(s => s.id === fe.id).flex_credits).toBe(3)
    expect(fe.flex_credits).toBe(9)                              // the stored row is never touched
    expect(m.totalHours).toBe(120)
    expect(m.shadows.find(s => s.slotId === b[2].id).reason).toBe('free_elective')   // the added program's own bucket is not a requirement
  })

  it('a bucket used up leaves the grid; the hours beyond it grow the plan', () => {
    const fe = pool('FREE_ELECTIVE', 5)
    const a = [fixed('CSC1300'), fe]
    const b = [fixed('MATH2110'), fixed('MATH3400'), fixed('PHYS2010')]
    const m = mergePrograms({ programId: 1, slots: a, totalHours: 120 }, [{ programId: 2, slots: b }], { courses: crs })
    expect(m.freeElective).toEqual({ primaryHours: 5, addedHours: 10, absorbed: 5, extraHours: 5 })
    expect(m.slots.some(s => s.id === fe.id)).toBe(false)
    expect(m.shadows).toContainEqual({ slotId: fe.id, programId: 1, targetSlotId: null, reason: 'free_elective' })
    expect(m.totalHours).toBe(125)
  })

  it('never shrinks a bucket below the course already picked in it', () => {
    const fe = pool('FREE_ELECTIVE', 6)
    const m = mergePrograms({ programId: 1, slots: [fe], totalHours: 120 }, [{ programId: 2, slots: [fixed('MATH2110'), fixed('MATH3400')] }],
      { courses: crs, planSlots: { [fe.id]: 'PHYS2010' } })
    expect(m.freeElective.primaryHours).toBe(2)
    expect(m.slots[0].flex_credits).toBe(4)
    expect(m.totalHours).toBe(124)
  })

  it('an added major\'s own total is a floor, a minor\'s is not', () => {
    const a = [fixed('CSC1300')]
    expect(mergePrograms({ programId: 1, slots: a, totalHours: 120 }, [{ programId: 2, role: 'major', slots: [], totalHours: 128 }]).totalHours).toBe(128)
    expect(mergePrograms({ programId: 1, slots: a, totalHours: 120 }, [{ programId: 2, role: 'minor', slots: [], totalHours: 128 }]).totalHours).toBe(120)
  })

  it('with nothing added the list and the total are the primary\'s', () => {
    const a = [fixed('CSC1300'), pool('FREE_ELECTIVE', 5)]
    const m = mergePrograms({ programId: 1, slots: a, totalHours: 120 }, [], { courses: crs })
    expect(m.slots).toEqual(a)
    expect(m.totalHours).toBe(120)
    expect(m.shadows).toEqual([])
  })
})

describe('mergePrograms: prior credit across shadows', () => {
  it('a credit archives the visible card, and expandToShadows gives the hidden row the same state', () => {
    const a = [fixed('MATH1910')]
    const b = [fixed('MATH1910'), fixed('MATH2110')]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs })
    const credit = [{ id: 'ap', credit_type: 'ap_credit', satisfies_course_code: 'MATH1910', credits_awarded: 4 }]
    // merged: the one credit archives the one card
    const archived = resolveTransferCredits(credit, {}, m.slots)
    expect(Object.keys(archived)).toEqual([String(a[0].id)])
    expect(expandToShadows(archived, m.shadowOf)).toEqual({ [a[0].id]: true, [b[0].id]: true })
    // the plain concatenation archives only one of the two rows: the second card would stay on the grid
    expect(Object.keys(resolveTransferCredits(credit, {}, [...a, ...b]))).toHaveLength(1)
  })

  it('copies a picked course to the shadow of a pool too', () => {
    const a = [pool('FF_SOCIAL', 3)]
    const b = [pool('FF_SOCIAL', 3)]
    const m = mergePrograms({ programId: 1, slots: a }, [{ programId: 2, slots: b }], { courses: crs })
    expect(expandToShadows({ [a[0].id]: 'PSY1030' }, m.shadowOf)).toEqual({ [a[0].id]: 'PSY1030', [b[0].id]: 'PSY1030' })
    expect(expandToShadows({}, m.shadowOf)).toEqual({})
  })
})

// ── Real catalog ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const prog = code => T.concentrations.find(p => p.code === code)
const planOf = code => T.degree_plans.find(d => d.concentration_id === prog(code).id && d.catalog_year === '2026-2027')
const slotsOf = code => T.requirement_slots.filter(s => s.concentration_id === prog(code).id && s.catalog_year === '2026-2027')
const merge = second => mergePrograms(
  { programId: prog('core').id, slots: slotsOf('core'), totalHours: planOf('core').total_hours },
  [{ programId: prog(second).id, role: 'major', slots: slotsOf(second), totalHours: planOf(second).total_hours }],
  { courses },
)

describe.each(['math_bs', 'bai_bsba', 'me'])('the Computer Science Core plan with %s as a second major, from the real catalog', second => {
  const merged = merge(second)
  const naive = [...slotsOf('core'), ...slotsOf(second)]
  const priorCredits = [{ id: 'act', ...resolveMathPlacementRow({ act: 29 }) }]

  it('puts every slot of both programs either on the grid or behind a shadow, once', () => {
    const ids = [...merged.slots.map(s => s.id), ...merged.shadows.map(s => s.slotId)]
    // a primary bucket that was spent appears as a shadow too, but is not in `slots`
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids)).toEqual(new Set(naive.map(s => s.id)))
  })

  it('leaves no fixed course twice', () => {
    const codes = merged.slots.filter(s => !s.is_pool).map(s => s.class_code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('counts every course once, exactly as the plain concatenation does (so the hours cannot inflate)', () => {
    const count = list => computePlanCredits({}, priorCredits, list, courses, []).totalEarned
    expect(count(merged.slots)).toBe(count(naive))
  })

  it('places every slot, within the semester load limit, in fewer semesters than the concatenation', () => {
    const profile = { student_type: 'incoming_freshman', act_math: 29, start_season: 'Fall' }
    const build = slots => buildDegreePlan({ slots, courseMap, prereqMap, coreqMap, priorCredits, studentProfile: profile })
    const a = build(merged.slots)
    const b = build(naive)
    expect(merged.slots.filter(s => a.assignments[s.id] == null && !a.archived[s.id])).toEqual([])
    expect(Math.max(...Object.values(a.assignments))).toBeLessThan(Math.max(...Object.values(b.assignments)))
  })

  it('feeds the audit, whose total is the merged total', () => {
    const audit = buildDegreeAudit({ slots: merged.slots, courses, genedProgram: 'flight_foundations', totalHours: merged.totalHours, priorCredits })
    expect(audit.summary.total).toBe(merged.totalHours)
    expect(merged.totalHours).toBeGreaterThanOrEqual(planOf(second).total_hours)
    expect(audit.blocks.flatMap(b => b.rows).length).toBeGreaterThan(0)
  })

  it('archives both rows of a course a prior credit covers', () => {
    const credit = [{ id: 'ap', credit_type: 'ap_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3 }]
    const archived = expandToShadows(resolveTransferCredits(credit, {}, merged.slots), merged.shadowOf)
    const rows = naive.filter(s => s.class_code === 'ENGL1010')
    expect(rows).toHaveLength(2)
    expect(rows.every(s => archived[s.id])).toBe(true)
  })
})

describe('the Computer Science Core plan with Mathematics B.S., the figures the plan records', () => {
  const merged = merge('math_bs')
  it('shares twelve fixed courses and keeps the pools the primary does not have', () => {
    expect(merged.shadows.filter(s => s.reason === 'duplicate')).toHaveLength(12)
    const kept = merged.slots.filter(s => !slotsOf('core').some(c => c.id === s.id)).map(s => s.class_code)
    expect(kept).toContain('ENG_LIT')
    expect(kept).toContain('FF_LITERACY')
  })
  it('absorbs the primary\'s five open Free Elective hours and grows the plan by the rest', () => {
    expect(merged.freeElective.primaryHours).toBe(5)
    expect(merged.freeElective.absorbed).toBe(5)
    expect(merged.totalHours).toBe(planOf('core').total_hours + merged.freeElective.extraHours)
    expect(merged.slots.some(s => s.class_code === 'FREE_ELECTIVE')).toBe(false)
  })
})

describe('a minor\'s "M hours from this list" buckets, against the real catalog', () => {
  const addMinor = code => mergePrograms(
    { programId: prog('core').id, slots: slotsOf('core'), totalHours: planOf('core').total_hours },
    [{ programId: prog(code).id, role: 'minor', slots: slotsOf(code), totalHours: planOf(code).total_hours }],
    { courses },
  )
  const own = (merged, code) => merged.slots.filter(s => merged.programsOf[s.id]?.[0] === prog(code).id)
  const reasons = (merged, code) => merged.shadows
    .filter(s => s.reason !== 'free_elective')
    .map(s => [s.reason, slotsOf(code).find(x => x.id === s.slotId)?.class_code])

  it('is covered whole by the courses another program already has: the Computer Science Minor adds nothing to Computer Science Core', () => {
    const merged = addMinor('minor_computer_science')
    expect(own(merged, 'minor_computer_science')).toEqual([])
    expect(reasons(merged, 'minor_computer_science')).toEqual(expect.arrayContaining([['satisfied', 'MN_CSC_CSC_UP'], ['duplicate', 'CSC1310'], ['satisfied', 'MN_CSC_CSC']]))
    expect(merged.freeElective.addedHours).toBe(0)
    expect(merged.totalHours).toBe(120)
  })

  it('counts a course toward one requirement of a minor once: Mathematics keeps the 6 upper-division hours and its second course, and the shared MATH 1910 is not also counted in a bucket', () => {
    const merged = addMinor('minor_mathematics')
    expect(own(merged, 'minor_mathematics').map(s => [s.class_code, s.flex_credits]).sort()).toEqual([['MATH1920', null], ['MN_MATH_MATH_UP', 6]])
    expect(reasons(merged, 'minor_mathematics')).toEqual(expect.arrayContaining([['duplicate', 'MATH1910'], ['satisfied', 'MN_MATH_MATH']]))
    expect(merged.freeElective).toMatchObject({ primaryHours: 5, addedHours: 10, absorbed: 5, extraHours: 5 })
    expect(merged.totalHours).toBe(125)
  })

  it('adds all its hours when nothing overlaps (Physics), less the 5 open Free Elective hours; a minor\'s own total is not a floor', () => {
    const merged = addMinor('minor_physics')
    expect(own(merged, 'minor_physics').map(s => [s.class_code, s.flex_credits])).toEqual([['MN_PHYS_PHYS_UP', 6], ['MN_PHYS_PHYS', 9]])
    expect(merged.freeElective).toMatchObject({ addedHours: 15, absorbed: 5, extraHours: 10 })
    expect(merged.totalHours).toBe(130)
  })

  it('shrinks a bucket by the hours the other program\'s courses cover, and leaves the stored row alone', () => {
    const fixedCsc = { id: 9001, class_code: 'CSC3300', is_pool: false, flex_credits: null }
    const bucket = { id: 9002, class_code: 'MN_CSC_CSC_UP', is_pool: true, flex_credits: 6 }
    const merged = mergePrograms({ programId: 1, slots: [fixedCsc] }, [{ programId: 2, role: 'minor', slots: [bucket] }], { courses })
    const rest = merged.slots.find(s => s.id === 9002)
    expect(rest.flex_credits).toBe(3)                    // CSC 3300 is 3 hours of the 6
    expect(bucket.flex_credits).toBe(6)
    expect(merged.programsOf[9001]).toEqual([1, 2])
  })
})
