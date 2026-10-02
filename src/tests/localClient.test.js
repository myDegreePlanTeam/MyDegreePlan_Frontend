import { describe, it, expect, beforeEach } from 'vitest'
import { createLocalClient, LOCAL_USER_ID } from '../lib/data/localClient'
import { createMemoryStorage } from '../lib/data/storage'
import catalog from '../data/catalog.json'

const fixture = {
  tables: {
    courses: [
      { code: 'CSC1300', name: 'Intro Programming', credits: 3, subject_code: 'CSC', description: null, standing_req: null },
      { code: 'CSC2400', name: 'Algorithms', credits: 3, subject_code: 'CSC', description: null, standing_req: null },
      { code: 'MATH1910', name: 'Calculus I', credits: 4, subject_code: 'MATH', description: null, standing_req: null },
    ],
    concentrations: [{ id: 1, code: 'core', name: 'CSC Core', total_hours: 120 }],
    test_equivalencies: [
      { id: 1, test_type: 'ap_credit', test_name: 'Calc AB', min_score: 3, awarded_course_code: 'MATH1910', credits_awarded: 4, satisfies_pool: null },
      { id: 2, test_type: 'ap_credit', test_name: 'Calc AB', min_score: 5, awarded_course_code: 'MATH1920', credits_awarded: 4, satisfies_pool: null },
      { id: 3, test_type: 'act_placement', test_name: 'ACT Math', min_score: null, awarded_course_code: 'MATH1000', credits_awarded: 0, satisfies_pool: null },
    ],
    prerequisite_entries: [], corequisite_entries: [], requirement_slots: [],
  },
}

let storage, db
const make = (s = storage) => createLocalClient({ loadCatalog: async () => fixture, storage: s })
beforeEach(() => { storage = createMemoryStorage(); db = make() })

