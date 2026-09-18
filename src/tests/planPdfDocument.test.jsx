// planPdfDocument.test.jsx
//
// A render smoke test for the PDF document itself, not its data.
//
// planExportModel.test.js covers what the document says; this covers whether
// it can be produced at all. @react-pdf fails in ways a model test cannot
// see: a bare string outside a <Text> throws at render time, and — found
// while building this — a lineHeight on the <Page> silently drops the
// absolutely-positioned footer from the output with no error at all. So this
// renders the real component and asserts the bytes come back as a PDF.
//
// renderToBuffer is the Node equivalent of the browser's pdf().toBlob().

import { describe, it, expect } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import PlanPdfDocument from '../components/PlanPdfDocument'
import { buildPlanExportModel } from '../lib/planExportModel'

const COURSES = {
  CSC1300:  { name: 'Introduction to Problem Solving and Programming', credits: 4 },
  MATH1910: { name: 'Calculus I',                credits: 4 },
  PHIL1030: { name: 'Introduction to Philosophy', credits: 3 },
}

function render(modelInput) {
  return renderToBuffer(<PlanPdfDocument model={buildPlanExportModel(modelInput)} />)
}

async function expectPdf(promise) {
  const buffer = await promise
  expect(buffer.length).toBeGreaterThan(0)
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  return buffer
}

describe('PlanPdfDocument', () => {
  it('renders a populated plan', async () => {
    await expectPdf(render({
      semesterNumbers:   [1],
      semesterMap:       { 1: [
        { id: 1, class_code: 'CSC1300',  is_pool: false },
        { id: 2, class_code: 'MATH1910', is_pool: false },
        { id: 3, class_code: 'GEN_ED',   is_pool: true  },
      ] },
      freeAddBySemester: { 1: [{ id: 91, course_code: 'PHIL1030' }] },
      planSlots:         { 3: 'PHIL1030' },
      courses:           COURSES,
      semesterTerms:     { 1: { season: 'Fall', year: 2026 } },
      profile:           { start_season: 'Fall', start_year: 2026, concentrations: { name: 'Data Science & AI', total_hours: 120 } },
      graduation:        { season: 'Spring', year: 2030 },
      generatedAt:       new Date(2026, 8, 17),
    }))
  })

  it('renders an empty plan without throwing', async () => {
    await expectPdf(render({}))
  })

  it('renders unfilled pool slots and uncatalogued courses', async () => {
    await expectPdf(render({
      semesterNumbers: [1],
      semesterMap:     { 1: [
        { id: 1, class_code: 'SCIENCE', is_pool: true, flex_credits: 4 },
        { id: 2, class_code: 'CSC9999', is_pool: false },
      ] },
      planSlots:       {},
      courses:         {},
      semesterTerms:   {},
      profile:         null,
    }))
  })

  it('spans multiple pages without losing the fixed footer', async () => {
    // Twelve semesters overflow one LETTER page. The footer is absolutely
    // positioned and `fixed`, which is the fragile combination — this is the
    // case that regressed silently before.
    const semesterNumbers = Array.from({ length: 12 }, (_, i) => i + 1)
    const semesterMap = Object.fromEntries(semesterNumbers.map(n => [
      n,
      [1, 2, 3, 4].map(i => ({ id: n * 10 + i, class_code: 'CSC1300', is_pool: false })),
    ]))
    const semesterTerms = Object.fromEntries(
      semesterNumbers.map(n => [n, { season: n % 2 ? 'Fall' : 'Spring', year: 2026 + Math.floor(n / 2) }])
    )

    await expectPdf(render({
      semesterNumbers, semesterMap, courses: COURSES, semesterTerms,
      profile: { start_season: 'Fall', start_year: 2026, concentrations: { name: 'Core', total_hours: 120 } },
      generatedAt: new Date(2026, 8, 17),
    }))
  })
})
