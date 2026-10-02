// install-hooks.mjs: point this clone's git at the tracked hooks in .githooks (pre-commit lints the staged files).
//
//   npm run hooks:install
//
// Sets core.hooksPath for this repository only (local config; nothing global). Idempotent. It leaves a hooksPath you set
// yourself alone, and does nothing outside a git checkout of this folder. Undo: git config --unset core.hooksPath
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

try {
  if (resolve(git('rev-parse', '--show-toplevel')) !== ROOT) {
    console.log('hooks: this folder is not the root of a git checkout, nothing to do')
    process.exit(0)
  }
  let current = ''
  try { current = git('config', '--local', '--get', 'core.hooksPath') } catch { /* not set */ }
  if (current === '.githooks') console.log('hooks: already installed (core.hooksPath = .githooks)')
  else if (current) console.log(`hooks: core.hooksPath is already "${current}", left alone`)
  else {
    git('config', '--local', 'core.hooksPath', '.githooks')
    console.log('hooks: installed (core.hooksPath = .githooks); the pre-commit hook now lints staged files')
  }
} catch (e) {
  console.log(`hooks: not installed (${String(e.message).split('\n')[0]})`)
}
