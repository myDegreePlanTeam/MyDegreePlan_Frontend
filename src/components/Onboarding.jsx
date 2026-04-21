import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { validatePriorCredit } from '../lib/validatePriorCredit'
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

// ── Step 3 checkbox options ───────────────────────────────────────────────────
// Each entry maps to a prior_credits row that will be inserted on completion.
// Students are not asked for raw test scores — only threshold questions.
const PRIOR_CREDIT_OPTIONS = [
  {
    id: 'act_math',
    label: 'ACT Math score of 27 or higher',
    record: {
      credit_type:          'act_placement',
      satisfies_course_code: null,
      note:                 'ACT Math ≥ 27',
      credits_awarded:      0,
    },
  },
  {
    id: 'ap_calc_ab',
    label: 'AP Calculus AB (score 3+)',
    record: {
      credit_type:          'ap_credit',
      satisfies_course_code: 'MATH1910',
      note:                 'AP Calculus AB',
      credits_awarded:      4,
    },
  },
  {
    id: 'ap_calc_bc',
    label: 'AP Calculus BC (score 3+)',
    record: {
      credit_type:          'ap_credit',
      satisfies_course_code: 'MATH1920',
      note:                 'AP Calculus BC',
      credits_awarded:      4,
    },
  },
  {
    id: 'ap_engl_lang',
    label: 'AP English Language and Composition (score 3+)',
    record: {
      credit_type:          'ap_credit',
      satisfies_course_code: 'ENGL1010',
      note:                 'AP English Language',
      credits_awarded:      3,
    },
  },
  {
    id: 'ap_engl_lit',
    label: 'AP English Literature and Composition (score 3+)',
    record: {
      credit_type:          'ap_credit',
      satisfies_course_code: 'ENGL1020',
      note:                 'AP English Literature',
      credits_awarded:      3,
    },
  },
]

