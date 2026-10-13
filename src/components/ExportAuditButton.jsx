// ExportAuditButton.jsx
// One click, one download: the degree audit as its own PDF, separate from the Degree Map. Built from the audit and projection the
// Requirements tab shows. Same lazy loading and no persistence as ExportPlanButton.

import { useState } from 'react'
import { buildAuditDocumentModel, buildAuditExportFilename } from '../lib/auditExportModel'
import { downloadBlob } from '../lib/downloadBlob'

export default function ExportAuditButton({ audit, projection, profile, addedPrograms = [], className = 'degreeplan-settings' }) {
  const [status, setStatus] = useState('idle')   // 'idle' | 'working' | 'error'
  const isEmpty = !audit

  async function handleExport() {
    if (status === 'working') return
    setStatus('working')
    try {
      const generatedAt = new Date()
      const model = buildAuditDocumentModel({ audit, projection, profile, generatedAt, addedPrograms })
      const [{ pdf }, { default: AuditPdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./AuditPdfDocument'),
      ])
      const blob = await pdf(<AuditPdfDocument model={model} />).toBlob()
      downloadBlob(blob, buildAuditExportFilename(model, generatedAt))
      setStatus('idle')
    } catch (err) {
      console.error('Audit PDF export failed:', err)
      setStatus('error')
    }
  }

  const label = status === 'working' ? 'Preparing PDF…' : status === 'error' ? 'Export failed — retry' : 'Export PDF'
  return (
    <button
      className={className}
      onClick={handleExport}
      disabled={isEmpty || status === 'working'}
      title={isEmpty ? 'Nothing to export yet' : 'Download the degree audit as a PDF'}
    >
      {label}
    </button>
  )
}
