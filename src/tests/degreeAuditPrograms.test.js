import { describe, it, expect } from 'vitest'
import { T, courses } from './support/realStudent.js'
import { mergePrograms } from '../lib/programMerge.js'
import { buildDegreeAudit } from '../lib/degreeAudit.js'
import { buildAuditDocumentModel } from '../lib/auditExportModel.js'
import { buildPlanExportModel } from '../lib/planExportModel.js'
import { alsoProgramsOf, programsTitle } from '../lib/programBrowser.js'

const prog = code => T.concentrations.find(p => p.code === code)
const slotsOf = code => T.requirement_slots.filter(s => s.concentration_id === prog(code).id && s.catalog_year === '2026-2027')
const totalOf = code => T.degree_plans.find(d => d.concentration_id === prog(code).id && d.catalog_year === '2026-2027').total_hours

function twoPrograms(second) {
  const primary = prog('core')
  const added = prog(second)
  const merged = mergePrograms(
    { programId: primary.id, slots: slotsOf('core'), totalHours: totalOf('core') },
    [{ programId: added.id, role: 'major', slots: slotsOf(second), totalHours: totalOf(second) }],
    { courses },
  )
  const programs = [{ programId: primary.id, name: primary.name }, { programId: added.id, name: added.name }]
  const input = { slots: merged.slots, courses, genedProgram: 'flight_foundations', totalHours: merged.totalHours, majorLabel: primary.name }
  return {
    primary, added, merged, programs,
    audit: buildDegreeAudit({ ...input, programs, programsOf: merged.programsOf }),
    single: buildDegreeAudit({ ...input }),
  }
}

const rowsOf = audit => audit.blocks.flatMap(b => b.rows)

describe.each(['me', 'bai_bsba'])('the degree audit of Computer Science Core with %s as a second major', second => {
  const ctx = twoPrograms(second)

  it('has one major block per program, then general education and electives once', () => {
    expect(ctx.audit.blocks.map(b => b.id)).toEqual(['major', `major:${ctx.added.id}`, 'gened', 'electives'])
    expect(ctx.audit.blocks[0].title).toBe(ctx.primary.name)
    expect(ctx.audit.blocks[1].title).toBe(ctx.added.name)
  })

  it('lists every requirement once: no row appears in two blocks', () => {
    const keys = rowsOf(ctx.audit).map(r => String(r.key))
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.length).toBe(ctx.merged.slots.length)
  })

  it('keeps a program\'s own courses in its own block', () => {
    const own = id => ctx.audit.blocks.find(b => b.id === id).rows.map(r => r.programId)
    expect(own('major').every(id => id === ctx.primary.id)).toBe(true)
    expect(own(`major:${ctx.added.id}`).every(id => id === ctx.added.id)).toBe(true)
  })

  it('lists a course both programs need once, and as a reference in the other program\'s block', () => {
    const addedBlock = ctx.audit.blocks[1]
    const shared = ctx.merged.shadows.filter(s => s.reason === 'duplicate')
    expect(shared.length).toBeGreaterThan(0)
    const refs = addedBlock.groups.flatMap(g => g.refs)
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ref.label).toBe(`Counted from ${ctx.primary.name}`)
    // the course itself is a row of exactly one block
    const code = refs[0].code
    expect(rowsOf(ctx.audit).filter(r => r.code === code)).toHaveLength(1)
  })

  it('has the merged total, not the primary\'s', () => {
    expect(ctx.audit.summary.total).toBe(ctx.merged.totalHours)
  })
})

describe('a program\'s own course that also counts toward a general-education category', () => {
  it('stays in the major block of the program whose subject it carries (DS 2810 in Business Analytics)', () => {
    const ctx = twoPrograms('bai_bsba')
    const major = ctx.audit.blocks.find(b => b.id === `major:${ctx.added.id}`)
    expect(major.rows.some(r => r.code === 'DS2810')).toBe(true)
    expect(ctx.audit.blocks.find(b => b.id === 'gened').rows.some(r => r.code === 'DS2810')).toBe(false)
    // the merged list alone would have homed it in general education: its subject is not the primary's
    expect(rowsOf(ctx.single).find(r => r.code === 'DS2810').block).toBe('gened')
  })
})

describe('a student with one program', () => {
  it('gets exactly the audit they got before: one major block, no program fields on a row', () => {
    const primary = prog('core')
    const input = { slots: slotsOf('core'), courses, genedProgram: 'flight_foundations', totalHours: totalOf('core'), majorLabel: primary.name }
    const plain = buildDegreeAudit(input)
    const withPrograms = buildDegreeAudit({ ...input, programs: [{ programId: primary.id, name: primary.name }], programsOf: {} })
    expect(withPrograms).toEqual(plain)
    expect(plain.blocks.map(b => b.id)).toEqual(['major', 'gened', 'electives'])
    expect(rowsOf(plain).every(r => r.programId === null && r.programIds === null)).toBe(true)
  })
})

describe('the printed documents', () => {
  const ctx = twoPrograms('me')
  const profile = { concentrations: { ...prog('core'), total_hours: 120 }, catalog_year: '2026-2027', start_season: 'Fall', start_year: 2026 }
  const added = [{ ...prog('me'), role: 'major' }]

  it('name every program, and the second major under the first', () => {
    expect(alsoProgramsOf(added)).toEqual([{ role: 'Second major', text: `Mechanical Engineering, ${prog('me').degree}` }])
    expect(alsoProgramsOf([{ ...prog('me_aero'), role: 'minor' }])[0].role).toBe('Minor')
    expect(alsoProgramsOf([{ ...prog('me_aero'), role: 'major' }])[0].text).toContain('(ME Aerospace)')
    expect(alsoProgramsOf([])).toEqual([])
    expect(programsTitle('CSC Core', added)).toBe('CSC Core + Mechanical Engineering')
    expect(programsTitle('CSC Core', [])).toBe('CSC Core')
  })

  it('the audit PDF model has the same blocks, groups, rows and references as the screen\'s audit', () => {
    const model = buildAuditDocumentModel({ audit: ctx.audit, projection: null, profile, addedPrograms: added })
    expect(model.concentrationName).toBe('CSC Core + Mechanical Engineering')
    expect(model.alsoPrograms).toHaveLength(1)
    expect(model.audit.blocks.map(b => b.id)).toEqual(ctx.audit.blocks.map(b => b.id))
    ctx.audit.blocks.forEach((block, i) => {
      const printed = model.audit.blocks[i]
      expect(printed.groups.map(g => g.rows.length), block.id).toEqual(block.groups.map(g => g.rows.length))
      expect(printed.groups.map(g => g.refs.length), block.id).toEqual(block.groups.map(g => g.refs.length))
    })
  })

  it('the degree map model carries the merged total and the added program; one program is unchanged', () => {
    const base = { semesterNumbers: [1], semesterMap: { 1: [] }, courses, profile }
    const merged = buildPlanExportModel({ ...base, addedPrograms: added, totalHours: ctx.merged.totalHours })
    expect(merged.totalHours).toBe(ctx.merged.totalHours)
    expect(merged.concentrationName).toBe('CSC Core + Mechanical Engineering')
    expect(merged.alsoPrograms).toHaveLength(1)
    const single = buildPlanExportModel(base)
    expect(single.totalHours).toBe(120)
    expect(single.concentrationName).toBe('CSC Core')
    expect(single.alsoPrograms).toEqual([])
  })
})
