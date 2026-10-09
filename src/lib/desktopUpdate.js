// Pure helpers for the update card in the Windows desktop app (MyDegreePlan_Desktop).
//
// The desktop app's preload exposes `window.mdpDesktop.updates` = { state, check, download, install, onChange }. The main
// process owns the work (it asks GitHub Releases, downloads and installs); the page only shows its state and passes on
// the student's choices. Everywhere else (the hosted build, the Docker install) the bridge is absent and nothing renders.
//
// State, as the desktop app sends it:
//   { status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error',
//     current, version?, notes?, percent?, message? }
// Updates are always optional: there is no "required" state.

export function desktopUpdates(win = typeof window !== 'undefined' ? window : undefined) {
  const updates = win?.mdpDesktop?.updates
  return updates && typeof updates.state === 'function' && typeof updates.onChange === 'function' ? updates : null
}

// Reduces the desktop app's state to one thing to show:
//   none         nothing to say
//   available    a newer version exists: [Download] / [Later]
//   downloading  it is coming down in the background (the app keeps working)
//   ready        downloaded: [Restart now] / [Later] (it also installs when the app is closed)
//   failed       the last check or download did not finish; the installed version is untouched
//
// `dismissed` = { available, ready, error }: what the student already waved away, so a "Later" does not nag.
// `available` and `ready` hold the version put off; a newer version is offered again.
export function describeDesktopUpdate(state, dismissed = {}) {
  if (!state) return { mode: 'none' }
  switch (state.status) {
    case 'available':
      if (dismissed.available === state.version) return { mode: 'none' }
      return { mode: 'available', version: state.version, notes: state.notes ?? '' }
    case 'downloading': {
      const percent = Number.isFinite(state.percent) ? Math.min(100, Math.max(0, Math.round(state.percent))) : 0
      return { mode: 'downloading', version: state.version, percent }
    }
    case 'ready':
      if (dismissed.ready === state.version) return { mode: 'none' }
      return { mode: 'ready', version: state.version }
    case 'error':
      if (dismissed.error) return { mode: 'none' }
      return { mode: 'failed', message: state.message || 'The update could not be completed. Your plan is unchanged.' }
    default:
      return { mode: 'none' }
  }
}
