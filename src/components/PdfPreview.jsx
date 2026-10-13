// PdfPreview.jsx
// Shows a PDF embedded in the page through the browser's own PDF viewer (zoom, page nav, print). The Degree Map and the Degree Audit
// each have a thin wrapper that builds their model and says which document to render, so what is previewed is exactly what the
// matching export button downloads.
//
// Same lazy-loading rule as the export buttons: @react-pdf/renderer is only fetched once a preview mounts.

import { useEffect, useState } from 'react'

/**
 * @param {string|null} modelJson   the serialized model (the effect keys on it, so the PDF is regenerated only when what it would
 *                                  print changes; the parent hands down fresh object identities on most renders). null = nothing to show
 * @param {() => Promise<{default: Function}>} loadDocument  dynamic import of the document component
 * @param {string} title            the iframe's title
 * @param {string} emptyMessage
 */
export default function PdfPreview({ modelJson, loadDocument, title, emptyMessage }) {
  const [url, setUrl]       = useState(null)
  const [status, setStatus] = useState('working')   // 'working' | 'ready' | 'error'

  useEffect(() => {
    if (!modelJson) return
    let cancelled = false
    let objectUrl = null
    setStatus('working')

    async function render() {
      try {
        const [{ pdf }, { default: Document }] = await Promise.all([
          import('@react-pdf/renderer'),
          loadDocument(),
        ])
        const blob = await pdf(<Document model={JSON.parse(modelJson)} />).toBlob()
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
    // loadDocument is a stable module-level function in each wrapper
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelJson])

  if (!modelJson) {
    return <div className="ds-pdf-frame ds-pdf-msg">{emptyMessage}</div>
  }

  return (
    <div className="ds-pdf-frame">
      {url && (
        <iframe
          className="ds-pdf-iframe"
          src={`${url}#view=FitH&navpanes=0`}
          title={title}
        />
      )}
      {status === 'working' && <div className="ds-pdf-msg ds-pdf-overlay">Rendering PDF…</div>}
      {status === 'error'   && <div className="ds-pdf-msg ds-pdf-overlay">Couldn't render the preview.</div>}
    </div>
  )
}
