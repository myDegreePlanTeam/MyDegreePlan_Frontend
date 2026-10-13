import { useEffect, useState } from 'react'
import { db, isLocalBackend } from '../../lib/dataClient'
import { getBrand } from '../../lib/brand'
import { FEATURES, isFeatureOpen } from '../../lib/features'
import { NAV_TABS } from './navTabs'
import NavIcon from './NavIcon'

// The rail on a desktop, a bottom tab bar on a phone (AppShell.css, 760 px). Four destinations (shell/navTabs.js). The Plan check list is not
// one of them: it opens from the plan, and while it is open the Plan tab stays marked.
export default function Sidebar({ view, onNavigate, lastSavedAt, features = FEATURES }) {
  const [email, setEmail] = useState('')

  useEffect(() => {
    db.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? '')
    })
  }, [])

  const current = view === 'issues' ? 'plan' : view

  return (
    <nav className="ds-sidebar" aria-label="Main">
      <div className="ds-brand">
        <p className="ds-brand-title">{getBrand().shellEyebrow}</p>
      </div>

      <div className="ds-tabs">
        {NAV_TABS.map(tab => !isFeatureOpen(tab.feature, features) ? (
          // Built, not open yet: shown so students know it is coming, but it cannot be entered.
          <button
            key={tab.id}
            className="ds-tab ds-tab-soon"
            disabled
            aria-disabled="true"
            title="Coming soon"
          >
            <NavIcon id={tab.id} />
            <span className="ds-tab-label">{tab.label}</span>
            <span className="ds-tab-soon-tag">Coming soon</span>
          </button>
        ) : (
          <button
            key={tab.id}
            className={`ds-tab${current === tab.id ? ' ds-tab-active' : ''}`}
            onClick={() => onNavigate(tab.id)}
            aria-current={current === tab.id ? 'page' : undefined}
          >
            <NavIcon id={tab.id} />
            <span className="ds-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="ds-account">
        <div className="ds-account-name" title={email}>{isLocalBackend ? 'On this device' : (email || 'Signed in')}</div>
        <div className="ds-account-meta">
          {lastSavedAt
            ? `Saved at ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Changes save automatically'}
        </div>
        {/* No accounts in local mode: the plan lives on this device, so there is nothing to sign out of. */}
        {!isLocalBackend && <button className="ds-signout" onClick={() => db.auth.signOut()}>Sign out</button>}
      </div>
    </nav>
  )
}
