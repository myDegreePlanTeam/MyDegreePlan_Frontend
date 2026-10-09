// The wording shown around the app (login/signup panel, sidebar, email placeholder, the catalog's name in a message).
//
// The product is MyDegreePlan and it names no institution. These defaults are what every platform shows. An install that wants its own
// wording (a Docker install, say) can override individual strings through its /config.js: `window.__MDP_CONFIG__.brand = { authEyebrow: '...' }`.
// Anything that is not an object (including the old preset name 'neutral', which is now simply the default) leaves the defaults alone.

export const DEFAULT_BRAND = {
  authEyebrow: 'MyDegreePlan',
  shellEyebrow: 'MyDegreePlan',
  emailPlaceholder: 'you@university.edu',
  welcomeEyebrow: 'Welcome to MyDegreePlan',
  catalogName: 'course catalog',
}

export function getBrand(win = typeof window !== 'undefined' ? window : undefined) {
  const requested = win?.__MDP_CONFIG__?.brand
  if (requested && typeof requested === 'object') {
    const merged = { ...DEFAULT_BRAND }
    for (const key of Object.keys(DEFAULT_BRAND)) {
      if (typeof requested[key] === 'string') merged[key] = requested[key]
    }
    return merged
  }
  return DEFAULT_BRAND
}
