import { describe, it, expect } from 'vitest'
import {
  UNDO_LIMIT, UNDO_MAX_AGE_MS, stampUndo, pruneUndo, isUndoApplicable, loadUndo, saveUndo, clearAllUndo,
} from '../lib/undoStore'

// the parts of localStorage the store uses
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)) },
    removeItem: k => { data.delete(k) },
    _data: data,
  }
}
const blockedStorage = () => new Proxy({}, { get() { throw new Error('storage is blocked') } })

const NOW = Date.UTC(2026, 9, 8)
const profile = { id: 4, concentration_id: 12, catalog_year: '2026-2027' }
const move = (n, at = NOW) => ({ type: 'drag_slot', slotId: n, prevSemester: 2, label: `Moved ${n}`, at })

describe('saving and loading the stack', () => {
  it('round-trips the records, oldest first', () => {
    const storage = memoryStorage()
    const records = [move(1), move(2), { type: 'note', semNum: 3, prevNote: '', label: 'Note', at: NOW }]
    saveUndo(profile, records, { storage, now: NOW })
    expect(loadUndo(profile, { storage, now: NOW })).toEqual(records)
  })

  it('keeps only the newest UNDO_LIMIT records', () => {
    const storage = memoryStorage()
    saveUndo(profile, Array.from({ length: UNDO_LIMIT + 5 }, (_, i) => move(i)), { storage, now: NOW })
    const back = loadUndo(profile, { storage, now: NOW })
    expect(back).toHaveLength(UNDO_LIMIT)
    expect(back.at(-1).slotId).toBe(UNDO_LIMIT + 4)
  })

  it('removes the entry when the stack is empty', () => {
    const storage = memoryStorage()
    saveUndo(profile, [move(1)], { storage, now: NOW })
    saveUndo(profile, [], { storage, now: NOW })
    expect(storage._data.size).toBe(0)
  })

  it('keeps each profile apart', () => {
    const storage = memoryStorage()
    saveUndo(profile, [move(1)], { storage, now: NOW })
    expect(loadUndo({ ...profile, id: 5 }, { storage, now: NOW })).toEqual([])
  })
})

describe('what is dropped', () => {
  it('a record older than 30 days', () => {
    const records = [move(1, NOW - UNDO_MAX_AGE_MS - 1), move(2, NOW - UNDO_MAX_AGE_MS + 1000)]
    expect(pruneUndo(records, NOW).map(r => r.slotId)).toEqual([2])
  })

  it('a stack saved for another program or catalog year', () => {
    const storage = memoryStorage()
    saveUndo(profile, [move(1)], { storage, now: NOW })
    expect(loadUndo({ ...profile, concentration_id: 99 }, { storage, now: NOW })).toEqual([])
    expect(loadUndo({ ...profile, catalog_year: '2025-2026' }, { storage, now: NOW })).toEqual([])
  })

  it('malformed or foreign data, and records with no timestamp', () => {
    expect(loadUndo(profile, { storage: memoryStorage({ 'mdp.undo.4': '{not json' }), now: NOW })).toEqual([])
    expect(loadUndo(profile, { storage: memoryStorage({ 'mdp.undo.4': JSON.stringify({ v: 99, records: [move(1)] }) }), now: NOW })).toEqual([])
    expect(pruneUndo([{ type: 'drag_slot', slotId: 1 }, null, 'x', { slotId: 2, at: NOW }], NOW)).toEqual([])
    expect(pruneUndo('nope', NOW)).toEqual([])
  })

  it('everything, when the data on the device is erased or replaced', () => {
    const storage = memoryStorage({ other: 'keep me' })
    saveUndo(profile, [move(1)], { storage, now: NOW })
    saveUndo({ ...profile, id: 9 }, [move(2)], { storage, now: NOW })
    clearAllUndo({ storage })
    expect([...storage._data.keys()]).toEqual(['other'])
  })
})

describe('storage that is missing or blocked', () => {
  it('never throws, and loads nothing', () => {
    expect(() => saveUndo(profile, [move(1)], { storage: blockedStorage(), now: NOW })).not.toThrow()
    expect(loadUndo(profile, { storage: blockedStorage(), now: NOW })).toEqual([])
    expect(() => clearAllUndo({ storage: blockedStorage() })).not.toThrow()
    expect(loadUndo(profile, { storage: null, now: NOW })).toEqual([])
    expect(() => saveUndo(profile, [move(1)], { storage: null, now: NOW })).not.toThrow()
  })

  it('a storage that refuses a write (full) leaves the app working', () => {
    const full = { ...memoryStorage(), setItem() { throw new DOMException('quota', 'QuotaExceededError') } }
    expect(() => saveUndo(profile, [move(1)], { storage: full, now: NOW })).not.toThrow()
  })
})

describe('isUndoApplicable', () => {
  const plan = { slots: [{ id: 1 }, { id: 2 }], freeAddSlots: [{ id: 7 }] }
  it('needs the slot or added course to still exist', () => {
    expect(isUndoApplicable({ type: 'drag_slot', slotId: 1 }, plan)).toBe(true)
    expect(isUndoApplicable({ type: 'pool_select', slotId: 3 }, plan)).toBe(false)
    expect(isUndoApplicable({ type: 'free_add', freeAddId: 7 }, plan)).toBe(true)
    expect(isUndoApplicable({ type: 'drag_free', freeAddId: 8 }, plan)).toBe(false)
    expect(isUndoApplicable({ type: 'note', semNum: 2 }, plan)).toBe(true)
  })
  it('never applies a type it does not know (the retired completion records, for one)', () => {
    for (const type of ['sem_complete', 'slot_status', 'free_status', 'whatever']) expect(isUndoApplicable({ type }, plan)).toBe(false)
    expect(isUndoApplicable(null, plan)).toBe(false)
  })
})

describe('stampUndo', () => {
  it('adds the time without changing the record', () => {
    expect(stampUndo({ type: 'note', semNum: 1 }, 5)).toEqual({ type: 'note', semNum: 1, at: 5 })
  })
})
