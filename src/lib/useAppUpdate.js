// React hook behind <UpdateBanner />: polls the local updater, exposes what to show and
// the two actions a student can take (install, install-automatically toggle).
// Inert unless this is the local Docker build (see updateSupported).
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from './dataClient'
import { callUpdater, describeUpdate, updateFinished, updateSupported } from './updateStatus'

const IDLE_POLL_MS = 10 * 60 * 1000   // the updater itself only asks the internet every ~6h
const WORKING_POLL_MS = 2000
const GIVE_UP_MS = 15 * 60 * 1000     // stop waiting for the app to come back after this long
const DISMISS_KEY = 'mdp.update.dismissed'

function loadDismissed() {
  try { return JSON.parse(sessionStorage.getItem(DISMISS_KEY)) ?? {} } catch { return {} }
}
function saveDismissed(v) {
  try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify(v)) } catch { /* private mode */ }
}

async function accessToken() {
  const { data } = await db.auth.getSession()
  return data?.session?.access_token ?? null
}

export function useAppUpdate() {
  const supported = updateSupported()
  const [status, setStatus] = useState(null)
  const [dismissed, setDismissed] = useState(loadDismissed)
  const [working, setWorking] = useState(null)        // { target, since } once Update was pressed
  const [notice, setNotice] = useState(null)          // problem starting the update, or giving up
  const [unreachable, setUnreachable] = useState(false) // no answer at all: the stack is restarting
  const workingRef = useRef(null)
  useEffect(() => { workingRef.current = working }, [working])   // read by the polling loop

  const refresh = useCallback(async ({ check = false } = {}) => {
    const token = await accessToken()
    if (!token) return null
    try {
      const s = await callUpdater(check ? '/check' : '/status', { method: check ? 'POST' : 'GET', token })
      setStatus(s)
      setUnreachable(false)
      const w = workingRef.current
      if (w) {
        if (updateFinished(s, w.target)) { window.location.reload(); return s }
        if (s.lastResult && s.lastResult.ok === false && s.lastResult.at >= w.since) setWorking(null)   // it failed; the banner explains
      }
      return s
    } catch {
      // While an update is running the whole stack restarts, so silence is expected.
      const w = workingRef.current
      if (w) setUnreachable(true)
      if (w && Date.now() - w.since > GIVE_UP_MS) {
        setWorking(null)
        setNotice('The app did not come back after the update. Open Docker Desktop, make sure the MyDegreePlan containers are running, or run mdp start.')
      }
      return null
    }
  }, [])

  // Poll. The cadence depends on `working`, so this effect restarts when Update is pressed:
  // a loop that picked its delay once would stay on the slow idle cadence and never notice
  // the app coming back on the new version.
  const isWorking = working !== null
  const askedInternet = useRef(false)
  useEffect(() => {
    if (!supported) return undefined
    let timer
    let stopped = false
    const loop = async () => {
      await refresh({ check: false })
      // Ask the internet once per app load (the updater also checks by itself every few hours).
      if (!askedInternet.current) { askedInternet.current = true; refresh({ check: true }) }
      if (!stopped) timer = setTimeout(loop, isWorking ? WORKING_POLL_MS : IDLE_POLL_MS)
    }
    loop()
    return () => { stopped = true; clearTimeout(timer) }
  }, [supported, refresh, isWorking])

  const install = useCallback(async () => {
    setNotice(null)
    try {
      const token = await accessToken()
      const s = await callUpdater('/apply', { method: 'POST', token })
      setStatus(s)
      setWorking({ target: s.target ?? s.latest, since: Date.now() })
    } catch (e) {
      setNotice(e.message)
    }
  }, [])

  const setAuto = useCallback(async (auto) => {
    try {
      const token = await accessToken()
      setStatus(await callUpdater('/settings', { method: 'POST', token, body: { auto } }))
    } catch (e) {
      setNotice(e.message)
    }
  }, [])

  const dismiss = useCallback((patch) => {
    setDismissed((d) => { const next = { ...d, ...patch }; saveDismissed(next); return next })
  }, [])

  let view = describeUpdate(status, dismissed)
  // Between pressing Update and the updater reporting progress, and while the stack
  // restarts (no answers at all), keep showing progress rather than flickering back.
  if (working && view.mode !== 'failed') {
    view = view.mode === 'working' ? view : { mode: 'working', phase: null, label: 'Updating', target: working.target }
    // While the stack switches versions nothing answers; say so rather than show a stale step.
    if (unreachable) view = { ...view, label: 'Restarting the app' }
  }

  return { supported, view, status, notice, install, setAuto, dismiss, clearNotice: () => setNotice(null) }
}
