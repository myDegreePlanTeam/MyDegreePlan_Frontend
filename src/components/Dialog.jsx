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

  // The keys are heard on the document, not on the dialog: a step that swaps its content removes the control that had focus, focus
  // then falls to the page, and a listener on the dialog would no longer hear Escape or Tab. The latest props are read through refs.
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy })
  useEffect(() => {
    function onKeyDown(e) {
      const dialog = ref.current
      if (!dialog) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        if (!busyRef.current) closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0)
      // -1 when focus is on the dialog itself or has fallen outside it: Tab then goes to the first control (Shift+Tab to the last)
      const target = trapTarget(items.length, items.indexOf(document.activeElement), e.shiftKey)
      if (target === null) return
      e.preventDefault()
      if (target >= 0) items[target].focus()
      else dialog.focus({ preventScroll: true })
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div className="ds-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div
        className={`ds-modal${className ? ` ${className}` : ''}`}
        role={role} aria-modal="true" aria-labelledby={labelledBy}
        tabIndex={-1} ref={ref}
      >
        {children}
      </div>
    </div>
  )
}

/** The top of a dialog: an optional line saying what it belongs to, the title the dialog is labelled by, an optional sentence, and (for a picker) a Close button. */
export function DialogHead({ id, kicker, title, onClose, children }) {
  return (
    <div className={`ds-modal-head${onClose ? ' ds-modal-head-close' : ''}`}>
      <div className="ds-modal-head-text">
        {kicker && <p className="ds-modal-kicker">{kicker}</p>}
        <h3 className="ds-modal-title" id={id}>{title}</h3>
        {children && <p className="ds-modal-lede">{children}</p>}
      </div>
      {onClose && (
        <button type="button" className="ds-modal-close" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          Close
        </button>
      )}
    </div>
  )
}
