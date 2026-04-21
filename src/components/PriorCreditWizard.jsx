// PriorCreditWizard.jsx
//
// 5-step guided prior credit wizard.
// Students never type a course code manually — all selections are driven by
// the test_equivalencies table and the courses catalog.
//
// Step 1 — What kind of credit do you have?
// Step 2 — Which exam / course?
// Step 3 — What score did you receive? (scored exams only)
// Step 4 — Confirm what you'll receive (read-only summary)
// Step 5 — [ Confirm & Apply ] button
//
// Saves one prior_credits row per awarded course from test_equivalencies.
// credits_awarded and satisfies_pool are auto-populated from the table —
// students never set these manually.

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { resolveSatisfiesPool } from '../lib/poolResolver'
import './Dashboard.css'

// Credit type options presented in Step 1
const CREDIT_TYPES = [
  { value: 'ap_credit',       label: 'AP Exam',               hasScore: true  },
  { value: 'act_credit',      label: 'ACT Score',             hasScore: true  },
  { value: 'test_out',        label: 'CLEP Exam',             hasScore: true  },
  { value: 'ib_credit',       label: 'IB Exam',               hasScore: true  },
  { value: 'cambridge',       label: 'Cambridge International', hasScore: false },
  { value: 'transfer_credit', label: 'Transfer Credit',       hasScore: false, disabled: true },
]

// Human-readable labels for display
const TYPE_LABELS = Object.fromEntries(CREDIT_TYPES.map(t => [t.value, t.label]))

