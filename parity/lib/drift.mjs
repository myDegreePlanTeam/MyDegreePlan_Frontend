// drift.mjs: has a user-facing change on the Frontend's main reached every platform? Pure (no network), so it is unit tested
// (parity/test/drift.test.mjs); parity/watch.mjs gathers the inputs from GitHub.
//
// The three platforms run one bundle but are DEPLOYED differently: Vercel redeploys on every merge to main, while the Windows app
// and the Docker install only change when someone cuts a release. So the web build is expected to equal main, and the other two
// may lag, but not for long: a student on an old release is a student missing a fix. A platform is STALE when main holds a
// user-facing change (anything but tests, docs and tooling) that is older than its allowed lag and has not reached it.

export const DAY = 24 * 60 * 60 * 1000

// What a student can feel. Tests, docs, CI and this tooling do not count.
export const USER_FACING = /^(src\/(?!tests\/|lib\/__tests__\/)|public\/|index\.html$|vite\.config\.js$|package(-lock)?\.json$)/

export const DEFAULT_LIMITS = { web: 1, desktop: 7, docker: 7 }   // days a user-facing change may wait

/**
 * @param {{ sha: string }} main
 * @param {Array<{ name: string, label?: string, version?: string|null, commit: string|null, note?: string,
 *                 behind?: { aheadBy: number, files: string[], firstCommitDate: string }|null }>} platforms
 *        `behind` is GitHub's compare of the platform's commit with main (null when the commit is main, or unknown)
 */
export function assessDrift({ main, platforms, now = Date.now(), limits = DEFAULT_LIMITS }) {
  const rows = platforms.map(platform => {
    const base = { name: platform.name, label: platform.label ?? platform.name, version: platform.version ?? null, commit: platform.commit, note: platform.note ?? '' }
    if (!platform.commit) return { ...base, status: 'unknown', detail: platform.note || 'this platform does not record which Frontend commit it was built from' }
    const note = platform.note ? ` (${platform.note})` : ''
    if (platform.commit === main.sha) return { ...base, status: 'in sync', detail: `running the latest commit${note}` }
    if (!platform.behind) return { ...base, status: 'unknown', detail: `could not compare with main${note}` }
    const userFiles = platform.behind.files.filter(file => USER_FACING.test(file))
    if (userFiles.length === 0) return { ...base, status: 'behind, nothing user-facing', detail: `${platform.behind.aheadBy} commit(s) behind main; none change what a student sees${note}` }
    const days = (now - new Date(platform.behind.firstCommitDate).getTime()) / DAY
    const limit = limits[platform.name] ?? 7
    const detail = `${platform.behind.aheadBy} commit(s) behind main; ${userFiles.length} user-facing file(s) changed; the oldest change has waited ${days.toFixed(1)} day(s) (limit ${limit})${note}`
    return { ...base, status: days > limit ? 'STALE' : 'behind (within limit)', detail, waitedDays: days, limitDays: limit, userFiles }
  })
  return { ok: rows.every(row => row.status !== 'STALE'), rows }
}

export function formatDrift(result, main) {
  const icon = { 'in sync': 'OK', 'behind, nothing user-facing': 'OK', 'behind (within limit)': 'WAIT', unknown: '??', STALE: 'STALE' }
  const lines = [`# Platform drift: ${result.ok ? 'OK' : 'STALE'}`, '', `Frontend main is ${main.sha.slice(0, 7)}.`, '', '| Platform | Version | Frontend commit | Status | Detail |', '|---|---|---|---|---|']
  for (const row of result.rows) {
    lines.push(`| ${row.label} | ${row.version ?? '-'} | ${row.commit ? row.commit.slice(0, 7) : '-'} | ${icon[row.status] ?? row.status} ${row.status} | ${row.detail} |`)
  }
  const stale = result.rows.filter(row => row.status === 'STALE')
  if (stale.length) {
    lines.push('', 'A user-facing change on main has not reached these platforms in time. Cut a release (or fix the failed deploy) for:', ...stale.map(row => `- ${row.label}`))
  }
  return lines.join('\n')
}
