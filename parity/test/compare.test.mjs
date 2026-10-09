// Unit tests for the comparison engine (no browser). Run: node --test parity/test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { compareRuns, normalizeLines } from '../lib/compare.mjs'
import { platformWords } from '../../src/lib/platform.js'

const pdf = { header: '%PDF-', pages: 2, bigEnough: true }
const plan = [{ semester: 'Semester 1', courses: ['CSC 1300', 'MATH 1910'] }]
const run = (target, screens, over = {}) => ({
  target,
  facts: { signals: { desktopBridge: target === 'desktop', dockerConfig: target === 'docker' }, plan, pdf, ...over },
  screens,
})
const screen = (sidebar, main = ['Settings'], extra = {}) => ({ sidebar, main, modal: [], page: [], ...extra })
const settings = platform => {
  const w = platformWords(platform)
  return screen([platform === 'docker' ? 'a@b.test' : 'On this device'], ['Your data', w.storedMeta, w.backupText, w.eraseLabel, `Deletes your plan from ${w.where}, then starts onboarding again.`])
}
const rules = [
  { feature: 'accounts', platforms: ['docker'], regions: ['sidebar'], match: '^(Sign out|Signed in|\\S+@\\S+)$' },
  { feature: 'accounts', platforms: ['web', 'desktop'], regions: ['sidebar'], match: '^On this device$' },
  { feature: 'accounts', screen: 'auth-signup', platforms: ['docker'] },
]
const features = ['accounts']

test('identical platforms pass', () => {
  const same = { plan: screen(['Plan'], ['Semester 1']) }
  assert.equal(compareRuns([run('web', same), run('desktop', same)], { rules, knownFeatures: features }).ok, true)
})

test('words that legitimately differ by platform are neutralised: this browser / this computer / this install', () => {
  const result = compareRuns([run('web', { settings: settings('web') }), run('desktop', { settings: settings('desktop') }), run('docker', { settings: settings('docker') })], { rules, knownFeatures: features })
  assert.deepEqual(result.problems, [])
})

test('a wording difference that is NOT a registered platform word fails, with both sides shown', () => {
  const web = { settings: settings('web') }
  const desktop = { settings: screen(['On this device'], ['Your data', 'Change concentration']) }
  const result = compareRuns([run('web', web), run('desktop', desktop)], { rules, knownFeatures: features })
  assert.equal(result.ok, false)
  const text = result.problems.find(problem => problem.kind === 'text')
  assert.ok(text['only on desktop'].includes('Change concentration'))
})

test('the wrong platform word on a platform fails (web saying "this computer")', () => {
  const wrong = screen(['On this device'], ['Your data', platformWords('desktop').storedMeta])
  const result = compareRuns([run('web', { settings: settings('web') }), run('desktop', { settings: settings('desktop') })].map(r => r), { rules, knownFeatures: features })
  assert.equal(result.ok, true)
  const bad = compareRuns([run('web', { settings: wrong }), run('desktop', { settings: settings('desktop') })], { rules, knownFeatures: features })
  assert.equal(bad.ok, false)
})

test('a different plan fails (this is what catches local and remote storage disagreeing)', () => {
  const same = { plan: screen(['Plan']) }
  const other = run('docker', same, { plan: [{ semester: 'Semester 1', courses: ['CSC 1300'] }] })
  const result = compareRuns([run('web', same), other], { rules, knownFeatures: features })
  assert.equal(result.problems.some(problem => problem.kind === 'plan'), true)
})

test('a PDF that is not a real PDF fails on any platform', () => {
  const same = { plan: screen(['Plan']) }
  const result = compareRuns([run('web', same), run('desktop', same, { pdf: { header: '<html', pages: 0, bigEnough: false } })], { rules, knownFeatures: features })
  assert.equal(result.problems.some(problem => problem.kind === 'pdf' && problem.target === 'desktop'), true)
})

