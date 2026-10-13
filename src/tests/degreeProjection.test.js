// degreeProjection.test.js
//
// The finish line is only worth showing if it is right: a date a student plans around, and a chain that says what sets it. So the
// tests run the real catalog (prerequisites, corequisites, season rules, the department maps) for every open program and check each
// placement against the same rules independently, then cover the cases a real student is in: not started, partway, finished.

import { describe, it, expect } from 'vitest'
import { buildDegreeAudit } from '../lib/degreeAudit.js'
import { projectDegree } from '../lib/degreeProjection.js'
import { computeSemesterTerms, formatTermLabel } from '../lib/semesterTerms.js'
import { freshStudent, courses, prereqMap, coreqMap } from './support/realStudent.js'
import { checkPrereqs, checkCoreqsProvisional } from '../lib/prereqChecker.js'
import { isEnrollmentAllowed } from '../lib/semesterRestrictions.js'
import { POOL_COURSES, REQUIREMENT_POOLS } from '../lib/poolResolver.js'
import { planRequiresCalculusII } from '../lib/mathPlacement.js'
import { nthTerm } from '../lib/termScheduler.js'

// freshStudent(program, actMath) is in tests/support/realStudent.js

// Re-check every placement against the rules, term by term, without the scheduler's own bookkeeping.
function violations({ audit, projection, priorCredits, slots, semesterTerms }) {
  const found = []
  const rows = audit.blocks.flatMap(b => b.rows)
  const done = new Set(priorCredits.filter(pc => pc.satisfies_course_code && (pc.credits_awarded ?? 0) > 0).map(pc => pc.satisfies_course_code))
  for (const r of rows) if ((r.state === 'done' || r.state === 'in_progress') && r.code) done.add(r.code)
  let credits = audit.summary.done + audit.summary.inProgress
  const startTerm = projection.startTerm
  const follows = planRequiresCalculusII(slots)
  const slotOf = new Map(slots.map(s => [String(s.id), s]))
  const pending = []

  for (const term of projection.schedule) {
    const season = nthTerm(startTerm, term.index).season
    const sameCodes = new Set()
    const samePending = []
    for (const item of term.items) {
      const where = `${item.code ?? item.label} in ${term.termLabel}`
      const floorSem = follows ? slotOf.get(String(item.key))?.map_semester : null
      if (Number.isInteger(floorSem) && formatTermLabel(semesterTerms[floorSem]) && term.index < indexOf(startTerm, semesterTerms[floorSem])) found.push(`${where} is before its map term`)
      if (!item.code) {
        if (REQUIREMENT_POOLS.has(item.poolCode)) samePending.push({ key: item.key, codes: POOL_COURSES[item.poolCode] ?? [] })
        continue
      }
      sameCodes.add(item.code)
      if (!isEnrollmentAllowed(item.code, season)) found.push(`${where}: not offered in ${season}`)
      const need = { junior: 60, senior: 90 }[courses[item.code]?.standing_req]
      if (need && credits < need) found.push(`${where}: ${credits} hours before it, standing needs ${need}`)
      const pre = checkPrereqs(item.code, prereqMap, done, priorCredits, courses, coreqMap, pending)
      if (!pre.satisfied) found.push(`${where}: prerequisite ${pre.missing.join(', ')}`)
    }
    for (const item of term.items) {
      if (!item.code) continue
      const co = checkCoreqsProvisional(item.code, coreqMap, new Set([...done, ...sameCodes]), [...pending, ...samePending])
      if (!co.satisfied) found.push(`${item.code} in ${term.termLabel}: corequisite ${co.missing.join(', ')}`)
    }
    const hours = term.items.reduce((s, i) => s + i.hours, 0)
    if (hours > projection.maxHours && term.items.length > 1) found.push(`${term.termLabel} holds ${hours} hours`)
    for (const c of sameCodes) done.add(c)
    pending.push(...samePending)
    credits += hours
  }
  return found
}

function indexOf(start, term) {
  for (let i = 1, t = start; i <= 40; i++, t = nthTerm(t, 2)) { if (t.season === term.season && t.year === term.year) return i }
  return 1
}

const PROGRAMS = ['core', 'cybersecurity', 'hpc', 'ai', 'me', 'me_aero', 'me_mechatronics', 'me_vehicle']

