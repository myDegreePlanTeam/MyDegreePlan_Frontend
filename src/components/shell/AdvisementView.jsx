// Advising tab (the file keeps its old name, AdvisementView): an in-page preview of the PDF a student would hand an advisor, so they see exactly what is printed. There are two
// documents, each its own PDF with its own export button: the Degree Map (the plan, semester by semester, on the department's form) and
// the Degree Audit (every requirement, what counts toward it, and the finish line). One is shown at a time.
//
// documents: [{ id, label, exportButton, preview, soon }]. A document marked `soon` is built but not open yet (lib/features.js): it is
// listed, greyed out and tagged, and cannot be chosen.

import { useState } from 'react'

export default function AdvisementView({
  concentrationName,
  email,
  documents,
}) {
  const [chosen, setChosen] = useState(documents[0]?.id)
  const current = documents.find(d => d.id === chosen && !d.soon) ?? documents.find(d => !d.soon)

  return (
    <div className="ds-view ds-adv-view">
      <div className="ds-adv-top">
        <div>
          <p className="ds-eyebrow">Advising</p>
          <h2 className="ds-h2">{current?.label}</h2>
          <p className="ds-sub">{concentrationName}{email && ` · ${email}`}</p>
        </div>
        {current?.exportButton}
      </div>

      {documents.length > 1 && (
        <div className="ds-adv-docs" role="group" aria-label="Document">
          {documents.map(doc => (
            <button
              key={doc.id}
              type="button"
              className={`ds-adv-doc${doc.id === current?.id ? ' ds-adv-doc-active' : ''}${doc.soon ? ' ds-adv-doc-soon' : ''}`}
              aria-pressed={doc.id === current?.id}
              disabled={doc.soon}
              onClick={() => setChosen(doc.id)}
            >
              {doc.label}
              {doc.soon && <span className="ds-tab-soon-tag">Coming soon</span>}
            </button>
          ))}
        </div>
      )}

      {current?.preview}
    </div>
  )
}
