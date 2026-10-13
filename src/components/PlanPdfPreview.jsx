// PlanPdfPreview.jsx
// Shows the exact PDF that ExportPlanButton downloads, embedded in the page
// through the browser's own PDF viewer (zoom, page nav, print).
//
// Same lazy-loading rule as ExportPlanButton: @react-pdf/renderer is only
// fetched once this component mounts, i.e. when the Advisement tab is opened.

import { buildPlanExportModel } from '../lib/planExportModel'
import PdfPreview from './PdfPreview'

const loadDocument = () => import('./PlanPdfDocument')

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
  remainders,
  addedPrograms = [],
  totalHours = null,
}) {
  const isEmpty = !semesterNumbers?.length

  // The parent hands down fresh object identities on most renders, so the
  // preview keys on the serialized model instead: the PDF is regenerated only
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
    remainders,
    addedPrograms,
    totalHours,
  }))

  return (
    <PdfPreview
      modelJson={modelJson}
      loadDocument={loadDocument}
      title="Degree plan PDF preview"
      emptyMessage="Nothing to preview yet — your plan has no semesters."
    />
  )
}
