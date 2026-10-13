// termScheduler.test.js
//
// The scheduler packs what a student still owes into the terms ahead. It must obey the same rules the Plan tab warns about
// (prerequisites from earlier terms, corequisites in the same or an earlier one, the season a course is offered, standing, the hours
// a term holds), find the earliest finish those rules allow, and name the chain that sets it.

import { describe, it, expect } from 'vitest'
import { scheduleTerms, nthTerm } from '../lib/termScheduler.js'

const FALL26 = { season: 'Fall', year: 2026 }
const task = (code, extra = {}) => ({ id: code, code, hours: 3, pool: null, floor: 1, after: [], ...extra })
const pre = (...groups) => Object.fromEntries(groups.map((g, i) => [i, { logic: g.length > 1 ? 'OR' : 'AND', codes: g }]))
const run = (tasks, opts = {}) => scheduleTerms({ tasks, startTerm: FALL26, ctx: { prereqMap: {}, coreqMap: {}, courseMap: {}, priorCredits: [] }, ...opts })
const termOf = (result, id) => result.termOf.get(id)

describe('terms', () => {
  it('runs Fall then Spring, never Summer', () => {
    expect(nthTerm(FALL26, 1)).toEqual({ season: 'Fall', year: 2026 })
    expect(nthTerm(FALL26, 2)).toEqual({ season: 'Spring', year: 2027 })
    expect(nthTerm(FALL26, 3)).toEqual({ season: 'Fall', year: 2027 })
  })

  it('a Summer start rolls to the next Fall', () => {
    const r = run([task('A')], { startTerm: { season: 'Summer', year: 2026 } })
    expect(r.terms[0].label).toBe('Fall 2026')
  })
})

describe('prerequisites', () => {
  const ctx = prereqMap => ({ prereqMap, coreqMap: {}, courseMap: {}, priorCredits: [] })

  it('a chain takes one term per link, and is named', () => {
    const r = run([task('A'), task('B'), task('C')], { ctx: ctx({ B: pre(['A']), C: pre(['B']) }) })
    expect([termOf(r, 'A'), termOf(r, 'B'), termOf(r, 'C')]).toEqual([1, 2, 3])
    expect(r.termCount).toBe(3)
    expect(r.chain.map(s => s.code)).toEqual(['A', 'B', 'C'])
    expect(r.chain.map(s => s.label)).toEqual(['Fall 2026', 'Spring 2027', 'Fall 2027'])
    expect(r.lowerBound.prerequisites).toBe(3)
    expect(r.optimal).toBe(true)
  })

  it('never puts a course in the same term as its prerequisite', () => {
    const r = run([task('A'), task('B')], { ctx: ctx({ B: pre(['A']) }) })
    expect(termOf(r, 'B')).toBeGreaterThan(termOf(r, 'A'))
  })

  it('a course done already (or finishing this term) is satisfied from the first term', () => {
    const r = run([task('B')], { ctx: ctx({ B: pre(['A']) }), satisfied: ['A'] })
    expect(termOf(r, 'B')).toBe(1)
  })

  it('an OR group is met by the earlier alternative', () => {
    const r = run([task('A1'), task('A2'), task('B'), task('X'), task('Y')], {
      ctx: ctx({ A1: pre(['X']), B: pre(['A1', 'A2']) }),
    })
    expect(termOf(r, 'B')).toBe(2)           // A2 is in term 1, A1 only in term 2
  })

  it('an AND of two groups waits for the later one', () => {
    const r = run([task('A'), task('M'), task('B'), task('C')], { ctx: ctx({ M: pre(['A']), B: pre(['A'], ['M']), C: pre(['A']) }) })
    expect(termOf(r, 'B')).toBe(3)
  })

  it('an empty requirement pool in an earlier term stands in for a prerequisite it offers', () => {
    const pool = { id: 'comm', code: null, hours: 3, pool: { codes: ['COMM2025', 'PC2500'], gates: true }, floor: 1, after: [] }
    const r = run([pool, task('CSC3040')], { ctx: ctx({ CSC3040: pre(['COMM2025', 'PC2500']) }) })
    expect(termOf(r, 'comm')).toBe(1)
    expect(termOf(r, 'CSC3040')).toBe(2)
  })

  it('an elective pool never stands in for a prerequisite', () => {
    const pool = { id: 'elec', code: null, hours: 3, pool: { codes: ['CSC1200'], gates: false }, floor: 1, after: [] }
    const r = run([pool, task('CSC1300')], { ctx: ctx({ CSC1300: pre(['CSC1200']) }) })
    expect(r.blocked.map(b => b.id)).toEqual(['CSC1300'])
  })

  it('reports a course whose prerequisite is nowhere in the plan, with what it needs, and still schedules the rest', () => {
    const r = run([task('A'), task('B')], { ctx: ctx({ B: pre(['Z']) }) })
    expect(termOf(r, 'A')).toBe(1)
    expect(r.blocked).toEqual([{ id: 'B', code: 'B', missing: ['Z'], reason: 'prerequisite' }])
    expect(r.optimal).toBe(false)
  })
})

describe('corequisites', () => {
  it('may share a term with their partner, and cannot go without it', () => {
    const ctx = { prereqMap: {}, coreqMap: { B: pre(['A']) }, courseMap: {}, priorCredits: [] }
    const both = run([task('A'), task('B')], { ctx })
    expect(termOf(both, 'B')).toBe(termOf(both, 'A'))
    const alone = run([task('B')], { ctx })
    expect(alone.blocked.map(b => b.id)).toEqual(['B'])
  })
})