export default function Onboarding({ profileId, onComplete }) {
  const [step, setStep]                   = useState(1)
  const [selectedCode, setSelectedCode]   = useState(null)
  const [startSeason, setStartSeason]     = useState('Fall')
  const [startYear, setStartYear]         = useState(CURRENT_YEAR)
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // Step 3 state
  const [checkedOptions, setCheckedOptions]       = useState(new Set())
  const [transferSearch, setTransferSearch]       = useState('')
  const [transferResults, setTransferResults]     = useState([])
  const [searchingTransfer, setSearchingTransfer] = useState(false)
  const [selectedTransferCourse, setSelectedTransferCourse] = useState(null)
  const [transferNote, setTransferNote]           = useState('')
  const [showTransferForm, setShowTransferForm]   = useState(false)
  const transferSearchTimerRef                    = useRef(null)

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

  function toggleOption(id) {
    setCheckedOptions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Catalog-bound course search for transfer credits (BUG-20).
  // A typed course code is only accepted after the student explicitly picks
  // a row from the dropdown; freeform text never reaches handleFinishWithCredits.
  function handleTransferSearch(val) {
    setTransferSearch(val)
    setSelectedTransferCourse(null)
    if (!val.trim()) { setTransferResults([]); return }
    clearTimeout(transferSearchTimerRef.current)
    setSearchingTransfer(true)
    transferSearchTimerRef.current = setTimeout(async () => {
      const term = val.trim()
      const { data } = await supabase
        .from('courses')
        .select('code, name, credits')
        .or(`code.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(10)
      setTransferResults(data ?? [])
      setSearchingTransfer(false)
    }, 250)
  }

  function handleTransferSelect(course) {
    setSelectedTransferCourse(course)
    setTransferSearch(course.code + ' — ' + course.name)
    setTransferResults([])
  }

  // ── Final save — called from step 2 "Build my degree plan" ───────
  // Always runs regardless of step 3 choices (step 3 is skippable).
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

    // Insert any selected prior credit records
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

  // Called from step 2 — proceed to step 3 (prior credits)
  function handleGoToStep3() {
    if (!selectedCode) return
    setStep(3)
  }

  // Called from step 3 "Build my degree plan" — collect checked options + transfer form
  async function handleFinishWithCredits() {
    const records = []

    for (const optId of checkedOptions) {
      const opt = PRIOR_CREDIT_OPTIONS.find(o => o.id === optId)
      if (opt) records.push(opt.record)
    }

    if (showTransferForm) {
      if (!selectedTransferCourse) {
        setError('Please pick a course from the search results, or uncheck the transfer credit option.')
        return
      }

      // Credits are always read from the catalog — never user input.  This
      // mirrors the CLAUDE.md principle for scored exam types (credits_awarded
      // is authoritative from test_equivalencies / courses, never self-reported).
      const creditsFromCatalog = selectedTransferCourse.credits ?? 0

      // Backend safety net: guard against bad rows even though the UI picker
      // binds to the catalog.  Matches the principle in CLAUDE.md that every
      // prior_credits INSERT is validated before it reaches the database.
      const miniCatalog = {
        [selectedTransferCourse.code]: { credits: creditsFromCatalog },
      }
      const { valid, error: validationError } = validatePriorCredit(
        'transfer_credit',
        selectedTransferCourse.code,
        creditsFromCatalog,
        [],
        miniCatalog,
      )
      if (!valid) {
        setError(validationError)
        return
      }

      records.push({
        credit_type:          'transfer_credit',
        satisfies_course_code: selectedTransferCourse.code,
        note:                 transferNote.trim() || null,
        credits_awarded:      creditsFromCatalog,
      })
    }

    await handleComplete(records)
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
            <div className="onboarding-prior-credits">
              {PRIOR_CREDIT_OPTIONS.map(opt => (
                <label key={opt.id} className="onboarding-checkbox-row">
                  <input
                    type="checkbox"
                    className="onboarding-checkbox"
                    checked={checkedOptions.has(opt.id)}
                    onChange={() => toggleOption(opt.id)}
                  />
                  <span className="onboarding-checkbox-label">{opt.label}</span>
                </label>
              ))}

              {/* Transfer credit sub-form */}
              <label className="onboarding-checkbox-row">
                <input
                  type="checkbox"
                  className="onboarding-checkbox"
                  checked={showTransferForm}
                  onChange={() => setShowTransferForm(v => !v)}
                />
                <span className="onboarding-checkbox-label">
                  Transfer credit for a specific course
                </span>
              </label>

              {showTransferForm && (
                <div className="onboarding-transfer-sub">
                  <div className="onboarding-field">
                    <label className="onboarding-label">Course</label>
                    <input
                      className="onboarding-select"
                      type="text"
                      value={transferSearch}
                      onChange={e => handleTransferSearch(e.target.value)}
                      placeholder="Search by name or code, e.g. MATH1710"
                      autoComplete="off"
                    />
                    {searchingTransfer && (
                      <p className="wizard-loading">Searching…</p>
                    )}
                    {transferResults.length > 0 && (
                      <div className="add-credit-results">
                        {transferResults.map(c => (
                          <button
                            key={c.code}
                            type="button"
                            className="add-credit-result-row"
                            onClick={() => handleTransferSelect(c)}
                          >
                            <span className="add-credit-result-code">{c.code}</span>
                            <span className="add-credit-result-name">{c.name}</span>
                            <span className="add-credit-result-cr">{c.credits} cr</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="onboarding-field">
                    <label className="onboarding-label">Credits awarded</label>
                    <p className="onboarding-readonly-value">
                      {selectedTransferCourse
                        ? `${selectedTransferCourse.credits} cr (from TTU catalog)`
                        : 'Pick a course above to see credits.'}
                    </p>
                  </div>
                  <div className="onboarding-field">
                    <label className="onboarding-label">Note (optional)</label>
                    <input
                      className="onboarding-select"
                      type="text"
                      value={transferNote}
                      onChange={e => setTransferNote(e.target.value)}
                      placeholder="e.g. Transferred from community college"
                    />
                  </div>
                </div>
              )}
            </div>

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
                onClick={handleFinishWithCredits}
                disabled={loading}
              >
                {loading ? 'Saving…' : 'Build my degree plan'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
