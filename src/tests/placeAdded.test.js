import { describe, it, expect } from 'vitest'
import { placeAddedSlots } from '../lib/placeAdded.js'

let id = 100
const fixed = code => ({ id: id++, class_code: code, is_pool: false, flex_credits: null })
const pool = (code, flex = null) => ({ id: id++, class_code: code, is_pool: true, flex_credits: flex })
const courseMap = Object.fromEntries(['A1', 'A2', 'B1', 'B2', 'B3', 'CSC3100', 'CSC3220', 'X'].map(c => [c, { credits: 3 }]))
const chain = (code, ...required) => ({ [code]: Object.fromEntries(required.map((r, i) => [i, { logic: 'AND', codes: [r] }])) })

// the plan as it stands: `rows` is [slot, semester], placed and not archived
const planOf = rows => ({ slots: rows.map(([s]) => s), placed: Object.fromEntries(rows.map(([s, sem]) => [s.id, sem])) })

describe('placeAddedSlots', () => {
  it('leaves what is placed alone and puts a new slot at its floor when there is room', () => {
    const a1 = fixed('A1')
    const b1 = fixed('B1')
    const { slots, placed } = planOf([[a1, 1]])
    expect(placeAddedSlots({ unplaced: [b1], floors: { [b1.id]: 1 }, placed, slots: [...slots, b1], courseMap })).toEqual({ [b1.id]: 1 })
  })

  it('moves a slot past a semester that is full', () => {
    const full = [1, 2, 3, 4, 5, 6].map(() => fixed('A1'))     // 18 hours in semester 1
    const b1 = fixed('B1')
    const { slots, placed } = planOf(full.map(s => [s, 1]))
    const out = placeAddedSlots({ unplaced: [b1], floors: { [b1.id]: 1 }, placed, slots: [...slots, b1], courseMap })
    expect(out[b1.id]).toBe(2)
  })

  it('counts a pool at its flex hours and the estimate for an open pool', () => {
    const bucket = pool('FREE_ELECTIVE', 12)
    const filler = [fixed('A1'), fixed('A2')]                   // 6 + 12 = 18 in semester 1
    const b1 = fixed('B1')
    const { slots, placed } = planOf([[bucket, 1], ...filler.map(s => [s, 1])])
    expect(placeAddedSlots({ unplaced: [b1], floors: { [b1.id]: 1 }, placed, slots: [...slots, b1], courseMap })[b1.id]).toBe(2)
  })

  it('puts a course after a prerequisite the plan has later, and ignores one the plan does not have', () => {
    const a1 = fixed('A1')
    const b1 = fixed('B1')
    const b2 = fixed('B2')
    const { slots, placed } = planOf([[a1, 3]])
    const prereqMap = { ...chain('B1', 'A1'), ...chain('B2', 'NOT_IN_PLAN') }
    const out = placeAddedSlots({ unplaced: [b1, b2], floors: { [b1.id]: 1, [b2.id]: 1 }, placed, slots: [...slots, b1, b2], courseMap, prereqMap })
    expect(out[b1.id]).toBe(4)
    expect(out[b2.id]).toBe(1)
  })

  it('does not wait for a prerequisite that is itself being placed now, but places it first', () => {
    const b1 = fixed('B1')
    const b2 = fixed('B2')
    const prereqMap = chain('B2', 'B1')
    const out = placeAddedSlots({
      unplaced: [b2, b1], floors: { [b1.id]: 1, [b2.id]: 1 }, placed: {}, slots: [b1, b2], courseMap, prereqMap,
    })
    expect(out[b1.id]).toBe(1)
    expect(out[b2.id]).toBeGreaterThanOrEqual(1)
  })

  it('keeps a corequisite in the same semester or later', () => {
    const a1 = fixed('A1')
    const b1 = fixed('B1')
    const { slots, placed } = planOf([[a1, 2]])
    const coreqMap = chain('B1', 'A1')
    const out = placeAddedSlots({ unplaced: [b1], floors: { [b1.id]: 1 }, placed, slots: [...slots, b1], courseMap, coreqMap })
    expect(out[b1.id]).toBe(2)
  })

  it('respects the term a course is offered in, from the start season', () => {
    const fallOnly = fixed('CSC3220')
    const springOnly = fixed('CSC3100')
    const base = { floors: { [fallOnly.id]: 2, [springOnly.id]: 1 }, placed: {}, slots: [fallOnly, springOnly], courseMap }
    // Fall start: semester 1 is Fall, 2 Spring
    expect(placeAddedSlots({ ...base, unplaced: [fallOnly, springOnly], startSeason: 'Fall' })).toEqual({ [fallOnly.id]: 3, [springOnly.id]: 2 })
    // Spring start: semester 1 is Spring, 2 Fall
    expect(placeAddedSlots({ ...base, unplaced: [fallOnly, springOnly], startSeason: 'Spring' })).toEqual({ [fallOnly.id]: 2, [springOnly.id]: 1 })
  })

  it('places new slots in the order of their floors, and later ones see the earlier ones', () => {
    const rows = [fixed('B1'), fixed('B2'), fixed('B3')]
    const floors = { [rows[0].id]: 1, [rows[1].id]: 1, [rows[2].id]: 1 }
    const full = [1, 2, 3, 4, 5].map(() => fixed('A1'))        // 15 hours in semester 1: room for one more
    const { slots, placed } = planOf(full.map(s => [s, 1]))
    const out = placeAddedSlots({ unplaced: rows, floors, placed, slots: [...slots, ...rows], courseMap })
    expect(Object.values(out).filter(s => s === 1)).toHaveLength(1)
    expect(Object.values(out).filter(s => s === 2)).toHaveLength(2)
  })

  it('falls back to the floor for a slot nothing can hold, rather than dropping it', () => {
    const huge = pool('FREE_ELECTIVE', 40)
    expect(placeAddedSlots({ unplaced: [huge], floors: { [huge.id]: 5 }, placed: {}, slots: [huge], courseMap })).toEqual({ [huge.id]: 5 })
  })

  it('reads a picked pool course for prerequisites', () => {
    const p = pool('CSC_ELECTIVE')
    const b1 = fixed('B1')
    const prereqMap = chain('B1', 'A1')
    const { slots, placed } = planOf([[p, 3]])
    const out = placeAddedSlots({ unplaced: [b1], floors: { [b1.id]: 1 }, placed, slots: [...slots, b1], courseMap, prereqMap, planSlots: { [p.id]: 'A1' } })
    expect(out[b1.id]).toBe(4)
  })
})
