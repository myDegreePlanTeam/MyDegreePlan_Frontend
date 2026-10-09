// run.mjs: the cross-platform conformance run. Drives the same student journey through the real UI on each platform and fails if
// they differ in a way the registries do not allow.
//
//   node parity/run.mjs                              web + desktop (what a developer machine can run)
//   node parity/run.mjs --targets web,desktop,docker docker needs MDP_DOCKER_URL (CI starts the stack)
//   node parity/run.mjs --out parity/out
//   node parity/run.mjs --dist <folder>              check another build of the app (the default is this checkout's dist/)
//
// Needs a fresh build first (npm run build): web and desktop serve dist/. The desktop target needs the MyDegreePlan_Desktop checkout
// with its npm install done (MDP_DESKTOP_DIR, default ../MyDegreePlan_Desktop). Exit code 0 = in sync, 1 = they differ, 2 = could not run.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAUNCHERS } from './lib/targets.mjs'
import { runScenario } from './lib/scenario.mjs'
import { compareRuns, formatReport } from './lib/compare.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback }

const targets = arg('targets', 'web,desktop').split(',').map(s => s.trim()).filter(Boolean)
const outDir = path.resolve(arg('out', path.join(here, 'out')))
const distDir = path.resolve(arg('dist', path.join(root, 'dist')))   // --dist <folder>: check another build, e.g. an older release
const desktopDir = path.resolve(process.env.MDP_DESKTOP_DIR ?? path.join(root, '..', 'MyDegreePlan_Desktop'))

const unknown = targets.filter(t => !(t in LAUNCHERS))
if (unknown.length) { console.error(`unknown target(s): ${unknown.join(', ')} (known: ${Object.keys(LAUNCHERS).join(', ')})`); process.exit(2) }
if (!fs.existsSync(path.join(distDir, 'index.html'))) { console.error('No build found. Run "npm run build" in the Frontend first.'); process.exit(2) }
if (targets.includes('desktop') && !fs.existsSync(path.join(desktopDir, 'node_modules', 'electron'))) {
  console.error(`The desktop target needs ${desktopDir} with "npm install" done (set MDP_DESKTOP_DIR).`); process.exit(2)
}

fs.mkdirSync(outDir, { recursive: true })
const registry = JSON.parse(fs.readFileSync(path.join(here, 'platform-branches.json'), 'utf8'))
const expected = JSON.parse(fs.readFileSync(path.join(here, 'expected-differences.json'), 'utf8'))

const runs = []
for (const name of targets) {
  console.log(`\n== ${name}`)
  let target
  try {
    target = await LAUNCHERS[name]({ distDir, desktopDir, url: process.env.MDP_DOCKER_URL })
    const run = await runScenario(target, { log: console.log })
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(run, null, 2))
    runs.push(run)
  } catch (error) {
    console.error(`\n${name}: the scenario could not finish: ${error.message}`)
    if (target) await target.page.screenshot({ path: path.join(outDir, `${name}-failure.png`) }).catch(() => {})
    process.exitCode = 2
    break
  } finally {
    await target?.close().catch(() => {})
  }
}
if (process.exitCode === 2) process.exit(2)

const result = compareRuns(runs, { rules: expected.rules, presence: expected.presence, knownFeatures: Object.keys(registry.features) })
const report = formatReport(result, runs)
fs.writeFileSync(path.join(outDir, 'report.md'), report + '\n')
console.log('\n' + report)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
process.exit(result.ok ? 0 : 1)
