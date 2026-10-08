// typecheck.mjs: TypeScript's checker over the modules listed in tsconfig.typecheck.json, in the terse format. Pilot, not part of verify.
//
//   npm run typecheck
//
// The app stays plain JavaScript. checkJs is off, so only a file that starts with `// @ts-check` is reported; the list in
// tsconfig.typecheck.json says which files are followed. To bring a module in: add `// @ts-check` to its first line, add it to
// "files", and fix what it reports with JSDoc (no runtime change). Prints one line when clean, one line per error otherwise.
// Exit 1 on any error. Read-only: it never writes or fixes anything.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))
const config = 'tsconfig.typecheck.json'
const files = JSON.parse(readFileSync(new URL(`../${config}`, import.meta.url), 'utf8')).files ?? []

const run = spawnSync(process.execPath, [tsc, '-p', config, '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8' })
if (run.error) {
  console.error(`typecheck: could not run tsc (${run.error.message}); run npm install`)
  process.exit(2)
}
const errors = (run.stdout || '').split('\n').filter(l => /error TS\d+/.test(l))
if (!errors.length && run.status === 0) {
  console.log(`typecheck ok (${files.length} files)`)
  process.exit(0)
}
for (const l of errors) console.log(l.length > 200 ? `${l.slice(0, 197)}...` : l)
if (!errors.length) console.log(`typecheck failed (exit ${run.status}): ${(run.stderr || run.stdout || '').trim().slice(0, 200)}`)
else console.log(`typecheck: ${errors.length} error${errors.length === 1 ? '' : 's'}`)
process.exit(1)
