// undoStore.js
//
// The plan view's undo stack, kept in the browser between visits. A record is plain data (a type, the ids it touches and the
// values to put back), so it survives JSON. It is stored per profile in localStorage: on the local backend the plan lives in
// the browser anyway, and on the Docker backend the stack is per browser, which is what undo means.
//
// A stored stack must never be applied to a plan it was not made for, so it is dropped when:
//   - it is older than UNDO_MAX_AGE_MS (a record is stamped with `at` when it is pushed),
//   - the profile's program or catalog year differs from the one it was saved under,
//   - a record's slot or added course no longer exists (isUndoApplicable, checked on load and again when undoing),
//   - the data on this device is erased or replaced by an import (clearAllUndo; the local backend reuses profile ids after an erase).
// Browser storage can be missing, full or blocked (private windows): every read and write is guarded and the app works without it.

const PREFIX = 'mdp.undo.'
const VERSION = 1

export const UNDO_LIMIT = 20
export const UNDO_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const keyFor = profileId => `${PREFIX}${profileId}`

function defaultStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

/** A record as it is stored: stamped with when it was made. */
export function stampUndo(record, now = Date.now()) {
  return { ...record, at: now }
}

/** Keeps the records that are well formed and recent, newest UNDO_LIMIT of them. */
export function pruneUndo(records, now = Date.now()) {
  if (!Array.isArray(records)) return []
  return records
    .filter(r => r && typeof r === 'object' && typeof r.type === 'string' && Number.isFinite(r.at) && now - r.at <= UNDO_MAX_AGE_MS && r.at <= now + 60_000)
    .slice(-UNDO_LIMIT)
}

/**
 * Whether a record can still be undone against the plan as it is now. Its slot or added course must still exist; a type this
 * version does not know is never applied.
 * @param {object} record
 * @param {{ slots: Array, freeAddSlots: Array }} plan
 */
export function isUndoApplicable(record, { slots = [], freeAddSlots = [] } = {}) {
  switch (record?.type) {
    case 'pool_select':
    case 'drag_slot':
      return slots.some(s => s.id === record.slotId)
    case 'free_add':
    case 'drag_free':
      return freeAddSlots.some(f => f.id === record.freeAddId)
    case 'note':
      return Number.isFinite(record.semNum)
    default:
      return false
  }
}

const scopeOf = profile => ({ concentrationId: profile?.concentration_id ?? null, catalogYear: profile?.catalog_year ?? null })

/** The stack saved for this profile, or [] when there is none, it is for another program, or storage is unavailable. */
export function loadUndo(profile, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || profile?.id == null) return []
  try {
    const saved = JSON.parse(storage.getItem(keyFor(profile.id)) ?? 'null')
    const scope = scopeOf(profile)
    if (!saved || saved.v !== VERSION || saved.concentrationId !== scope.concentrationId || saved.catalogYear !== scope.catalogYear) return []
    return pruneUndo(saved.records, now)
  } catch {
    return []
  }
}

/** Saves the stack (an empty one removes the entry). Never throws. */
export function saveUndo(profile, records, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage || profile?.id == null) return
  try {
    const kept = pruneUndo(records, now)
    if (kept.length === 0) storage.removeItem(keyFor(profile.id))
    else storage.setItem(keyFor(profile.id), JSON.stringify({ v: VERSION, ...scopeOf(profile), records: kept }))
  } catch {
    // storage full or blocked: the stack stays in memory for this visit
  }
}

/** Forgets every saved stack (data on this device was erased or replaced). */
export function clearAllUndo({ storage = defaultStorage() } = {}) {
  if (!storage) return
  try {
    const keys = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach(key => storage.removeItem(key))
  } catch {
    // nothing to clear
  }
}
