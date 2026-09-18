import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import {
  ACT_FIELDS, validateActScore, describeActScore, saveActScoresAndRebuild,
} from '../../lib/actScores'

export default function SettingsView({
  profile,
  theme,
  onToggleTheme,
  onOpenConcentration,
  onOpenReset,
  onActSaved,
}) {
  return (
    <div className="ds-view ds-settings">
      <p className="ds-eyebrow">Preferences</p>
      <h2 className="ds-h2" style={{ marginBottom: 24 }}>Settings</h2>

      <div className="ds-card">
        <button className="ds-setting" onClick={onToggleTheme} role="switch" aria-checked={theme === 'light'}>
          <span className="ds-setting-text">
            <span className="ds-setting-label">Light mode</span>
            <span className="ds-setting-desc">Lavender low-glare theme. Remembered on this device.</span>
          </span>
          <span className={`ds-toggle${theme === 'light' ? ' ds-toggle-on' : ''}`} aria-hidden="true">
            <span className="ds-toggle-knob" />
          </span>
        </button>
        <div className="ds-setting">
          <span className="ds-setting-text">
            <span className="ds-setting-label">Concentration</span>
            <span className="ds-setting-desc">
              Currently {profile.concentrations.name}. Switching clears your course selections; prior credits and ACT scores are kept.
            </span>
          </span>
          <button className="ds-btn-ghost" style={{ minHeight: 36, color: 'var(--gold)' }} onClick={onOpenConcentration}>
            Change
          </button>
        </div>
      </div>

      <ActScoresCard
        key={ACT_FIELDS.map(({ key }) => profile[key] ?? '').join('|')}
        profile={profile}
        onSaved={onActSaved}
      />

      <div className="ds-danger-card">
        <span className="ds-setting-text">
          <span className="ds-setting-label">Reset plan</span>
          <span className="ds-setting-desc">
            Clears your course selections, added courses, and semester notes, then rebuilds the default sequence. Prior credits and ACT scores are kept.
          </span>
        </span>
        <button className="ds-btn-danger" onClick={onOpenReset}>Reset plan</button>
      </div>
    </div>
  )
}

// ── ActScoresCard ─────────────────────────────────────────────────────────────
// Replaces the old /settings page. Saving re-places the plan around the new
// math placement and English credit (see lib/actScores.js).

function scoresFromProfile(profile) {
  const out = {}
  for (const { key } of ACT_FIELDS) out[key] = profile[key] ?? ''
  return out
}