describe('every open program, a student who has not started', () => {
  for (const code of PROGRAMS) {
    for (const act of [29, 17]) {
      it(`${code}, ACT Math ${act}: every course lands where the rules allow, and no later than the plan`, () => {
        const s = freshStudent(code, act)
        expect(violations(s)).toEqual([])
        expect(s.projection.graduation.index).toBeLessThanOrEqual(s.projection.plan.index)
        expect(s.projection.termsLater).toBe(0)
      })

      it(`${code}, ACT Math ${act}: places everything it can, and names what it cannot`, () => {
        const { audit, projection } = freshStudent(code, act)
        const open = audit.blocks.flatMap(b => b.rows).filter(r => r.state === 'planned' || r.state === 'not_placed').length
        const placed = projection.schedule.reduce((n, t) => n + t.items.length, 0)
        expect(placed + projection.blocked.length).toBe(open)
        if (code !== 'me_mechatronics') expect(projection.blocked).toEqual([])
      })
    }
  }

  it('a standard student finishes when the department\'s own map does (8 terms), no sooner', () => {
    for (const code of ['core', 'cybersecurity', 'hpc', 'ai', 'me', 'me_aero', 'me_vehicle']) {
      const { projection } = freshStudent(code, 29)
      expect(projection.graduation.index, code).toBe(8)
      expect(projection.graduation.label, code).toBe('Spring 2030')
    }
  })

  it('the chain starts where the student starts and ends on the last course, one step per term or together in one', () => {
    const { projection } = freshStudent('cybersecurity', 29)
    const indexes = projection.chain.map(c => c.index)
    expect(indexes[0]).toBe(1)
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)
    expect(indexes[indexes.length - 1]).toBe(projection.chainTerms)
    for (let i = 1; i < indexes.length; i++) expect(indexes[i] - indexes[i - 1]).toBeLessThanOrEqual(1)
  })

  it('the chain says when a course waited for its season', () => {
    const { projection } = freshStudent('hpc', 29)
    expect(projection.chain.some(c => /Spring only/.test(c.note ?? ''))).toBe(true)
  })

  it('an engineering plan is held to its department map, so its chain names the map and the map is what sets the pace', () => {
    const { projection } = freshStudent('me', 29)
    expect(projection.chain.some(c => /degree map/.test(c.note ?? ''))).toBe(true)
    expect(projection.limit).toBe('map')
  })

  it('a Computer Science plan is limited by hours or prerequisites, never by a map', () => {
    for (const code of ['core', 'cybersecurity', 'hpc', 'ai']) expect(['hours', 'prerequisites'], code).toContain(freshStudent(code, 29).projection.limit)
  })

  it('a student placed lower in math finishes later than one placed higher, and sooner than the builder\'s plan only when the rules allow', () => {
    const high = freshStudent('core', 29).projection
    const low = freshStudent('core', 17).projection
    expect(low.graduation.index).toBeGreaterThanOrEqual(high.graduation.index)
    expect(low.chainTerms).toBeGreaterThan(high.chainTerms)
  })

  it('a prerequisite the plan never takes is reported, not guessed around', () => {
    const { projection } = freshStudent('me_mechatronics', 29)
    expect(projection.incomplete).toBe(true)
    expect(projection.blocked.map(b => b.code)).toContain('ME4140')
    expect(projection.blocked.find(b => b.code === 'ME4140').missing.join(' ')).toMatch(/ECE3260/)
  })

  it('keeps the schedule for the recommendation engine: each term, its hours and its courses', () => {
    const { projection } = freshStudent('core', 29)
    expect(projection.schedule[0]).toMatchObject({ index: 1, termLabel: 'Fall 2026' })
    expect(projection.schedule.every(t => t.hours === t.items.reduce((s, i) => s + i.hours, 0))).toBe(true)
  })
})