describe('the season a course is offered', () => {
  const ctx = { prereqMap: { CSC3220: pre(['A']) }, coreqMap: {}, courseMap: {}, priorCredits: [] }

  it('a Fall-only course waits for the next Fall, and the chain says why', () => {
    const r = run([task('A'), task('CSC3220')], { ctx })
    expect(termOf(r, 'A')).toBe(1)
    expect(termOf(r, 'CSC3220')).toBe(3)       // Fall 2027: Spring 2027 is the wrong season
    const step = r.chain.find(s => s.code === 'CSC3220')
    expect(step.label).toBe('Fall 2027')
    expect(step.note).toBe('Offered Fall only')
  })

  it('a Spring-only course with nothing before it sits in the first Spring', () => {
    const r = run([task('CSC3100')])
    expect(termOf(r, 'CSC3100')).toBe(2)
  })
})

describe('room in a term', () => {
  it('splits independent courses across terms by the hours a term holds', () => {
    const r = run(['A', 'B', 'C', 'D', 'E'].map(c => task(c, { hours: 4 })), { maxHours: 8 })
    expect(r.terms.map(t => t.hours)).toEqual([8, 8, 4])
    expect(r.lowerBound.hours).toBe(3)
    expect(r.termCount).toBe(3)
    expect(r.optimal).toBe(true)
  })

  it('a course larger than a term holds still gets one to itself', () => {
    const r = run([task('BIG', { hours: 6 })], { maxHours: 4 })
    expect(termOf(r, 'BIG')).toBe(1)
  })

  it('starts the longest chain first, so loose courses do not push it back', () => {
    const chain = ['A', 'B', 'C', 'D']
    const loose = ['L1', 'L2', 'L3', 'L4'].map(c => task(c))
    const r = run([...loose, ...chain.map(c => task(c))], {
      ctx: { prereqMap: { B: pre(['A']), C: pre(['B']), D: pre(['C']) }, coreqMap: {}, courseMap: {}, priorCredits: [] },
      maxHours: 6,
    })
    expect(r.termCount).toBe(4)
    expect(r.lowerBound.index).toBe(4)
    expect(r.optimal).toBe(true)
    expect(termOf(r, 'A')).toBe(1)
  })

  it('reports the hours bound when it, not the prerequisites, sets the pace', () => {
    const r = run(['A', 'B', 'C', 'D', 'E', 'F'].map(c => task(c)), { maxHours: 6 })
    expect(r.lowerBound).toEqual({ prerequisites: 1, hours: 3, index: 3 })
  })
})

describe('floors, implicit prerequisites and standing', () => {
  it('a course on a department map does not start before its map term', () => {
    const r = run([task('A', { floor: 3 })])
    expect(termOf(r, 'A')).toBe(3)
    expect(r.chain[0].note).toMatch(/degree map/)
  })

  it('an open pool with an implicit prerequisite follows that course', () => {
    const elective = { id: 'elec', code: null, hours: 3, pool: { codes: [], gates: false }, floor: 1, after: ['A'] }
    const r = run([task('A'), elective])
    expect(termOf(r, 'elec')).toBe(2)
  })

  it('a senior-standing course waits until 90 hours are done', () => {
    const courseMap = { S: { standing_req: 'senior' } }
    const ctx = { prereqMap: {}, coreqMap: {}, courseMap, priorCredits: [] }
    const r = run([task('S'), task('A', { hours: 6 })], { ctx, creditsBefore: 85 })
    expect(termOf(r, 'S')).toBe(2)           // 85 hours before term 1, 91 before term 2
    const early = run([task('S')], { ctx, creditsBefore: 95 })
    expect(termOf(early, 'S')).toBe(1)
  })

  it('an open choice that takes only courses nothing allows yet waits for one', () => {
    const courseMap = { SEN: { standing_req: 'senior' } }
    const choice = { id: 'c', code: null, hours: 3, pool: { codes: ['SEN'], gates: false }, floor: 1, after: [] }
    const r = run([choice, task('A', { hours: 6 })], { ctx: { prereqMap: {}, coreqMap: {}, courseMap, priorCredits: [] }, creditsBefore: 85 })
    expect(termOf(r, 'c')).toBe(2)
  })
})

describe('the result', () => {
  it('is empty and safe with nothing to schedule', () => {
    const r = run([])
    expect(r.termCount).toBe(0)
    expect(r.chain).toEqual([])
    expect(r.blocked).toEqual([])
    expect(r.optimal).toBe(true)
  })

  it('gives the same answer for the same input', () => {
    const tasks = ['A', 'B', 'C', 'D', 'E'].map(c => task(c))
    const ctx = { prereqMap: { C: pre(['A']), D: pre(['B']) }, coreqMap: {}, courseMap: {}, priorCredits: [] }
    const a = run(tasks, { ctx, maxHours: 6 })
    const b = run([...tasks].reverse(), { ctx, maxHours: 6 })
    expect([...a.termOf.entries()].sort()).toEqual([...b.termOf.entries()].sort())
  })

  it('records every task in exactly one term, and the hours of each term add up', () => {
    const tasks = ['A', 'B', 'C', 'D'].map(c => task(c, { hours: 4 }))
    const r = run(tasks, { maxHours: 8 })
    expect(r.terms.flatMap(t => t.tasks.map(x => x.id)).sort()).toEqual(['A', 'B', 'C', 'D'])
    for (const t of r.terms) expect(t.hours).toBe(t.tasks.reduce((s, x) => s + x.hours, 0))
  })
})
