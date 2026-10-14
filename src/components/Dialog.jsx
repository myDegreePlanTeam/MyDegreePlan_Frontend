import { useEffect, useRef } from 'react'
import { FOCUSABLE, trapTarget } from '../lib/focusTrap'

// ── Dialog ────────────────────────────────────────────────────────────────────
// The one dialog (redesign Phase 6): a centred dialog on a desktop, a bottom sheet at 760 px or less (the CSS decides). It is labelled by
// its title, modal, keeps Tab inside itself, closes on Escape and on a click of the scrim, and gives focus back to whatever had it.
// While `busy` (a save under way) it does not close. `role="alertdialog"` is for one that interrupts with a warning.

export default function Dialog({ labelledBy, onClose, busy = false, role = 'dialog', className = '', children }) {
  const ref = useRef(null)

  // focus moves into the dialog when it opens, and back to where it was when it closes
  useEffect(() => {
    const previous = document.activeElement
    ref.current?.focus({ preventScroll: true })
    return () => { if (previous?.focus && document.contains(previous)) previous.focus({ preventScroll: true }) }
  }, [])

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!busy) onClose()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...ref.current.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0)
    const target = trapTarget(items.length, items.indexOf(document.activeElement), e.shiftKey)
    if (target === null) return
    e.preventDefault()
    if (target >= 0) items[target].focus()
  }

  return (
    <div className="ds-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div
        className={`ds-modal${className ? ` ${className}` : ''}`}
        role={role} aria-modal="true" aria-labelledby={labelledBy}
        tabIndex={-1} ref={ref} onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  )
}

/** The top of a dialog: an optional line saying what it belongs to, the title the dialog is labelled by, and an optional sentence. */
export function DialogHead({ id, kicker, title, children }) {
  return (
    <div className="ds-modal-head">
      {kicker && <p className="ds-modal-kicker">{kicker}</p>}
      <h3 className="ds-modal-title" id={id}>{title}</h3>
      {children && <p className="ds-modal-lede">{children}</p>}
    </div>
  )
}