// ── Students partway through ─────────────────────────────────────────────────
describe('a student partway through', () => {
  const slot = (id, class_code, semester_number, extra = {}) => ({ id, class_code, semester_number, is_pool: false, flex_credits: null, ...extra })
  const pool = (id, class_code, semester_number, flex_credits = null) => ({ id, class_code, semester_number, is_pool: true, flex_credits })
  const prereq = { C2: { 0: { logic: 'AND', codes: ['C1'] } }, C3: { 0: { logic: 'AND', codes: ['C2'] } }, C4: { 0: { logic: 'AND', codes: ['C3'] } } }
  const slots = [slot(1, 'C1', 1), slot(2, 'C2', 2), slot(3, 'C3', 3), slot(4, 'C4', 4), slot(5, 'D1', 3), slot(6, 'D2', 4)]
  const crs = Object.fromEntries(['C1', 'C2', 'C3', 'C4', 'D1', 'D2'].map(c => [c, { code: c, name: `${c} name`, credits: 3 }]))
  const terms = computeSemesterTerms('Fall', 2025, [1, 2, 3, 4])           // Fall 2025, Spring 2026, Fall 2026, Spring 2027
  const labels = Object.fromEntries(Object.entries(terms).map(([n, t]) => [n, formatTermLabel(t)]))

  const project = (phases, extra = {}) => {
    const audit = buildDegreeAudit({ slots, courses: crs, semesterPhase: phases, semesterLabels: labels, totalHours: 18, ...extra })
    return projectDegree({ audit, slots, courses: crs, prereqMap: prereq, coreqMap: {}, semesterTerms: terms, semesterPhase: phases, ...extra })
  }

  it('schedules from the first term not yet begun, with what is done and in progress behind it', () => {
    const p = project({ 1: 'past', 2: 'current', 3: 'future', 4: 'future' })
    expect(p.startTerm).toEqual({ season: 'Fall', year: 2026 })
    expect(p.graduation.label).toBe('Spring 2027')          // C3 in Fall 2026 (C2 is in progress), C4 in Spring 2027
    expect(p.schedule[0].items.map(i => i.code).sort()).toEqual(['C3', 'D1', 'D2'])
    expect(p.chain.map(c => c.code)).toEqual(['C3', 'C4'])
  })

  it('moving courses sooner than the plan has them shows as terms saved', () => {
    // C3 sits two terms after C2 and C4 a term after C3: the chain needs only one term between each
    const late = [slot(1, 'C1', 1), slot(2, 'C2', 2), slot(3, 'C3', 4), slot(4, 'C4', 5)]
    const lateTerms = computeSemesterTerms('Fall', 2025, [1, 2, 3, 4, 5])
    const phases = { 1: 'past', 2: 'future', 3: 'future', 4: 'future', 5: 'future' }
    const audit = buildDegreeAudit({ slots: late, courses: crs, semesterPhase: phases, totalHours: 12 })
    const p = projectDegree({ audit, slots: late, courses: crs, prereqMap: prereq, coreqMap: {}, semesterTerms: lateTerms, semesterPhase: phases })
    expect(p.plan.index).toBeGreaterThan(p.graduation.index)
    expect(p.termsSooner).toBe(p.plan.index - p.graduation.index)
    expect(p.termsSooner).toBeGreaterThan(0)
  })

  it('says so when the plan ends earlier than the rules allow', () => {
    const tight = [slot(1, 'C1', 3), slot(2, 'C2', 3)]       // a course in the same term as its prerequisite
    const tightTerms = computeSemesterTerms('Fall', 2026, [3])
    const phases = { 3: 'future' }
    const audit = buildDegreeAudit({ slots: tight, courses: crs, semesterPhase: phases, totalHours: 6 })
    const p = projectDegree({ audit, slots: tight, courses: crs, prereqMap: prereq, coreqMap: {}, semesterTerms: tightTerms, semesterPhase: phases })
    expect(p.termsLater).toBe(1)
    expect(p.termsSooner).toBe(0)
  })

  it('a student with nothing left but courses in progress has no schedule, and says when they finish', () => {
    const p = project({ 1: 'past', 2: 'past', 3: 'current', 4: 'current' }, { planSlots: {} })
    expect(p.complete).toBe(true)
    expect(p.graduation).toBeNull()
    expect(p.underway).toBe('Spring 2027')
  })

  it('a student with everything done has nothing to project', () => {
    const p = project({ 1: 'past', 2: 'past', 3: 'past', 4: 'past' })
    expect(p.complete).toBe(true)
    expect(p.graduation).toBeNull()
    expect(p.underway).toBeNull()
  })

  it('gives each block when the plan completes it and the soonest the schedule could', () => {
    const p = project({ 1: 'past', 2: 'current', 3: 'future', 4: 'future' })
    expect(p.blocks.major).toMatchObject({ complete: false, planBy: 'Spring 2027', fastestBy: 'Spring 2027', notable: false })
  })

  it('counts an open Free Elective as hours to schedule, and a choice nobody made as a course to place', () => {
    const withChoices = [slot(1, 'C1', 1), pool(7, 'FREE_ELECTIVE', 2, 6), pool(8, 'SCIENCE', 2)]
    const phases = { 1: 'future', 2: 'future' }
    const audit = buildDegreeAudit({ slots: withChoices, courses: crs, semesterPhase: phases, totalHours: 12 })
    const p = projectDegree({ audit, slots: withChoices, courses: crs, prereqMap: prereq, coreqMap: {}, semesterTerms: computeSemesterTerms('Fall', 2026, [1, 2]), semesterPhase: phases })
    expect(p.hoursRemaining).toBe(3 + 6 + 4)        // the course, the Free Elective bucket, a 4-hour science
    expect(p.schedule.reduce((n, t) => n + t.items.length, 0)).toBe(3)
  })
})
