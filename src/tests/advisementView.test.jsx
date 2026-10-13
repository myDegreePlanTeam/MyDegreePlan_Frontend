// advisementView.test.jsx
//
// The Advising tab offers two documents, each its own PDF: the Degree Map and the Degree Audit. While the audit is held back it is listed
// as coming soon and cannot be chosen; when it is open it is a second choice beside the map, and only the chosen one is shown.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AdvisementView from '../components/shell/AdvisementView'

const map = { id: 'map', label: 'Degree map', exportButton: <button>Export map</button>, preview: <div>map preview</div> }
const audit = { id: 'audit', label: 'Degree audit', exportButton: <button>Export audit</button>, preview: <div>audit preview</div> }
const render = documents => renderToStaticMarkup(<AdvisementView concentrationName="CSC Core" documents={documents} />)

describe('AdvisementView', () => {
  it('with only the map, shows the map and no picker', () => {
    const html = render([map])
    expect(html).toContain('map preview')
    expect(html).toContain('Export map')
    expect(html).not.toContain('ds-adv-docs')
  })

  it('lists a held-back audit as coming soon, disabled, and still shows the map', () => {
    const html = render([map, { id: 'audit', label: 'Degree audit', soon: true }])
    expect(html).toContain('map preview')
    expect(html).toContain('Coming soon')
    expect(html).toMatch(/<button[^>]*ds-adv-doc-soon[^>]*disabled/)
    expect(html).not.toContain('audit preview')
  })

  it('with both open, offers a choice and shows the first one', () => {
    const html = render([map, audit])
    expect(html).toContain('ds-adv-docs')
    expect(html).toContain('Degree map')
    expect(html).toContain('Degree audit')
    expect(html).toContain('map preview')
    expect(html).not.toContain('audit preview')
    expect(html).not.toContain('Coming soon')
  })

  it('never makes a held-back document the one shown, even if it comes first', () => {
    const html = render([{ id: 'audit', label: 'Degree audit', soon: true }, map])
    expect(html).toContain('map preview')
  })
})
