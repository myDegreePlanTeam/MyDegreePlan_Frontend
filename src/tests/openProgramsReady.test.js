import { describe, it, expect } from 'vitest'
import { T } from './support/realStudent.js'
import { planBlockers, KNOWN_GAPS } from './support/planChecks.js'
import { isProgramReady } from '../lib/programBrowser.js'

// A program a student can choose must not open with a course out of order. For every open program, at a high and a low math placement,
// the plan the degree builder makes has no unmet prerequisite or corequisite by the plan view's own checks.
//
// KNOWN_GAPS (support/planChecks.js) holds the gaps in a department's degree map that are not the planner's to fix.
const KNOWN = KNOWN_GAPS

const open = T.concentrations.filter(p => isProgramReady(p) && T.degree_plans.some(d => d.concentration_id === p.id && d.catalog_year === '2026-2027'))

describe('every program open to students opens with nothing out of order', () => {
  it('covers Computer Science, Mechanical Engineering, Biology and Chemistry', () => {
    const majors = new Set(open.map(p => p.major_code))
    for (const m of ['computer_science', 'mechanical_engineering', 'biology', 'chemistry']) expect(majors.has(m), m).toBe(true)
  })

  describe.each(open.map(p => [p.code]))('%s', code => {
    for (const act of [29, 17]) {
      it(`at ACT Math ${act}`, () => {
        const blockers = planBlockers(code, act)
        const known = KNOWN[code] ?? []
        const unexpected = blockers.filter(b => !known.some(prefix => b.startsWith(prefix)))
        expect(unexpected).toEqual([])
      })
    }
  })

  it('names a known gap only while it is still there', () => {
    for (const [code, prefixes] of Object.entries(KNOWN)) {
      const blockers = [...planBlockers(code, 29), ...planBlockers(code, 17)]
      for (const prefix of prefixes) expect(blockers.some(b => b.startsWith(prefix)), `${code} ${prefix}`).toBe(true)
    }
  })
})
