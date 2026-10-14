// focusTrap.js
//
// Where Tab goes inside a dialog, so focus cannot leave it (components/Dialog.jsx). Pure, so it is tested without a DOM.

/** What a keyboard user can reach, in document order. */
export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The index to move focus to when Tab is pressed, or null to let the browser move it.
 * @param {number} count     how many focusable controls the dialog holds
 * @param {number} index     the focused control's index, or -1 when focus is on the dialog itself (or outside it)
 * @param {boolean} shiftKey Shift+Tab goes backwards
 */
export function trapTarget(count, index, shiftKey) {
  if (count === 0) return -1                      // nothing to focus: keep focus on the dialog
  if (shiftKey) return index <= 0 ? count - 1 : null
  if (index === -1) return 0
  return index === count - 1 ? 0 : null
}
