import { useEffect, useState } from 'react'
import { db } from '../../lib/dataClient'
import {
  ACT_FIELDS, validateScore, describeActScore, saveActScoresAndRebuild,
} from '../../lib/actScores'
import {
  academicYearOf, availablePrograms, catalogYearForProfile, degreeTitle, groupByMajor, planForYear,
} from '../../lib/catalogYears'
import { selectWithOptional } from '../../lib/dbErrors'
import { COMING_SOON, groupByCollege, isProgramReady, programPath, searchPrograms } from '../../lib/programBrowser'
import DeviceDataCard from './DeviceDataCard'

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
            <span className="ds-setting-label">Degree program</span>
            <span className="ds-setting-desc">
              Currently {programPath(profile.concentrations)}. Switching clears your course selections; prior credits and ACT scores are kept.
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

      <DeviceDataCard />

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
      const err = validateScore(key, draft[key])
      if (err) errs[key] = err
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    const numScores = {}
    // a blank score is no score (null), not zero
    for (const { key } of ACT_FIELDS) numScores[key] = draft[key] === '' ? null : Number(draft[key])

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
        <p className="ds-eyebrow">Test scores</p>
        <p className="ds-section-meta">ACT or SAT Math sets your math placement; ACT English can earn credit. Leave blank what you do not have.</p>
      </div>
      <div className="ds-card ds-act">
        {ACT_FIELDS.map(({ key, label, min = 1, max = 36 }) => (
          <div key={key} className="ds-act-row">
            <label className="ds-act-label" htmlFor={`act-${key}`}>{label}</label>
            <span className={`ds-act-note${errors[key] ? ' ds-act-note-error' : ''}`}>
              {errors[key] ?? describeActScore(key, draft[key])}
            </span>
            <input
              id={`act-${key}`}
              type="number"
              min={min}
              max={max}
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

export function ConcentrationModal({ profile, onSwitch, onClose, switching }) {
  const currentId = profile.concentration_id
  const [programs, setPrograms]   = useState([])
  const [plans, setPlans]         = useState([])
  const [selected, setSelected]   = useState(null)
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // The student stays bound to the catalog year they entered under; in another program that year resolves to the
  // latest plan not newer than it (catalogYears.js).
  const entryYear = academicYearOf(profile.start_season, profile.start_year) ?? catalogYearForProfile(profile)

  useEffect(() => {
    Promise.all([
      selectWithOptional(
        columns => db.from('concentrations').select(columns).order('id', { ascending: true }),
        'id, code, name, total_hours',
        ['kind', 'degree', 'major_name', 'department', 'supersedes', 'last_catalog_year', 'description', 'college', 'major_code', 'is_base', 'aliases'],
      ),
      db.from('degree_plans').select('id, concentration_id, catalog_year, gened_program, total_hours, covers_earlier'),
    ]).then(([programsRes, plansRes]) => {
      const error = programsRes.error ?? plansRes.error
      if (error) { setFetchError(error.message); setLoading(false); return }
      setPrograms(programsRes.data)
      setPlans(plansRes.data)
      setSelected(programsRes.data.find(c => c.id === currentId) ?? null)
      setLoading(false)
    })
  }, [currentId])

  const options = availablePrograms(programs, plans, entryYear, { currentId })
  // college → major → programs (the same grouping the onboarding picker uses); a long list gets a search box
  const tree    = groupByCollege(query.trim() ? searchPrograms(options, query) : options)
  const current = programs.find(c => c.id === currentId)
  const currentGroup = groupByMajor(current ? [current] : [])[0]
  const isDifferent = selected && selected.id !== currentId

  return (
    <div className="ds-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !switching) onClose() }}>
      <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="conc-title">
        <div className="ds-modal-head">
          <p className="ds-eyebrow">{currentGroup ? degreeTitle(currentGroup) : 'Degree program'}</p>
          <h3 className="ds-modal-title" id="conc-title">Change degree program</h3>
          <p className="ds-sub" style={{ fontSize: 11, lineHeight: 1.6 }}>
            Prior credits and placement scores carry over. The plan is rebuilt for the new requirements.
          </p>
        </div>
        <div className="ds-modal-body">
          {loading ? (
            <p className="ds-modal-text">Loading programs…</p>
          ) : fetchError ? (
            <p className="ds-modal-text" style={{ color: 'var(--danger)' }}>{fetchError}</p>
          ) : (
            <>
              {options.length > 10 && (
                <input
                  type="search"
                  className="ds-act-input"
                  style={{ width: '100%', margin: '0 0 6px', textAlign: 'left' }}
                  placeholder="Search majors and concentrations"
                  aria-label="Search majors and concentrations"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              )}
              {tree.length === 0 && <p className="ds-modal-text">No program matches “{query.trim()}”.</p>}
              {tree.map(({ college, majors }) => (
                <div key={college.code}>
                  {tree.length > 1 && <p className="ds-eyebrow" style={{ margin: '14px 0 2px' }}>{college.short}</p>}
                  {majors.map(major => (
                    <div key={major.key}>
                      {(tree.length > 1 || majors.length > 1) && <p className="ds-eyebrow" style={{ margin: '10px 0 4px' }}>{degreeTitle(major)}</p>}
                      {major.programs.map(c => (
                        <button
                          key={c.id}
                          className={`ds-option${selected?.id === c.id ? ' ds-option-selected' : ''}`}
                          disabled={!isProgramReady(c) && c.id !== currentId}
                          onClick={() => setSelected(c)}
                        >
                          <span className="ds-option-mark" aria-hidden="true">{selected?.id === c.id ? '●' : '○'}</span>
                          <span className="ds-option-text">
                            <span className="ds-setting-label">{c.name}</span>
                          </span>
                          <span className="ds-option-meta">
                            {c.id === currentId ? 'current' : isProgramReady(c) ? `${c.total_hours} hrs` : COMING_SOON}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
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
            onClick={() => isDifferent && onSwitch(selected, planForYear(plans, selected.id, entryYear))}
            disabled={!isDifferent || switching}
          >
            {switching ? 'Switching…' : isDifferent ? `Switch to ${selected.name}` : 'Choose a degree program'}
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
          degree program, then rebuilds the default sequence. Prior credits and placement scores are kept.
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
