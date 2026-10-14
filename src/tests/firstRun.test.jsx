// firstRun.test.jsx
//
// Redesign Phase 7: first run is four screens, and nothing is saved until the student opens the plan. A server render shows the first
// screen (no effects, no clicks); the rest is read from the source, the way the Frontend's other wording tests work.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Onboarding from '../components/Onboarding'

const path = rel => fileURLToPath(new URL(rel, import.meta.url))
const read = rel => readFileSync(path(rel), 'utf8').replace(/\r\n/g, '\n')
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('the first screen', () => {
  const html = renderToStaticMarkup(<Onboarding profileId={1} onComplete={() => {}} />)
  const t = text(html)

  it('says which step it is, in words, and asks for the major', () => {
    expect(t).toContain('Step 1 of 4')
    expect(html).toMatch(/<h2 class="fr-title">Choose your major<\/h2>/)
    expect(t).toContain('This decides your required courses and your recommended plan.')
  })

  it('has one filled button, Continue, disabled until a major is chosen', () => {
    expect(html.match(/class="fr-btn fr-btn-primary"/g)).toHaveLength(1)
    expect(html).toMatch(/<button class="fr-btn fr-btn-primary" disabled="">Continue<\/button>/)
  })

  it('offers Import a backup, and has no all-caps eyebrow', () => {
    expect(t).toContain('Import a backup')
    expect(html).not.toContain('onboarding-eyebrow')
  })
})

describe('the flow', () => {
  const src = read('../components/Onboarding.jsx')

  it('builds the plan without writing, and writes only from Open my plan', () => {
    const build = src.slice(src.indexOf('async function handleBuild()'), src.indexOf('async function saveFirstPlan()'))
    expect(build).toContain('buildFirstPlan(')
    expect(build).not.toMatch(/\.(update|insert|upsert|delete)\(/)
    const save = src.slice(src.indexOf('async function saveFirstPlan()'), src.indexOf('function handleWizardSave'))
    expect(save).toMatch(/from\('student_profiles'\)\s*\.update\(/)
    expect(save).toMatch(/from\('prior_credits'\)\s*\.insert\(/)
    expect(save).toMatch(/from\('student_plan_slots'\)\s*\.upsert\(/)
    expect(src.match(/async function saveFirstPlan\(\)/g)).toHaveLength(1)     // defined once,
    expect(src.match(/[={(]\s*saveFirstPlan\b/g)).toHaveLength(1)              // and used once: the Open my plan button
    expect(src).toMatch(/onClick=\{saveFirstPlan\}[^>]*>\s*\{loading \? 'Saving…' : 'Open my plan'\}/)
  })

  it('saves the profile before the credits, and the credits before the slots', () => {
    const save = src.slice(src.indexOf('async function saveFirstPlan()'), src.indexOf('function handleWizardSave'))
    const at = name => save.indexOf(`from('${name}')`)
    expect(at('student_profiles')).toBeLessThan(at('prior_credits'))
    expect(at('prior_credits')).toBeLessThan(at('student_plan_slots'))
  })

  it('names its four screens and their buttons', () => {
    for (const words of ['Choose your major', 'When do you start?', 'Scores and credits', 'Your plan is ready', 'Build my plan', 'Open my plan', 'Add a credit']) {
      expect(src, words).toContain(words)
    }
    for (const old of ['Build my degree plan', "I'll add these later", 'Any prior credits?', 'Test Scores', '+ Add prior credit']) {
      expect(src, old).not.toContain(old)
    }
  })

  it('says hours, never cr, and never draws an old onboarding class', () => {
    expect(src).not.toMatch(/\bcr`|\bcr</)
    expect(src).not.toMatch(/className="onboarding-/)
    expect(read('../components/ProgramPicker.jsx')).not.toMatch(/className=["{`]+(onboarding-|program-|concentration-)/)
  })
})

describe('the first-run stylesheet', () => {
  const css = read('../components/FirstRun.css')

  it('reads the redesign tokens only, with no all-caps', () => {
    expect(css).toContain('var(--c-surface)')
    expect(css).not.toMatch(/var\(--(gold|navy|navy-mid|navy-light|white|muted|bg|bg-mid|bg-light|text-muted|text|status-[a-z-]+|danger|ds-[a-z-]+)\)/)
    expect(css).not.toContain('text-transform: uppercase')
  })

  it('sets no text under 13 px and gives every control 44 px', () => {
    for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
    for (const cls of ['fr-btn', 'fr-chip', 'fr-link', 'fr-conc']) expect(css, cls).toMatch(new RegExp(`[.]${cls} [{][^}]*min-height: var[(]--target[)]`))
    expect(css).toMatch(/[.]fr-input, [.]fr-select [{]\s*min-height: var[(]--target[)]/)
    expect(css).toMatch(/[.]fr-major [{][^}]*min-height: 56px/)
  })

  it('stacks the actions on a phone, the main one on top', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 760px)'))
    expect(phone).toMatch(/[.]fr-actions [{] flex-direction: column-reverse;/)
  })

  it('replaces the old picker stylesheet', () => {
    expect(existsSync(path('../components/ProgramPicker.css'))).toBe(false)
  })
})
