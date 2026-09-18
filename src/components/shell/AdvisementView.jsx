// Advisement tab: an in-page preview of the exported PDF, so a student sees
// exactly what they'd hand an advisor. The PDF export button lives here.

export default function AdvisementView({
  concentrationName,
  email,
  exportButton,
  preview,
}) {
  return (
    <div className="ds-view ds-adv-view">
      <div className="ds-adv-top">
        <div>
          <p className="ds-eyebrow">Advisement view</p>
          <h2 className="ds-h2">Degree map</h2>
          <p className="ds-sub">{concentrationName}{email && ` · ${email}`}</p>
        </div>
        {exportButton}
      </div>

      {preview}
    </div>
  )
}
