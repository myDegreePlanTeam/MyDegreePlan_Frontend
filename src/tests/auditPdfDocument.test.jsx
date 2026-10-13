// auditPdfDocument.test.jsx
//
// A render smoke test for the degree audit PDF, which is its own document, not pages of the Degree Map. Like planPdfDocument.test.jsx it
// renders the real component: @react-pdf fails in ways a model test cannot see (a bare string outside a <Text> throws at render time).

import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import AuditPdfDocument from '../components/AuditPdfDocument'
import { buildAuditDocumentModel } from '../lib/auditExportModel'
import { freshStudent } from './support/realStudent.js'

const pagesOf = buffer => (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

async function render(code, act = 29, extra = {}) {
  const s = freshStudent(code, act)
  const model = buildAuditDocumentModel({
    audit: s.audit, projection: s.projection, generatedAt: new Date(2026, 9, 12),
    profile: { start_season: 'Fall', start_year: 2026, catalog_year: '2026-2027', concentrations: { name: s.audit.blocks[0].title, total_hours: 120 } },
    ...extra(s),
  })
  const buffer = await renderToBuffer(<AuditPdfDocument model={model} />)
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  return buffer
}
const same = () => ({})

describe('AuditPdfDocument', () => {
  it('renders a real student\'s audit on its own pages', async () => {
    const buffer = await render('cybersecurity', 17, same)
    expect(pagesOf(buffer)).toBeGreaterThanOrEqual(2)
  })

  it('renders an engineering student (an exempt category, a department-map finish line)', async () => {
    await render('me', 29, same)
  })

  it('renders without a projection, and with items that did not count', async () => {
    await render('core', 17, s => ({
      projection: null,
      audit: { ...s.audit, notCounted: [
        { kind: 'extra', key: 'fa_1', code: 'CSC1200', name: 'Principles of Computing', hours: 3, reason: 'Counts toward your total hours. It does not fill a listed requirement.' },
        { kind: 'over_cap', key: null, code: null, name: 'Scientific Reasoning', hours: 4, reason: 'Above the 8-hour limit.' },
      ] },
    }))
  })

  it('renders a student with nothing left to schedule', async () => {
    await render('core', 29, s => ({ projection: { ...s.projection, complete: true, graduation: null, underway: 'Spring 2027', chain: [], blocked: [] } }))
  })
})
