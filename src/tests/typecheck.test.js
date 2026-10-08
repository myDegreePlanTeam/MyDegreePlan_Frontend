// The typecheck pilot (scripts/typecheck.mjs, tsconfig.typecheck.json): the listed modules must stay clean, and every listed
// module must opt in with `// @ts-check` (checkJs is off, so a file without it would be listed but never reported).
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const files = JSON.parse(readFileSync(`${ROOT}tsconfig.typecheck.json`, 'utf8')).files

describe('typecheck pilot', () => {
  it('lists at least one module', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s starts with // @ts-check', file => {
    expect(readFileSync(`${ROOT}${file}`, 'utf8').startsWith('// @ts-check')).toBe(true)
  })

  it('reports no type errors', () => {
    const run = spawnSync(process.execPath, [`${ROOT}scripts/typecheck.mjs`], { cwd: ROOT, encoding: 'utf8' })
    expect(run.stdout.trim()).toMatch(/^typecheck ok \(\d+ files\)$/)
    expect(run.status).toBe(0)
  }, 30000)
})
