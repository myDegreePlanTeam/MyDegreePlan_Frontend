// "Moved CSC 1310 to Fall 2027. Undo": what just changed and the one way back, where the student is looking (redesign Phase 3d).
// It replaces an always-visible, mostly disabled Undo button. role="status" so a screen reader says it without taking focus.
export default function UndoToast({ label, onUndo, onDismiss }) {
  if (!label) return null
  return (
    <div className="ds-undo-toast" role="status">
      <span className="ds-undo-toast-text">{label}.</span>
      <button className="ds-undo-toast-undo" onClick={onUndo}>Undo</button>
      <button className="ds-undo-toast-close" onClick={onDismiss} aria-label="Dismiss">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
      </button>
    </div>
  )
}
