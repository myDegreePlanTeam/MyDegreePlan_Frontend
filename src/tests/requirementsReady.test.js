import { describe, it, expect } from 'vitest'
import { T, freshStudent } from './support/realStudent.js'
import { KNOWN_GAPS } from './support/planChecks.js'
import { isProgramReady } from '../lib/programBrowser.js'
import { buildAuditDocumentModel } from '../lib/auditExportModel.js'

// The Requirements tab and the degree audit PDF are open to students, so for every program a student can choose they must work: the audit
// builds, every requirement is listed once, the hours are the plan's, the finish line is worked out, and the PDF's model carries what
// the screen shows. Run at a high and a low math placement.

const open = T.concentrations.filter(p => isProgramReady(p) && T.degree_plans.some(d => d.concentration_id === p.id && d.catalog_year === '2026-2027'))
const planHours = code => T.degree_plans.find(d => d.concentration_id === T.concentrations.find(p => p.code === code).id && d.catalog_year === '2026-2027').total_hours

describe.each(open.map(p => [p.code]))('%s', code => {
  for (const act of [29, 17]) {
    describe(`at ACT Math ${act}`, () => {
      const s = freshStudent(code, act)
      const rows = s.audit.blocks.flatMap(b => b.rows)

      it('lists every requirement once, in a block with groups', () => {
        expect(s.audit.blocks.length).toBeGreaterThan(0)
        expect(s.audit.blocks.every(b => b.groups.length > 0)).toBe(true)
        const keys = rows.map(r => String(r.key))
        expect(new Set(keys).size).toBe(keys.length)
        expect(rows.length).toBeGreaterThan(0)
        const counted = Object.values(s.audit.summary.requirements).reduce((a, b) => a + b, 0)
        expect(counted).toBe(rows.length)
        expect(rows.every(r => ['done', 'in_progress', 'planned', 'not_placed'].includes(r.state))).toBe(true)
      })

      it('says the plan\'s hours, and a student who has not started has nothing done', () => {
        expect(s.audit.summary.total).toBe(planHours(code))
        expect(s.audit.summary.done).toBe(0)
      })

      it('works out a finish, and the only courses it cannot place are the department\'s known gaps', () => {
        expect(s.projection).toBeTruthy()
        expect(s.projection.graduation?.index).toBeGreaterThanOrEqual(1)
        const known = (KNOWN_GAPS[code] ?? []).map(prefix => prefix.replace(/@$/, ''))
        const unplaced = (s.projection.blocked ?? []).map(b => b.code ?? b.label).filter(c => !known.includes(c))
        expect(unplaced).toEqual([])
      })

      it('prints the same blocks, groups and rows as the screen', () => {
        const model = buildAuditDocumentModel({ audit: s.audit, projection: s.projection, profile: { concentrations: { name: code, total_hours: planHours(code) }, catalog_year: '2026-2027', start_season: 'Fall', start_year: 2026 } })
        expect(model.audit.blocks.map(b => b.id)).toEqual(s.audit.blocks.map(b => b.id))
        s.audit.blocks.forEach((block, i) => {
          expect(model.audit.blocks[i].groups.map(g => g.rows.length)).toEqual(block.groups.map(g => g.rows.length))
        })
      })
    })
  }
})
