// targets.mjs: starts the app on each platform and hands back a Playwright page, so one scenario can drive all three.
//
//   web      the Frontend's dist/ served by a tiny static server (as Vercel serves it), in Chromium
//   desktop  the Windows app (MyDegreePlan_Desktop) in Electron, loading the same dist/ (Playwright drives Electron too)
//   docker   an already-running Docker install, at MDP_DOCKER_URL (in CI the workflow starts the stack; locally it is never started
//            by this runner: a developer machine may hold a real install)
//
// Every launch gets its own throwaway profile, so a run can never touch a real plan.
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { chromium, _electron as electron } from 'playwright'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }

function startStaticServer(root) {
  const base = path.resolve(root)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let file = path.resolve(base, '.' + decodeURIComponent(url.pathname))
    if (!file.startsWith(base) || !path.extname(file)) file = path.join(base, 'index.html')   // SPA fallback, like vercel.json
    let body
    try { body = fs.readFileSync(file) } catch { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)))
}

const tempProfile = prefix => fs.mkdtempSync(path.join(os.tmpdir(), `mdp-parity-${prefix}-`))

export async function launchWeb({ distDir }) {
  const server = await startStaticServer(distDir)
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  return { name: 'web', page, close: async () => { await browser.close(); server.close() } }
}

export async function launchDesktop({ desktopDir, distDir }) {
  const profile = tempProfile('desktop')
  // The Desktop repo's own electron binary (its node_modules), so no second copy is installed here.
  const electronPath = createRequire(path.join(desktopDir, 'package.json'))('electron')
  const app = await electron.launch({
    executablePath: electronPath,
    // On a Linux CI runner Electron's own process sandbox needs a setuid helper that is not installed; this is only the test launch.
    args: [desktopDir, ...(process.platform === 'linux' ? ['--no-sandbox'] : []), `--user-data-dir=${profile}`],
    env: { ...process.env, MDP_WEB_ROOT: path.resolve(distDir) },
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
  await page.waitForLoadState('domcontentloaded')
  return { name: 'desktop', page, close: async () => { await app.close().catch(() => {}); fs.rmSync(profile, { recursive: true, force: true }) } }
}

export async function launchDocker({ url }) {
  if (!url) throw new Error('docker target needs MDP_DOCKER_URL (a running Docker install, e.g. http://localhost:8080)')
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto(url)
  return { name: 'docker', page, close: async () => { await browser.close() } }
}

export const LAUNCHERS = { web: launchWeb, desktop: launchDesktop, docker: launchDocker }
