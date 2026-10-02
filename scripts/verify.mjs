// verify.mjs: lint, tests and a production build in one command, each reduced to one line when it passes.
//
//   npm run verify                 lint (whole project), tests, build
//   npm run verify -- --skip-build lint and tests only (the build is the slow part)
//
// A passing run prints three lines (`lint ok`, `tests ok`, `build ok`). A failing step prints its failures: one
// line per lint problem, and per failed test its name, file and the first lines of the error; for a build, the last
// lines of its output. Exit 1 if any step failed. Read-only apart from `dist/` (the build output, ignored by git).
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)))
const skipBuild = process.argv.includes('--skip-build')
const MAX_LINES = 8
const secs = t0 => ((Date.now() - t0) / 1000).toFixed(1) + 's'
const indent = (text, n = MAX_LINES) => {
  const lines = String(text).trim().split('\n')
  return lines.slice(0, n).map(l => '    ' + l.trimEnd()).join('\n') + (lines.length > n ? `\n    ... +${lines.length - n} more lines` : '')
}
// stack frames inside node_modules or node internals say nothing about the failing test
const withoutLibraryFrames = text => text.split('\n').filter(l => !/^\s*at .*(node_modules|node:internal|<anonymous>)/.test(l)).join('\n')
const run = (script, args) => spawnSync(process.execPath, [resolve(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

let failed = false
const fail = text => { failed = true; console.log(text) }

// 1. lint
{
  const t0 = Date.now()
  const eslint = new ESLint({ cwd: ROOT })
  const results = await eslint.lintFiles(['.'])
  const formatter = await eslint.loadFormatter(resolve(ROOT, 'scripts/eslint-compact.mjs'))
  const out = await formatter.format(results)
  if (results.some(r => r.errorCount || r.warningCount)) fail('lint FAILED\n' + out.split('\n').map(l => '  ' + l).join('\n'))
  else console.log(`${out} ${secs(t0)}`)
}

// 2. tests (vitest's JSON report is read instead of its console output)
{
  const t0 = Date.now()
  const dir = mkdtempSync(join(tmpdir(), 'mdp-verify-'))
  const file = join(dir, 'vitest.json')
  const r = run('node_modules/vitest/vitest.mjs', ['run', '--reporter=json', `--outputFile=${file}`])
  let report = null
  try { report = JSON.parse(readFileSync(file, 'utf8')) } catch { /* vitest crashed before writing it */ }
  rmSync(dir, { recursive: true, force: true })
  if (!report) fail('tests FAILED (no report written); last lines:\n' + indent(((r.stdout ?? '') + (r.stderr ?? '')).split('\n').slice(-30).join('\n'), 30))
  else if (report.numFailedTests || report.numFailedTestSuites || !report.success) {
    const bad = []
    for (const f of report.testResults) {
      const name = relative(ROOT, f.name).split('\\').join('/')
      const failedTests = f.assertionResults.filter(a => a.status === 'failed')
      for (const a of failedTests) bad.push(`  FAIL ${a.fullName} (${name})\n${indent(withoutLibraryFrames((a.failureMessages ?? []).join('\n')))}`)
      if (!failedTests.length && f.status === 'failed') bad.push(`  FAIL ${name} (file did not run)\n${indent(f.message ?? '')}`)
    }
    fail(`tests FAILED (${report.numFailedTests} of ${report.numTotalTests} tests)\n${bad.join('\n')}`)
  } else console.log(`tests ok (${report.numPassedTests} tests, ${report.testResults.length} files) ${secs(t0)}`)
}

// 3. build
if (skipBuild) console.log('build skipped')
else {
  const t0 = Date.now()
  const r = run('node_modules/vite/bin/vite.js', ['build'])
  const text = (r.stdout ?? '') + (r.stderr ?? '')
  if (r.status !== 0) fail('build FAILED; last lines:\n' + indent(text.split('\n').slice(-30).join('\n'), 30))
  else console.log(`build ok ${secs(t0)}`)
}

process.exit(failed ? 1 : 0)