describe('catalog reads', () => {
  it('selects named columns only', async () => {
    const { data, error } = await db.from('courses').select('code, credits').eq('code', 'CSC1300')
    expect(error).toBeNull()
    expect(data).toEqual([{ code: 'CSC1300', credits: 3 }])
  })
  it('returns copies, so callers cannot mutate the catalog', async () => {
    const { data } = await db.from('courses').select('*')
    data[0].name = 'changed'
    const again = await db.from('courses').select('name').eq('code', 'CSC1300')
    expect(again.data[0].name).toBe('Intro Programming')
  })
  it('supports in, not-null, lte and ordering', async () => {
    const inRows = (await db.from('courses').select('code').in('code', ['CSC1300', 'MATH1910']).order('code')).data
    expect(inRows.map(r => r.code)).toEqual(['CSC1300', 'MATH1910'])
    const scored = (await db.from('test_equivalencies').select('min_score').eq('test_type', 'ap_credit').not('min_score', 'is', null).lte('min_score', 3)).data
    expect(scored).toEqual([{ min_score: 3 }])
    expect((await db.from('test_equivalencies').select('test_name').not('min_score', 'is', null)).data).toHaveLength(2)
  })
  it('orders nulls last ascending and first descending, like Postgres', async () => {
    const asc = (await db.from('test_equivalencies').select('min_score').order('min_score', { ascending: true })).data.map(r => r.min_score)
    expect(asc).toEqual([3, 5, null])
    const desc = (await db.from('test_equivalencies').select('min_score').order('min_score', { ascending: false })).data.map(r => r.min_score)
    expect(desc).toEqual([null, 5, 3])
  })
  it('matches the course search used by the pickers (or + ilike, quoted, limit)', async () => {
    const q = '%alg%'
    const { data } = await db.from('courses').select('code, name').or(`code.ilike."${q}",name.ilike."${q}"`).order('code', { ascending: true }).limit(10)
    expect(data).toEqual([{ code: 'CSC2400', name: 'Algorithms' }])
    const byCode = (await db.from('courses').select('code').or('code.ilike."%MATH%",name.ilike."%MATH%"')).data
    expect(byCode).toEqual([{ code: 'MATH1910' }])
  })
  it('keeps a comma inside quotes as part of the value', async () => {
    const { data, error } = await db.from('courses').select('code').or('code.ilike."%a,b%",name.ilike."%a,b%"')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
  it('applies limit after ordering', async () => {
    const { data } = await db.from('courses').select('code').order('code', { ascending: false }).limit(1)
    expect(data).toEqual([{ code: 'MATH1910' }])
  })
  it('is read-only for catalog tables', async () => {
    const { error } = await db.from('courses').insert({ code: 'X', name: 'X', credits: 1 })
    expect(error?.code).toBe('42501')
  })
  it('errors cleanly (never throws) for a table that does not exist', async () => {
    const { data, error } = await db.from('nope').select('*')
    expect(data).toBeNull()
    expect(error.message).toMatch(/does not exist/)
  })
})

describe('auth', () => {
  it('has one implicit session and ignores sign in/out', async () => {
    const { data } = await db.auth.getSession()
    expect(data.session.user.id).toBe(LOCAL_USER_ID)
    expect(data.session.access_token).toBeNull()
    expect((await db.auth.signOut()).error).toBeNull()
    expect((await db.auth.getSession()).data.session).not.toBeNull()
    const { data: { subscription } } = db.auth.onAuthStateChange(() => {})
    expect(() => subscription.unsubscribe()).not.toThrow()
  })
})

describe('student_profiles', () => {
  it('reports PGRST116 for single() with no row, which Dashboard uses to create the profile', async () => {
    const { data, error } = await db.from('student_profiles').select('id').eq('user_id', LOCAL_USER_ID).single()
    expect(data).toBeNull()
    expect(error.code).toBe('PGRST116')
  })
  it('inserts with an identity id and schema defaults, returning the row for select().single()', async () => {
    const { data, error } = await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID }).select('id, concentration_id, gened_program, student_type').single()
    expect(error).toBeNull()
    expect(data).toEqual({ id: 1, concentration_id: null, gened_program: 'legacy', student_type: null })
  })
  it('joins the to-one concentration embed, including multi-line select text', async () => {
    await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID, concentration_id: 1 })
    const { data } = await db.from('student_profiles').select(`
      id,
      concentration_id,
      gened_program,
      concentrations (
        id,
        code,
        name,
        total_hours
      )
    `).eq('user_id', LOCAL_USER_ID).single()
    expect(data.concentrations).toEqual({ id: 1, code: 'core', name: 'CSC Core', total_hours: 120 })
    const none = await db.from('student_profiles').update({ concentration_id: null }).eq('id', 1).select('concentrations(code)').single()
    expect(none.data.concentrations).toBeNull()
  })
  it('enforces one profile per user (23505)', async () => {
    await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID })
    const { error } = await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID })
    expect(error.code).toBe('23505')
  })
  it('reports a lost creation race as 23505, which Dashboard recovers from by re-reading the profile', async () => {
    const create = () => db.from('student_profiles').insert({ user_id: LOCAL_USER_ID }).select('id').single()
    const [first, second] = await Promise.all([create(), create()])
    expect([first.error, second.error].filter(Boolean).map(e => e.code)).toEqual(['23505'])
    expect((await db.from('student_profiles').select('id')).data).toHaveLength(1)
  })
  it('refuses a profile with no user', async () => {
    const { error } = await db.from('student_profiles').insert({})
    expect(error.code).toBe('23502')
  })
})

