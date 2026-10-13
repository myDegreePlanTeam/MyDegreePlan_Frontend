// theme.js
//
// The colour theme: a preference of 'system', 'light' or 'dark', resolved to the 'light' or 'dark' that `data-theme` on <html> carries.
//
//   'system' (nothing stored) follows the device's light or dark setting, live;
//   'light' and 'dark' are an explicit choice, stored under localStorage 'theme' (the key and the two values older builds already wrote).
//
// public/theme-init.js sets the same attribute before first paint so a stored light theme does not flash dark. It is a classic external
// script because the Windows app and the Docker web container refuse inline scripts; src/tests/theme.test.js runs it against this module
// so the two cannot drift. Storage may be blocked (private windows): every read and write is guarded and the page still renders.

export const THEME_KEY = 'theme'
export const PREFERENCES = ['system', 'light', 'dark']
export const LIGHT_QUERY = '(prefers-color-scheme: light)'

/** The stored preference. Anything but an explicit 'light' or 'dark' (nothing, an old or unknown value, blocked storage) is 'system'. */
export function readPreference(storage) {
  try {
    const stored = storage?.getItem(THEME_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

/** Store a preference. 'system' removes the key, so a device that never chose follows the device. */
export function writePreference(storage, preference) {
  try {
    if (preference === 'light' || preference === 'dark') storage.setItem(THEME_KEY, preference)
    else storage.removeItem(THEME_KEY)
  } catch { /* storage blocked: the choice lasts until the page closes */ }
}

/** 'light' or 'dark' for a preference. `prefersLight` is what the device reports. */
export function resolveTheme(preference, prefersLight) {
  if (preference === 'light' || preference === 'dark') return preference
  return prefersLight ? 'light' : 'dark'
}

const prefersLightNow = win => !!win?.matchMedia?.(LIGHT_QUERY)?.matches

/** Put the theme on <html>. Returns what it set. */
export function applyTheme(theme, doc = typeof document !== 'undefined' ? document : undefined) {
  if (doc?.documentElement) doc.documentElement.dataset.theme = theme
  return theme
}

/**
 * Apply the stored preference now, and follow the device while the preference is 'system'. Returns a function that stops following.
 * Call once at start (App.jsx).
 */
export function initTheme({ storage = safeStorage(), win = typeof window !== 'undefined' ? window : undefined, doc } = {}) {
  const apply = () => applyTheme(resolveTheme(readPreference(storage), prefersLightNow(win)), doc)
  apply()
  const query = win?.matchMedia?.(LIGHT_QUERY)
  if (!query?.addEventListener) return () => {}
  query.addEventListener('change', apply)
  return () => query.removeEventListener('change', apply)
}

/** Choose a preference: store it and apply it. Returns the theme now showing. */
export function setPreference(preference, { storage = safeStorage(), win = typeof window !== 'undefined' ? window : undefined, doc } = {}) {
  writePreference(storage, preference)
  return applyTheme(resolveTheme(preference, prefersLightNow(win)), doc)
}

function safeStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : undefined } catch { return undefined }
}
