// storage.js: where the local-first backend keeps a student's rows between visits.
//
// A storage adapter is { persistent, load(), save(tables, meta), clear() }:
//   load()  -> { tables: { [name]: row[] }, meta: { counters } }
//   save()  -> writes the given tables (whole-table replace) and the meta record in one transaction
//
// IndexedDB is the real store. The memory adapter backs the unit tests and is the fallback when
// IndexedDB cannot open (some private-browsing modes), in which case nothing survives a reload.
// `persistent: false` lets the UI say so.

const DB_NAME = 'mydegreeplan'
const DB_VERSION = 1
const STORE = 'kv'
const META_KEY = '__meta'

export function createMemoryStorage(initial = {}) {
  const tables = new Map(Object.entries(initial.tables ?? {}))
  let meta = initial.meta ?? {}
  return {
    persistent: false,
    async load() {
      return { tables: Object.fromEntries([...tables].map(([k, v]) => [k, structuredClone(v)])), meta: structuredClone(meta) }
    },
    async save(changed, nextMeta) {
      for (const [name, rows] of Object.entries(changed)) tables.set(name, structuredClone(rows))
      if (nextMeta) meta = structuredClone(nextMeta)
    },
    async clear() { tables.clear(); meta = {} },
  }
}

const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const finished = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
})

function open(factory) {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
}

export function createIndexedDbStorage(factory = globalThis.indexedDB) {
  if (!factory) return createMemoryStorage()

  const dbPromise = open(factory)
  let fallback = null          // set if IndexedDB fails after we promised persistence
  const adapter = {
    persistent: true,
    async load() {
      let db
      try { db = await dbPromise } catch (err) {
        console.warn('MyDegreePlan: IndexedDB is unavailable, plans will not be kept after this tab closes.', err)
        fallback = createMemoryStorage()
        adapter.persistent = false
        return fallback.load()
      }
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const keys = await request(store.getAllKeys())
      const tables = {}
      let meta = {}
      for (const key of keys) {
        const value = await request(store.get(key))
        if (key === META_KEY) meta = value ?? {}
        else tables[key] = value
      }
      return { tables, meta }
    },
    async save(changed, meta) {
      if (fallback) return fallback.save(changed, meta)
      const db = await dbPromise
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const [name, rows] of Object.entries(changed)) store.put(rows, name)
      if (meta) store.put(meta, META_KEY)
      await finished(tx)
    },
    async clear() {
      if (fallback) return fallback.clear()
      const db = await dbPromise
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      await finished(tx)
    },
  }
  return adapter
}

// Ask the browser not to evict this origin's storage under pressure. Best effort: Safari and
// Firefox decide for themselves, and installing the site to the home screen helps most there.
export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}