describe('writes', () => {
  let studentId
  beforeEach(async () => {
    studentId = (await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID }).select('id').single()).data.id
  })

  it('returns data null for a write without select(), like PostgREST', async () => {
    const res = await db.from('student_free_add_slots').insert({ student_id: studentId, course_code: 'CSC2400', semester_number: 3 })
    expect(res).toMatchObject({ data: null, error: null })
  })

  it('stores a free-add linked to a Free Elective slot, and leaves other free-adds unlinked', async () => {
    const add = (course_code, extra = {}) => db.from('student_free_add_slots')
      .insert({ student_id: studentId, course_code, semester_number: 8, ...extra })
      .select('id, course_code, fills_slot_id').single()
    expect((await add('ART1030', { fills_slot_id: 42 })).data).toMatchObject({ fills_slot_id: 42 })
    expect((await add('CSC2400')).data).toMatchObject({ fills_slot_id: null })
  })

  it('leaves the credit hours a student chose for a ranged course empty unless given', async () => {
    const add = (extra = {}) => db.from('student_free_add_slots')
      .insert({ student_id: studentId, course_code: 'AGBE4940', semester_number: 4, ...extra })
      .select('credits').single()
    expect((await add()).data).toEqual({ credits: null })
    expect((await add({ credits: 3 })).data).toEqual({ credits: 3 })

    const slot = await db.from('student_plan_slots')
      .insert({ student_id: studentId, requirement_slot_id: 31, selected_course_code: 'AGBE4940' })
      .select('selected_credits').single()
    expect(slot.data).toEqual({ selected_credits: null })
  })

  it('has an SAT Math column on the profile, empty by default', async () => {
    const { data } = await db.from('student_profiles').select('act_math, sat_math').eq('id', studentId).single()
    expect(data).toMatchObject({ sat_math: null })
  })

  it('upserts on the composite key: insert, then merge only the supplied columns', async () => {
    const slot = { student_id: studentId, requirement_slot_id: 10, selected_course_code: 'CSC1300', semester_number: 2 }
    await db.from('student_plan_slots').upsert(slot, { onConflict: 'student_id, requirement_slot_id' })
    await db.from('student_plan_slots').upsert({ student_id: studentId, requirement_slot_id: 10, semester_number: 4 }, { onConflict: 'student_id, requirement_slot_id' })
    const { data } = await db.from('student_plan_slots').select('*').eq('student_id', studentId)
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ selected_course_code: 'CSC1300', semester_number: 4, status: 'planned', archived: false, locked: false, credits_remaining: 0 })
  })

  it('upserts a chunk of many rows, inserting some and merging others', async () => {
    await db.from('student_plan_slots').upsert({ student_id: studentId, requirement_slot_id: 1, status: 'planned' }, { onConflict: 'student_id, requirement_slot_id' })
    const rows = [1, 2, 3].map(n => ({ student_id: studentId, requirement_slot_id: n, semester_number: n }))
    const { error } = await db.from('student_plan_slots').upsert(rows, { onConflict: 'student_id, requirement_slot_id' })
    expect(error).toBeNull()
    const { data } = await db.from('student_plan_slots').select('requirement_slot_id, semester_number').order('requirement_slot_id')
    expect(data).toEqual([{ requirement_slot_id: 1, semester_number: 1 }, { requirement_slot_id: 2, semester_number: 2 }, { requirement_slot_id: 3, semester_number: 3 }])
  })

  it('upserts semester notes on (student, concentration, semester)', async () => {
    const key = { student_id: studentId, concentration_id: 1, semester_number: 2 }
    await db.from('student_semester_notes').upsert({ ...key, note_text: 'hi' }, { onConflict: 'student_id, concentration_id, semester_number' })
    await db.from('student_semester_notes').upsert({ ...key, completed_by_student: true }, { onConflict: 'student_id, concentration_id, semester_number' })
    const { data } = await db.from('student_semester_notes').select('note_text, completed_by_student, term_season').eq('student_id', studentId)
    expect(data).toEqual([{ note_text: 'hi', completed_by_student: true, term_season: null }])
  })

  it('updates and deletes only matching rows, and delete().in() works', async () => {
    const rows = [1, 2, 3].map(n => ({ student_id: studentId, requirement_slot_id: n }))
    await db.from('student_plan_slots').insert(rows)
    await db.from('student_plan_slots').update({ archived: true, archive_reason: 'prior_credit' }).eq('student_id', studentId).in('requirement_slot_id', [1, 2])
    const archived = (await db.from('student_plan_slots').select('requirement_slot_id').eq('archived', true).order('requirement_slot_id')).data
    expect(archived).toEqual([{ requirement_slot_id: 1 }, { requirement_slot_id: 2 }])
    await db.from('student_plan_slots').delete().in('requirement_slot_id', [2, 3])
    expect((await db.from('student_plan_slots').select('requirement_slot_id')).data).toEqual([{ requirement_slot_id: 1 }])
  })

  it('assigns ids that increase and are not reused after a delete', async () => {
    const a = (await db.from('student_free_add_slots').insert({ student_id: studentId, course_code: 'A', semester_number: 1 }).select('id').single()).data.id
    await db.from('student_free_add_slots').delete().eq('id', a)
    const b = (await db.from('student_free_add_slots').insert({ student_id: studentId, course_code: 'B', semester_number: 1 }).select('id').single()).data.id
    expect(b).toBeGreaterThan(a)
  })

  it('gives prior_credits a UUID id and orders by created_at', async () => {
    await db.from('prior_credits').insert([{ plan_id: studentId, credit_type: 'ap_credit', credits_awarded: 4 }, { plan_id: studentId, credit_type: 'transfer_credit' }])
    const { data } = await db.from('prior_credits').select('id, credit_type, satisfies_pool, credits_awarded').eq('plan_id', studentId).order('created_at', { ascending: true })
    expect(data).toHaveLength(2)
    expect(data[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(data[1]).toMatchObject({ satisfies_pool: null, credits_awarded: 0 })
  })

  it('rejects a bad free-add status and rows missing required columns, writing nothing from a failed batch', async () => {
    const bad = await db.from('student_free_add_slots').insert({ student_id: studentId, course_code: 'A', semester_number: 1, status: 'bogus' })
    expect(bad.error.code).toBe('23514')
    const batch = await db.from('student_plan_slots').insert([{ student_id: studentId, requirement_slot_id: 1 }, { student_id: studentId }])
    expect(batch.error.code).toBe('23502')
    expect((await db.from('student_plan_slots').select('id')).data).toEqual([])
  })

  it('cascades a profile delete to its children, like ON DELETE CASCADE', async () => {
    await db.from('student_plan_slots').insert({ student_id: studentId, requirement_slot_id: 1 })
    await db.from('prior_credits').insert({ plan_id: studentId, credit_type: 'ap_credit' })
    await db.from('student_free_add_slots').insert({ student_id: studentId, course_code: 'A', semester_number: 1 })
    await db.from('student_profiles').delete().eq('id', studentId)
    for (const t of ['student_plan_slots', 'prior_credits', 'student_free_add_slots']) {
      expect((await db.from(t).select('*')).data, t).toEqual([])
    }
  })

  it('supports match() and awaiting several queries together', async () => {
    await db.from('student_plan_slots').insert([{ student_id: studentId, requirement_slot_id: 1, locked: true }, { student_id: studentId, requirement_slot_id: 2 }])
    const [a, b] = await Promise.all([
      db.from('student_plan_slots').select('requirement_slot_id').match({ student_id: studentId, locked: true }),
      db.from('courses').select('code'),
    ])
    expect(a.data).toEqual([{ requirement_slot_id: 1 }])
    expect(b.data).toHaveLength(3)
  })
})

