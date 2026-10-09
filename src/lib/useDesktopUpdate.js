// React hook behind <DesktopUpdateCard />: mirrors the desktop app's update state and passes on the student's choices.
// Inert (view.mode === 'none') unless this is the desktop app; see desktopUpdate.js.
import { useCallback, useEffect, useState } from 'react'
import { describeDesktopUpdate, desktopUpdates } from './desktopUpdate'

export function useDesktopUpdate() {
  const bridge = desktopUpdates()
  const [state, setState] = useState(null)
  const [dismissed, setDismissed] = useState({})

  useEffect(() => {
    if (!bridge) return undefined
    let live = true
    const apply = (next) => {
      if (!live || !next) return
      setState(next)
      // A failure the student dismissed must not hide the next, different one.
      if (next.status !== 'error') setDismissed((d) => (d.error ? { ...d, error: false } : d))
    }
    bridge.state().then(apply).catch(() => { /* the bridge is gone: show nothing */ })
    const stop = bridge.onChange(apply)
    return () => { live = false; if (typeof stop === 'function') stop() }
  }, [bridge])

  const download = useCallback(() => { bridge?.download().catch(() => {}) }, [bridge])
  const install = useCallback(() => { bridge?.install().catch(() => {}) }, [bridge])
  const retry = useCallback(() => { bridge?.check().catch(() => {}) }, [bridge])
  const dismiss = useCallback((patch) => setDismissed((d) => ({ ...d, ...patch })), [])

  return { view: describeDesktopUpdate(state, dismissed), download, install, retry, dismiss }
}
