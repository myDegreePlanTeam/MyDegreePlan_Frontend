// dialog.test.jsx
//
// Redesign Phase 6: one dialog (components/Dialog.jsx). It is a labelled modal dialog, keeps Tab inside itself (lib/focusTrap.js), and is a
// bottom sheet on a phone. The shell's dialogs (change major, add major or minor, remove, reset, the requisite conflict) all use it.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Dialog, { DialogHead } from '../components/Dialog'
import { RemoveProgramModal, ResetModal } from '../components/shell/SettingsView'
import { trapTarget, FOCUSABLE } from '../lib/focusTrap'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('Dialog', () => {
  const html = renderToStaticMarkup(
    <Dialog labelledBy="t" onClose={() => {}}>
      <DialogHead id="t" kicker="Your majors" title="Remove Mathematics?">One sentence.</DialogHead>
      <div className="ds-modal-foot"><button>Cancel</button></div>
    </Dialog>
  )

  it('is a modal dialog labelled by its title, on a scrim, and can take focus', () => {
    expect(html).toMatch(/<div class="ds-modal-backdrop"><div class="ds-modal" role="dialog" aria-modal="true" aria-labelledby="t" tabindex="-1">/)
    expect(html).toContain('<h3 class="ds-modal-title" id="t">Remove Mathematics?</h3>')
    expect(text(html)).toBe('Your majors Remove Mathematics? One sentence. Cancel')
  })

  it('can be an alert dialog', () => {
    expect(renderToStaticMarkup(<Dialog labelledBy="t" role="alertdialog" onClose={() => {}} />)).toContain('role="alertdialog"')
  })

  it('has no all-caps eyebrow', () => {
    expect(html).not.toContain('ds-eyebrow')
  })
})

describe('trapTarget keeps Tab inside the dialog', () => {
  it('wraps forward from the last control to the first', () => {
    expect(trapTarget(3, 2, false)).toBe(0)
    expect(trapTarget(3, 0, false)).toBeNull()
    expect(trapTarget(3, 1, false)).toBeNull()
  })

  it('wraps backward from the first control to the last', () => {
    expect(trapTarget(3, 0, true)).toBe(2)
    expect(trapTarget(3, 2, true)).toBeNull()
  })

  it('enters at the first control (or the last, going backwards) when focus is on the dialog itself', () => {
    expect(trapTarget(3, -1, false)).toBe(0)
    expect(trapTarget(3, -1, true)).toBe(2)
  })

  it('keeps focus on the dialog when it holds nothing to focus', () => {
    expect(trapTarget(0, -1, false)).toBe(-1)
    expect(trapTarget(0, -1, true)).toBe(-1)
  })

  it('counts buttons, links, fields and tabbable elements, not disabled ones', () => {
    expect(FOCUSABLE).toContain('button:not([disabled])')
    expect(FOCUSABLE).toContain('select:not([disabled])')
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])')
  })
})

describe('the shell dialogs use it', () => {
  it('Remove and Reset are dialogs with a title, a sentence and two buttons, the main one last', () => {
    const remove = renderToStaticMarkup(<RemoveProgramModal name="Mathematics" onConfirm={() => {}} onClose={() => {}} />)
    expect(remove).toContain('aria-labelledby="remove-program-title"')
    expect(text(remove)).toMatch(/^Your majors Remove Mathematics\? .* Cancel Remove$/)
    const reset = renderToStaticMarkup(<ResetModal onConfirm={() => {}} onClose={() => {}} />)
    expect(text(reset)).toMatch(/^Start over Reset this plan\? .* Cancel Reset plan$/)
  })

  it('no component draws its own ds-modal any more', () => {
    for (const file of ['../components/shell/SettingsView.jsx', '../components/shell/AddProgramModal.jsx', '../components/DegreePlan.jsx']) {
      const src = read(file)
      expect(src, file).not.toContain('ds-modal-backdrop')
      expect(src, file).not.toMatch(/className="ds-modal"/)
      expect(src, file).toMatch(/import Dialog, \{ DialogHead \} from/)
    }
  })

  it('the requisite conflict is an alert dialog with a label', () => {
    expect(read('../components/DegreePlan.jsx')).toContain('<Dialog labelledBy="conflict-title" role="alertdialog"')
  })
})

