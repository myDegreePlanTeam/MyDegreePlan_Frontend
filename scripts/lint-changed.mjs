// lint-changed.mjs: eslint on the .js/.jsx files you changed, in the terse format. Run it before a commit.
//
//   npm run lint:changed                 files changed since HEAD (staged, unstaged and untracked)
//   npm run lint:changed -- --since main files changed since main (everything on the branch, plus uncommitted work)
//
// Prints one line when clean (`lint ok (N files)`), one line per problem otherwise. Exit 1 on any error or warning:
// the baseline is clean, so a warning is new. Read-only: it never fixes anything.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const i = args.indexOf('--since')
const since = i >= 0 ? args[i + 1] : 'HEAD'
if (i >= 0 && !since) {
  console.error('usage: npm run lint:changed [-- --since REF]')
  process.exit(64)
}

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
// `--relative` limits to this repo folder and prints paths relative to it; --diff-filter=d drops deleted files.
const changed = new Set([
  ...git('diff', '--name-only', '--relative', '--diff-filter=d', since),
  ...git('ls-files', '--others', '--exclude-standard'),
])
const wanted = [...changed].filter(f => /\.(js|jsx)$/.test(f) && !f.startsWith('dist/')).map(f => resolve(ROOT, f))

const eslint = new ESLint({ cwd: ROOT })
const files = []
for (const f of wanted) if (!(await eslint.isPathIgnored(f))) files.push(f)

if (!files.length) {
  console.log('lint ok (no changed js/jsx files)')
  process.exit(0)
}

const results = await eslint.lintFiles(files)
const formatter = await eslint.loadFormatter(resolve(ROOT, 'scripts/eslint-compact.mjs'))
const out = await formatter.format(results)
console.log(out)
process.exit(results.some(r => r.errorCount || r.warningCount) ? 1 : 0)
