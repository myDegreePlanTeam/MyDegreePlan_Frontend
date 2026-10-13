// auditExportModel.js
//
// The degree audit as the printed PDF reads it. Pure: it takes the audit (lib/degreeAudit.js) and the projection
// (lib/degreeProjection.js) the Requirements tab already shows and shapes them into plain, JSON-safe rows, so the pages an advisor
// reads are the screen's own numbers and words (the labels come from lib/auditLabels.js, the finish line from describeFinish).
//
// Like planExportModel, it is read cold: a row carries its course, state and where the credit comes from, and a course that counts
// toward a category from another block says so under that category.
//
//   buildAuditExport({ audit, projection }) -> null | {
//     requirements: { done, inProgress, planned, open, total },
//     hoursLine,
//     finish: { lead, graduationLabel, detail, pace, chainText, blocked, fine } | null,
//     blocks: [{ id, title, countLabel, datesLine, summary, exemptLine, groups: [{ title, progressLabel, stateKey, note, rows, refs }] }],
//     notCounted: [{ kind, label, hours, reason }],
//   }
//
// A row: { code, title, state, stateLabel, where, tags, hours }. `state` is the audit's own key (done, in_progress, planned,
// not_placed), which the document colours; `stateLabel` is the word, so a greyscale print still says it.

import { formatCourseCode } from './courseCodeFormat.js'
import { deriveCatalogYear, formatLongDate, filenameFor } from './planExportModel.js'
import { programHeader } from './programBrowser.js'
import { formatRange } from './genEdPanel.js'
import { ROW_STATES, CATEGORY_STATES } from './auditLabels.js'
import { describeFinish, describeBlockDates } from './degreeProjection.js'

function whereOf(item) {
  if (item.source === 'prior_credit') {
    return `Prior credit${item.sourceLabel ? ` (${item.sourceLabel})` : ''}${item.sourceNote ?? item.note ? `: ${item.sourceNote ?? item.note}` : ''}`
  }
  return item.term ?? null
}

function printRow(row) {
  const tags = []
  if (row.choose) tags.push(row.choose)
  if (row.alsoCounts) tags.push(`also counts for ${row.alsoCounts}`)
  return {
    code:       row.code ? formatCourseCode(row.code) : null,
    title:      row.code ? (row.name ?? null) : row.label,
    state:      row.state,
    stateLabel: ROW_STATES[row.state].label,
    where:      whereOf(row),
    tags,
    hours:      row.hours > 0 ? row.hours : null,
  }
}

// A course counted toward a category from elsewhere (your major, an added course, prior credit)
function printRef(ref) {
  return {
    code:       ref.code ? formatCourseCode(ref.code) : null,
    title:      ref.name ?? null,
    state:      ref.state,
    stateLabel: ROW_STATES[ref.state].label,
    where:      whereOf(ref),
    tags:       [ref.label],
    hours:      ref.hours > 0 ? ref.hours : null,
  }
}

function printGroup(group) {
  const p = group.progress
  return {
    title:         group.title,
    progressLabel: p ? (p.exempt ? 'Not required for your major · Exempt' : `${p.earned} of ${formatRange(p)} hrs · ${CATEGORY_STATES[p.state]}`) : null,
    stateKey:      p?.state ?? null,
    note:          group.note ?? null,
    rows:          group.rows.map(printRow),
    refs:          (group.refs ?? []).map(printRef),
  }
}

function summaryLine(panel) {
  if (!panel) return null
  const covered = `${panel.title}: ${panel.earned} of ${panel.required} hours covered (${panel.done} earned, ${panel.inProgress} in progress, ${panel.planned} planned).`
  return panel.flexNote ? `${covered} ${panel.flexNote}.` : covered
}

export function buildAuditExport({ audit, projection } = {}) {
  if (!audit) return null
  const r = audit.summary.requirements
  const s = audit.summary
  const finish = describeFinish(projection)

  return {
    requirements: { done: r.done, inProgress: r.in_progress, planned: r.planned, open: r.not_placed, total: r.done + r.in_progress + r.planned + r.not_placed },
    hoursLine: `In hours: ${s.done} done, ${s.inProgress} in progress and ${s.planned} planned, of the ${s.total} the degree needs.`,
    finish: finish && {
      lead:            finish.lead,
      graduationLabel: finish.graduationLabel,
      detail:          finish.detail,
      pace:            finish.pace ? `What sets the pace: ${finish.pace.label}. ${finish.pace.text}` : null,
      chainText:       finish.chain.map(step => `${step.termLabel} ${step.code ? formatCourseCode(step.code) : step.label}`).join('  >  ') || null,
      blocked:         finish.blocked.map(b => `${b.code ? formatCourseCode(b.code) : b.label} ${b.text}`),
      fine:            finish.fine,
    },
    blocks: audit.blocks.map(block => ({
      id:         block.id,
      title:      block.title,
      countLabel: block.total > 0 ? `${block.counts.done} of ${block.total} done` : null,
      datesLine:  describeBlockDates(projection?.blocks?.[block.id]),
      summary:    summaryLine(block.panel),
      exemptLine: block.panel?.exemptions?.length
        ? `Exempt for this major: ${block.panel.exemptions.map(e => `${e.label} (${e.hours} hrs)`).join(', ')}. Confirm with an advisor.`
        : null,
      groups:     block.groups.map(printGroup),
    })),
    notCounted: (audit.notCounted ?? []).map(item => ({
      kind:   item.kind,
      label:  [item.code ? formatCourseCode(item.code) : null, item.name].filter(Boolean).join(' '),
      hours:  item.hours > 0 ? item.hours : null,
      reason: item.reason,
    })),
  }
}

/**
 * The whole document: what heads it (the program, the catalog year, the day it was made) and the audit itself. A separate PDF from the
 * Degree Map, built from the same audit and projection the Requirements tab shows.
 *
 * @param {Object} input
 * @param {Object} input.audit       buildDegreeAudit's result
 * @param {Object} input.projection  projectDegree's result, or null
 * @param {Object} input.profile     student_profiles row (+ joined concentrations)
 * @param {Date}   input.generatedAt
 * @returns {null | { concentrationName, degree, major, concentration, catalogYear, generatedOn, audit }}
 */
export function buildAuditDocumentModel({ audit, projection, profile = null, generatedAt = new Date() } = {}) {
  const body = buildAuditExport({ audit, projection })
  if (!body) return null
  const header = programHeader(profile?.concentrations)
  return {
    concentrationName: profile?.concentrations?.name ?? null,
    degree:            header.degree,
    major:             header.major,
    concentration:     header.concentration,
    catalogYear:       profile?.catalog_year ?? deriveCatalogYear(profile?.start_season, profile?.start_year),
    generatedOn:       formatLongDate(generatedAt),
    audit:             body,
  }
}

/** "degree-audit-computer-science-2026-09-17.pdf" */
export function buildAuditExportFilename(model, date = new Date()) {
  return filenameFor('degree-audit', model, date)
}
