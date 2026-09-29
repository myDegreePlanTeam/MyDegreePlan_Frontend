// Pure helpers for the in-app update banner (Docker/local installs only).
//
// The local Docker build runs an "updater" service next to the app. nginx exposes it at
// /_mdp/update/*; every call carries the signed-in user's access token. None of this
// exists on the hosted (Vercel) build, where `window.__MDP_CONFIG__` is undefined and
// updateSupported() is false, so the banner never renders there.

export const UPDATE_BASE = '/_mdp/update'

export function updateSupported(win = typeof window !== 'undefined' ? window : undefined) {
  return !!win?.__MDP_CONFIG__
}

// What the student is told while the updater works. The phases are the updater's own.
export const PHASE_LABELS = {
  downloading: 'Downloading the update',
  stopping: 'Stopping the app',
  backup: 'Backing up your plan',
  starting: 'Starting the new version',
  verifying: 'Checking that everything works',
  rollback: 'Something went wrong — restoring the previous version',
}

export function phaseLabel(phase) {
  return PHASE_LABELS[phase] ?? 'Updating'
}

// Reduces the updater's status to one thing to show:
//   none      nothing to say
//   available a newer version exists (optional)
//   required  this version is too old to keep using; block until updated
//   working   an update is in progress (downloading or switching versions)
//   failed    the last update did not complete (the old version is still running)
//
// `dismissed` = { failedAt, availableSequence }: what the student already waved away
// this session, so a failure or a "later" does not nag on every poll.
export function describeUpdate(status, dismissed = {}) {
  if (!status || status.state === 'disabled') return { mode: 'none' }

  if (status.state === 'downloading' || status.state === 'applying') {
    return { mode: 'working', phase: status.phase, label: phaseLabel(status.phase), target: status.target ?? status.latest ?? null }
  }

  const failed = status.lastResult && status.lastResult.ok === false && status.lastResult.at !== dismissed.failedAt
  if (failed) {
    return { mode: 'failed', message: status.lastResult.message, canRetry: !!status.updateAvailable, at: status.lastResult.at, latest: status.latest }
  }

  if (status.updateAvailable && status.required) return { mode: 'required', latest: status.latest, current: status.current }
  if (status.updateAvailable && dismissed.availableSequence !== status.latest?.sequence) {
    return { mode: 'available', latest: status.latest, current: status.current }
  }
  return { mode: 'none' }
}

// True once the version that was being installed is the one running, i.e. the page
// should reload to pick up the new front end.
export function updateFinished(status, target) {
  if (!status || !target) return false
  if (status.state === 'downloading' || status.state === 'applying') return false
  return status.current?.sequence >= target.sequence
}

export class UpdateApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

// One call to the updater. Network failures reject with a plain Error (status 0), which
// the caller treats as "the app is restarting" while an update is in flight.
export async function callUpdater(path, { method = 'GET', token, body, fetchImpl = globalThis.fetch } = {}) {
  let res
  try {
    res = await fetchImpl(`${UPDATE_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      // The whole stack restarts during an update; never let one hung connection stall polling.
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
    })
  } catch {
    throw new UpdateApiError(0, 'The app is not answering.')
  }
  let json = null
  try { json = await res.json() } catch { /* nginx error page while the stack restarts */ }
  if (!res.ok) throw new UpdateApiError(res.status, json?.error ?? `Update service answered ${res.status}`)
  return json
}
