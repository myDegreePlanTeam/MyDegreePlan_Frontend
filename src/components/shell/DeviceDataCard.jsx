import { useState } from 'react'
import { db, platform } from '../../lib/dataClient'
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
      setMessage({ text: 'Plan exported. Keep the file somewhere safe; Import a backup loads it back.' })
    } catch (err) {
      setMessage({ text: `Could not export: ${err.message}`, error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="ds-scard" aria-labelledby="set-data">
      <div className="ds-scard-head">
        <h3 className="ds-scard-title" id="set-data">Your data</h3>
        <p className="ds-scard-desc">{words.storedMeta}. {words.backupText}</p>
      </div>
      <div className="ds-scard-actions">
        <button className="ds-btn-ghost" onClick={handleExport} disabled={busy}>Export a backup</button>
        <ImportBackupButton
          className="ds-btn-ghost"
          disabled={busy}
          onBusy={setBusy}
          onError={text => setMessage({ text, error: true })}
        >
          Import a backup
        </ImportBackupButton>
      </div>
      {!persistent && (
        <p className="ds-act-status ds-act-status-error" role="alert">
          {words.notPersistent}
        </p>
      )}
      {message && (
        <p className={`ds-act-status${message.error ? ' ds-act-status-error' : ''}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  )
}

// Erase: deletes the plan, the credits and the scores, then starts over from the first screen. It sits in Settings' "Start over" section
// beside Reset plan, worded differently so the two are not mixed up, and asks once more before it does anything.
export function EraseCard() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmErase, setConfirmErase] = useState(false)
  const words = platformWords(platform)

  async function handleErase() {
    setBusy(true)
    try {
      await db.planData.eraseAll()
      clearAllUndo()
      window.location.reload()
    } catch (err) {
      setError(`Could not erase: ${err.message}`)
      setBusy(false)
    }
  }

  return (
    <div className="ds-danger-card ds-danger-card-erase">
      <span className="ds-setting-text">
        <span className="ds-setting-label">{words.eraseLabel}</span>
        <span className="ds-setting-desc">
          Deletes your plan, prior credits and scores from {words.where}, then starts from the first screen again. This cannot be undone unless you exported a backup.
        </span>
        {error && <span className="ds-act-status ds-act-status-error" role="alert">{error}</span>}
      </span>
      {confirmErase ? (
        <span className="ds-setting-actions">
          <button className="ds-btn-ghost" onClick={() => setConfirmErase(false)} disabled={busy}>Cancel</button>
          <button className="ds-btn-danger" onClick={handleErase} disabled={busy}>Yes, erase</button>
        </span>
      ) : (
        <button className="ds-btn-danger" onClick={() => setConfirmErase(true)} disabled={busy}>{words.eraseButton}</button>
      )}
    </div>
  )
}
