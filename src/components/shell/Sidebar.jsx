import { useEffect, useState } from 'react'
import { db, isLocalBackend } from '../../lib/dataClient'
import { getBrand } from '../../lib/brand'

const TABS = [
  { id: 'plan',     label: 'Plan',       icon: '▤' },
  { id: 'issues',   label: 'Issues',     icon: '⚠' },
  { id: 'advising', label: 'Advisement', icon: '◇' },
  { id: 'settings', label: 'Settings',   icon: '◎' },
]

export default function Sidebar({ view, onNavigate, issueCount, lastSavedAt }) {
  const [email, setEmail] = useState('')

  useEffect(() => {
    db.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? '')
    })
  }, [])

  const initials = email ? email.slice(0, 2) : '··'

  return (
    <nav className="ds-sidebar" aria-label="Main">
      <div className="ds-brand">
        <p className="ds-brand-eyebrow">{getBrand().shellEyebrow}</p>
        <h1 className="ds-brand-title">Degree Planner</h1>
      </div>

      <div className="ds-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`ds-tab${view === tab.id ? ' ds-tab-active' : ''}`}
            onClick={() => onNavigate(tab.id)}
            aria-current={view === tab.id ? 'page' : undefined}
          >
            <span className="ds-tab-icon" aria-hidden="true">{tab.icon}</span>
            <span className="ds-tab-label">{tab.label}</span>
            {tab.id === 'issues' && issueCount > 0 && (
              <span className="ds-tab-badge" aria-label={`${issueCount} issues`}>{issueCount}</span>
            )}
          </button>
        ))}
      </div>

      <div className="ds-account">
        <div className="ds-account-row">
          <div className="ds-avatar" aria-hidden="true">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="ds-account-name" title={email}>{isLocalBackend ? 'On this device' : (email || 'Signed in')}</div>
          </div>
        </div>
        <div className="ds-account-meta">
          {lastSavedAt
            ? `Last saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Changes save automatically'}
        </div>
        {/* No accounts in local mode: the plan lives in this browser, so there is nothing to sign out of. */}
        {!isLocalBackend && <button className="ds-signout" onClick={() => db.auth.signOut()}>Sign out</button>}
      </div>
    </nav>
  )
}
