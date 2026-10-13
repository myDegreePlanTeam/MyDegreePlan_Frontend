import { describe, it, expect } from 'vitest'
import { createLocalClient } from '../lib/data/localClient'
import { createMemoryStorage } from '../lib/data/storage'
import { fetchProgramSlotSets, fetchProgramInfo } from '../lib/programSlots'
import { fetchStudentPrograms } from '../lib/studentPrograms'
import { mergePrograms } from '../lib/programMerge'
import catalog from '../data/catalog.json'

const make = () => createLocalClient({ loadCatalog: async () => catalog, storage: createMemoryStorage() })
const prog = code => catalog.tables.concentrations.find(p => p.code === code)
const COLUMNS = 'id, semester_number, slot_order, class_code, is_pool, flex_credits, map_semester'
const ORDER = [{ column: 'semester_number' }, { column: 'slot_order' }]

describe('programs and their slots, from the data client', () => {
  it('reads every program\'s slots for the plan year it follows, primary first', async () => {
    const db = make()
    const profile = { id: 1, concentration_id: prog('core').id, catalog_year: '2026-2027', gened_program: 'flight_foundations' }
    await db.from('student_programs').insert({ student_id: 1, concentration_id: prog('math_bs').id, role: 'major', catalog_year: '2026-2027', gened_program: 'flight_foundations' })

    const { data: programs } = await fetchStudentPrograms(db, profile)
    const { data: sets, error } = await fetchProgramSlotSets(db, programs, COLUMNS, ORDER)
    expect(error).toBeNull()
    expect(sets.map(s => s.program.programId)).toEqual([prog('core').id, prog('math_bs').id])
    expect(sets.map(s => s.slots.length)).toEqual([44, 42])
    expect(new Set(sets.flatMap(s => s.slots.map(x => x.id))).size).toBe(86)       // slot ids are unique across programs

    const { data: info } = await fetchProgramInfo(db, programs.map(p => p.programId))
    expect(info[prog('math_bs').id].name).toContain('Math')
    expect(info[prog('core').id].total_hours).toBe(120)
  })

  it('feeds the merge, which needs the program\'s own gen-ed program because these slot columns do not carry it', async () => {
    const db = make()
    const profile = { id: 1, concentration_id: prog('core').id, catalog_year: '2026-2027', gened_program: 'flight_foundations' }
    await db.from('student_programs').insert({ student_id: 1, concentration_id: prog('math_bs').id, catalog_year: '2026-2027', gened_program: 'flight_foundations' })
    const { data: programs } = await fetchStudentPrograms(db, profile)
    const { data: sets } = await fetchProgramSlotSets(db, programs, COLUMNS, ORDER)
    const [primary, added] = sets
    const merged = mergePrograms(
      { programId: primary.program.programId, slots: primary.slots, totalHours: 120, genedProgram: primary.program.genedProgram },
      [{ programId: added.program.programId, role: 'major', slots: added.slots, totalHours: 120, genedProgram: added.program.genedProgram }],
      { courses: Object.fromEntries(catalog.tables.courses.map(c => [c.code, c])) },
    )
    expect(merged.shadows.filter(s => s.reason === 'duplicate')).toHaveLength(12)
    expect(merged.slots.length).toBeLessThan(86)
  })

  it('answers with an empty map for no programs, and passes a failing read on', async () => {
    expect(await fetchProgramInfo(make(), [])).toEqual({ data: {}, error: null })
    const broken = { from: () => { throw new Error('unused') } }
    const failing = { from: () => { const chain = { select: () => chain, eq: () => chain, order: () => chain, then: (a, b) => Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(a, b) }; return chain } }
    expect((await fetchProgramSlotSets(failing, [{ programId: 1, catalogYear: '2026-2027' }], COLUMNS)).error.message).toBe('timeout')
    expect(await fetchProgramSlotSets(broken, [], COLUMNS)).toEqual({ data: [], error: null })
  })
})
