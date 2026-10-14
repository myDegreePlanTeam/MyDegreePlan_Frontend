// pickReliance.test.js
//
// lib/pickReliance.js reads prerequisites and corequisites from a plan's positions and records which open picks a later course leans
// on. The plan view and first run's "Your plan is ready" share it, so both name the same pick. Checked on the real catalog: the sample
// CSC Cybersecurity plan (ACT Math 29, Fall 2026), where CSC 3040 leans on the empty Communications pick.

import { describe, it, expect } from 'vitest'
import { T, freshStudent } from './support/realStudent.js'
import { buildRequirementMap } from '../lib/requirementMap.js'
import { prereqStanding, coreqStanding, firstDependentPick } from '../lib/pickReliance.js'

const program = T.concentrations.find(p => p.code === 'cybersecurity')
const slots = T.requirement_slots.filter(s => s.concentration_id === program.id && s.catalog_year === '2026-2027')
const { assignments } = freshStudent('cybersecurity', 29)
const courses = Object.fromEntries(T.courses.map(c => [c.code, c]))
const placement = [{ credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0 }]

const plan = (over = {}) => ({
  slots, semesterOf: s => assignments[s.id] ?? null, planSlots: {}, freeAddSlots: [],
  prereqMap: buildRequirementMap(T.prerequisite_entries), coreqMap: buildRequirementMap(T.corequisite_entries),
  priorCredits: placement, courses, ...over,
})
const comm = slots.find(s => s.class_code === 'COMM_REQ')
const csc3040 = slots.find(s => s.class_code === 'CSC3040')

describe('prereqStanding and coreqStanding', () => {
  it('finds nothing out of order in the plan the builder placed', () => {
    expect(prereqStanding(plan()).warnings).toEqual({})
    expect(coreqStanding(plan()).warnings).toEqual({})
  })

  it('records the course leaning on an open pick in an earlier semester', () => {
    expect(prereqStanding(plan()).reliance[comm.id]).toEqual(['CSC3040'])
  })

  it('stops leaning once the pick is made', () => {
    expect(prereqStanding(plan({ planSlots: { [comm.id]: 'COMM2025' } })).reliance[comm.id]).toBeUndefined()
  })

  it('flags the course when the open pick is not before it', () => {
    const late = plan({ semesterOf: s => (s.id === comm.id ? assignments[csc3040.id] : assignments[s.id] ?? null) })
    expect(prereqStanding(late).warnings[csc3040.id]?.length).toBeGreaterThan(0)
  })

  it('leaves out a slot with no semester (archived or unplaced)', () => {
    const none = plan({ semesterOf: () => null })
    expect(prereqStanding(none)).toEqual({ warnings: {}, reliance: {} })
    expect(coreqStanding(none)).toEqual({ warnings: {}, reliance: {} })
  })

  it('reads an added course by its fa_ key', () => {
    const added = plan({ freeAddSlots: [{ id: 3, course_code: 'CSC3040', semester_number: 1 }] })
    expect(prereqStanding(added).warnings.fa_3?.length).toBeGreaterThan(0)
  })
})

describe('firstDependentPick', () => {
  it('is the earliest open pick a later course depends on', () => {
    expect(firstDependentPick(plan())).toEqual({ slotId: comm.id, label: 'Communications', dependents: ['CSC3040'], semester: assignments[comm.id] })
  })

  it('is null once that pick is made and nothing else is leaned on', () => {
    expect(firstDependentPick(plan({ planSlots: { [comm.id]: 'COMM2025' } }))).toBeNull()
  })
})
