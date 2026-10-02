import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// CLAUDE.md was split into CLAUDE.md + REFERENCE.md and two `see "Section"` pointers kept naming sections that had moved.
// Nothing noticed until a retro read them. These checks keep the maintained instruction docs from pointing at nothing:
//   1. every relative markdown link resolves to a file;
//   2. every `see "Section"` names a heading (or a bold lead-in such as **No more Supabase migrations.**) that exists in
//      CLAUDE.md or REFERENCE.md.
// Historical plan and prompt docs are not checked: they are records, and some of their links were relative to a folder
// they no longer live in.

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DOCS = ['CLAUDE.md', 'docs/claude/CLAUDE.md', 'docs/claude/REFERENCE.md', 'docs/claude/README.md', 'docs/claude/ROADMAP.md']
const SEE_DOCS = ['docs/claude/CLAUDE.md', 'docs/claude/REFERENCE.md']
const read = rel => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const clean = s => s.replace(/`/g, '').replace(/\.$/, '').trim().toLowerCase()

function anchors() {
  const found = new Set()
  for (const rel of SEE_DOCS) {
    const text = read(rel)
    for (const m of text.matchAll(/^#{1,6}\s+(.+)$/gm)) found.add(clean(m[1]))
    for (const m of text.matchAll(/^\*\*([^*]+?)\.?\*\*/gm)) found.add(clean(m[1]))
  }
  return found
}

describe('instruction docs', () => {
  it('exist', () => {
    for (const rel of DOCS) expect(existsSync(join(ROOT, rel)), rel).toBe(true)
  })

  it('only link to files that exist', () => {
    const broken = []
    let links = 0
    for (const rel of DOCS) {
      for (const m of read(rel).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1].split('#')[0]
        if (!target || /^(https?:|mailto:)/.test(target)) continue
        links += 1
        if (!existsSync(join(ROOT, dirname(rel), target))) broken.push(`${rel} -> ${m[1]}`)
      }
    }
    expect(links, 'the link pattern found nothing, so this check is not checking').toBeGreaterThan(3)
    expect(broken.join('\n')).toBe('')
  })

  it('only `see "Section"` a section that exists in CLAUDE.md or REFERENCE.md', () => {
    const known = anchors()
    const missing = []
    let refs = 0
    for (const rel of SEE_DOCS) {
      for (const m of read(rel).matchAll(/see "([^"]+)"/g)) {
        refs += 1
        if (!known.has(clean(m[1]))) missing.push(`${rel}: see "${m[1]}"`)
      }
    }
    expect(refs, 'the see "..." pattern found nothing, so this check is not checking').toBeGreaterThan(2)
    expect(missing.join('\n')).toBe('')
  })
})
