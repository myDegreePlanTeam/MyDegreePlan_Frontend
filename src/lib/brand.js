// Institution wording shown around the app (login/signup panel, sidebar, email placeholder).
//
// Defaults are what the hosted app and normal installs show. The Docker build's /config.js
// can override them through `window.__MDP_CONFIG__.brand`:
//   brand: 'neutral'                        -> no institution named anywhere (used for public demo captures)
//   brand: { authEyebrow: '...', ... }      -> override individual strings
// Nothing sets `brand` in a normal install, so users never see a difference.

export const DEFAULT_BRAND = {
  authEyebrow: 'Tennessee Tech University',
  shellEyebrow: 'Tennessee Tech',
  emailPlaceholder: 'you@tntech.edu',
}

export const NEUTRAL_BRAND = {
  authEyebrow: 'Computer Science',
  shellEyebrow: 'Computer Science',
  emailPlaceholder: 'you@university.edu',
}

export function getBrand(win = typeof window !== 'undefined' ? window : undefined) {
  const requested = win?.__MDP_CONFIG__?.brand
  if (requested === 'neutral') return NEUTRAL_BRAND
  if (requested && typeof requested === 'object') {
    const merged = { ...DEFAULT_BRAND }
    for (const key of Object.keys(DEFAULT_BRAND)) {
      if (typeof requested[key] === 'string') merged[key] = requested[key]
    }
    return merged
  }
  return DEFAULT_BRAND
}
