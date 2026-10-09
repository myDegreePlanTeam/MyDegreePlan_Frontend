import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDrift, formatDrift, DAY, USER_FACING } from '../lib/drift.mjs'

const main = { sha: 'a'.repeat(40) }
const now = Date.parse('2026-10-20T12:00:00Z')
const daysAgo = n => new Date(now - n * DAY).toISOString()
const behind = (files, days, aheadBy = 3) => ({ aheadBy, files, firstCommitDate: daysAgo(days) })

test('a platform running main is in sync', () => {
  const { ok, rows } = assessDrift({ main, platforms: [{ name: 'web', commit: main.sha }], now })
  assert.equal(ok, true)
  assert.equal(rows[0].status, 'in sync')
})

test('behind main but only in tests, docs and tooling: fine, however old', () => {
  const files = ['src/tests/platform.test.js', 'docs/claude/CLAUDE.md', 'parity/run.mjs', '.github/workflows/ci.yml']
  const { ok, rows } = assessDrift({ main, platforms: [{ name: 'desktop', commit: 'b'.repeat(40), behind: behind(files, 90) }], now })
  assert.equal(ok, true)
  assert.equal(rows[0].status, 'behind, nothing user-facing')
})

test('a user-facing change that has waited longer than the limit makes the platform STALE', () => {
  const { ok, rows } = assessDrift({ main, platforms: [{ name: 'desktop', commit: 'b'.repeat(40), behind: behind(['src/components/shell/SettingsView.jsx'], 8) }], now })
  assert.equal(ok, false)
  assert.equal(rows[0].status, 'STALE')
  assert.match(rows[0].detail, /waited 8\.0 day/)
})

test('a user-facing change within the limit is only a wait, not a failure', () => {
  const { ok, rows } = assessDrift({ main, platforms: [{ name: 'docker', commit: 'b'.repeat(40), behind: behind(['index.html'], 3) }], now })
  assert.equal(ok, true)
  assert.equal(rows[0].status, 'behind (within limit)')
})

test('web has a short limit: it deploys itself, so any real lag means a failed deploy', () => {
  const { ok } = assessDrift({ main, platforms: [{ name: 'web', commit: 'b'.repeat(40), behind: behind(['src/App.jsx'], 2) }], now })
  assert.equal(ok, false)
})

test('a platform that does not record its commit is unknown, never silently fine', () => {
  const { ok, rows } = assessDrift({ main, platforms: [{ name: 'desktop', commit: null, note: 'release predates build.json' }], now })
  assert.equal(rows[0].status, 'unknown')
  assert.match(rows[0].detail, /predates/)
  assert.equal(ok, true, 'unknown is reported but does not fail the run')
})

test('a commit that cannot be compared with main is unknown', () => {
  assert.equal(assessDrift({ main, platforms: [{ name: 'web', commit: 'b'.repeat(40), behind: null }], now }).rows[0].status, 'unknown')
})

test('what counts as user-facing', () => {
  for (const f of ['src/App.jsx', 'src/lib/platform.js', 'src/data/catalog.json', 'public/favicon.svg', 'index.html', 'vite.config.js', 'package.json', 'package-lock.json']) assert.ok(USER_FACING.test(f), f)
  for (const f of ['src/tests/x.test.js', 'src/lib/__tests__/y.test.js', 'docs/a.md', 'parity/run.mjs', '.github/workflows/ci.yml', 'README.md', 'eslint.config.js']) assert.ok(!USER_FACING.test(f), f)
})

test('the report says which platforms need a release', () => {
  const result = assessDrift({ main, platforms: [{ name: 'desktop', label: 'Windows app', version: '0.1.2', commit: 'b'.repeat(40), behind: behind(['src/App.jsx'], 9) }], now })
  const text = formatDrift(result, main)
  assert.match(text, /Platform drift: STALE/)
  assert.match(text, /\| Windows app \| 0\.1\.2 \| bbbbbbb \|/)
  assert.match(text, /- Windows app/)
})
