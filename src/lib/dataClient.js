// dataClient.js: the one data client the app imports. Every component talks to `db` and does not
// know which backend answers; see data/backend.js for how it is chosen.
//
//   db.from('table').select(...)...   queries
//   db.auth.getSession() / ...        the (single, implicit) session in local mode
//   db.planData                       export / import / erase of the student's plan; both backends have it
import { chooseBackend } from './data/backend'
import { createLocalClient } from './data/localClient'
import { createIndexedDbStorage, requestPersistence } from './data/storage'
import { platformOf } from './platform'

const runtime = typeof window !== 'undefined' ? window.__MDP_CONFIG__ : undefined

export const backend = chooseBackend(runtime, import.meta.env)
export const isLocalBackend = backend === 'local'
// 'web' | 'desktop' | 'docker': see lib/platform.js. Wording that differs by platform comes from platformWords(platform).
export const platform = platformOf({ backend, win: typeof window !== 'undefined' ? window : undefined })

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
