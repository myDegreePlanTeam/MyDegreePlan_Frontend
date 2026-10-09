import { useState } from 'react'
import { db, isLocalBackend, platform } from '../../lib/dataClient'
import { platformWords } from '../../lib/platform'
import { backupFileName, buildBackup } from '../../lib/data/backup'
import ImportBackupButton from '../ImportBackupButton'
import { clearAllUndo } from '../../lib/undoStore'

// Settings card on both backends. In the browser the plan lives on this device, so backing it up, moving
// it and wiping it are the student's job. On the Docker stack it lives in that install's database, and the
// same backup file is how a plan moves between the web version and an install. Reloading after an import
// or an erase makes the Dashboard re-read its profile from the changed store.
export default function DeviceDataCard() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)       // { text, error }
  const [confirmErase, setConfirmErase] = useState(false)
  const persistent = db.planData.persistent
  const words = platformWords(platform)

  async function handleExport() {
    setBusy(true)
    try {
      const backup = buildBackup(await db.planData.exportData())
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
      await db.planData.eraseAll()
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
        <p className="ds-section-meta">{words.storedMeta}</p>
      </div>
      <div className="ds-card">
        <div className="ds-setting">
          <span className="ds-setting-text">
            <span className="ds-setting-label">Back up or move your plan</span>
            <span className="ds-setting-desc">
              {words.backupText}
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
            {words.notPersistent}
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
          <span className="ds-setting-label">{isLocalBackend ? 'Erase all data on this device' : 'Erase my plan'}</span>
          <span className="ds-setting-desc">
            Deletes your plan, prior credits and notes from {words.where}, then starts onboarding again. This cannot be undone unless you exported a backup.
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
