import { useState } from 'react'
import { useAppUpdate } from '../lib/useAppUpdate'
import './UpdateBanner.css'

// Update notice for the local Docker install. Renders nothing on the hosted build.
//   available  small card, bottom right: what's new + [Update now] / [Later]
//   required   full-screen, no way past it: [Update now]
//   working    full-screen progress while the app switches versions
//   failed     small card: the old version is still running; [Try again] / [Dismiss]
export default function UpdateBanner() {
  const { supported, view, status, notice, install, setAuto, dismiss, clearNotice } = useAppUpdate()
  const [showNotes, setShowNotes] = useState(false)

  if (!supported || view.mode === 'none') {
    return notice ? <Card tone="warn" onClose={clearNotice}><p>{notice}</p></Card> : null
  }

  if (view.mode === 'working') {
    return (
      <div className="upd-overlay" role="dialog" aria-modal="true" aria-labelledby="upd-title">
        <div className="upd-panel">
          <div className="upd-spinner" aria-hidden="true" />
          <h2 id="upd-title">Updating MyDegreePlan{view.target?.version ? ` to ${view.target.version}` : ''}</h2>
          <p className="upd-live" aria-live="polite">{view.label}…</p>
          <p className="upd-muted">
            This usually takes a minute or two. Your plan is backed up first, and this page reloads by itself
            when it is done. Please keep Docker Desktop running.
          </p>
        </div>
      </div>
    )
  }

  if (view.mode === 'required') {
    return (
      <div className="upd-overlay" role="dialog" aria-modal="true" aria-labelledby="upd-title">
        <div className="upd-panel">
          <p className="upd-eyebrow">Update required</p>
          <h2 id="upd-title">MyDegreePlan {view.latest.version} is needed to keep going</h2>
          <p className="upd-muted">
            This version is out of date. Update now to keep using the planner. Your plans are kept.
          </p>
          <Notes notes={view.latest.notes} />
          {notice && <p className="upd-error" role="alert">{notice}</p>}
          <div className="upd-actions">
            <button type="button" className="upd-primary" onClick={install}>Update now</button>
          </div>
        </div>
      </div>
    )
  }

  if (view.mode === 'failed') {
    return (
      <Card tone="warn" onClose={() => dismiss({ failedAt: view.at })}>
        <p className="upd-strong">The update didn&rsquo;t finish</p>
        <p>{view.message}</p>
        <div className="upd-actions">
          {view.canRetry && <button type="button" className="upd-primary" onClick={install}>Try again</button>}
          <button type="button" className="upd-link" onClick={() => dismiss({ failedAt: view.at })}>Dismiss</button>
        </div>
      </Card>
    )
  }

  // available
  return (
    <Card onClose={() => dismiss({ availableSequence: view.latest.sequence })} closeLabel="Later">
      <p className="upd-strong">MyDegreePlan {view.latest.version} is available</p>
      {view.latest.notes && (
        <button type="button" className="upd-link" onClick={() => setShowNotes((v) => !v)} aria-expanded={showNotes}>
          {showNotes ? 'Hide what’s new' : 'What’s new'}
        </button>
      )}
      {showNotes && <Notes notes={view.latest.notes} />}
      {notice && <p className="upd-error" role="alert">{notice}</p>}
      <div className="upd-actions">
        <button type="button" className="upd-primary" onClick={install}>Update now</button>
        <button type="button" className="upd-link" onClick={() => dismiss({ availableSequence: view.latest.sequence })}>Later</button>
      </div>
      <label className="upd-auto">
        <input type="checkbox" checked={!!status?.auto} onChange={(e) => setAuto(e.target.checked)} />
        Install updates automatically
      </label>
    </Card>
  )
}

function Notes({ notes }) {
  if (!notes) return null
  return <pre className="upd-notes">{notes}</pre>
}

function Card({ children, tone, onClose, closeLabel = 'Dismiss' }) {
  return (
    <aside className={`upd-card${tone === 'warn' ? ' upd-card--warn' : ''}`} role="status" aria-live="polite">
      <button type="button" className="upd-x" onClick={onClose} aria-label={closeLabel}>&times;</button>
      {children}
    </aside>
  )
}
