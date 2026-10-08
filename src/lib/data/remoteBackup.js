// remoteBackup.js: export, import and erase of the signed-in student's plan on the Docker stack, with the
// same `db.planData` shape the local client has (exportData / importData / eraseAll / persistent), so
// Settings and Onboarding do not care which backend they run on. A backup file is the same either way:
// it moves a plan from the web version into a Docker install and back.
//
// Row-level security already limits every query to the signed-in user, so reads need no filter. Ids are
// GENERATED ALWAYS in Postgres, so an import cannot reuse the ids in the file: the profile is inserted
// first and its children are re-pointed at the id the database gave it.
import { STUDENT_TABLES } from './localClient'

// The columns that point at student_profiles.id, per child table.
const CHILD_FK = {
  student_plan_slots: 'student_id',
  student_semester_notes: 'student_id',
  student_free_add_slots: 'student_id',
  prior_credits: 'plan_id',
}

// PostgREST says "Could not find the 'x' column of 'student_plan_slots' in the schema cache" (PGRST204) for a
// column the table lacks: an install whose setup step has not re-run, importing a backup from a newer version.
function unknownColumn(error) {
  if (error?.code !== 'PGRST204') return null
  return /'([^']+)' column/.exec(error.message ?? '')?.[1] ?? null
}

const without = (row, column) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== column))

export function createRemotePlanData(client) {
  async function currentUserId() {
    const { data, error } = await client.auth.getSession()
    const id = data?.session?.user?.id
    if (error || !id) throw new Error('You are not signed in.')
    return id
  }

  async function exportData() {
    const tables = {}
    for (const name of Object.keys(STUDENT_TABLES)) {
      const { data, error } = await client.from(name).select('*').order('id', { ascending: true })
      if (error) throw new Error(error.message)
      tables[name] = data
    }
    return tables
  }

  // Inserts rows, dropping any column this database does not have and trying again.
  async function insertRows(table, rows, { returning = false } = {}) {
    let batch = rows
    for (;;) {
      const query = client.from(table).insert(batch)
      const { data, error } = await (returning ? query.select() : query)
      if (!error) return data
      const missing = unknownColumn(error)
      if (!missing) throw new Error(error.message)
      batch = batch.map(row => without(row, missing))
    }
  }

  // A student has one profile (user_id is unique) and everything else hangs off it with ON DELETE CASCADE.
  async function wipe(userId) {
    const { error } = await client.from('student_profiles').delete().eq('user_id', userId)
    if (error) throw new Error(error.message)
  }

  async function replace(userId, tables) {
    await wipe(userId)
    const profile = tables.student_profiles?.[0]
    if (!profile) return
    const { id: oldId, ...profileRow } = profile
    const [created] = await insertRows('student_profiles', [{ ...profileRow, user_id: userId }], { returning: true })
    for (const [table, column] of Object.entries(CHILD_FK)) {
      const rows = (tables[table] ?? [])
        .filter(row => String(row[column]) === String(oldId))
        .map(row => ({ ...without(row, 'id'), [column]: created.id }))
      if (rows.length) await insertRows(table, rows)
    }
  }

  return {
    persistent: true,
    exportData,
    // PostgREST has no transaction across requests, so the old plan is read first and put back if the new one fails.
    async importData(tables) {
      const userId = await currentUserId()
      const previous = await exportData()
      try {
        await replace(userId, tables)
      } catch (err) {
        try { await replace(userId, previous) } catch {
          throw new Error(`${err.message} Your earlier plan could not be restored; export it from another copy if you have one.`)
        }
        throw err
      }
    },
    async eraseAll() {
      await wipe(await currentUserId())
    },
  }
}
