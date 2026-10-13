// features.test.js
//
// A feature that is built but held back must read "Coming soon" and stay out of reach, and opening it must be one flag. The sidebar is
// rendered with the real flags (the Requirements tab is held back today) and with flags a test sets, so both states are pinned.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FEATURES, isFeatureOpen } from '../lib/features.js'
import Sidebar from '../components/shell/Sidebar'

describe('isFeatureOpen', () => {
  it('no name (a tab that is always on) is open', () => {
    expect(isFeatureOpen(undefined)).toBe(true)
    expect(isFeatureOpen(null)).toBe(true)
    expect(isFeatureOpen(undefined, { requirements: false })).toBe(true)
  })

  it('a name no flag lists stays closed, so a typo cannot open something held back', () => {
    expect(isFeatureOpen('requirments', { requirements: false })).toBe(false)
    expect(isFeatureOpen('plan', {})).toBe(false)
  })

  it('a listed flag is open only when it is exactly true', () => {
    expect(isFeatureOpen('requirements', { requirements: true })).toBe(true)
    expect(isFeatureOpen('requirements', { requirements: false })).toBe(false)
    expect(isFeatureOpen('requirements', { requirements: 'yes' })).toBe(false)
    expect(isFeatureOpen('requirements', { requirements: undefined })).toBe(false)
  })

  it('the Requirements feature is open: the tab, the degree audit and its PDF', () => {
    expect(FEATURES.requirements).toBe(true)
    expect(isFeatureOpen('requirements')).toBe(true)
  })

  it('adding a secondary major is held back until the plan tags its cards and the PDFs name every program', () => {
    expect(FEATURES.additionalPrograms).toBe(false)
    expect(isFeatureOpen('additionalPrograms')).toBe(false)
  })
})

describe('the sidebar', () => {
  const render = props => renderToStaticMarkup(<Sidebar view="plan" onNavigate={() => {}} issueCount={0} lastSavedAt={null} {...props} />)
  const tabMarkup = (html, label) => html.split('<button').find(chunk => chunk.includes(`>${label}<`))

  it('shows a closed feature tab as coming soon, greyed out, and not a button anyone can press', () => {
    const tab = tabMarkup(render({ features: { requirements: false } }), 'Requirements')
    expect(tab).toContain('ds-tab-soon')
    expect(tab).toContain('disabled')
    expect(tab).toContain('aria-disabled="true"')
    expect(tab).toContain('Coming soon')
  })

  it('the Requirements tab is an ordinary tab now that it is open', () => {
    const tab = tabMarkup(render(), 'Requirements')
    expect(tab).not.toContain('ds-tab-soon')
    expect(tab).not.toContain('disabled')
    expect(tab).not.toContain('Coming soon')
  })

  it('keeps every other tab live, in the same order', () => {
    const html = render()
    for (const label of ['Plan', 'Issues', 'Advisement', 'Settings']) {
      const tab = tabMarkup(html, label)
      expect(tab, label).not.toContain('ds-tab-soon')
      expect(tab, label).not.toContain('disabled')
    }
    const order = ['Plan', 'Requirements', 'Issues', 'Advisement', 'Settings'].map(l => html.indexOf(`>${l}<`))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('closing the flag turns the tab back into a Coming soon tag, with nothing else changed', () => {
    expect(tabMarkup(render({ features: { requirements: false } }), 'Requirements')).toContain('ds-tab-soon')
    expect(tabMarkup(render({ features: { requirements: true } }), 'Requirements')).not.toContain('ds-tab-soon')
  })
})
