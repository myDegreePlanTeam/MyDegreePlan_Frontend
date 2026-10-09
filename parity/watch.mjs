// watch.mjs: the drift watchdog. Asks GitHub which Frontend commit each platform is running and fails when a user-facing change on
// main has waited too long to reach one (see lib/drift.mjs for the rules). Needs no checkout and no secrets: only public repos.
//
//   node parity/watch.mjs                 prints the report; exit 1 when a platform is STALE
//   node parity/watch.mjs --json out.json also writes the data
//
// Where each platform records its Frontend commit:
//   web      Vercel's latest successful Production deployment (GitHub deployments API)
//   desktop  build.json attached to the newest MyDegreePlan_Desktop release (older releases: inferred from the release time)
//   docker   sources.frontend in release.json of the newest MyDegreePlan_Deploy release
import fs from 'node:fs'
import { assessDrift, formatDrift } from './lib/drift.mjs'

const ORG = process.env.MDP_ORG ?? 'myDegreePlanTeam'
const FRONTEND = `${ORG}/MyDegreePlan_Frontend`
const DESKTOP = `${ORG}/MyDegreePlan_Desktop`
const DEPLOY = `${ORG}/MyDegreePlan_Deploy`
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'mydegreeplan-parity', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }

const api = async path => {
  const res = await fetch(`https://api.github.com/${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`)
  return res.json()
}
const json = async url => { const res = await fetch(url, { headers: { 'User-Agent': 'mydegreeplan-parity' } }); if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`); return res.json() }

const attempt = async (label, fn) => { try { return await fn() } catch (error) { return { error: `${label}: ${error.message}` } } }

async function webPlatform() {
  const deployments = await api(`repos/${FRONTEND}/deployments?environment=Production&per_page=10`)
  for (const deployment of deployments) {
    const [status] = await api(`repos/${FRONTEND}/deployments/${deployment.id}/statuses?per_page=1`)
    if (status?.state === 'success') return { name: 'web', label: 'Web (Vercel)', version: null, commit: deployment.sha, note: `deployed ${deployment.created_at.slice(0, 10)}` }
  }
  return { name: 'web', label: 'Web (Vercel)', commit: null, note: 'no successful Production deployment found' }
}

async function desktopPlatform() {
  const release = await api(`repos/${DESKTOP}/releases/latest`)
  const asset = release.assets.find(a => a.name === 'build.json')
  if (asset) {
    const build = await json(asset.browser_download_url)
    return { name: 'desktop', label: 'Windows app', version: release.tag_name.replace(/^v/, ''), commit: build.frontend, note: `released ${release.published_at.slice(0, 10)}` }
  }
  // Releases before build.json existed: the release workflow builds Frontend main at that moment, so main's tip at the release time is the build.
  const [tip] = await api(`repos/${FRONTEND}/commits?sha=main&until=${encodeURIComponent(release.published_at)}&per_page=1`)
  return { name: 'desktop', label: 'Windows app', version: release.tag_name.replace(/^v/, ''), commit: tip?.sha ?? null, note: 'inferred from the release time: this release has no build.json' }
}

async function dockerPlatform() {
  const release = await api(`repos/${DEPLOY}/releases/latest`)
  const asset = release.assets.find(a => a.name === 'release.json')
  if (!asset) return { name: 'docker', label: 'Docker install', version: release.tag_name.replace(/^v/, ''), commit: null, note: 'the release has no release.json' }
  const manifest = await json(asset.browser_download_url)
  return { name: 'docker', label: 'Docker install', version: manifest.version, commit: manifest.sources?.frontend ?? null, note: `released ${release.published_at.slice(0, 10)}` }
}

const main = await (async () => { const c = await api(`repos/${FRONTEND}/commits/main`); return { sha: c.sha, date: c.commit.committer.date } })()
const gathered = await Promise.all([attempt('web', webPlatform), attempt('desktop', desktopPlatform), attempt('docker', dockerPlatform)])

const platforms = []
for (const [i, platform] of gathered.entries()) {
  const name = ['web', 'desktop', 'docker'][i]
  if (platform.error) { platforms.push({ name, commit: null, note: platform.error }); continue }
  if (platform.commit && platform.commit !== main.sha) {
    try {
      const diff = await api(`repos/${FRONTEND}/compare/${platform.commit}...main`)
      // A very large diff comes back truncated: treat it as user-facing rather than hide it.
      const files = diff.files.length >= 300 ? [...diff.files.map(f => f.filename), 'src/(more than 300 files changed)'] : diff.files.map(f => f.filename)
      platform.behind = { aheadBy: diff.ahead_by, files, firstCommitDate: diff.commits[0].commit.committer.date }
    } catch (error) { platform.note = `${platform.note ?? ''} compare failed: ${error.message}`.trim() }
  }
  platforms.push(platform)
}

const result = assessDrift({ main, platforms })
const report = formatDrift(result, main)
console.log(report)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
const outIndex = process.argv.indexOf('--json')
if (outIndex >= 0) fs.writeFileSync(process.argv[outIndex + 1], JSON.stringify({ main, ...result }, null, 2))
process.exit(result.ok ? 0 : 1)
