import { describe, it, expect } from 'vitest'
import { T, courseMap, prereqMap, coreqMap } from './support/realStudent.js'
import { buildDegreePlan } from '../lib/degreeBuilder.js'
import { resolveMathPlacementRow } from '../lib/actScoreResolver.js'
import { POOL_CREDIT_ESTIMATES } from '../lib/poolResolver.js'

// The degree builder's last step balances the loads (Step 13): every regular semester holds 12 to 16 hours where the plan allows,
// none is under 12 but the last, a semester above 16 comes second, and none passes 18. Reported 2026-10-14: a Data Science & AI
// student who entered before Fall 2026 got an 18-hour semester ahead of a 9- and an 11-hour one.

const hours = s => s.flex_credits ?? (s.is_pool ? POOL_CREDIT_ESTIMATES[s.class_code] ?? 3 : courseMap[s.class_code]?.credits ?? 3)

function loads(code, year, act, season = 'Fall') {
  const prog = T.concentrations.find(p => p.code === code)
  const slots = T.requirement_slots.filter(s => s.concentration_id === prog.id && s.catalog_year === year)
  const { assignments, archived } = buildDegreePlan({
    slots, courseMap, prereqMap, coreqMap, priorCredits: [{ id: 'act', ...resolveMathPlacementRow({ act }) }],
    studentProfile: { student_type: 'returning', act_math: act, start_season: season },
  })
  const bySem = {}
  for (const s of slots) if (!archived[s.id]) bySem[assignments[s.id]] = (bySem[assignments[s.id]] ?? 0) + hours(s)
  return Array.from({ length: Math.max(...Object.keys(bySem).map(Number)) }, (_, i) => bySem[i + 1] ?? 0)
}

describe('Data Science & AI (2025-2026), entered before Fall 2026', () => {
  describe.each([17, 19, 22, 25, 29])('ACT Math %s', act => {
    for (const season of ['Fall', 'Spring']) {
      it(`${season} start: no semester under 12 hours but the last, none over 18`, () => {
        const plan = loads('dsai', '2025-2026', act, season)
        expect(plan.slice(0, -1).filter(h => h < 12), String(plan)).toEqual([])
        expect(Math.max(...plan), String(plan)).toBeLessThanOrEqual(18)
      })
    }
  })

  it('no longer puts an 18-hour semester ahead of a 9-hour one (ACT Math 17, the reported plan)', () => {
    const plan = loads('dsai', '2025-2026', 17)
    expect(plan.filter(h => h > 16), String(plan)).toEqual([])
    expect(plan).toHaveLength(10)                          // and no semester more than before
  })
})
