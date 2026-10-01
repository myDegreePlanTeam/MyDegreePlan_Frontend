// backend.js: which data backend this page load uses. Pure so the rule can be tested.
//
//   'remote'  an HTTP API with Postgres behind it: the self-hosted Docker stack (local-deploy/).
//   'local'   the static catalog plus IndexedDB in the student's own browser. Nothing leaves the device.
//
// The Docker web container serves /config.js, which sets window.__MDP_CONFIG__ (its own API address
// and a per-install key). That is how a build knows it is running inside that stack, with no build
// flag, so the same bundle works everywhere and Vercel needs no settings.
//
// VITE_DATA_BACKEND=remote is a developer opt-in for pointing `npm run dev` at a Supabase-compatible
// API using VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
export function chooseBackend(runtimeConfig, env = {}) {
  if (runtimeConfig) return 'remote'
  if (env.VITE_DATA_BACKEND === 'remote') return 'remote'
  return 'local'
}
