import { useRef } from 'react'
import { db } from '../lib/dataClient'
import { BackupError, parseBackup } from '../lib/data/backup'
import { clearAllUndo } from '../lib/undoStore'

// A button that opens a file picker and loads a plan backup into this browser (local backend only).
// Shared by Settings and by the first onboarding step: importing is most needed on a device that has
// no plan yet, which cannot reach Settings. A successful import reloads the page so the Dashboard
// re-reads its profile from the replaced store.
//
// onBusy(true|false) brackets the work; onError(message) reports a problem the student can act on.
export default function ImportBackupButton({ className, style, disabled, onBusy = () => {}, onError = () => {}, children }) {
  const fileInput = useRef(null)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    onBusy(true)
    try {
      const [slots, concentrations] = await Promise.all([
        db.from('requirement_slots').select('id'),
        db.from('concentrations').select('id'),
      ])
      if (slots.error || concentrations.error) throw new Error('The course catalog did not load.')
      const { tables, dropped } = parseBackup(await file.text(), {
        validSlotIds: new Set(slots.data.map(r => r.id)),
        validConcentrationIds: new Set(concentrations.data.map(r => r.id)),
      })
      if (!tables.student_profiles.length) throw new BackupError('That backup has no plan in it.')
      if (dropped && !window.confirm(`${dropped} item${dropped === 1 ? '' : 's'} in this backup no longer match the current course catalog and will be left out. Import the rest?`)) {
        onBusy(false)
        return
      }
      await db.local.importData(tables)
      clearAllUndo()
      window.location.reload()
    } catch (err) {
      onError(err instanceof BackupError ? err.message : `Could not import: ${err.message}`)
      onBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={className} style={style} disabled={disabled} onClick={() => fileInput.current?.click()}>
        {children}
      </button>
      <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleFile} aria-label="Choose a backup file to import" />
    </>
  )
}
