// scenario.mjs: the one student journey every platform must complete the same way. It drives the real UI (no test hooks) and
// records a "fingerprint" of each screen: the visible text of the sidebar, the main area and any open dialog, plus a few facts
// (the plan's courses per semester, whether the PDF preview produced a real PDF).
//
// The scenario is fixed on purpose (CSC Cybersecurity, first semester Fall 2026, ACT Math 29) so the same plan is built everywhere.
// The Docker install gets one extra first step: creating an account (it has logins, the others do not).

const STEP_TIMEOUT = 30_000

// Reads one region's visible text as trimmed non-empty lines.
const READ_LINES = `(selector) => {
  const el = document.querySelector(selector)
  return el ? el.innerText.split('\\n').map(s => s.replace(/\\s+/g, ' ').trim()).filter(Boolean) : []
}`

export async function runScenario(target, { log = () => {} } = {}) {
  const { page } = target
  const screens = {}
  const facts = {}

  const readLines = selector => page.evaluate(`(${READ_LINES})(${JSON.stringify(selector)})`)

  // Wait until the app has finished loading what it shows. Web and desktop read their data from the same machine and are done at
  // once; the Docker install fetches it over the network, and a screen read too early is its loading skeleton (an empty plan, no
  // account block, "?" where a course name goes). So: the network is quiet and no loading placeholder or "Loading..." text is left.
  async function settle() {
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.locator('.sk-pulse').first().waitFor({ state: 'detached', timeout: STEP_TIMEOUT }).catch(() => {})
    await page.getByText(/^Loading/).first().waitFor({ state: 'detached', timeout: STEP_TIMEOUT }).catch(() => {})
    await page.waitForTimeout(300)
  }

  async function grab(name, extra = {}) {
    await settle()
    // The shell (sidebar + main) exists once a plan is built; before that (onboarding, sign-in) the whole page is the screen.
    const hasShell = await page.locator('.ds-sidebar').count()
    screens[name] = {
      sidebar: hasShell ? await readLines('.ds-sidebar') : [],
      main: hasShell ? await readLines('.ds-main') : [],
      modal: await readLines('.ds-modal, .modal-backdrop'),   // Settings dialogs are .ds-modal; the prior-credit wizard is .modal-backdrop
      page: hasShell ? [] : await readLines('body'),
      ...extra,
    }
    log(`  captured ${name}`)
  }
  const button = (name, opts = {}) => page.getByRole('button', { name, ...opts })

  // ── which platform is this really? (so a mis-launched target cannot pass as another) ──
  facts.signals = await page.evaluate(() => ({
    desktopBridge: !!window.mdpDesktop?.isDesktop,
    dockerConfig: !!window.__MDP_CONFIG__,
    origin: location.origin.replace(/:\d+$/, ':PORT'),
  }))

  // ── Docker only: an account (the other platforms have one implicit user) ──
  if (target.name === 'docker') {
    await page.goto(new URL('/signup', page.url()).href)
    await page.waitForSelector('input[type=email]', { timeout: STEP_TIMEOUT })
    await grab('auth-signup')
    const email = `parity-${Date.now()}@example.test`
    await page.locator('input[type=email]').fill(email)
    await page.locator('input[type=password]').nth(0).fill('parity-password-1')
    await page.locator('input[type=password]').nth(1).fill('parity-password-1')
    await button('Create account').click()
  }

  // ── Onboarding ──
  await page.waitForSelector('input[type=search]', { timeout: STEP_TIMEOUT })
  await grab('onboarding-1-program')
  await page.locator('input[type=search]').fill('Cybersecurity')
  await page.locator('.concentration-card', { hasText: 'CSC Cybersecurity' }).first().click()
  await button('Continue').click()

  await page.getByText('When do you start?').waitFor({ timeout: STEP_TIMEOUT })
  await grab('onboarding-2-start-term')
  await page.locator('select.onboarding-select').nth(0).selectOption('2026')
  await page.locator('select.onboarding-select').nth(1).selectOption('Fall')
  await button('Continue').click()

  await page.getByText('Test Scores').first().waitFor({ timeout: STEP_TIMEOUT })
  await grab('onboarding-3-scores')
  await page.locator('input.onboarding-input').nth(0).fill('29')
  await button('Continue').click()

  // The math step appears only for plans with Calculus I (CSC has it).
  const mathStep = page.getByText('Your Math Sequence').first()
  if (await mathStep.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
    await grab('onboarding-4-math')
    await button('Continue').click()
  }

  await page.getByText('Any prior credits?').first().waitFor({ timeout: STEP_TIMEOUT })
  await grab('onboarding-5-prior-credit')
  await button('Build my degree plan').click()

  // ── The plan ──
  await page.waitForSelector('.ds-sem', { timeout: 60_000 })
  // `.ds-sem` also matches the loading skeleton's placeholders: the real plan is there once its heading is.
  await page.getByText('Four-Year Plan').first().waitFor({ timeout: 60_000 })
  await grab('plan')
  facts.plan = await page.evaluate(() => [...document.querySelectorAll('.ds-sem')].map(el => {
    const lines = el.innerText.split('\n').map(s => s.trim()).filter(Boolean)
    return { semester: lines[0], courses: [...new Set(el.innerText.match(/\b[A-Z]{2,5} ?\d{4}[A-Z]?\b/g) ?? [])] }
  }))

  const openTab = async name => { await page.locator('.ds-tab', { hasText: name }).click(); await page.waitForTimeout(400) }

  await openTab('Issues')
  await grab('issues')

  // ── Advisement: the PDF preview must produce a real PDF on every platform ──
  await openTab('Advisement')
  const frame = page.locator('iframe.ds-pdf-iframe')
  await frame.waitFor({ timeout: 90_000 })
  await page.waitForTimeout(3_000)
  facts.pdf = await page.evaluate(async () => {
    const src = document.querySelector('iframe.ds-pdf-iframe')?.getAttribute('src')
    if (!src) return { error: 'no preview iframe' }
    const bytes = new Uint8Array(await (await fetch(src.split('#')[0])).arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    return { header: text.slice(0, 5), pages: (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length, bigEnough: bytes.length > 5_000 }
  })
  await grab('advisement')

  // ── Settings and its dialogs ──
  await openTab('Settings')
  await grab('settings')

  // Found by its button, not its label, so a wording difference shows up as a difference instead of breaking the run.
  await page.locator('.ds-setting').filter({ has: page.getByRole('button', { name: 'Change', exact: true }) }).getByRole('button', { name: 'Change', exact: true }).click()
  await page.locator('.ds-modal').waitFor({ timeout: STEP_TIMEOUT })
  await page.getByText('Loading programs').waitFor({ state: 'detached', timeout: STEP_TIMEOUT }).catch(() => {})
  await grab('settings-change-degree-program')
  await button('Cancel').click()

  await page.locator('.ds-danger-card', { hasText: 'Reset plan' }).getByRole('button', { name: 'Reset plan' }).click()
  await page.locator('.ds-modal').waitFor({ timeout: STEP_TIMEOUT })
  await grab('settings-reset-plan')
  await button('Cancel').click()

  // ── Prior credit wizard ──
  await openTab('Plan')
  await page.locator('.ds-prior-head').click()      // the panel starts collapsed
  await page.locator('.ds-prior-add').waitFor({ timeout: STEP_TIMEOUT })
  await grab('prior-coursework-panel')
  await page.locator('.ds-prior-add').click()
  await page.locator('.modal-backdrop').waitFor({ timeout: STEP_TIMEOUT })
  await page.waitForTimeout(800)
  await grab('prior-credit-wizard')

  return { target: target.name, facts, screens }
}
