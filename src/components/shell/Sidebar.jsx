import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const TABS = [
  { id: 'plan',     label: 'Plan',       icon: '▤' },
  { id: 'issues',   label: 'Issues',     icon: '⚠' },
  { id: 'advising', label: 'Advisement', icon: '◇' },
  { id: 'settings', label: 'Settings',   icon: '◎' },
]

export default function Sidebar({ view, onNavigate, issueCount, lastSavedAt }) {
  const [email, setEmail] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? '')
    })
  }, [])

  const initials = email ? email.slice(0, 2) : '··'

  return (
    <nav className="ds-sidebar" aria-label="Main">
      <div className="ds-brand">
        <p className="ds-brand-eyebrow">Tennessee Tech</p>
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
            <div className="ds-account-name" title={email}>{email || 'Signed in'}</div>
          </div>
        </div>
        <div className="ds-account-meta">
          {lastSavedAt
            ? `Last saved ${lastSavedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
            : 'Changes save automatically'}
        </div>
        <button className="ds-signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </nav>
  )
}
