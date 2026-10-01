import { describe, it, expect } from 'vitest'
import { fetchRequirementSlots, isMissingProgramColumn } from '../lib/requirementSlots'

// A recording stand-in for the supabase query builder. `rows(filters)` answers a read; `fail(call)` can fail one.
function fakeClient(rows, { fail = () => null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, filters: {}, order: [] }
      calls.push(call)
      const b = {
        select(cols) { call.select = cols; return b },
        eq(col, val) { call.filters[col] = val; return b },
        order(col, opts) { call.order.push([col, opts]); return b },
        then(resolve) {
          const error = fail(call)
          return resolve(error ? { data: null, error } : { data: rows(call.filters), error: null })
        },
      }
      return b
    },
  }
}

const slot2026 = [{ id: 1, class_code: 'FF_SOCIAL' }]
const slot2025 = [{ id: 9, class_code: 'GEN_ED' }]
const byYear = f => (f.catalog_year === '2026-2027' ? slot2026 : f.catalog_year === '2025-2026' ? slot2025 : [])

describe('fetchRequirementSlots', () => {
  it('loads one program\'s plan for one catalog year', async () => {
    const client = fakeClient(byYear)
    const r = await fetchRequirementSlots(client, 7, '2026-2027', 'id, class_code')
    expect(r.data).toEqual(slot2026)
    expect(r.catalogYear).toBe('2026-2027')
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].table).toBe('requirement_slots')
    expect(client.calls[0].filters).toEqual({ concentration_id: 7, catalog_year: '2026-2027' })
    expect(client.calls[0].select).toBe('id, class_code')
  })

  it('never mixes two years: another year is another set', async () => {
    const client = fakeClient(byYear)
    expect((await fetchRequirementSlots(client, 7, '2025-2026', 'id')).data).toEqual(slot2025)
    expect((await fetchRequirementSlots(client, 7, '2027-2028', 'id')).data).toEqual([])
  })

  it('applies the requested ordering', async () => {
    const client = fakeClient(byYear)
    await fetchRequirementSlots(client, 1, '2025-2026', 'id', [
      { column: 'semester_number' }, { column: 'slot_order', ascending: false },
    ])
    expect(client.calls[0].order).toEqual([
      ['semester_number', { ascending: true }], ['slot_order', { ascending: false }],
    ])
  })

  it('returns an ordinary error as it is, without retrying', async () => {
    const client = fakeClient(byYear, { fail: () => ({ code: 'XX000', message: 'boom' }) })
    const r = await fetchRequirementSlots(client, 3, '2026-2027', 'id')
    expect(r.error).toEqual({ code: 'XX000', message: 'boom' })
    expect(client.calls).toHaveLength(1)
  })
})

describe('a database that has not gained catalog_year yet', () => {
  const noYear = { code: '42703', message: 'column requirement_slots.catalog_year does not exist' }
  const noGened = { code: '42703', message: 'column requirement_slots.gened_program does not exist' }
  const gened = f => (f.gened_program === 'flight_foundations' ? slot2026 : f.gened_program === 'legacy' ? slot2025 : [])

  it('reads the original two sets by gen-ed program: Fall 2026 on is Flight Foundations', async () => {
    const client = fakeClient(gened, { fail: c => ('catalog_year' in c.filters ? noYear : null) })
    const r = await fetchRequirementSlots(client, 2, '2026-2027', 'id, class_code')
    expect(r.data).toEqual(slot2026)
    expect(client.calls.map(c => Object.keys(c.filters).filter(k => k !== 'concentration_id'))).toEqual([['catalog_year'], ['gened_program']])
  })

  it('earlier years read the legacy set', async () => {
    const client = fakeClient(gened, { fail: c => ('catalog_year' in c.filters ? noYear : null) })
    expect((await fetchRequirementSlots(client, 2, '2024-2025', 'id')).data).toEqual(slot2025)
  })

  it('falls back to legacy when a program has no Flight Foundations slots (DSAI)', async () => {
    const client = fakeClient(f => (f.gened_program === 'legacy' ? slot2025 : []), { fail: c => ('catalog_year' in c.filters ? noYear : null) })
    const r = await fetchRequirementSlots(client, 3, '2026-2027', 'id')
    expect(r.data).toEqual(slot2025)
    expect(client.calls.map(c => c.filters.gened_program)).toEqual([undefined, 'flight_foundations', 'legacy'])
  })

  it('with neither column, loads the unfiltered slots', async () => {
    const client = fakeClient(() => slot2025, { fail: c => ('catalog_year' in c.filters ? noYear : 'gened_program' in c.filters ? noGened : null) })
    const r = await fetchRequirementSlots(client, 4, '2026-2027', 'id, class_code', [{ column: 'semester_number' }])
    expect(r.data).toEqual(slot2025)
    expect(r.error).toBeNull()
    const last = client.calls.at(-1)
    expect(last.filters).toEqual({ concentration_id: 4 })
    expect(last.order).toEqual([['semester_number', { ascending: true }]])
  })

  it('recognises the missing-column error', () => {
    expect(isMissingProgramColumn(noYear)).toBe(true)
    expect(isMissingProgramColumn(noGened)).toBe(true)
    expect(isMissingProgramColumn({ code: '42703', message: 'column x.y does not exist' })).toBe(true)
    expect(isMissingProgramColumn({ code: 'PGRST116', message: 'no rows' })).toBe(false)
    expect(isMissingProgramColumn(null)).toBe(false)
  })
})
