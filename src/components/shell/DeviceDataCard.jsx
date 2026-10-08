import { useState } from 'react'
import { db } from '../../lib/dataClient'
import { backupFileName, buildBackup } from '../../lib/data/backup'
import ImportBackupButton from '../ImportBackupButton'
import { clearAllUndo } from '../../lib/undoStore'

// Settings card for the local-first backend only: the plan lives in this browser, so backing it up,
// moving it to another device and wiping it are the student's job. Reloading after an import or an
// erase makes the Dashboard re-read its profile from the changed store.
export default function DeviceDataCard() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)       // { text, error }
  const [confirmErase, setConfirmErase] = useState(false)
  const persistent = db.local.persistent

  async function handleExport() {
    setBusy(true)
    try {
      const backup = buildBackup(await db.local.exportData())
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = backupFileName()
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage({ text: 'Plan exported. Keep the file somewhere safe; Import loads it back.' })
    } catch (err) {
      setMessage({ text: `Could not export: ${err.message}`, error: true })
    } finally {
      setBusy(false)
    }
  }

  async function handleErase() {
    setBusy(true)
    try {
      await db.local.eraseAll()
      clearAllUndo()
      window.location.reload()
    } catch (err) {
      setMessage({ text: `Could not erase: ${err.message}`, error: true })
      setBusy(false)
    }
  }

  return (
    <>
      <div className="ds-section-head">
        <p className="ds-eyebrow">Your data</p>
        <p className="ds-section-meta">Stored only in this browser</p>
      </div>
      <div className="ds-card">
        <div className="ds-setting">
          <span className="ds-setting-text">
            <span className="ds-setting-label">Back up or move your plan</span>
            <span className="ds-setting-desc">
              Your plan never leaves this device, so it does not follow you to another phone or computer, and clearing
              this site's data deletes it. Export a copy to keep it safe or to load it somewhere else.
            </span>
          </span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="ds-btn-ghost" style={{ minHeight: 36 }} onClick={handleExport} disabled={busy}>Export</button>
            <ImportBackupButton
              className="ds-btn-ghost"
              style={{ minHeight: 36 }}
              disabled={busy}
              onBusy={setBusy}
              onError={text => setMessage({ text, error: true })}
            >
              Import
            </ImportBackupButton>
          </span>
        </div>
        {!persistent && (
          <p className="ds-act-status ds-act-status-error" role="alert" style={{ padding: '0 16px 12px', margin: 0 }}>
            This browser is not letting the planner save (private browsing?). Your plan will be lost when you close this tab. Export it before you leave.
          </p>
        )}
        {message && (
          <p className={`ds-act-status${message.error ? ' ds-act-status-error' : ''}`} role="status" style={{ padding: '0 16px 12px', margin: 0 }}>
            {message.text}
          </p>
        )}
      </div>

      <div className="ds-danger-card">
        <span className="ds-setting-text">
          <span className="ds-setting-label">Erase all data on this device</span>
          <span className="ds-setting-desc">
            Deletes your plan, prior credits and notes from this browser, then starts onboarding again. This cannot be undone unless you exported a backup.
          </span>
        </span>
        {confirmErase ? (
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="ds-btn-ghost" onClick={() => setConfirmErase(false)} disabled={busy}>Cancel</button>
            <button className="ds-btn-danger" onClick={handleErase} disabled={busy}>Yes, erase</button>
          </span>
        ) : (
          <button className="ds-btn-danger" onClick={() => setConfirmErase(true)} disabled={busy}>Erase data</button>
        )}
      </div>
    </>
  )
}
