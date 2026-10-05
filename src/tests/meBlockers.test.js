import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { checkPrereqs, checkCoreqsProvisional } from '../lib/prereqChecker'
import { POOL_COURSES, REQUIREMENT_POOLS, formatMissingForDisplay } from '../lib/poolResolver'

// A standard student on the department's own map must see no unmet prerequisite or corequisite: every one of them is a blocker in
// the Issues tab. The warnings are computed as DegreePlan does (placed courses, and unfilled requirement-pool slots standing in
// for what their pool offers), here for a Fall start with ACT Math 30, who gets the department map as printed.

const T = catalog.tables
const courseMap = Object.fromEntries(T.courses.map(c => [c.code, { code: c.code, name: c.name, credits: c.credits, standing_req: c.standing_req ?? null, description: c.description ?? null }]))
const prereqMap = buildRequirementMap(T.prerequisite_entries)
const coreqMap = buildRequirementMap(T.corequisite_entries)

// ACT Math 30 places into MATH 1910: the placement row the plan carries (no credit hours) opens it
const PLACEMENT = [{ credit_type: 'act_placement', satisfies_course_code: 'MATH1910', credits_awarded: 0 }]

const slotsOf = program => {
  const conc = T.concentrations.find(c => c.code === program)
  return T.requirement_slots.filter(s => s.concentration_id === conc.id && s.catalog_year === '2026-2027')
}

function warningsFor(program, planSlots = {}) {
  const slots = slotsOf(program)
  const { assignments, archived } = buildDegreePlan({
    slots, courseMap, prereqMap, coreqMap, priorCredits: [],
    studentProfile: { student_type: 'incoming_freshman', act_math: 30, start_season: 'Fall' },
  })
  const active = slots.filter(s => !archived[s.id])
  const placed = []
  const pending = []
  for (const s of active) {
    const sem = assignments[s.id]
    const code = s.is_pool ? planSlots[s.id] : s.class_code
    if (code) placed.push({ key: s.id, code, sem })
    else if (s.is_pool && REQUIREMENT_POOLS.has(s.class_code)) pending.push({ key: s.id, sem, codes: POOL_COURSES[s.class_code] ?? [] })
  }
  const out = []
  for (const item of placed) {
    const before = new Set(placed.filter(p => p.sem < item.sem).map(p => p.code))
    const prereq = checkPrereqs(item.code, prereqMap, before, PLACEMENT, courseMap, coreqMap, pending.filter(p => p.sem < item.sem))
    if (!prereq.satisfied) out.push(`${item.code} prerequisite: ${formatMissingForDisplay(prereq.missing)}`)
    const available = new Set([...before, ...placed.filter(p => p.sem === item.sem && p.code !== item.code).map(p => p.code)])
    const coreq = checkCoreqsProvisional(item.code, coreqMap, available, pending.filter(p => p.sem <= item.sem))
    if (!coreq.satisfied) out.push(`${item.code} corequisite: ${formatMissingForDisplay(coreq.missing)}`)
  }
  return out
}

describe('the standard Mechanical Engineering plan (no concentration)', () => {
  it('shows no unmet prerequisite or corequisite while the pool slots are still empty', () => {
    expect(warningsFor('me')).toEqual([])
  })

  it('shows none once Machine or Thermal Design has a course', () => {
    const slots = slotsOf('me')
    const design = slots.find(s => s.class_code === 'ME_DESIGN')
    expect(warningsFor('me', { [design.id]: 'ME4020' })).toEqual([])
  })

  it('names Machine or Thermal Design, not the elective pool that also lists those courses, when it is missing', () => {
    expect(formatMissingForDisplay(['(ME4020 or ME4720)'])).toBe('Machine or Thermal Design')
  })
})