export default function PriorCreditWizard({ onSave, onClose, planSlots, slots }) {
  const [step, setStep]           = useState(1)
  const [creditType, setCreditType] = useState(null)
  const [selectedExam, setSelectedExam] = useState(null) // { test_name, ... } or course object
  const [selectedScore, setSelectedScore] = useState(null)
  const [awards, setAwards]       = useState([])  // final list of { awarded_course_code, credits_awarded, satisfies_pool }
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState(null)

  // Step 2 data
  const [examOptions, setExamOptions]   = useState([])   // distinct test_names from test_equivalencies
  const [loadingExams, setLoadingExams] = useState(false)
  const [courseSearch, setCourseSearch] = useState('')
  const [courseResults, setCourseResults] = useState([])
  const [searchingCourses, setSearchingCourses] = useState(false)
  const searchTimerRef = useRef(null)

  // Step 3 data
  // Each entry: { score, awardedCodes, totalCredits, isPlacementOnly }
  const [scoreOptions, setScoreOptions] = useState([])

  const typeConfig = CREDIT_TYPES.find(t => t.value === creditType)

  // ── Step 2: load exam list from test_equivalencies ────────────────
  useEffect(() => {
    if (step !== 2 || !creditType || creditType === 'transfer_credit') return

    setLoadingExams(true)
    supabase
      .from('test_equivalencies')
      .select('test_name')
      .eq('test_type', creditType)
      .order('test_name', { ascending: true })
      .then(({ data }) => {
        // Deduplicate test names
        const names = [...new Set((data ?? []).map(r => r.test_name))]
        setExamOptions(names)
        setLoadingExams(false)
      })
  }, [step, creditType])

  // ── Step 3: load score options for selected exam ──────────────────
  useEffect(() => {
    if (step !== 3 || !creditType || !selectedExam) return

    supabase
      .from('test_equivalencies')
      .select('min_score, awarded_course_code, credits_awarded, satisfies_pool')
      .eq('test_type', creditType)
      .eq('test_name', selectedExam.test_name)
      .not('min_score', 'is', null)
      .order('min_score', { ascending: true })
      .then(({ data }) => {
        const rows = data ?? []
        // Build cumulative award info per score threshold.
        // Each threshold shows everything a student earns at that score
        // (i.e. all rows with min_score <= threshold), matching the Step 4 query.
        const allScores = [...new Set(rows.map(r => r.min_score))].sort((a, b) => a - b)
        const options = allScores.map(score => {
          const cumulativeRows = rows.filter(r => r.min_score <= score)
          const totalCredits   = cumulativeRows.reduce((s, r) => s + (r.credits_awarded ?? 0), 0)
          const awardedCodes   = [...new Set(cumulativeRows.map(r => r.awarded_course_code).filter(Boolean))]
          const isPlacementOnly = cumulativeRows.every(r => (r.credits_awarded ?? 0) === 0)
          return { score, awardedCodes, totalCredits, isPlacementOnly }
        })
        setScoreOptions(options)
      })
  }, [step, creditType, selectedExam])

  // ── Step 4: compute awards ────────────────────────────────────────
  useEffect(() => {
    if (step !== 4) return

    async function loadAwards() {
      if (creditType === 'transfer_credit') {
        // Transfer credit: one award for the selected course.
        // Look up whether the course belongs to a pool so the INSERT can archive
        // the matching pool slot via resolveTransferCredits Rule 2.
        //
        // BUG-4: iterate only over pools that actually exist in the active
        // concentration's plan (slots prop). A course like CSC2220 lives in
        // both CSC_LOWER_ELECTIVE (Core) and CSC_ELECTIVE (Cybersecurity/DSAI),
        // so a concentration-agnostic match would always pick the first listed
        // pool and miss the real slot on other concentrations.
        if (!selectedExam) return
        setAwards([{
          awarded_course_code: selectedExam.code,
          credits_awarded:     selectedExam.credits ?? 3,
          satisfies_pool:      resolveSatisfiesPool(selectedExam.code, slots),
          course_name:         selectedExam.name,
        }])
        return
      }

      // Exam-based: query test_equivalencies for this exam + score
      let query = supabase
        .from('test_equivalencies')
        .select('awarded_course_code, credits_awarded, satisfies_pool')
        .eq('test_type', creditType)
        .eq('test_name', selectedExam.test_name)

      // For scored exams with a selected score, filter to rows where min_score <= selectedScore
      // (the student earns all rows that their score meets)
      if (typeConfig?.hasScore && selectedScore != null) {
        query = query.lte('min_score', selectedScore)
      }

      const { data } = await query
      if (!data || data.length === 0) { setAwards([]); return }

      // Fetch course names for display
      const codes = [...new Set(data.map(r => r.awarded_course_code).filter(Boolean))]
      const { data: courseData } = await supabase
        .from('courses')
        .select('code, name, credits')
        .in('code', codes)

      const courseMap = {}
      for (const c of courseData ?? []) courseMap[c.code] = c

      setAwards(data.map(row => ({
        awarded_course_code: row.awarded_course_code,
        credits_awarded:     row.credits_awarded,
        satisfies_pool:      row.satisfies_pool,
        course_name:         courseMap[row.awarded_course_code]?.name ?? row.awarded_course_code,
      })))
    }

    loadAwards()
  }, [step, creditType, selectedExam, selectedScore, typeConfig, slots])

  // ── Course search for transfer_credit (Step 2) ────────────────────
  function handleCourseSearch(val) {
    setCourseSearch(val)
    if (!val.trim()) { setCourseResults([]); return }
    clearTimeout(searchTimerRef.current)
    setSearchingCourses(true)
    searchTimerRef.current = setTimeout(async () => {
      const term = val.trim()
      const { data } = await supabase
        .from('courses')
        .select('code, name, credits')
        .or(`code.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(10)
      setCourseResults(data ?? [])
      setSearchingCourses(false)
    }, 250)
  }

  // ── Navigation ────────────────────────────────────────────────────
  function goBack() {
    if (step === 1) { onClose(); return }
    setStep(s => s - 1)
    if (step === 2) { setSelectedExam(null); setExamOptions([]); setCourseSearch(''); setCourseResults([]) }
    if (step === 3) { setSelectedScore(null); setScoreOptions([]) }
    if (step === 4) { setAwards([]) }
  }

  function handleTypeSelect(type) {
    setCreditType(type)
    setSelectedExam(null)
    setSelectedScore(null)
    setAwards([])
    setStep(2)
  }

  function handleExamSelect(examName) {
    setSelectedExam({ test_name: examName })
    setSelectedScore(null)
    if (typeConfig?.hasScore) {
      setStep(3)
    } else {
      setStep(4)
    }
  }

  function handleCourseSelect(course) {
    setSelectedExam(course)
    setCourseSearch(course.code + ' — ' + course.name)
    setCourseResults([])
    setStep(4)
  }

  function handleScoreSelect(score) {
    setSelectedScore(score)
    setStep(4)
  }

  // ── Apply ─────────────────────────────────────────────────────────
  async function handleApply() {
    if (awards.length === 0) return
    setSaving(true)
    setSaveError(null)

    const note = buildNote(creditType, selectedExam, selectedScore)

    // Pass all awarded rows as a single array so the parent can batch-insert
    // them atomically and update priorCredits state once.  Calling onSave in
    // a loop causes stale-closure overwrites: each iteration captures the same
    // priorCredits snapshot, so only the last row survives in React state.
    await onSave(
      awards.map(award => ({
        credit_type:           creditType,
        satisfies_course_code: award.awarded_course_code,
        satisfies_pool:        award.satisfies_pool,
        note,
        credits_awarded:       award.credits_awarded,
      }))
    )

    setSaving(false)
    onClose()
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function buildNote(type, exam, score) {
    if (!exam) return null
    const label = TYPE_LABELS[type] ?? type
    const examName = exam.test_name ?? (exam.code + ' — ' + exam.name)
    if (score != null) return `${label}: ${examName}, score ${score}`
    return `${label}: ${examName}`
  }

  function slotForCode(code) {
    if (!code || !slots) return null
    return slots.find(s => s.class_code === code)
  }

  // ── Backdrop click ────────────────────────────────────────────────
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card wizard-card">

        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Prior Credits — Step {step} of {maxStep(creditType, typeConfig)}</p>
            <h3 className="modal-title">{stepTitle(step, creditType, typeConfig)}</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="wizard-body">

          {/* Step 1 — Credit type */}
          {step === 1 && (
            <div className="wizard-type-grid">
              {CREDIT_TYPES.map(t => (
                <button
                  key={t.value}
                  className={`wizard-type-btn${t.disabled ? ' wizard-type-btn-disabled' : ''}`}
                  onClick={() => !t.disabled && handleTypeSelect(t.value)}
                  disabled={t.disabled}
                  aria-disabled={t.disabled ? 'true' : undefined}
                >
                  <span className="wizard-type-btn-label">{t.label}</span>
                  {t.disabled && (
                    <span className="wizard-type-btn-pill">Coming soon</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step 2 — Exam or course selection */}
          {step === 2 && creditType !== 'transfer_credit' && (
            <div className="wizard-exam-list">
              {loadingExams && <p className="wizard-loading">Loading exams…</p>}
              {!loadingExams && examOptions.length === 0 && (
                <p className="wizard-empty">
                  No {TYPE_LABELS[creditType]} equivalencies found in the database.
                  Contact your advisor if you believe this is an error.
                </p>
              )}
              {examOptions.map(name => (
                <button
                  key={name}
                  className="wizard-exam-btn"
                  onClick={() => handleExamSelect(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {step === 2 && creditType === 'transfer_credit' && (
            <div className="wizard-course-search">
              <p className="wizard-step-hint">
                Search by course name or code from the TTU catalog.
              </p>
              <input
                className="add-credit-input"
                type="text"
                value={courseSearch}
                onChange={e => handleCourseSearch(e.target.value)}
                placeholder="e.g. Calculus I or MATH1910"
                autoFocus
                autoComplete="off"
              />
              {searchingCourses && <p className="wizard-loading">Searching…</p>}
              {courseResults.length > 0 && (
                <div className="add-credit-results">
                  {courseResults.map(c => (
                    <button
                      key={c.code}
                      type="button"
                      className="add-credit-result-row"
                      onClick={() => handleCourseSelect(c)}
                    >
                      <span className="add-credit-result-code">{c.code}</span>
                      <span className="add-credit-result-name">{c.name}</span>
                      <span className="add-credit-result-cr">{c.credits} cr</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Score selection */}
          {step === 3 && (
            <div className="wizard-score-list">
              <p className="wizard-step-hint">
                Select the score you received on{' '}
                <strong>{selectedExam?.test_name}</strong>.
                Only qualifying score thresholds are shown.
              </p>
              {scoreOptions.length === 0 && (
                <p className="wizard-empty">Loading score options…</p>
              )}
              {scoreOptions.map(opt => (
                <button
                  key={opt.score}
                  className="wizard-score-btn"
                  onClick={() => handleScoreSelect(opt.score)}
                >
                  <span className="wizard-score-num">Score {opt.score}+</span>
                  {opt.isPlacementOnly ? (
                    <span className="wizard-score-detail">
                      Qualifies for placement into {opt.awardedCodes.join(', ')} — no credit hours awarded
                    </span>
                  ) : (
                    <span className="wizard-score-detail">
                      Awards {opt.totalCredits} credit hour{opt.totalCredits !== 1 ? 's' : ''}
                      {opt.awardedCodes.length > 0
                        ? ` toward ${opt.awardedCodes.join(', ')}`
                        : ''}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step 4 — Confirmation */}
          {step === 4 && (
            <div className="wizard-confirm">
              <div className="wizard-confirm-header">
                <span className="wizard-confirm-exam">
                  {selectedExam?.test_name ?? selectedExam?.code}
                </span>
                {selectedScore != null && (
                  <span className="wizard-confirm-score"> — Score {selectedScore}+</span>
                )}
              </div>

              {awards.length === 0 && (
                <p className="wizard-empty">Loading award details…</p>
              )}

              {awards.map((award, i) => {
                const slot = slotForCode(award.awarded_course_code)
                const slotSem = slot
                  ? (slot.semester_number ?? '?')
                  : null
                const alreadyInPlan = !!slot
                const isPlacementOnly = (award.credits_awarded ?? 0) === 0

                return (
                  <div key={i} className="wizard-award-card">
                    <div className="wizard-award-main">
                      <span className="wizard-award-code">{award.awarded_course_code}</span>
                      <span className="wizard-award-name">{award.course_name}</span>
                      {isPlacementOnly ? (
                        <span className="wizard-award-cr wizard-award-cr-placement">No credit hours</span>
                      ) : (
                        <span className="wizard-award-cr">{award.credits_awarded} cr</span>
                      )}
                    </div>
                    {isPlacementOnly ? (
                      <p className="wizard-award-effect wizard-award-effect-placement">
                        This qualifies you for placement into{' '}
                        <strong>{award.awarded_course_code}</strong> — no credit hours are awarded.
                      </p>
                    ) : alreadyInPlan ? (
                      <p className="wizard-award-effect">
                        This removes <strong>{award.awarded_course_code}</strong> from
                        Semester {slotSem} of your plan.
                      </p>
                    ) : (
                      <p className="wizard-award-effect wizard-award-effect-no-slot">
                        This course is not in your current plan. It will be recorded as
                        prior credit and count toward your degree total.
                      </p>
                    )}
                    {award.satisfies_pool && (
                      <p className="wizard-award-pool">
                        Also satisfies: {award.satisfies_pool} pool requirement
                      </p>
                    )}
                  </div>
                )
              })}

              {saveError && (
                <p className="wizard-save-error">{saveError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="modal-footer-btns">
            <button
              type="button"
              className="onboarding-btn-secondary"
              onClick={goBack}
              disabled={saving}
            >
              {step === 1 ? 'Cancel' : '← Back'}
            </button>

            {step === 4 && (
              <button
                type="button"
                className="onboarding-btn"
                onClick={handleApply}
                disabled={saving || awards.length === 0}
              >
                {saving ? 'Applying…' : 'Confirm & Apply'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maxStep(creditType, typeConfig) {
  if (!creditType) return 4
  if (creditType === 'transfer_credit') return 4   // no score step
  if (!typeConfig?.hasScore) return 4              // no score step
  return 4                                         // all steps
}

function stepTitle(step, creditType, typeConfig) {
  switch (step) {
    case 1: return 'What kind of credit do you have?'
    case 2: return creditType === 'transfer_credit'
      ? 'Which course did you transfer?'
      : `Which ${TYPE_LABELS[creditType] ?? 'exam'} did you take?`
    case 3: return 'What score did you receive?'
    case 4: return 'Confirm what you\'ll receive'
    default: return 'Add Prior Credit'
  }
}
