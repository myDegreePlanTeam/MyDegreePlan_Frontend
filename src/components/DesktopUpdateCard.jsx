import { useState } from 'react'
import { useDesktopUpdate } from '../lib/useDesktopUpdate'
import './UpdateBanner.css'

// Update notice for the Windows desktop app. Renders nothing anywhere else (hosted build, Docker install).
// Every state is a small card, bottom right, and the app stays usable throughout:
//   available    what's new + [Download] / [Later]
//   downloading  progress
//   ready        [Restart now] / [Later]; the update also installs when the app is closed
//   failed       the installed version is untouched; [Try again] / [Dismiss]
export default function DesktopUpdateCard() {
  const { view, download, install, retry, dismiss } = useDesktopUpdate()
  const [showNotes, setShowNotes] = useState(false)

  if (view.mode === 'none') return null

  if (view.mode === 'downloading') {
    return (
      <aside className="upd-card" role="status" aria-live="polite">
        <p className="upd-strong">Downloading MyDegreePlan {view.version}</p>
        <progress className="upd-progress" max="100" value={view.percent} aria-label="Download progress" />
        <p className="upd-muted">{view.percent}%. You can keep working.</p>
      </aside>
    )
  }

  if (view.mode === 'ready') {
    return (
      <Card onClose={() => dismiss({ ready: view.version })} closeLabel="Later">
        <p className="upd-strong">MyDegreePlan {view.version} is ready</p>
        <p className="upd-muted">Restart to finish updating. Your plan is kept. If you do nothing, it installs the next time you close the app.</p>
        <div className="upd-actions">
          <button type="button" className="upd-primary" onClick={install}>Restart now</button>
          <button type="button" className="upd-link" onClick={() => dismiss({ ready: view.version })}>Later</button>
        </div>
      </Card>
    )
  }

  if (view.mode === 'failed') {
    return (
      <Card tone="warn" onClose={() => dismiss({ error: true })}>
        <p className="upd-strong">The update didn&rsquo;t finish</p>
        <p>{view.message}</p>
        <div className="upd-actions">
          <button type="button" className="upd-primary" onClick={retry}>Try again</button>
          <button type="button" className="upd-link" onClick={() => dismiss({ error: true })}>Dismiss</button>
        </div>
      </Card>
    )
  }

  // available
  return (
    <Card onClose={() => dismiss({ available: view.version })} closeLabel="Later">
      <p className="upd-strong">MyDegreePlan {view.version} is available</p>
      {view.notes && (
        <button type="button" className="upd-link" onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes}>
          {showNotes ? 'Hide what’s new' : 'What’s new'}
        </button>
      )}
      {showNotes && <pre className="upd-notes">{view.notes}</pre>}
      <div className="upd-actions">
        <button type="button" className="upd-primary" onClick={download}>Download</button>
        <button type="button" className="upd-link" onClick={() => dismiss({ available: view.version })}>Later</button>
      </div>
    </Card>
  )
}

function Card({ children, tone, onClose, closeLabel = 'Dismiss' }) {
  return (
    <aside className={`upd-card${tone === 'warn' ? ' upd-card--warn' : ''}`} role="status" aria-live="polite">
      <button type="button" className="upd-x" onClick={onClose} aria-label={closeLabel}>&times;</button>
      {children}
    </aside>
  )
}
