import { describe, it, expect } from 'vitest'
import { createMemoryStorage } from '../lib/data/storage'

describe('memory storage', () => {
  it('starts empty and reports itself as not persistent', async () => {
    const s = createMemoryStorage()
    expect(s.persistent).toBe(false)
    expect(await s.load()).toEqual({ tables: {}, meta: {} })
  })
  it('saves whole tables and meta, and keeps tables it was not asked to touch', async () => {
    const s = createMemoryStorage()
    await s.save({ a: [{ id: 1 }], b: [{ id: 2 }] }, { counters: { a: 1 } })
    await s.save({ a: [{ id: 1 }, { id: 3 }] }, { counters: { a: 3 } })
    const { tables, meta } = await s.load()
    expect(tables.a).toHaveLength(2)
    expect(tables.b).toEqual([{ id: 2 }])
    expect(meta.counters.a).toBe(3)
  })
  it('stores copies, so later mutation of a row cannot change what was saved', async () => {
    const s = createMemoryStorage()
    const rows = [{ id: 1, v: 'x' }]
    await s.save({ a: rows })
    rows[0].v = 'changed'
    expect((await s.load()).tables.a[0].v).toBe('x')
  })
  it('clears everything', async () => {
    const s = createMemoryStorage({ tables: { a: [1] }, meta: { m: 1 } })
    await s.clear()
    expect(await s.load()).toEqual({ tables: {}, meta: {} })
  })
})
