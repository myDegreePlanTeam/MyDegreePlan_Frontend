// dataClient.js: the one data client the app imports. Every component talks to `db` and does not
// know which backend answers; see data/backend.js for how it is chosen.
//
//   db.from('table').select(...)...   queries
//   db.auth.getSession() / ...        the (single, implicit) session in local mode
//   db.local                          per-device backup/erase controls; undefined on the remote backend
import { chooseBackend } from './data/backend'
import { createLocalClient } from './data/localClient'
import { createIndexedDbStorage, requestPersistence } from './data/storage'

const runtime = typeof window !== 'undefined' ? window.__MDP_CONFIG__ : undefined

export const backend = chooseBackend(runtime, import.meta.env)
export const isLocalBackend = backend === 'local'

function createLocal() {
  // Fire and forget: asks the browser not to evict this origin's storage when space is tight.
  requestPersistence()
  return createLocalClient({
    // A separate chunk, fetched on first query, so it never loads on the remote backend.
    loadCatalog: () => import('../data/catalog.json').then(m => m.default),
    // Descriptions of the courses no template or pool names: fetched the first time a query needs one.
    loadDescriptions: () => import('../data/catalog.descriptions.json').then(m => m.default),
    storage: createIndexedDbStorage(),
  })
}

// Top-level await: supabase-js is only fetched when the remote backend is chosen.
export const db = isLocalBackend
  ? createLocal()
  : (await import('./data/remoteClient')).createRemoteClient()