test('a screen that exists on one platform only fails, unless a rule allows it', () => {
  const base = { plan: screen(['Plan']) }
  const docker = { plan: screen(['Plan']), 'auth-signup': screen([], [], { page: ['Create account'] }) }
  assert.equal(compareRuns([run('web', base), run('docker', docker)], { rules, knownFeatures: features }).ok, true)
  const unknownScreen = { plan: screen(['Plan']), 'new-screen': screen([], ['Hello']) }
  const result = compareRuns([run('web', base), run('desktop', unknownScreen)], { rules, knownFeatures: features })
  assert.equal(result.problems.some(problem => problem.kind === 'screen' && problem.screen === 'new-screen'), true)
})

test('a rule must name a registered feature', () => {
  const same = { plan: screen(['Plan']) }
  const result = compareRuns([run('web', same)], { rules: [{ feature: 'made-up', match: 'x' }], knownFeatures: features })
  assert.equal(result.problems.some(problem => problem.kind === 'rule'), true)
})

test('presence: Sign out must be on Docker and only on Docker', () => {
  const presence = [{ feature: 'accounts', screen: 'plan', region: 'sidebar', text: '^Sign out$', presentOn: ['docker'] }]
  const ok = compareRuns([run('web', { plan: screen(['On this device']) }), run('docker', { plan: screen(['a@b.test', 'Sign out']) })], { rules, presence, knownFeatures: features })
  assert.deepEqual(ok.problems, [])
  const missing = compareRuns([run('web', { plan: screen(['On this device']) }), run('docker', { plan: screen(['a@b.test']) })], { rules, presence, knownFeatures: features })
  assert.equal(missing.problems.some(problem => problem.kind === 'presence' && problem.target === 'docker'), true)
  const leaked = compareRuns([run('web', { plan: screen(['On this device', 'Sign out']) })], { rules, presence, knownFeatures: features })
  assert.equal(leaked.problems.some(problem => problem.kind === 'presence' && problem.target === 'web'), true)
})

test('a target that is not the platform it claims fails (a mis-launched desktop run cannot pass as web)', () => {
  const same = { plan: screen(['Plan']) }
  const fake = run('web', same, { signals: { desktopBridge: true, dockerConfig: false } })
  assert.equal(compareRuns([fake], { rules, knownFeatures: features }).problems.some(problem => problem.kind === 'platform'), true)
})

test('normalizeLines also hides the volatile "Last saved" time', () => {
  assert.deepEqual(normalizeLines(['Last saved 2:45 PM'], 'web'), ['Last saved {{time}}'])
})

// The real rules, against sidebars shaped like the real ones. A rule written for the avatar initials once also matched the two-digit
// issues badge ("12"), which hid a difference; these keep that from happening again.
import fs from 'node:fs'
const real = JSON.parse(fs.readFileSync(new URL('../expected-differences.json', import.meta.url), 'utf8'))
const webSidebar = ['TENNESSEE TECH', 'Degree Planner', 'Plan', 'Issues', '12', 'Advisement', 'Settings', '··', 'On this device', 'Changes save automatically']
const dockerSidebar = ['TENNESSEE TECH', 'Degree Planner', 'Plan', 'Issues', '12', 'Advisement', 'Settings', 'PA', 'parity-1@example.test', 'Changes save automatically', 'Sign out']
const realOptions = { rules: real.rules, presence: real.presence, knownFeatures: ['accounts', 'docker-update-banner', 'desktop-update-card'] }

test('the real rules accept the real sidebars: avatar initials, the account line and Sign out are the registered account difference', () => {
  const result = compareRuns([run('web', { plan: screen(webSidebar) }), run('docker', { plan: screen(dockerSidebar) })], realOptions)
  assert.deepEqual(result.problems, [])
})

test('the real rules do NOT hide a missing issues badge (two digits are not avatar initials)', () => {
  const noBadge = dockerSidebar.filter(line => line !== '12')
  const result = compareRuns([run('web', { plan: screen(webSidebar) }), run('docker', { plan: screen(noBadge) })], realOptions)
  assert.equal(result.ok, false)
  assert.ok(result.problems.some(problem => problem.kind === 'text' && problem['only on web']?.includes('12')))
})

test('the real rules do not hide a different badge count either', () => {
  const other = dockerSidebar.map(line => (line === '12' ? '9' : line))
  assert.equal(compareRuns([run('web', { plan: screen(webSidebar) }), run('docker', { plan: screen(other) })], realOptions).ok, false)
})
