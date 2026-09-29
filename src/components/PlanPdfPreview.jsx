// PlanPdfPreview.jsx
// Shows the exact PDF that ExportPlanButton downloads, embedded in the page
// through the browser's own PDF viewer (zoom, page nav, print).
//
// Same lazy-loading rule as ExportPlanButton: @react-pdf/renderer is only
// fetched once this component mounts, i.e. when the Advisement tab is opened.

import { useEffect, useState } from 'react'
import { buildPlanExportModel } from '../lib/planExportModel'

export default function PlanPdfPreview({
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
}) {
  const [url, setUrl]       = useState(null)
  const [status, setStatus] = useState('working')   // 'working' | 'ready' | 'error'

  const isEmpty = !semesterNumbers?.length

  // The parent hands down fresh object identities on most renders, so the
  // effect keys on the serialized model instead: the PDF is regenerated only
  // when what it would print actually changes. generatedOn is day-granular,
  // so the stamp doesn't churn the key.
  const modelJson = isEmpty ? null : JSON.stringify(buildPlanExportModel({
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
  }))

  useEffect(() => {
    if (!modelJson) return
    let cancelled = false
    let objectUrl = null
    setStatus('working')

    async function render() {
      try {
        const [{ pdf }, { default: PlanPdfDocument }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('./PlanPdfDocument'),
        ])
        const blob = await pdf(<PlanPdfDocument model={JSON.parse(modelJson)} />).toBlob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        console.error('PDF preview failed:', err)
        setStatus('error')
      }
    }
    render()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [modelJson])

  if (isEmpty) {
    return <div className="ds-pdf-frame ds-pdf-msg">Nothing to preview yet — your plan has no semesters.</div>
  }

  return (
    <div className="ds-pdf-frame">
      {url && (
        <iframe
          className="ds-pdf-iframe"
          src={`${url}#view=FitH&navpanes=0`}
          title="Degree plan PDF preview"
        />
      )}
      {status === 'working' && <div className="ds-pdf-msg ds-pdf-overlay">Rendering PDF…</div>}
      {status === 'error'   && <div className="ds-pdf-msg ds-pdf-overlay">Couldn't render the preview.</div>}
    </div>
  )
}
