import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'
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
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - 5 + i)

export default function Onboarding({ profileId, onComplete }) {
  const [step, setStep]                   = useState(1)
  const [selectedCode, setSelectedCode]   = useState(null)
  const [startSeason, setStartSeason]     = useState('Fall')
  const [startYear, setStartYear]         = useState(CURRENT_YEAR)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // Step 3: every student enters prior credits through the unified wizard.
  // Entries accumulate locally and are batch-inserted on completion, so
  // abandoning onboarding leaves no stray prior_credits rows.
  const [pendingRecords, setPendingRecords] = useState([])
  const [showWizard, setShowWizard]         = useState(false)
  // Requirement slots for the selected concentration.  Loaded lazily when
  // the student advances to step 3 so the wizard can resolve transfer
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

  function handleNextStep() {
    if (!selectedCode) return
    setStep(2)
  }

  async function handleGoToStep3() {
    if (!selectedCode) return

    // Load requirement_slots for the selected concentration so the wizard
    // can map transfer-credit courses to the correct pool on this plan.
    const concData = concentrations.find(c => c.code === selectedCode)
    if (concData) {
      const { data } = await supabase
        .from('requirement_slots')
        .select('id, class_code, is_pool')
        .eq('concentration_id', concData.id)
      setConcSlots(data ?? [])
    }
    setStep(3)
  }

  // ── Final save — persists concentration + start term and flushes
  // the locally accumulated prior_credits rows in a single insert.
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
      })
      .eq('id', profileId)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    if (priorCreditRecords.length > 0) {
      await supabase
        .from('prior_credits')
        .insert(priorCreditRecords.map(r => ({ ...r, plan_id: profileId })))
    }

    onComplete({
      id:               profileId,
      concentration_id: concData.id,
      start_season:     startSeason,
      start_year:       startYear,
      concentrations:   concData,
    })
  }

  // PriorCreditWizard hands us an array of
  // { credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded }
  // records.  Accumulate for batch insert on completion.
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

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">

        <div className="onboarding-header">
          <p className="onboarding-eyebrow">Welcome to TTU Degree Planner</p>
          <h2 className="onboarding-title">
            {step === 1 ? 'Choose your concentration'
             : step === 2 ? 'When did you start?'
             : 'Any prior credits or placement scores?'}
          </h2>
          <p className="onboarding-sub">
            {step === 1
              ? 'This determines your required courses and recommended plan.'
              : step === 2
              ? 'This helps us calculate where you are in your degree.'
              : 'We\'ll use these to pre-fill your plan and skip false prereq warnings.'}
          </p>
          <div className="onboarding-steps">
            <div className={`onboarding-step ${step >= 1 ? 'active' : ''}`} />
            <div className={`onboarding-step ${step >= 2 ? 'active' : ''}`} />
            <div className={`onboarding-step ${step >= 3 ? 'active' : ''}`} />
          </div>
        </div>

        {/* ── Step 1: Concentration ── */}
        {step === 1 && (
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
                concentrations.map(c => (
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

            <button
              className="onboarding-btn"
              onClick={handleNextStep}
              disabled={!selectedCode || concsLoading}
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Step 2: Start date ── */}
        {step === 2 && (
          <div className="onboarding-body">
            <div className="season-year-row">
              <div className="onboarding-field">
                <label className="onboarding-label">Start semester</label>
                <select
                  className="onboarding-select"
                  value={startSeason}
                  onChange={e => setStartSeason(e.target.value)}
                >
                  {SEASONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="onboarding-field">
                <label className="onboarding-label">Start year</label>
                <select
                  className="onboarding-select"
                  value={startYear}
                  onChange={e => setStartYear(Number(e.target.value))}
                >
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
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
                disabled={loading}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Prior credits (skippable) ── */}
        {step === 3 && (
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
        />
      )}
    </div>
  )
}