function ActScoresCard({ profile, onSaved }) {
  // Remounted (keyed on the scores) whenever the saved profile changes.
  const [saved]             = useState(() => scoresFromProfile(profile))
  const [draft,  setDraft]  = useState(() => scoresFromProfile(profile))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const dirty = ACT_FIELDS.some(({ key }) => String(draft[key]) !== String(saved[key]))

  async function handleSave() {
    const errs = {}
    for (const { key } of ACT_FIELDS) {
      const err = validateActScore(draft[key])
      if (err) errs[key] = err
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const numScores = {}
    for (const { key } of ACT_FIELDS) numScores[key] = Number(draft[key])

    setSaving(true)
    setError(null)
    const err = await saveActScoresAndRebuild(profile, numScores)
    setSaving(false)
    if (err) { setError(err); return }
    onSaved(numScores)
  }

  const status = error
    ? { text: error, cls: 'ds-act-status-error' }
    : saving
      ? { text: 'Saving and recalculating your plan…', cls: '' }
      : dirty
        ? { text: 'Unsaved changes — placement is not updated until you save.', cls: 'ds-act-status-dirty' }
        : { text: 'Saved. Placement and credit reflect these scores.', cls: '' }

  return (
    <>
      <div className="ds-section-head">
        <p className="ds-eyebrow">ACT scores</p>
        <p className="ds-section-meta">Used for math placement and English credit</p>
      </div>
      <div className="ds-card ds-act">
        {ACT_FIELDS.map(({ key, label }) => (
          <div key={key} className="ds-act-row">
            <label className="ds-act-label" htmlFor={`act-${key}`}>{label}</label>
            <span className={`ds-act-note${errors[key] ? ' ds-act-note-error' : ''}`}>
              {errors[key] ?? describeActScore(key, draft[key])}
            </span>
            <input
              id={`act-${key}`}
              type="number"
              min={1}
              max={36}
              placeholder="—"
              className={[
                'ds-act-input',
                key === 'act_composite' && 'ds-act-input-composite',
                errors[key] && 'ds-act-input-error',
              ].filter(Boolean).join(' ')}
              value={draft[key]}
              disabled={saving}
              onKeyDown={e => { if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault() }}
              onChange={e => {
                setDraft(prev => ({ ...prev, [key]: e.target.value }))
                if (errors[key]) setErrors(prev => ({ ...prev, [key]: null }))
              }}
            />
          </div>
        ))}
        <div className="ds-act-foot">
          <span className={`ds-act-status ${status.cls}`}>{status.text}</span>
          {dirty && !saving && (
            <button
              className="ds-btn-ghost"
              onClick={() => { setDraft(saved); setErrors({}); setError(null) }}
            >
              Discard
            </button>
          )}
          <button className="ds-btn-primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save scores'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── ConcentrationModal ────────────────────────────────────────────────────────

export function ConcentrationModal({ currentId, onSwitch, onClose, switching }) {
  const [concentrations, setConcentrations] = useState([])
  const [selected, setSelected]             = useState(null)
  const [loading, setLoading]               = useState(true)
  const [fetchError, setFetchError]         = useState(null)

  useEffect(() => {
    supabase
      .from('concentrations')
      .select('id, code, name, total_hours')
      .order('id', { ascending: true })
      .then(({ data, error }) => {
        if (error) { setFetchError(error.message); setLoading(false); return }
        setConcentrations(data)
        setSelected(data.find(c => c.id === currentId) ?? null)
        setLoading(false)
      })
  }, [currentId])

  const isDifferent = selected && selected.id !== currentId

  return (
    <div className="ds-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !switching) onClose() }}>
      <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="conc-title">
        <div className="ds-modal-head">
          <p className="ds-eyebrow">B.S. Computer Science</p>
          <h3 className="ds-modal-title" id="conc-title">Change concentration</h3>
          <p className="ds-sub" style={{ fontSize: 11, lineHeight: 1.6 }}>
            Prior credits and placement scores carry over. The plan is rebuilt for the new requirements.
          </p>
        </div>
        <div className="ds-modal-body">
          {loading ? (
            <p className="ds-modal-text">Loading concentrations…</p>
          ) : fetchError ? (
            <p className="ds-modal-text" style={{ color: 'var(--danger)' }}>{fetchError}</p>
          ) : concentrations.map(c => (
            <button
              key={c.id}
              className={`ds-option${selected?.id === c.id ? ' ds-option-selected' : ''}`}
              onClick={() => setSelected(c)}
            >
              <span className="ds-option-mark" aria-hidden="true">{selected?.id === c.id ? '●' : '○'}</span>
              <span className="ds-option-text">
                <span className="ds-setting-label">{c.name}</span>
              </span>
              <span className="ds-option-meta">
                {c.id === currentId ? 'current' : `${c.total_hours} hrs`}
              </span>
            </button>
          ))}
          {isDifferent && (
            <p className="ds-modal-warn">
              Switching to {selected.name} clears your current course selections, added courses, and notes.
            </p>
          )}
        </div>
        <div className="ds-modal-foot">
          <button className="ds-btn-ghost" onClick={onClose} disabled={switching}>Cancel</button>
          <button
            className="ds-btn-primary"
            onClick={() => isDifferent && onSwitch(selected)}
            disabled={!isDifferent || switching}
          >
            {switching ? 'Switching…' : isDifferent ? `Switch to ${selected.name}` : 'Choose a concentration'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ResetModal ────────────────────────────────────────────────────────────────

export function ResetModal({ onConfirm, onClose, resetting }) {
  return (
    <div className="ds-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !resetting) onClose() }}>
      <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="ds-modal-head">
          <p className="ds-eyebrow">Plan settings</p>
          <h3 className="ds-modal-title" id="reset-title">Reset this plan?</h3>
        </div>
        <p className="ds-modal-text" style={{ padding: '16px 22px' }}>
          This clears all your course selections, added courses, and semester notes for this
          concentration, then rebuilds the default sequence. Prior credits and placement scores are kept.
        </p>
        <div className="ds-modal-foot">
          <button className="ds-btn-ghost" onClick={onClose} disabled={resetting}>Cancel</button>
          <button className="ds-btn-danger" style={{ minHeight: 38 }} onClick={onConfirm} disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
