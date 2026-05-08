import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'
import { resolveActMathPlacement, resolveActEnglishCredit } from '../lib/actScoreResolver'
import PriorCreditWizard from './PriorCreditWizard'
import './Dashboard.css'

const CONCENTRATION_DESCS = {
  core:          'A broad foundation across all areas of computer science.',
  cybersecurity: 'Security, networking, cryptography, and systems defense.',
  dsai:          'Machine learning, data analysis, and artificial intelligence.',
  hpc:           'Parallel systems, distributed computing, and advanced networking.',
}

const SEASONS = ['Fall', 'Spring', 'Summer']

const CURRENT_YEAR = new Date().getFullYear()

// Returning students started before Fall 2026 (old curriculum)
const RETURNING_YEARS = Array.from({ length: 11 }, (_, i) => 2016 + i) // 2016–2026

// Incoming/transfer students start Fall 2026 or later (new curriculum)
const NEW_STUDENT_YEARS = Array.from({ length: 7 }, (_, i) => 2026 + i) // 2026–2032

function getAvailableYears(type) {
  return type === 'returning' ? RETURNING_YEARS : NEW_STUDENT_YEARS
}

function getAvailableSeasons(type, year) {
  if (type === 'returning' && Number(year) === 2026) return ['Spring', 'Summer']
  if (type !== 'returning' && Number(year) === 2026) return ['Fall']
  return SEASONS
}

const STUDENT_TYPES = [
  { value: 'incoming_freshman', label: 'Incoming Freshman' },
  { value: 'transfer',          label: 'Transfer Student'  },
  { value: 'returning',         label: 'Returning Student' },
]

function validateActScore(val) {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  if (!Number.isInteger(n) || n < 1 || n > 36) return 'Must be a whole number between 1 and 36'
  return null
}

