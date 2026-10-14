// undoToast.test.jsx
//
// Redesign Phase 3d: Undo is a sentence and a button that appear after a change ("Moved CSC 1310 to Fall 2027. Undo"), not a button that
// sits in the header reading "Nothing to undo". lib/undoStore.js is untouched: the stack and what it stores are the same.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import UndoToast from '../components/shell/UndoToast'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('UndoToast', () => {
  it('says what changed as a sentence, with Undo beside it', () => {
    const html = renderToStaticMarkup(<UndoToast label="Moved CSC 1310 to Fall 2027" onUndo={() => {}} onDismiss={() => {}} />)
    expect(text(html)).toBe('Moved CSC 1310 to Fall 2027. Undo')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="Dismiss"')
  })

  it('renders nothing when there is nothing to say', () => {
    expect(renderToStaticMarkup(<UndoToast label={null} onUndo={() => {}} onDismiss={() => {}} />)).toBe('')
  })
})

describe('the plan view', () => {
  const src = read('../components/DegreePlan.jsx')

  it('no longer shows a disabled Undo button', () => {
    expect(src).not.toContain('Nothing to undo')
    expect(src).not.toContain('Undo — ')
    expect(src).toMatch(/\{lastUndo && \(\s*<button/)
  })

  it('says where a moved course went', () => {
    expect(src.match(/label: `Moved \$\{[^`]+\} to \$\{semLabels\[newSemester\]/g)).toHaveLength(2)
  })

  it('shows the toast when a change is recorded and hides it when it is undone', () => {
    expect(src).toMatch(/function pushUndo\(record\) \{[\s\S]*?setUndoToast\(record\.label/)
    expect(src).toMatch(/async function handleUndo\(\) \{\s*hideUndoToast\(\)/)
    expect(src).toContain('<UndoToast label={undoToast} onUndo={handleUndo} onDismiss={hideUndoToast} />')
  })
})

describe('the toast stylesheet', () => {
  const css = read('../components/shell/AppShell.css')
  const block = css.slice(css.indexOf('/* -- Undo toast (redesign Phase 3d)'), css.indexOf('.ds-undo-toast-close:hover'))

  it('reads the redesign tokens, with 44 px buttons', () => {
    expect(block).toContain('var(--c-surface-2)')
    expect(block).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted|status-[a-z]+|danger)\b/)
    expect(block).toMatch(/\.ds-undo-toast-undo \{[^}]*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-undo-toast-close \{[^}]*width: var\(--target\); height: var\(--target\)/)
  })

  it('sits above the tab bar on a phone', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 760px)'))
    expect(phone).toMatch(/\.ds-undo-toast \{[^}]*bottom: calc\(56px/)
  })

  it('draws the plan header buttons at 44 px in the interface font', () => {
    expect(css).toMatch(/\.ds-app \.ds-header-actions \.ds-btn-ghost \{[^}]*min-height: var\(--target\)[^}]*font-family: var\(--font-ui\)/)
  })
})
