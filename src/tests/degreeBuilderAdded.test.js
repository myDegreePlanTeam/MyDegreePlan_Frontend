import { describe, it, expect } from 'vitest'
import { T, courses, courseMap, prereqMap, coreqMap } from './support/realStudent.js'
import { mergePrograms, addedSlotIdsOf } from '../lib/programMerge.js'
import { buildDegreePlan } from '../lib/degreeBuilder.js'
import { mathChainReturning } from '../lib/mathPlacement.js'
import { resolveMathPlacementRow } from '../lib/actScoreResolver.js'

const prog = code => T.concentrations.find(p => p.code === code)
const slotsOf = code => T.requirement_slots.filter(s => s.concentration_id === prog(code).id && s.catalog_year === '2026-2027')

function plan(second, role, act) {
  const merged = mergePrograms(
    { programId: prog('core').id, slots: slotsOf('core'), totalHours: 120 },
    [{ programId: prog(second).id, role, slots: slotsOf(second), totalHours: 15 }],
    { courses },
  )
  const priorCredits = [{ id: 'act', ...resolveMathPlacementRow({ act }) }]
  const build = addedSlotIds => buildDegreePlan({
    slots: merged.slots, addedSlotIds, courseMap, prereqMap, coreqMap, priorCredits,
    studentProfile: { student_type: 'incoming_freshman', act_math: act, start_season: 'Fall' },
  })
  const slotOf = code => merged.slots.find(s => s.class_code === code)
  return { merged, slotOf, withAdded: build(addedSlotIdsOf(merged.programsOf, prog('core').id)), without: build(undefined) }
}

describe('the math placement and a program added to the plan', () => {
  it('chains for a returning student run MATH 1910, 1920, 2010', () => {
    expect(mathChainReturning('MATH1910')).toEqual(['MATH1910', 'MATH1920', 'MATH2010'])
    expect(mathChainReturning('MATH1710')).toContain('MATH1920')
    expect(mathChainReturning('nonsense')).toEqual(['MATH1910', 'MATH1920', 'MATH2010'])
  })

  it('does not drop a Calculus II the minor requires: Computer Science on the new curriculum has none, the Mathematics Minor does', () => {
    const { slotOf, withAdded, without } = plan('minor_mathematics', 'minor', 29)
    const calcII = slotOf('MATH1920')
    expect(without.archived[calcII.id]).toBe('not_applicable')            // what the builder did before: the requirement vanished
    expect(withAdded.archived[calcII.id]).toBeUndefined()
    expect(withAdded.assignments[calcII.id]).toBeGreaterThan(0)
  })

  it('still skips what the placement is above: a lower course the minor asks for is not needed by a student placed higher', () => {
    const { merged, withAdded } = plan('minor_mathematics', 'minor', 29)
    // the primary's own lead-in courses (MATH 1710 and below) stay archived for ACT 29, as before
    const lowerPrimary = merged.slots.filter(s => ['MATH1000', 'MATH1710', 'MATH1720'].includes(s.class_code))
    expect(lowerPrimary.length).toBeGreaterThan(0)
    for (const s of lowerPrimary) expect(withAdded.archived[s.id], s.class_code).toBe('not_applicable')
  })

  it('changes nothing for a plan with no added program', () => {
    const merged = mergePrograms({ programId: prog('core').id, slots: slotsOf('core'), totalHours: 120 }, [], { courses })
    const priorCredits = [{ id: 'act', ...resolveMathPlacementRow({ act: 29 }) }]
    const input = { slots: merged.slots, courseMap, prereqMap, coreqMap, priorCredits, studentProfile: { student_type: 'incoming_freshman', act_math: 29, start_season: 'Fall' } }
    expect(buildDegreePlan({ ...input, addedSlotIds: addedSlotIdsOf(merged.programsOf, prog('core').id) })).toEqual(buildDegreePlan(input))
  })

  it('addedSlotIdsOf lists the slots an added program owns, not the shared ones', () => {
    const { merged } = plan('minor_mathematics', 'minor', 29)
    const added = addedSlotIdsOf(merged.programsOf, prog('core').id)
    expect(added.length).toBeGreaterThan(0)
    expect(addedSlotIdsOf({}, 1)).toEqual([])
    // MATH1910 is the primary's card, shared with the minor
    expect(added).not.toContain(merged.slots.find(s => s.class_code === 'MATH1910').id)
  })
})
