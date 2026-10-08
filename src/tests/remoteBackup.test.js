import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, LOCAL_USER_ID } from '../lib/data/localClient'
import { createMemoryStorage } from '../lib/data/storage'
import { createRemotePlanData } from '../lib/data/remoteBackup'
import { buildBackup, parseBackup } from '../lib/data/backup'

// The remote plan-data tools only use the supabase-js chain (from/select/insert/delete/eq/order and
// auth.getSession), which the local client implements, so it stands in for PostgREST here.
const DOCKER_USER = '11111111-1111-4111-8111-111111111111'
const fixture = { tables: { courses: [], concentrations: [{ id: 1, code: 'core', name: 'Core', total_hours: 120 }], requirement_slots: [], prerequisite_entries: [], corequisite_entries: [], degree_plans: [], test_equivalencies: [] } }

let client, planData
const make = () => createLocalClient({ loadCatalog: async () => fixture, storage: createMemoryStorage(), userId: DOCKER_USER })

// A plan as the web version exports it: ids 7 / 40 / 50, owned by the implicit local user.
const webBackup = () => buildBackup({
  student_profiles: [{ id: 7, user_id: LOCAL_USER_ID, concentration_id: 1, start_season: 'Fall', start_year: 2026, gened_program: 'flight_foundations', catalog_year: '2026-2027' }],
  student_plan_slots: [{ id: 40, student_id: 7, requirement_slot_id: 5, semester_number: 2 }, { id: 41, student_id: 7, requirement_slot_id: 6 }],
  student_semester_notes: [{ id: 3, student_id: 7, concentration_id: 1, semester_number: 1, note_text: 'hi' }],
  student_free_add_slots: [{ id: 9, student_id: 7, course_code: 'ART1030', semester_number: 3 }],
  prior_credits: [{ id: '0b9f6a52-3d0e-4c8e-9a4b-5e1f5a2b7c11', plan_id: 7, credit_type: 'ap_credit', satisfies_course_code: 'MATH1910', credits_awarded: 4 }],
})

const counts = async () => Object.fromEntries(await Promise.all(
  ['student_profiles', 'student_plan_slots', 'student_semester_notes', 'student_free_add_slots', 'prior_credits']
    .map(async t => [t, (await client.from(t).select('*')).data.length])))

beforeEach(() => {
  client = make()
  planData = createRemotePlanData(client)
})

describe('remote plan data', () => {
  it('imports a web backup under the signed-in user and re-points every child at the new profile id', async () => {
    const { tables } = parseBackup(JSON.stringify(webBackup()), { validSlotIds: new Set([5, 6]), validConcentrationIds: new Set([1]) })
    await planData.importData(tables)

    const [profile] = (await client.from('student_profiles').select('*')).data
    expect(profile).toMatchObject({ user_id: DOCKER_USER, concentration_id: 1, start_year: 2026, catalog_year: '2026-2027' })
    expect(await counts()).toEqual({ student_profiles: 1, student_plan_slots: 2, student_semester_notes: 1, student_free_add_slots: 1, prior_credits: 1 })
    for (const [table, column] of [['student_plan_slots', 'student_id'], ['student_semester_notes', 'student_id'], ['student_free_add_slots', 'student_id'], ['prior_credits', 'plan_id']]) {
      expect((await client.from(table).select('*')).data.every(r => r[column] === profile.id)).toBe(true)
    }
    expect((await client.from('student_plan_slots').select('semester_number').eq('requirement_slot_id', 5)).data).toEqual([{ semester_number: 2 }])
  })

  it('replaces the plan already in the account', async () => {
    await planData.importData(JSON.parse(JSON.stringify(webBackup().tables)))
    const second = webBackup().tables
    second.student_plan_slots = second.student_plan_slots.slice(0, 1)
    await planData.importData(second)
    expect((await counts()).student_plan_slots).toBe(1)
    expect((await counts()).student_profiles).toBe(1)
  })

  it('exports what was imported, in a form the web version can load back', async () => {
    await planData.importData(webBackup().tables)
    const exported = buildBackup(await planData.exportData())
    const { tables, dropped } = parseBackup(JSON.stringify(exported), { validSlotIds: new Set([5, 6]), validConcentrationIds: new Set([1]) })
    expect(dropped).toBe(0)
    expect(tables.student_plan_slots).toHaveLength(2)

    const web = createLocalClient({ loadCatalog: async () => fixture, storage: createMemoryStorage() })
    await web.planData.importData(tables)
    const [profile] = (await web.from('student_profiles').select('user_id, id')).data
    expect(profile.user_id).toBe(LOCAL_USER_ID)
    expect((await web.from('student_plan_slots').select('student_id')).data.every(r => r.student_id === profile.id)).toBe(true)
  })

  it('erases the profile and everything under it', async () => {
    await planData.importData(webBackup().tables)
    await planData.eraseAll()
    expect(await counts()).toEqual({ student_profiles: 0, student_plan_slots: 0, student_semester_notes: 0, student_free_add_slots: 0, prior_credits: 0 })
  })

  it('drops a column this database does not have instead of failing the import', async () => {
    const tables = webBackup().tables
    tables.student_plan_slots[0].future_column = 'x'
    const picky = refusing(client, (table, rows) => rows.some(r => 'future_column' in r)
      ? { code: 'PGRST204', message: "Could not find the 'future_column' column of 'student_plan_slots' in the schema cache" } : null)
    await createRemotePlanData(picky).importData(tables)
    expect((await counts()).student_plan_slots).toBe(2)
  })

  it('puts the earlier plan back when the import fails part way', async () => {
    await planData.importData(webBackup().tables)
    const before = await planData.exportData()

    const failing = webBackup().tables
    failing.student_plan_slots = failing.student_plan_slots.slice(0, 1)
    const broken = refusing(client, table => (table === 'prior_credits' ? { code: '23514', message: 'check constraint failed' } : null), { once: true })
    await expect(createRemotePlanData(broken).importData(failing)).rejects.toThrow('check constraint failed')

    const after = await planData.exportData()
    expect(after.student_plan_slots).toHaveLength(before.student_plan_slots.length)
    expect(after.prior_credits).toHaveLength(1)
    expect(after.student_profiles).toHaveLength(1)
  })

  it('refuses when nobody is signed in', async () => {
    const signedOut = { ...client, auth: { getSession: async () => ({ data: { session: null }, error: null }) } }
    await expect(createRemotePlanData(signedOut).importData(webBackup().tables)).rejects.toThrow('not signed in')
  })
})

// Wraps a client so an insert can be refused with a PostgREST-style error. With { once: true } only the first refusal fires.
function refusing(inner, decide, { once = false } = {}) {
  let fired = false
  return {
    auth: inner.auth,
    from(table) {
      const query = inner.from(table)
      const insert = query.insert.bind(query)
      query.insert = rows => {
        const error = (once && fired) ? null : decide(table, Array.isArray(rows) ? rows : [rows])
        if (!error) return insert(rows)
        fired = true
        const result = Promise.resolve({ data: null, error })
        return { select: () => result, then: (a, b) => result.then(a, b) }
      }
      return query
    },
  }
}