export default function Onboarding({ profileId, onComplete }) {
  const [step, setStep]                   = useState(1)
  const [studentType, setStudentType]     = useState(null)
  const [selectedCode, setSelectedCode]   = useState(null)
  const [startSeason, setStartSeason]     = useState('')
  const [startYear, setStartYear]         = useState('')
  const [actScores, setActScores]         = useState({ math: '', english: '', science: '', reading: '', composite: '' })
  const [actErrors, setActErrors]         = useState({})
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // Step 4: every student enters prior credits through the unified wizard.
  // Entries accumulate locally and are batch-inserted on completion, so
  // abandoning onboarding leaves no stray prior_credits rows.
  const [pendingRecords, setPendingRecords] = useState([])
  const [showWizard, setShowWizard]         = useState(false)
  // Requirement slots for the selected concentration. Loaded lazily when
  // the student advances to step 4 so the wizard can resolve transfer
  // credits against the correct pool set (BUG-4).
  const [concSlots, setConcSlots]           = useState([])

  const [concentrations, setConcentrations] = useState([])
  const [concsLoading, setConcsLoading]     = useState(true)
  const [concsError, setConcsError]         = useState(null)

  useEffect(() => {
    async function fetchConcentrations() {
      const { data, error: fetchErr } = await supabase
        .from('concentrations')
        .select('id, code, name, total_hours')
        .order('id', { ascending: true })

      if (fetchErr) {
        setConcsError(fetchErr.message)
      } else {
        setConcentrations(data)
      }
      setConcsLoading(false)
    }
    fetchConcentrations()
  }, [])

  function handleSelectConcentration(code) {
    setSelectedCode(code)
  }

  function handleStudentTypeChange(type) {
    setStudentType(type)
    setStartSeason('')
    setStartYear('')
  }

  function handleGoToStep2() {
    if (!studentType || !startSeason || !startYear) return
    setStep(2)
  }

  // Step 2 → Step 3: requires a concentration selection
  function handleGoToStep3() {
    if (!selectedCode) return
    setStep(3)
  }

  // Step 3 → Step 4: validate ACT fields, then load slots
  async function handleGoToStep4() {
    const fields = ['math', 'english', 'science', 'reading', 'composite']
    const errors = {}
    for (const f of fields) {
      const err = validateActScore(actScores[f])
      if (err) errors[f] = err
    }
    if (Object.keys(errors).length > 0) {
      setActErrors(errors)
      return
    }
    setActErrors({})
    await loadConcSlots()
    setStep(4)
  }

  // Skip ACT step entirely → go straight to Step 4
  async function handleSkipAct() {
    setActScores({ math: '', english: '', science: '', reading: '', composite: '' })
    setActErrors({})
    await loadConcSlots()
    setStep(4)
  }

  async function loadConcSlots() {
    const concData = concentrations.find(c => c.code === selectedCode)
    if (concData) {
      const { data } = await supabase
        .from('requirement_slots')
        .select('id, class_code, is_pool')
        .eq('concentration_id', concData.id)
      setConcSlots(data ?? [])
    }
  }

  // ── Final save — persists concentration, start term, student type,
  // ACT columns, and flushes locally accumulated prior_credits in one insert.
  async function handleComplete(priorCreditRecords = []) {
    setLoading(true)
    setError(null)

    const concData = concentrations.find(c => c.code === selectedCode)
    if (!concData) {
      setError('Selected concentration not found. Please go back and try again.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase
      .from('student_profiles')
      .update({
        concentration_id: concData.id,
        start_season:     startSeason,
        start_year:       startYear,
        student_type:     studentType,
        act_math:         actScores.math      !== '' ? Number(actScores.math)      : null,
        act_english:      actScores.english   !== '' ? Number(actScores.english)   : null,
        act_science:      actScores.science   !== '' ? Number(actScores.science)   : null,
        act_reading:      actScores.reading   !== '' ? Number(actScores.reading)   : null,
        act_composite:    actScores.composite !== '' ? Number(actScores.composite) : null,
      })
      .eq('id', profileId)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // Generate ACT-derived prior_credit rows before the batch insert
    let allRecords = [...priorCreditRecords]

    const mathScore = actScores.math !== '' ? Number(actScores.math) : null
    const mathRow = resolveActMathPlacement(mathScore)
    if (mathRow) allRecords = [mathRow, ...allRecords]

    const englishScore = actScores.english !== '' ? Number(actScores.english) : null
    const englishRows = resolveActEnglishCredit(englishScore)
    if (englishRows.length > 0) allRecords = [...englishRows, ...allRecords]

    if (allRecords.length > 0) {
      await supabase
        .from('prior_credits')
        .insert(allRecords.map(r => ({ ...r, plan_id: profileId })))
    }

    onComplete({
      id:               profileId,
      concentration_id: concData.id,
      start_season:     startSeason,
      start_year:       startYear,
      student_type:     studentType,
      concentrations:   concData,
    })
  }

  // PriorCreditWizard hands us an array of
  // { credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded }
  // records. Accumulate for batch insert on completion.
  function handleWizardSave(records) {
    setPendingRecords(prev => [...prev, ...records])
  }

  function handleRemovePending(index) {
    setPendingRecords(prev => prev.filter((_, i) => i !== index))
  }

  async function handleFinish() {
    await handleComplete(pendingRecords)
  }

  // ── Render ────────────────────────────────────────────────────────

  const startDateLabel = studentType === 'returning' ? 'When did you start?' : 'When do you start?'

  const STEP_TITLES = {
    1: 'Tell us about yourself',
    2: 'Choose your concentration',
    3: 'ACT Scores',
    4: 'Any prior credits or placement scores?',
  }
  const STEP_SUBS = {
    1: 'This helps us tailor your degree plan.',
    2: 'This determines your required courses and recommended plan.',
    3: "Enter your ACT scores. Skip if you haven't taken the ACT.",
    4: "We'll use these to pre-fill your plan and skip false prereq warnings.",
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">

        <div className="onboarding-header">
          <p className="onboarding-eyebrow">Welcome to TTU Degree Planner</p>
          <h2 className="onboarding-title">{STEP_TITLES[step]}</h2>
          <p className="onboarding-sub">{STEP_SUBS[step]}</p>
          <div className="onboarding-steps">
            <div className={`onboarding-step ${step >= 1 ? 'active' : ''}`} />
            <div className={`onboarding-step ${step >= 2 ? 'active' : ''}`} />
            <div className={`onboarding-step ${step >= 3 ? 'active' : ''}`} />
            <div className={`onboarding-step ${step >= 4 ? 'active' : ''}`} />
          </div>
        </div>

        {/* ── Step 1: Student type + start date ── */}
        {step === 1 && (
          <div className="onboarding-body">
            <p className="onboarding-toggle-prompt">What best describes you?</p>
            <div className="onboarding-toggle-row">
              {STUDENT_TYPES.map(t => (
                <button
                  key={t.value}
                  className={`onboarding-toggle-btn ${studentType === t.value ? 'selected' : ''}`}
                  onClick={() => handleStudentTypeChange(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {studentType && (
              <div className="season-year-row">
                <div className="onboarding-field">
                  <label className="onboarding-label">{startDateLabel}</label>
                  <select
                    className="onboarding-select"
                    value={startSeason}
                    onChange={e => setStartSeason(e.target.value)}
                  >
                    <option value="">Select season</option>
                    {getAvailableSeasons(studentType, startYear).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div className="onboarding-field">
                  <label className="onboarding-label">Year</label>
                  <select
                    className="onboarding-select"
                    value={startYear}
                    onChange={e => {
                      setStartYear(e.target.value ? Number(e.target.value) : '')
                      setStartSeason('')
                    }}
                  >
                    <option value="">Select year</option>
                    {getAvailableYears(studentType).map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {error && <p className="onboarding-error">{error}</p>}

            <button
              className="onboarding-btn"
              onClick={handleGoToStep2}
              disabled={!studentType || !startSeason || !startYear}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 2: Concentration ── */}
        {step === 2 && (
          <div className="onboarding-body">
            <div className="concentration-grid">
              {concsLoading ? (
                [0, 1, 2, 3].map(i => (
                  <div key={i} className="sk-pulse sk-ob-conc-card" />
                ))
              ) : concsError ? (
                <p className="onboarding-error">
                  Could not load concentrations: {concsError}
                </p>
              ) : (
                // DSAI is no longer available for new students (Fall 2026+ curriculum)
                concentrations
                  .filter(c => studentType === 'returning' || c.code !== 'dsai')
                  .map(c => (
                    <button
                      key={c.code}
                      className={`concentration-card ${selectedCode === c.code ? 'selected' : ''}`}
                      onClick={() => handleSelectConcentration(c.code)}
                    >
                      <span className="concentration-name">{c.name}</span>
                      {CONCENTRATION_DESCS[c.code] && (
                        <span className="concentration-desc">{CONCENTRATION_DESCS[c.code]}</span>
                      )}
                    </button>
                  ))
              )}
            </div>

            {error && <p className="onboarding-error">{error}</p>}

            <div className="onboarding-btn-row">
              <button
                className="onboarding-btn-secondary"
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="onboarding-btn"
                onClick={handleGoToStep3}
                disabled={!selectedCode || concsLoading}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: ACT Scores ── */}
        {step === 3 && (
          <div className="onboarding-body">
            <div className="onboarding-act-grid">
              {[
                { key: 'math',      label: 'ACT Math'      },
                { key: 'english',   label: 'ACT English'   },
                { key: 'science',   label: 'ACT Science'   },
                { key: 'reading',   label: 'ACT Reading'   },
                { key: 'composite', label: 'ACT Composite' },
              ].map(({ key, label }) => (
                <div key={key} className="onboarding-field">
                  <label className="onboarding-label">{label}</label>
                  <input
                    type="number"
                    className={`onboarding-input${actErrors[key] ? ' onboarding-input-error' : ''}`}
                    value={actScores[key]}
                    min={1}
                    max={36}
                    placeholder="1–36"
                    onChange={e => {
                      setActScores(prev => ({ ...prev, [key]: e.target.value }))
                      if (actErrors[key]) setActErrors(prev => ({ ...prev, [key]: null }))
                    }}
                  />
                  {actErrors[key] && (
                    <p className="onboarding-field-error">{actErrors[key]}</p>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="onboarding-error">{error}</p>}

            <div className="onboarding-btn-row">
              <button
                className="onboarding-btn-secondary"
                onClick={() => setStep(2)}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="onboarding-btn-secondary"
                onClick={handleSkipAct}
                disabled={loading}
              >
                I didn't take the ACT / Skip
              </button>
              <button
                className="onboarding-btn"
                onClick={handleGoToStep4}
                disabled={loading}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Prior credits (skippable) ── */}
        {step === 4 && (
          <div className="onboarding-body">
            <p className="onboarding-sub">
              Add each AP exam, CLEP score, or other prior credit.
              You can add as many as you need, and remove any before finishing.
            </p>

            {pendingRecords.length === 0 ? (
              <p className="onboarding-readonly-value">
                No prior credits added yet.
              </p>
            ) : (
              <div className="onboarding-pending-groups">
                {groupAndSortPriorCredits(
                  pendingRecords.map((rec, i) => ({ ...rec, _pendingIndex: i }))
                ).map(group => (
                  <div key={group.type} className="onboarding-pending-group">
                    <div className="onboarding-pending-group-header">{group.label}</div>
                    <ul className="onboarding-pending-list">
                      {group.entries.map(rec => {
                        const isPlacement = (rec.credits_awarded ?? 0) === 0
                        return (
                          <li key={rec._pendingIndex} className="onboarding-pending-row">
                            <span className="onboarding-pending-code">
                              {rec.satisfies_course_code ?? '(placement only)'}
                            </span>
                            {rec.note && (
                              <>
                                <span className="onboarding-pending-sep" aria-hidden="true">·</span>
                                <span className="onboarding-pending-note">{rec.note}</span>
                              </>
                            )}
                            <span className="onboarding-pending-sep" aria-hidden="true">·</span>
                            <span className="onboarding-pending-cr">
                              {isPlacement ? 'Gate only' : `${rec.credits_awarded} cr`}
                            </span>
                            <button
                              type="button"
                              className="onboarding-pending-remove"
                              onClick={() => handleRemovePending(rec._pendingIndex)}
                              aria-label={`Remove ${rec.satisfies_course_code ?? 'entry'}`}
                            >
                              ✕
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="onboarding-btn-secondary"
              onClick={() => setShowWizard(true)}
              disabled={loading}
            >
              + Add prior credit
            </button>

            {error && <p className="onboarding-error">{error}</p>}

            <div className="onboarding-btn-row">
              <button
                className="onboarding-btn-secondary"
                onClick={() => setStep(3)}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="onboarding-btn-secondary"
                onClick={() => handleComplete([])}
                disabled={loading}
              >
                {loading ? 'Saving…' : "I'll add these later"}
              </button>
              <button
                className="onboarding-btn"
                onClick={handleFinish}
                disabled={loading}
              >
                {loading ? 'Saving…' : 'Build my degree plan'}
              </button>
            </div>
          </div>
        )}

      </div>

      {showWizard && (
        <PriorCreditWizard
          onSave={handleWizardSave}
          onClose={() => setShowWizard(false)}
          planSlots={{}}
          slots={concSlots}
          studentType={studentType}
        />
      )}
    </div>
  )
}
