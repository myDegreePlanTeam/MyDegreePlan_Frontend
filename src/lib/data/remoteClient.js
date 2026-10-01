// remoteClient.js: the data client for the self-hosted Docker stack (local-deploy/). supabase-js is
// used there only as a protocol library: nginx forwards /rest/v1 to PostgREST and /auth/v1 to GoTrue
// on the same origin as the page. No hosted service is involved. Loaded lazily by dataClient.js, so
// the default (local-first) build never downloads it.
import { createClient } from '@supabase/supabase-js'

export function createRemoteClient() {
  // The Docker web container serves /config.js, which sets window.__MDP_CONFIG__ at container start
  // (per-install API key, same-origin URL). Outside Docker (the developer opt-in) the build-time
  // VITE_ variables are used instead.
  const runtime = typeof window !== 'undefined' ? window.__MDP_CONFIG__ : undefined

  const url = runtime?.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL
  const key = runtime?.supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY

  return createClient(url, key)
}
