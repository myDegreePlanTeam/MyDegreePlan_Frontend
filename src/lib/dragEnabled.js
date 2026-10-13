// dragEnabled.js
//
// Whether the plan grid can be dragged. On a phone it cannot: a finger that drags is scrolling, and a row that claims the
// touch (touch-action: none) would stop the page scrolling. Everything a drag does has a tap-to-open equivalent: "Move to
// term" in the course panel moves a course, "+ Add prior credit" records one, and the ✕ on a prior credit removes it.
//
// The breakpoint is the one AppShell.css uses to turn the sidebar into a top bar.

import { createContext, useContext, useSyncExternalStore } from 'react'

export const PHONE_QUERY = '(max-width: 760px)'

const subscribe = onChange => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const snapshot = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY).matches : false)

/** True while the viewport is phone width; follows a resize or a rotation. */
export function useIsPhone() {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}

/** Provided by the plan view; rows and drop zones read it instead of being passed a flag through every level. */
export const DragEnabledContext = createContext(true)

export function useDragEnabled() {
  return useContext(DragEnabledContext)
}
