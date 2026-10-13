// auditExportModel.test.js
//
// The printed audit must say what the screen says. Its numbers and words come from the same audit and projection the Requirements tab
// shows, and the model is JSON-safe (the preview regenerates only when the model's JSON changes). Real students from the catalog.

import { describe, it, expect } from 'vitest'
import { buildAuditExport, buildAuditDocumentModel, buildAuditExportFilename } from '../lib/auditExportModel.js'
import { buildPlanExportModel } from '../lib/planExportModel.js'
import { describeFinish } from '../lib/degreeProjection.js'
import { ROW_STATES, CATEGORY_STATES } from '../lib/auditLabels.js'
import { freshStudent } from './support/realStudent.js'

describe('buildAuditExport', () => {
  const student = freshStudent('cybersecurity', 29)
  const model = buildAuditExport(student)

  it('is null without an audit, and survives having no projection', () => {
    expect(buildAuditExport({})).toBeNull()
    const noFinish = buildAuditExport({ audit: student.audit })
    expect(noFinish.finish).toBeNull()
    expect(noFinish.blocks.length).toBe(student.audit.blocks.length)
  })

  it('is plain data: it survives a JSON round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(model))).toEqual(model)
  })

  it('carries the screen\'s own counts', () => {
    const r = student.audit.summary.requirements
    expect(model.requirements).toEqual({ done: r.done, inProgress: r.in_progress, planned: r.planned, open: r.not_placed, total: r.done + r.in_progress + r.planned + r.not_placed })
    expect(model.hoursLine).toMatch(new RegExp(`of the ${student.audit.summary.total} the degree needs`))
  })

  it('prints the finish line in the screen\'s words', () => {
    const f = describeFinish(student.projection)
    expect(model.finish.lead).toBe(f.lead)
    expect(model.finish.graduationLabel).toBe('Spring 2030')
    expect(model.finish.detail).toBe(f.detail)
    expect(model.finish.fine).toBe(f.fine)
    expect(model.finish.pace).toContain(f.pace.label)
    expect(model.finish.chainText).toMatch(/Fall 2026 MATH 1910/)
  })

  it('has the three blocks, each with its groups and a count', () => {
    expect(model.blocks.map(b => b.id)).toEqual(['major', 'gened', 'electives'])
    expect(model.blocks[0].title).toBe('CSC Cybersecurity')
    for (const block of model.blocks) expect(block.countLabel).toMatch(/^\d+ of \d+ done$/)
    const gened = model.blocks.find(b => b.id === 'gened')
    expect(gened.summary).toMatch(/^Flight Foundations: \d+ of 41 hours covered/)
    expect(gened.groups.map(g => g.title)).toContain('English Composition')
  })

  it('prints each row with its course as the catalog writes it, a state word and where it comes from', () => {
    const major = model.blocks[0].groups.find(g => g.title === 'Required courses')
    const row = major.rows.find(r => r.code === 'CSC 1300')
    expect(row).toMatchObject({ title: expect.any(String), state: 'planned', stateLabel: ROW_STATES.planned.label })
    expect(row.where).toMatch(/^(Fall|Spring) \d{4}$/)
    expect(row.hours).toBe(4)
  })

  it('prints an unmade choice as the requirement, with how many courses it takes and the hours', () => {
    const social = model.blocks.find(b => b.id === 'gened').groups.find(g => g.title === 'Social and Behavioral Sciences')
    expect(social.rows[0]).toMatchObject({ code: null, title: 'Social & Behavioral Sciences', state: 'not_placed', stateLabel: ROW_STATES.not_placed.label, hours: 3 })
    expect(social.rows[0].tags[0]).toMatch(/^Choose 1 of \d+$/)
  })

  it('prints a category\'s progress with the shared wording, never "Met"', () => {
    const groups = model.blocks.find(b => b.id === 'gened').groups
    for (const g of groups) {
      expect(g.progressLabel).toMatch(/hrs · /)
      expect(Object.values(CATEGORY_STATES).some(label => g.progressLabel.endsWith(label))).toBe(true)
    }
    expect(groups.some(g => /Met/.test(g.progressLabel))).toBe(false)
  })

  it('points a category at a major course that counts for it', () => {
    const literacy = model.blocks.find(b => b.id === 'gened').groups.find(g => g.title === 'Financial Literacy or Digital Literacy')
    expect(literacy.refs.map(r => r.code)).toEqual(['CSC 2570'])
    expect(literacy.refs[0].tags).toEqual(['Counted from your major'])
    const major = model.blocks[0].groups.flatMap(g => g.rows).find(r => r.code === 'CSC 2570')
    expect(major.tags).toContain('also counts for Financial Literacy or Digital Literacy')
  })

  it('says when a category is exempt for the major', () => {
    const me = buildAuditExport(freshStudent('me', 29))
    expect(me.blocks.find(b => b.id === 'gened').groups.find(g => g.title === 'Historical Foundations').progressLabel).toBe('Not required for your major · Exempt')
  })

  it('a prior credit prints with its source and note', () => {
    const done = student.audit.blocks.flatMap(b => b.rows).filter(r => r.source === 'prior_credit')
    const printed = model.blocks.flatMap(b => b.groups.flatMap(g => g.rows)).filter(r => /^Prior credit/.test(r.where ?? ''))
    expect(printed.length).toBe(done.length)
  })

  it('lists what did not count', () => {
    const items = buildAuditExport({ audit: { ...student.audit, notCounted: [{ kind: 'extra', code: 'CSC1200', name: 'Principles of Computing', hours: 3, reason: 'Counts toward your total hours.' }] } }).notCounted
    expect(items).toEqual([{ kind: 'extra', label: 'CSC 1200 Principles of Computing', hours: 3, reason: 'Counts toward your total hours.' }])
  })
})

describe('buildAuditDocumentModel', () => {
  const student = freshStudent('cybersecurity', 29)
  const profile = { start_season: 'Fall', start_year: 2026, catalog_year: '2026-2027', concentrations: { name: 'CSC Cybersecurity', major_name: 'Computer Science', degree: 'B.S.', kind: 'concentration' } }

  it('heads the document with the program, the catalog year and the day, and carries the audit', () => {
    const model = buildAuditDocumentModel({ ...student, profile, generatedAt: new Date(2026, 9, 12) })
    expect(model).toMatchObject({ concentrationName: 'CSC Cybersecurity', catalogYear: '2026-2027', generatedOn: 'October 12, 2026' })
    expect(model.audit.blocks.map(b => b.id)).toEqual(['major', 'gened', 'electives'])
  })

  it('is null without an audit, and falls back to the catalog year the start term implies', () => {
    expect(buildAuditDocumentModel({})).toBeNull()
    expect(buildAuditDocumentModel({ ...student, profile: { start_season: 'Spring', start_year: 2027 } }).catalogYear).toBe('2026-2027')
  })

  it('is plain data', () => {
    const model = buildAuditDocumentModel({ ...student, profile })
    expect(JSON.parse(JSON.stringify(model))).toEqual(model)
  })

  it('is not part of the Degree Map: the plan export carries no audit, so it is its own document', () => {
    expect(buildPlanExportModel({ semesterNumbers: [1], semesterMap: { 1: [] } })).not.toHaveProperty('audit')
  })

  it('has its own file name, not the plan\'s', () => {
    const model = buildAuditDocumentModel({ ...student, profile })
    expect(buildAuditExportFilename(model, new Date(2026, 9, 12))).toBe('degree-audit-csc-cybersecurity-2026-10-12.pdf')
  })
})