describe('the dialog stylesheet', () => {
  const css = read('../components/shell/AppShell.css')
  const block = css.slice(css.indexOf('/* -- Dialog (redesign Phase 6)'), css.indexOf('/* -- Loading skeleton'))

  it('reads the redesign tokens only, with no all-caps', () => {
    expect(block).toContain('var(--c-surface)')
    expect(block).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted|text|status-[a-z-]+|danger|ds-[a-z-]+)\)/)
    expect(block).not.toContain('text-transform: uppercase')
  })

  it('sets no text under 13 px and gives every control 44 px', () => {
    for (const m of block.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
    expect(block).toMatch(/\.ds-option \{[^}]*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-modal \.ds-btn-primary, \.ds-modal \.ds-btn-ghost, \.ds-modal \.ds-btn-danger \{\s*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-modal-search \{[^}]*min-height: var\(--target\)/)
  })

  it('is a bottom sheet at 760 px or less, with the actions stacked', () => {
    const phone = block.slice(block.indexOf('@media (max-width: 760px)'))
    expect(phone).toMatch(/\.ds-modal-backdrop \{ align-items: flex-end; padding: 0; \}/)
    expect(phone).toMatch(/\.ds-modal-foot \{ flex-direction: column-reverse;/)
  })

  it('sits above the plan, the details sheet and the toasts', () => {
    expect(block).toMatch(/\.ds-modal-backdrop \{\s*position: fixed; inset: 0; z-index: 200;/)
  })
})

describe('the pickers use the same dialog (Phase 6b)', () => {
  const files = ['../components/SlotModal.jsx', '../components/AddCourseModal.jsx', '../components/PriorCreditWizard.jsx']

  it('none draws its own backdrop, card or cross', () => {
    for (const file of files) {
      const src = read(file)
      expect(src, file).toMatch(/import Dialog, \{ DialogHead \} from '\.\/Dialog'/)
      expect(src, file).not.toMatch(/className="modal-(backdrop|card|header|eyebrow|title|sub|close)/)
      expect(src, file).not.toContain('handleBackdropClick')
      expect(src, file).not.toMatch(/\bcr</)
    }
  })

  it('each is labelled by its title and has a Close button with a word', () => {
    expect(read('../components/AddCourseModal.jsx')).toContain('<Dialog labelledBy="add-course-title"')
    expect(read('../components/SlotModal.jsx')).toContain('<Dialog labelledBy="slot-modal-title"')
    expect(read('../components/PriorCreditWizard.jsx')).toContain('<Dialog labelledBy="prior-credit-title" onClose={onClose} busy={saving}')
    const head = renderToStaticMarkup(<DialogHead id="x" title="Add a course" onClose={() => {}} />)
    expect(text(head)).toBe('Add a course Close')
    expect(head).toContain('class="ds-modal-close"')
  })

  it('the old dialog rules are gone from Dashboard.css', () => {
    const old = read('../components/Dashboard.css')
    for (const cls of ['modal-backdrop', 'modal-card', 'modal-header', 'modal-eyebrow', 'modal-title', 'modal-sub', 'modal-close', 'wizard-card']) {
      expect(old, cls).not.toMatch(new RegExp(`^[.]${cls}(?![a-z-])`, 'm'))
    }
  })

  it('sets the type and control sizes of the rows once, with no colour mapping left (the rows read the tokens themselves)', () => {
    const css = read('../components/shell/AppShell.css')
    const block = css.slice(css.indexOf('/* -- The pickers inside a dialog (redesign Phase 6b)'), css.indexOf('/* -- Loading skeleton'))
    expect(block).not.toMatch(/--(gold|navy|danger|bg|muted|white)(-[a-z]+)?:/)
    expect(block).toMatch(/font-family: var\(--font-ui\); font-size: var\(--fs-ui\); line-height: var\(--lh-ui\); letter-spacing: 0; text-transform: none;/)
    expect(block).toMatch(/:is\(\.onboarding-btn, \.onboarding-btn-secondary, \.modal-remove-btn\) \{\s*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-modal-close \{[^}]*min-height: var\(--target\)/)
  })
})

describe('the dialog hears its keys wherever focus is', () => {
  // A step that swaps its content (the prior-credit wizard) removes the button that had focus; focus falls to the page. Escape and Tab
  // must still reach the dialog, so it listens on the document, and stops listening when it closes.
  const src = read('../components/Dialog.jsx')

  it('listens on the document while it is open, and removes the listener when it closes', () => {
    expect(src).toContain("document.addEventListener('keydown', onKeyDown, true)")
    expect(src).toContain("return () => document.removeEventListener('keydown', onKeyDown, true)")
    expect(src).not.toMatch(/<div[^>]*onKeyDown=/)
  })

  it('reads the latest onClose and busy, and does not close while a save is under way', () => {
    expect(src).toContain('closeRef.current = onClose; busyRef.current = busy')
    expect(src).toContain('if (!busyRef.current) closeRef.current()')
  })

  it('brings focus back into the dialog when Tab is pressed from outside it', () => {
    expect(trapTarget(4, -1, false)).toBe(0)
    expect(trapTarget(4, -1, true)).toBe(3)
  })
})
