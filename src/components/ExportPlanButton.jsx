// ExportPlanButton.jsx
// One click, one download: builds the printable model from the plan as it
// currently stands and hands the student a PDF. Nothing is persisted — no
// snapshot row, no share token, no Supabase write.
//
// @react-pdf/renderer and the document component are behind a dynamic
// import() inside the click handler. The renderer carries pdfkit and its font
// data — well over a megabyte — and a student who never exports should never
// download it. This mirrors the route-level React.lazy() splitting in App.jsx.

import { useState } from 'react'
import { buildPlanExportModel, buildPlanExportFilename } from '../lib/planExportModel'

export default function ExportPlanButton({
  semesterNumbers,
  semesterMap,
  freeAddBySemester,
  planSlots,
  courses,
  semesterTerms,
  profile,
  graduation,
  semesterCompleted,
  priorCredits,
  className = 'degreeplan-settings',
}) {
  const [status, setStatus] = useState('idle')   // 'idle' | 'working' | 'error'

  const isEmpty = !semesterNumbers?.length

  async function handleExport() {
    if (status === 'working') return
    setStatus('working')

    try {
      const generatedAt = new Date()
      const model = buildPlanExportModel({
        semesterNumbers,
        semesterMap,
        freeAddBySemester,
        planSlots,
        courses,
        semesterTerms,
        profile,
        graduation,
        generatedAt,
        semesterCompleted,
        priorCredits,
      })

      const [{ pdf }, { default: PlanPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./PlanPdfDocument'),
      ])

      // pdf().toBlob() renders the document off-screen. The alternative,
      // <PDFDownloadLink>, would mount the renderer into the page on every
      // visit to the plan; this only runs it when the student asks.
      const blob = await pdf(<PlanPdfDocument model={model} />).toBlob()

      const url    = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href     = url
      anchor.download = buildPlanExportFilename(model, generatedAt)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      // Revoked on the next tick: Safari cancels the download if the object
      // URL disappears in the same frame as the click.
      setTimeout(() => URL.revokeObjectURL(url), 0)

      setStatus('idle')
    } catch (err) {
      console.error('PDF export failed:', err)
      setStatus('error')
    }
  }

  const label = status === 'working'
    ? 'Preparing PDF…'
    : status === 'error'
      ? 'Export failed — retry'
      : 'Export PDF'

  return (
    <button
      className={className}
      onClick={handleExport}
      disabled={isEmpty || status === 'working'}
      title={isEmpty
        ? 'Nothing to export yet — your plan has no semesters'
        : 'Download this plan as a PDF'}
    >
      {label}
    </button>
  )
}
