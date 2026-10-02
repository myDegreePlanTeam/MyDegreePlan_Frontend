import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// An edit script that put "\b" in a Python or shell string wrote a literal backspace (0x08) into a JS regex
// twice (BUG: retro 2026-10-01, 2026-10-02), and nothing failed until a rule quietly stopped matching.
// Tab, LF, CR are fine; every other control character below 0x20 is never intended in source.
// eslint-disable-next-line no-control-regex -- matching control characters is the point of this test
const CONTROL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DIRS = ['src', 'scripts']
const EXT = /\.(js|jsx|mjs|css|json)$/
const SKIP = new Set(['node_modules', 'dist'])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (EXT.test(name)) yield path
  }
}

describe('source hygiene', () => {
  it('has no stray control characters in source files', () => {
    const offenders = []
    for (const d of DIRS) {
      for (const file of walk(join(ROOT, d))) {
        const text = readFileSync(file, 'utf8')
        const hit = CONTROL.exec(text)
        if (!hit) continue
        const line = text.slice(0, hit.index).split('\n').length
        offenders.push(`${relative(ROOT, file)}:${line} has U+${hit[0].charCodeAt(0).toString(16).padStart(4, '0')}`)
      }
    }
    expect(offenders, 'a "\\b" or "\\d" in an edit script reached the file as a control character; use [0-9] or chr(92)').toEqual([])
  })
})