describe('persistence', () => {
  it('survives a reload: rows, defaults and the id counter', async () => {
    const id = (await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID, student_type: 'transfer' }).select('id').single()).data.id
    await db.from('student_free_add_slots').insert({ student_id: id, course_code: 'A', semester_number: 1 })
    await db.from('student_free_add_slots').delete().eq('student_id', id)

    const reopened = make(storage)
    const profile = (await reopened.from('student_profiles').select('id, student_type').single()).data
    expect(profile).toEqual({ id, student_type: 'transfer' })
    const next = (await reopened.from('student_free_add_slots').insert({ student_id: id, course_code: 'B', semester_number: 1 }).select('id').single()).data.id
    expect(next).toBe(2)           // id 1 was used and deleted; not handed out again
  })
  it('has written to storage by the time the write resolves', async () => {
    const id = (await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID }).select('id').single()).data.id
    const saved = await storage.load()
    expect(saved.tables.student_profiles).toHaveLength(1)
    expect(saved.tables.student_profiles[0].id).toBe(id)
  })
})

describe('local data controls', () => {
  it('exports, erases and re-imports', async () => {
    const id = (await db.from('student_profiles').insert({ user_id: LOCAL_USER_ID }).select('id').single()).data.id
    await db.from('student_plan_slots').insert({ student_id: id, requirement_slot_id: 5 })
    const snapshot = await db.local.exportData()
    expect(snapshot.student_plan_slots).toHaveLength(1)

    await db.local.eraseAll()
    expect((await db.from('student_profiles').select('id')).data).toEqual([])
    expect((await make(storage).from('student_profiles').select('id')).data).toEqual([])

    await db.local.importData(JSON.parse(JSON.stringify(snapshot)))
    expect((await db.from('student_plan_slots').select('requirement_slot_id')).data).toEqual([{ requirement_slot_id: 5 }])
    const again = (await db.from('student_free_add_slots').insert({ student_id: id, course_code: 'Z', semester_number: 1 }).select('id').single()).data.id
    expect(again).toBeGreaterThan(0)
  })
})

describe('against the real catalog', () => {
  it('answers the queries Onboarding and DegreePlan make', async () => {
    const real = createLocalClient({ loadCatalog: async () => catalog, storage: createMemoryStorage() })
    const concs = (await real.from('concentrations').select('id, code, name, total_hours').order('id', { ascending: true })).data
    expect(concs.map(c => c.code)).toEqual(['core', 'cybersecurity', 'dsai', 'hpc', 'ai'])
    const ff = (await real.from('requirement_slots').select('id, class_code, gened_program').eq('concentration_id', concs[0].id).eq('gened_program', 'flight_foundations')).data
    expect(ff.length).toBeGreaterThan(0)
    expect(ff.some(s => s.class_code === 'FF_SOCIAL')).toBe(true)
    const dsaiFf = (await real.from('requirement_slots').select('id').eq('concentration_id', concs[2].id).eq('gened_program', 'flight_foundations')).data
    expect(dsaiFf).toEqual([])      // DSAI has no Flight Foundations set; requirementSlots.js falls back to legacy
  })
})
