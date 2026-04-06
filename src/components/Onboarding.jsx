import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import './Dashboard.css'

// Descriptions are display-only supplementary text — they live here in code
// because the concentrations table only stores id, code, name, total_hours.
// Unknown concentrations (e.g. a new one added to the DB later) will simply
// render without a description rather than breaking the onboarding flow.
const CONCENTRATION_DESCS = {
  core:          'A broad foundation across all areas of computer science.',
  cybersecurity: 'Security, networking, cryptography, and systems defense.',
  dsai:          'Machine learning, data analysis, and artificial intelligence.',
  hpc:           'Parallel systems, distributed computing, and advanced networking.',
}

const SEASONS = ['Fall', 'Spring', 'Summer']

// Generate a reasonable range of years — 5 years back, 2 years forward
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - 5 + i)

export default function Onboarding({ profileId, onComplete }) {
  const [step, setStep]                   = useState(1)
  const [selectedCode, setSelectedCode]   = useState(null)
  const [startSeason, setStartSeason]     = useState('Fall')
  const [startYear, setStartYear]         = useState(CURRENT_YEAR)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // ── Live fetch of concentration list ─────────────────────────────
  // Replaced the old hardcoded CONCENTRATIONS array. The DB is now the
  // single source of truth for which concentrations exist.
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
  }, [])  // empty deps — fetch once on mount, concentrations don't change mid-session

  // ── Step 1 handler — user picks a concentration ──────────────────
  function handleSelectConcentration(code) {
    setSelectedCode(code)
  }

  function handleNextStep() {
    if (!selectedCode) return
    setStep(2)
  }

  // ── Step 2 handler — user confirms and saves ─────────────────────
  async function handleComplete() {
    setLoading(true)
    setError(null)

    // No need to re-fetch — concentrations are already in state from the
    // useEffect above. A simple find() replaces the old single-row fetch.
    const concData = concentrations.find(c => c.code === selectedCode)
    if (!concData) {
      setError('Selected concentration not found. Please go back and try again.')
      setLoading(false)
      return
    }

    // Update the student's profile row with their selections.
    // profileId was passed down from Dashboard as a prop.
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

    // Build the updated profile object and pass it back up to Dashboard
    // via the onComplete callback — no need to re-fetch from Supabase.
    onComplete({
      id:               profileId,
      concentration_id: concData.id,
      start_season:     startSeason,
      start_year:       startYear,
      concentrations:   concData,
    })
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">

        <div className="onboarding-header">
          <p className="onboarding-eyebrow">Welcome to TTU Degree Planner</p>
          <h2 className="onboarding-title">
            {step === 1 ? "Choose your concentration" : "When did you start?"}
          </h2>
          <p className="onboarding-sub">
            {step === 1
              ? "This determines your required courses and recommended plan."
              : "This helps us calculate where you are in your degree."}
          </p>
          <div className="onboarding-steps">
            <div className={`onboarding-step ${step >= 1 ? 'active' : ''}`} />
            <div className={`onboarding-step ${step >= 2 ? 'active' : ''}`} />
          </div>
        </div>

        {step === 1 && (
          <div className="onboarding-body">
            <div className="concentration-grid">
              {concsLoading ? (
                // Skeleton cards — same pulse class used by OnboardingSkeleton
                // so the grid dimensions match the real cards exactly.
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
                onClick={handleComplete}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Build my degree plan'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}