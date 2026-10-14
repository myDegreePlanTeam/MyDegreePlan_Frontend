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
import { majorsHeading } from '../../lib/majors'
import DeviceDataCard, { EraseCard } from './DeviceDataCard'
import Dialog, { DialogHead } from '../Dialog'

export default function SettingsView({
  profile,
  themePreference = 'system',
  onChooseTheme,
  onOpenConcentration,
  onOpenReset,
  onActSaved,
  addedPrograms = [],
  whatIfPanel = null,
  additionalProgramsOpen = false,
  onOpenAddProgram,
  onRemoveProgram,
  onMakePrimary,
}) {
  // The majors the student is enrolled in: the primary one (on the profile), then the secondary majors they added. A minor is not one.
  const majors = [
    { id: null, programId: profile.concentration_id, name: profile.concentrations.name, primary: true, catalogYear: catalogYearForProfile(profile) },
    ...addedPrograms.filter(p => p.role !== 'minor'),
  ]
  const minors = addedPrograms.filter(p => p.role === 'minor')

  return (
    <div className="ds-view ds-settings">
      <h2 className="ds-h2 ds-page-title">Settings</h2>
      <p className="ds-audit-lede">Changes save automatically.</p>

      <div className="ds-settings-grid">
        {/* Your major(s): the plural only when the student really has several. */}
        <section className="ds-scard" aria-labelledby="set-majors">
          <div className="ds-scard-head">
            <h3 className="ds-scard-title" id="set-majors">{majorsHeading(majors)}</h3>
            <p className="ds-scard-desc">
              Your primary major decides your general education courses and your catalog year.
              {additionalProgramsOpen && ' A course more than one of your majors needs appears once and counts toward each.'}
            </p>
          </div>
          <div className="ds-card">
            <div className="ds-setting">
              <span className="ds-setting-text">
                <span className="ds-setting-label">{programPath(profile.concentrations)}</span>
                <span className="ds-setting-desc">
                  Change replaces your primary major and clears your course selections; prior credits and ACT scores are kept.
                </span>
              </span>
              <span className="ds-setting-actions">
                <button className="ds-btn-ghost" onClick={onOpenConcentration}>
                  Change
                </button>
                {additionalProgramsOpen && (
                  <button className="ds-btn-ghost" onClick={() => onOpenAddProgram('major')}>
                    Add major
                  </button>
                )}
              </span>
            </div>
            {additionalProgramsOpen && majors.map(major => (
              <div className="ds-setting ds-major-row" key={major.primary ? 'primary' : major.id}>
                <span className="ds-setting-text">
                  <span className="ds-setting-label">
                    {major.name}
                    {major.primary && <span className="ds-major-flag">Primary</span>}
                  </span>
                  <span className="ds-setting-desc">
                    {major.primary ? 'Primary major' : 'Secondary major'} · follows the {major.catalogYear} catalog
                  </span>
                </span>
                <span className="ds-setting-actions">
                  {!major.primary && (
                    <button className="ds-btn-ghost" onClick={() => onMakePrimary(major)} aria-label={`Make ${major.name} your primary major`}>
                      Make primary
                    </button>
                  )}
                  <button
                    className="ds-btn-ghost"
                    onClick={() => onRemoveProgram(major)}
                    aria-label={`Remove ${major.name}`}
                    disabled={major.primary}
                    title={major.primary ? (majors.length > 1 ? 'Make another major your primary major first' : 'You need at least one major') : undefined}
                  >
                    Remove major
                  </button>
                </span>
              </div>
            ))}
            {additionalProgramsOpen && (
              <div className="ds-setting">
                <span className="ds-setting-text">
                  <span className="ds-setting-label">Minors</span>
                  <span className="ds-setting-desc">
                    Add a minor: fifteen hours or more beyond your major, and a course your major also needs counts toward both.
                  </span>
                </span>
                <span className="ds-setting-actions">
                  <button className="ds-btn-ghost" onClick={() => onOpenAddProgram('minor')}>
                    Add minor
                  </button>
                </span>
              </div>
            )}
            {additionalProgramsOpen && minors.map(program => (
              <div className="ds-setting" key={program.id}>
                <span className="ds-setting-text">
                  <span className="ds-setting-label">{program.name}</span>
                  <span className="ds-setting-desc">
                    Minor · follows the {program.catalogYear} catalog
                    {program.modelled === false && ' · requirements not modelled here, so nothing in your plan is checked against it'}
                  </span>
                </span>
                <span className="ds-setting-actions">
                  <button className="ds-btn-ghost" onClick={() => onRemoveProgram(program)} aria-label={`Remove ${program.name}`}>
                    Remove minor
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>

        {additionalProgramsOpen && whatIfPanel}

        <ActScoresCard
          key={ACT_FIELDS.map(({ key }) => profile[key] ?? '').join('|')}
          profile={profile}
          onSaved={onActSaved}
        />

        <AppearanceCard preference={themePreference} onChoose={onChooseTheme} />

        <DeviceDataCard />

        {/* Two different things, kept apart so they are not mixed up: one rebuilds the semesters, the other deletes everything. */}
        <section className="ds-scard" aria-labelledby="set-startover">
          <div className="ds-scard-head">
            <h3 className="ds-scard-title" id="set-startover">Start over</h3>
            <p className="ds-scard-desc">Two different things, kept apart so they are not mixed up.</p>
          </div>
          <div className="ds-danger-card">
            <span className="ds-setting-text">
              <span className="ds-setting-label">Reset plan</span>
              <span className="ds-setting-desc">
                Rebuilds your semesters from the default plan: it clears your course selections, added courses and semester notes. Prior credits and ACT scores are kept.
              </span>
            </span>
            <button className="ds-btn-ghost" onClick={onOpenReset}>Reset plan</button>
          </div>
          <EraseCard />
        </section>
      </div>
    </div>
  )
}

// ── AppearanceCard ────────────────────────────────────────────────────────────
// Three ways to choose the colours (lib/theme.js): follow the device, or always light, or always dark.

const THEME_CHOICES = [
  { value: 'system', label: 'Match my device' },
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark' },
]

export function AppearanceCard({ preference, onChoose }) {
  return (
    <section className="ds-scard" aria-labelledby="set-appearance">
      <div className="ds-scard-head">
        <h3 className="ds-scard-title" id="set-appearance">Appearance</h3>
        <p className="ds-scard-desc">Match my device switches with your device's light or dark setting.</p>
      </div>
      <div className="ds-seg" role="radiogroup" aria-labelledby="set-appearance">
        {THEME_CHOICES.map(choice => (
          <label key={choice.value} className={`ds-seg-option${preference === choice.value ? ' ds-seg-on' : ''}`}>
            <input
              type="radio" name="ds-theme" className="ds-seg-radio" value={choice.value}
              checked={preference === choice.value} onChange={() => onChoose(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
    </section>
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
        ? { text: 'Not saved yet. Your placement updates when you save.', cls: 'ds-act-status-dirty' }
        : { text: 'Saved. Placement and credit reflect these scores.', cls: '' }

  return (
    <section className="ds-scard" aria-labelledby="set-scores">
      <div className="ds-scard-head">
        <h3 className="ds-scard-title" id="set-scores">Test scores</h3>
        <p className="ds-scard-desc">Your ACT or SAT Math score decides where your math starts, and ACT English can earn credit. Leave blank what you do not have.</p>
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
    </section>
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
    <Dialog labelledBy="conc-title" onClose={onClose} busy={switching}>
        <DialogHead id="conc-title" kicker={currentGroup ? degreeTitle(currentGroup) : 'Your major'} title="Change your major">
          Prior credits and placement scores carry over. The plan is rebuilt for the new requirements.
        </DialogHead>
        <div className="ds-modal-body">
          {loading ? (
            <p className="ds-modal-text">Loading programs…</p>
          ) : fetchError ? (
            <p className="ds-modal-text ds-modal-error" role="alert">{fetchError}</p>
          ) : (
            <>
              {options.length > 10 && (
                <input
                  type="search"
                  className="ds-modal-search"
                  placeholder="Search majors and concentrations"
                  aria-label="Search majors and concentrations"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              )}
              {tree.length === 0 && <p className="ds-modal-text">No program matches “{query.trim()}”.</p>}
              {tree.map(({ college, majors }) => (
                <div key={college.code}>
                  {tree.length > 1 && <p className="ds-modal-group">{college.short}</p>}
                  {majors.map(major => (
                    <div key={major.key}>
                      {(tree.length > 1 || majors.length > 1) && <p className="ds-modal-subgroup">{degreeTitle(major)}</p>}
                      {major.programs.map(c => (
                        <button
                          key={c.id}
                          className={`ds-option${selected?.id === c.id ? ' ds-option-selected' : ''}`}
                          disabled={!isProgramReady(c) && c.id !== currentId}
                          aria-pressed={selected?.id === c.id}
                          onClick={() => setSelected(c)}
                        >
                          <span className="ds-option-mark" aria-hidden="true" />
                          <span className="ds-option-text">
                            <span className="ds-setting-label">{c.name}</span>
                          </span>
                          <span className="ds-option-meta">
                            {c.id === currentId ? 'current' : isProgramReady(c) ? `${c.total_hours} hours` : COMING_SOON}
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
            {switching ? 'Switching…' : isDifferent ? `Switch to ${selected.name}` : 'Choose a major'}
          </button>
        </div>
    </Dialog>
  )
}

// ── RemoveProgramModal ────────────────────────────────────────────────────────

export function RemoveProgramModal({ name, role = 'major', onConfirm, onClose, removing }) {
  return (
    <Dialog labelledBy="remove-program-title" onClose={onClose} busy={removing}>
        <DialogHead id="remove-program-title" kicker={role === 'minor' ? 'Your minors' : 'Your majors'} title={`Remove ${name}?`} />
        <p className="ds-modal-text ds-modal-para">
          This takes the courses only {name} needs out of your plan, along with the selections you made for them. Courses your
          {role === 'minor' ? ' majors' : ' other majors'} need stay where they are. Prior credits and your other selections are kept.
        </p>
        <div className="ds-modal-foot">
          <button className="ds-btn-ghost" onClick={onClose} disabled={removing}>Cancel</button>
          <button className="ds-btn-danger" onClick={onConfirm} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </button>
        </div>
    </Dialog>
  )
}

// ── ResetModal ────────────────────────────────────────────────────────────────

export function ResetModal({ onConfirm, onClose, resetting }) {
  return (
    <Dialog labelledBy="reset-title" onClose={onClose} busy={resetting}>
        <DialogHead id="reset-title" kicker="Start over" title="Reset this plan?" />
        <p className="ds-modal-text ds-modal-para">
          This clears all your course selections, added courses, and semester notes for your
          primary major, then rebuilds the default sequence. Prior credits and placement scores are kept.
        </p>
        <div className="ds-modal-foot">
          <button className="ds-btn-ghost" onClick={onClose} disabled={resetting}>Cancel</button>
          <button className="ds-btn-danger" onClick={onConfirm} disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset plan'}
          </button>
        </div>
    </Dialog>
  )
}
