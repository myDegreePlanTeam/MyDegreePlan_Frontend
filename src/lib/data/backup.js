// backup.js: export and import of a student's plan as a JSON file. Browser storage can be cleared
// and does not follow a student between devices, so this is the only backup and the only way to
// move a plan. Pure functions; the download/upload plumbing lives in Settings.
import { STUDENT_TABLES } from './localClient'

export const BACKUP_APP = 'mydegreeplan'
// Format 1: one program per student. Format 2 adds student_programs (a second major or a minor). The reader accepts both (a
// format 1 file has no added programs); the writer says 2 only when the file holds an added program, so a plan that has none
// still opens on an install that has not been updated yet.
export const BACKUP_FORMAT = 2
export const BACKUP_FORMATS_READ = [1, 2]

export class BackupError extends Error {}

const same = (a, b) => a != null && b != null && String(a) === String(b)

export function buildBackup(tables, now = new Date()) {
  return {
    app: BACKUP_APP,
    format: (tables.student_programs ?? []).length > 0 ? BACKUP_FORMAT : 1,
    exportedAt: now.toISOString(),
    tables: Object.fromEntries(Object.keys(STUDENT_TABLES).map(name => [name, tables[name] ?? []])),
  }
}

export function backupFileName(now = new Date()) {
  return `mydegreeplan-backup-${now.toISOString().slice(0, 10)}.json`
}

/**
 * Validate a backup file's text and return the tables safe to load.
 *
 * Rows that point at something that does not exist here are dropped rather than imported, because
 * a plan slot whose requirement slot is gone (the catalog moved on) would otherwise break the grid:
 *   - plan slots / notes / free-adds / prior credits whose student profile is not in the file
 *   - plan slots whose requirement_slot_id is not in `validSlotIds`
 *   - profiles and notes whose concentration is not in `validConcentrationIds`
 *   - added programs whose concentration is not in `validConcentrationIds`, or is the profile's own program
 *
 * @returns {{ tables: object, dropped: number }}
 * @throws {BackupError} for anything that is not a MyDegreePlan backup of a version this build reads
 */
export function parseBackup(text, { validSlotIds, validConcentrationIds }) {
  let data
  try { data = JSON.parse(text) } catch { throw new BackupError('That file is not valid JSON.') }
  if (!data || data.app !== BACKUP_APP) throw new BackupError('That file is not a MyDegreePlan backup.')
  if (!BACKUP_FORMATS_READ.includes(data.format)) throw new BackupError(`This backup was made by a different version of the planner (format ${data.format}).`)
  if (!data.tables || typeof data.tables !== 'object') throw new BackupError('The backup has no data in it.')

  const tables = {}
  for (const name of Object.keys(STUDENT_TABLES)) {
    const rows = data.tables[name] ?? []
    if (!Array.isArray(rows) || rows.some(r => !r || typeof r !== 'object' || Array.isArray(r))) {
      throw new BackupError(`The backup's ${name} data is malformed.`)
    }
    tables[name] = rows
  }

  const before = Object.values(tables).reduce((n, rows) => n + rows.length, 0)

  tables.student_profiles = tables.student_profiles
    .filter(p => p.concentration_id == null || validConcentrationIds.has(p.concentration_id))
  const profileIds = new Set(tables.student_profiles.map(p => p.id))
  tables.student_plan_slots = tables.student_plan_slots
    .filter(r => profileIds.has(r.student_id) && validSlotIds.has(r.requirement_slot_id))
  tables.student_semester_notes = tables.student_semester_notes
    .filter(r => profileIds.has(r.student_id) && validConcentrationIds.has(r.concentration_id))
  tables.student_free_add_slots = tables.student_free_add_slots.filter(r => profileIds.has(r.student_id))
  const primaryOf = new Map(tables.student_profiles.map(p => [p.id, p.concentration_id]))
  tables.student_programs = tables.student_programs
    .filter(r => profileIds.has(r.student_id) && validConcentrationIds.has(r.concentration_id) && !same(primaryOf.get(r.student_id), r.concentration_id))
  tables.prior_credits = tables.prior_credits.filter(r => profileIds.has(r.plan_id))

  const after = Object.values(tables).reduce((n, rows) => n + rows.length, 0)
  return { tables, dropped: before - after }
}
