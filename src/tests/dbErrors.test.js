import { describe, it, expect } from 'vitest'
import { isMissingColumn, selectWithOptional } from '../lib/dbErrors'

// A database whose setup step has not re-run lacks the newest columns. selectWithOptional asks for them, and when Postgres
// names one it does not have, asks again without that column only: an install that has the older optional columns keeps them.

const missing = column => ({ data: null, error: { code: '42703', message: `column concentrations.${column} does not exist` } })
const ok = columns => ({ data: [{ columns }], error: null })

/** A fake table that has these columns and answers in the order PostgREST would: the first one it lacks is the error. */
const tableWith = have => columns => {
  const absent = columns.split(',').map(c => c.trim()).find(c => !have.includes(c))
  return Promise.resolve(absent ? missing(absent) : ok(columns))
}

describe('selectWithOptional', () => {
  const base = 'id, code'
  const optional = ['kind', 'degree', 'college', 'major_code']

  it('asks for everything once when the database has it all', async () => {
    const calls = []
    const run = columns => { calls.push(columns); return tableWith(['id', 'code', ...optional])(columns) }
    const { data } = await selectWithOptional(run, base, optional)
    expect(data[0].columns).toBe('id, code, kind, degree, college, major_code')
    expect(calls).toHaveLength(1)
  })

  it('drops only the column the database names, keeping the older optional ones', async () => {
    const calls = []
    const run = columns => { calls.push(columns); return tableWith(['id', 'code', 'kind', 'degree'])(columns) }
    const { data, error } = await selectWithOptional(run, base, optional)
    expect(error).toBeNull()
    expect(data[0].columns).toBe('id, code, kind, degree')
    expect(calls).toEqual(['id, code, kind, degree, college, major_code', 'id, code, kind, degree, major_code', 'id, code, kind, degree'])
  })

  it('falls back to the base columns when the message names nothing it asked for', async () => {
    const calls = []
    const run = columns => {
      calls.push(columns)
      return Promise.resolve(columns === base ? ok(columns) : { data: null, error: { code: '42703', message: 'column x does not exist' } })
    }
    const { data } = await selectWithOptional(run, base, optional)
    expect(data[0].columns).toBe(base)
    expect(calls).toEqual(['id, code, kind, degree, college, major_code', base])
  })

  it('leaves any other error alone, and works with no optional columns', async () => {
    const boom = { data: null, error: { code: '500', message: 'boom' } }
    expect(await selectWithOptional(() => Promise.resolve(boom), base, optional)).toBe(boom)
    const calls = []
    await selectWithOptional(c => { calls.push(c); return Promise.resolve(missing('code')) }, base)
    expect(calls).toEqual([base])
  })

  it('reads 42703 as a missing column', () => {
    expect(isMissingColumn({ code: '42703' })).toBe(true)
    expect(isMissingColumn({ code: '23505' })).toBe(false)
    expect(isMissingColumn(null)).toBe(false)
  })
})
