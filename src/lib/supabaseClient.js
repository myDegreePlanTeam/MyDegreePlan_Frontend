import { createClient } from '@supabase/supabase-js'

// The local Docker build serves /config.js, which sets window.__MDP_CONFIG__
// at container start (per-install API key, same-origin URL). Vercel builds have
// no such file, so they fall back to the build-time VITE_ variables.
const runtime = typeof window !== 'undefined' ? window.__MDP_CONFIG__ : undefined

const supabaseUrl = runtime?.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = runtime?.supabaseAnonKey ?? import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
