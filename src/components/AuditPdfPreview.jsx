// AuditPdfPreview.jsx
// Shows the exact PDF that ExportAuditButton downloads: the degree audit, embedded through the browser's own PDF viewer.

import { buildAuditDocumentModel } from '../lib/auditExportModel'
import PdfPreview from './PdfPreview'

const loadDocument = () => import('./AuditPdfDocument')

export default function AuditPdfPreview({ audit, projection, profile, addedPrograms = [] }) {
  const model = audit ? buildAuditDocumentModel({ audit, projection, profile, addedPrograms }) : null
  return (
    <PdfPreview
      modelJson={model ? JSON.stringify(model) : null}
      loadDocument={loadDocument}
      title="Degree audit PDF preview"
      emptyMessage="Nothing to preview yet — your plan has no requirements."
    />
  )
}
