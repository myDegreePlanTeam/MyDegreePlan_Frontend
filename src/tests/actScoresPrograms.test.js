import { describe, it, expect, vi, beforeEach } from 'vitest'
import catalog from '../data/catalog.json'

// the one data client the module imports, replaced by a local client over the real catalog and a memory store
const state = vi.hoisted(() => ({ db: null }))
vi.mock('../lib/dataClient', async () => {
  const { createLocalClient } = await import('../lib/data/localClient')
  const { createMemoryStorage } = await import('../lib/data/storage')
  const { default: realCatalog } = await import('../data/catalog.json')
  const make = () => createLocalClient({ loadCatalog: async () => realCatalog, storage: createMemoryStorage() })
  state.db = make()
  return { get db() { return state.db }, platform: 'web', isLocalBackend: true, backend: 'local', __reset: () => { state.db = make() } }
})

const { saveActScoresAndRebuild } = await import('../lib/actScores')
const dataClient = await import('../lib/dataClient')

const T = catalog.tables
const prog = code => T.concentrations.find(p => p.code === code)
const slotIdsOf = code => T.requirement_slots.filter(s => s.concentration_id === prog(code).id && s.catalog_year === '2026-2027').map(s => s.id)

const SCORES = act => ({ act_composite: null, act_english: null, act_math: act, act_reading: null, act_science: null, sat_math: null })

async function startStudent() {
  const db = state.db
  const { data: profile } = await db.from('student_profiles').insert({
    user_id: 'u', concentration_id: prog('core').id, start_season: 'Fall', start_year: 2026, student_type: 'incoming_freshman',
    act_math: 29, gened_program: 'flight_foundations', catalog_year: '2026-2027',
  }).select().single()
  return profile
}

const rowsOf = async profile => (await state.db.from('student_plan_slots').select('requirement_slot_id, semester_number, archived, archive_reason').eq('student_id', profile.id)).data

beforeEach(() => { dataClient.__reset() })

describe('saving ACT scores for a student who follows more than one program', () => {
  it('places the plan as before for a student with one program', async () => {
    const profile = await startStudent()
    expect(await saveActScoresAndRebuild(profile, SCORES(29))).toBeNull()
    const rows = await rowsOf(profile)
    const ids = new Set(slotIdsOf('core'))
    expect(rows.length).toBe(ids.size)
    expect(rows.every(r => ids.has(r.requirement_slot_id))).toBe(true)
    expect(rows.filter(r => !r.archived).every(r => r.semester_number > 0)).toBe(true)
  })

  it('places the added program\'s slots too, as one plan, and writes nothing for the slots that stand behind another card', async () => {
    const profile = await startStudent()
    const minor = prog('minor_mathematics')
    await state.db.from('student_programs').insert({ student_id: profile.id, concentration_id: minor.id, role: 'minor', catalog_year: '2026-2027', gened_program: 'flight_foundations' })
    expect(await saveActScoresAndRebuild(profile, SCORES(29))).toBeNull()
    const rows = await rowsOf(profile)
    const own = new Set(slotIdsOf('minor_mathematics'))
    const minorRows = rows.filter(r => own.has(r.requirement_slot_id))
    // MATH 1920 (the minor's own course) and the upper-division bucket are placed; MATH 1910 stands behind the primary's card and has no row
    expect(minorRows.length).toBe(2)
    expect(minorRows.every(r => !r.archived && r.semester_number > 0)).toBe(true)
    // no slot appears twice, and the total is the merged plan's, fewer than the two programs' slots added up
    expect(new Set(rows.map(r => r.requirement_slot_id)).size).toBe(rows.length)
    expect(rows.length).toBeLessThan(slotIdsOf('core').length + own.size)
  })

  it('keeps the minor\'s Calculus II when the score changes, and never archives it as "not applicable"', async () => {
    const profile = await startStudent()
    await state.db.from('student_programs').insert({ student_id: profile.id, concentration_id: prog('minor_mathematics').id, role: 'minor', catalog_year: '2026-2027', gened_program: 'flight_foundations' })
    for (const act of [29, 17, null]) {
      expect(await saveActScoresAndRebuild(profile, SCORES(act))).toBeNull()
      const calcII = T.requirement_slots.find(s => s.concentration_id === prog('minor_mathematics').id && s.class_code === 'MATH1920')
      const row = (await rowsOf(profile)).find(r => r.requirement_slot_id === calcII.id)
      expect(row, `ACT ${act}`).toBeTruthy()
      expect(row.archived, `ACT ${act}`).toBe(false)
    }
  })

  it('does nothing to place when no program has been chosen', async () => {
    const { data: profile } = await state.db.from('student_profiles').insert({ user_id: 'u', concentration_id: null, start_season: 'Fall', start_year: 2026 }).select().single()
    expect(await saveActScoresAndRebuild(profile, SCORES(29))).toBeNull()
    expect(await rowsOf(profile)).toEqual([])
  })
})
