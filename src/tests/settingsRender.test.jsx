// settingsRender.test.jsx
//
// Redesign Phase 5: Settings as titled cards. Your major(s), Try before you add, Test scores, Appearance (three ways), Your data, and
// Start over, where Reset plan and Erase are kept apart and worded differently. A server render (no effects, no clicks).

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import SettingsView, { AppearanceCard } from '../components/shell/SettingsView'
import { platformWords, PLATFORMS } from '../lib/platform'
import { PREFERENCES } from '../lib/theme'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const profile = {
  id: 1, concentration_id: 2, start_season: 'Fall', start_year: 2026, catalog_year: '2026-2027', gened_program: 'flight_foundations',
  act_math: 29, act_english: null, act_science: null, act_reading: null, act_composite: null, sat_math: null,
  concentrations: { id: 2, code: 'cybersecurity', name: 'CSC Cybersecurity', major_name: 'Computer Science', degree: 'B.S.', total_hours: 120 },
}
const render = props => renderToStaticMarkup(
  <SettingsView
    profile={profile} themePreference="system" onChooseTheme={() => {}} onOpenConcentration={() => {}} onOpenReset={() => {}} onActSaved={() => {}}
    additionalProgramsOpen onOpenAddProgram={() => {}} onRemoveProgram={() => {}} onMakePrimary={() => {}} {...props}
  />
)

describe('Settings', () => {
  const html = render({})
  const t = text(html)

  it('is a titled page of sections, in order, with no all-caps eyebrow', () => {
    expect(html).toMatch(/<h2 class="ds-h2 ds-page-title">Settings<\/h2>/)
    const titles = [...html.matchAll(/<h3 class="ds-scard-title"[^>]*>([^<]+)</g)].map(m => m[1])
    expect(titles).toEqual(['Your major', 'Test scores', 'Appearance', 'Your data', 'Start over'])
    expect(html).not.toContain('ds-eyebrow')
  })

  it('says Your majors only when there really are several', () => {
    const two = render({ addedPrograms: [{ id: 9, programId: 5, name: 'Mechanical Engineering', role: 'major', catalogYear: '2026-2027' }] })
    expect(text(two)).toContain('Your majors')
    expect(text(two)).toContain('Make primary')
    expect(two).toContain('aria-label="Make Mechanical Engineering your primary major"')
  })

  it('keeps Change beside Add major, and offers a minor', () => {
    expect(t).toMatch(/Change\s+Add major/)
    expect(t).toContain('Add minor')
  })

  it('offers three ways to choose the colours, as radios', () => {
    expect(html.match(/name="ds-theme"/g)).toHaveLength(3)
    expect(t).toContain('Match my device')
    expect(t).not.toContain('Light mode')
  })

  it('keeps Reset plan and Erase apart: one rebuilds, one deletes, and only Erase is the danger button', () => {
    const startOver = html.slice(html.indexOf('id="set-startover"'))
    expect(text(startOver)).toContain('Rebuilds your semesters from the default plan')
    expect(text(startOver)).toContain('This cannot be undone unless you exported a backup.')
    expect(startOver.match(/class="ds-btn-danger"/g)).toHaveLength(1)
    expect(startOver).toMatch(/<button class="ds-btn-ghost">Reset plan<\/button>/)
    expect(startOver.indexOf('Reset plan')).toBeLessThan(startOver.indexOf('ds-danger-card-erase'))
  })

  it('names the backup buttons by what they do', () => {
    expect(t).toContain('Export a backup')
    expect(t).toContain('Import a backup')
  })

  it('uses no inline colour and no old gold', () => {
    expect(html).not.toContain('var(--gold)')
    expect(html).not.toContain('var(--danger)')
  })
})

describe('AppearanceCard', () => {
  it('checks the stored preference, one of the three lib/theme.js knows', () => {
    for (const preference of PREFERENCES) {
      const html = renderToStaticMarkup(<AppearanceCard preference={preference} onChoose={() => {}} />)
      expect(html.match(/checked=""/g)).toHaveLength(1)
      expect(html).toMatch(new RegExp(`<input[^>]*(value="${preference}"[^>]*checked=""|checked=""[^>]*value="${preference}")`))
    }
  })
})

describe('platform words', () => {
  it('has an erase button label on every platform', () => {
    for (const platform of PLATFORMS) expect(platformWords(platform).eraseButton).toMatch(/^Erase /)
    expect(platformWords('docker').eraseButton).toBe('Erase my plan')
  })
})

describe('the Settings stylesheet', () => {
  const css = read('../components/shell/AppShell.css')
  const block = css.slice(css.indexOf('/* -- Settings (redesign Phase 5)'))

  it('reads the redesign tokens only, with no all-caps', () => {
    expect(block).toContain('var(--c-surface)')
    expect(block).not.toMatch(/var\(--(gold|navy|bg|bg-mid|bg-light|text-muted|text|status-[a-z-]+|danger|ds-[a-z-]+)\)/)
    expect(block).not.toContain('text-transform: uppercase')
  })

  it('sets no text under 13 px and gives every control 44 px', () => {
    for (const m of block.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(13)
    expect(block).toMatch(/\.ds-settings \.ds-btn-primary, \.ds-settings \.ds-btn-ghost, \.ds-settings \.ds-btn-danger \{\s*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-seg-option \{[^}]*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-select \{\s*min-height: var\(--target\)/)
    expect(block).toMatch(/\.ds-settings \.ds-act-input \{[^}]*min-height: var\(--target\)/)
  })

  it('is two columns, and one on a narrow screen', () => {
    expect(block).toMatch(/\.ds-settings-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
    expect(block).toMatch(/@media \(max-width: 900px\) \{\s*\.ds-settings-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/)
  })
})

describe('the plan view passes the stored theme preference', () => {
  it('reads it once and stores a new choice through lib/theme.js', () => {
    const src = read('../components/DegreePlan.jsx')
    expect(src).toContain('themePreference={themePreference}')
    expect(src).toMatch(/function chooseTheme\(preference\) \{\s*setThemePreference\(preference\)\s*setPreference\(preference\)/)
    expect(src).not.toContain('onToggleTheme')
  })
})
