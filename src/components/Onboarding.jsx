import { useState, useEffect } from 'react'
import { db, isLocalBackend } from '../lib/dataClient'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'
import { resolveMathPlacementRow, resolveActEnglishCredit, actScoresToProfileFields } from '../lib/actScoreResolver'
import { validateSatMath, SAT_MATH_RANGE, mathCurriculumFor, planHasMathChain } from '../lib/mathPlacement'
import { isMissingColumn, selectWithOptional } from '../lib/dbErrors'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { academicYearOf, planForYear, termChoices } from '../lib/catalogYears'
import { termUnavailableNote } from '../lib/programBrowser'
import { fetchRequirementSlots, isMissingProgramColumn } from '../lib/requirementSlots'
import { fetchPlannerCatalog } from '../lib/plannerCatalog'
import PriorCreditWizard from './PriorCreditWizard'
import ProgramPicker from './ProgramPicker'
import ImportBackupButton from './ImportBackupButton'
import { getBrand } from '../lib/brand'
import './Dashboard.css'

// New-curriculum chains (incoming_freshman / transfer): MATH1920 not required.
const MATH_CHAINS_NEW = {
  MATH1000: ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH2010'],
  MATH1710: ['MATH1710', 'MATH1720', 'MATH1910', 'MATH2010'],
  MATH1730: ['MATH1730', 'MATH1910', 'MATH2010'],
  MATH1904: ['MATH1904', 'MATH1906', 'MATH2010'],
  MATH1910: ['MATH1910', 'MATH2010'],
}
// Old-curriculum chains (returning students): MATH1920 sits between MATH1910 and MATH2010.
const MATH_CHAINS_RETURNING = {
  MATH1000: ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2010'],
  MATH1710: ['MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2010'],
  MATH1730: ['MATH1730', 'MATH1910', 'MATH1920', 'MATH2010'],
  MATH1904: ['MATH1904', 'MATH1906', 'MATH2010'],
  MATH1910: ['MATH1910', 'MATH1920', 'MATH2010'],
}
function getMathChains(curriculum) {
  return curriculum === 'returning' ? MATH_CHAINS_RETURNING : MATH_CHAINS_NEW
}
const MATH_FORK_CODES = ['MATH3070', 'MATH3470']

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

// The steps, in order. Step 4 (the math sequence) is skipped for a plan that has no Calculus I to place into.
const FLOW_WITH_MATH = [1, 2, 3, 4, 5]
const FLOW_WITHOUT_MATH = [1, 2, 3, 5]

export default function Onboarding({ profileId, onComplete }) {
  const [step, setStep]                   = useState(1)
  const [studentType, setStudentType]     = useState(null)
  const [selectedCode, setSelectedCode]   = useState(null)
  const [startSeason, setStartSeason]     = useState('')
  const [startYear, setStartYear]         = useState('')
  const [actScores, setActScores]         = useState({ math: '', english: '', science: '', reading: '', composite: '', satMath: '' })
  const [actErrors, setActErrors]         = useState({})
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // The math sequence step: only when the chosen plan includes Calculus I (known once its slots are loaded).
  const [hasMath, setHasMath]                   = useState(true)
  const [mathChainData, setMathChainData]       = useState([])
  const [mathChainLoading, setMathChainLoading] = useState(false)

  // Prior credits: every student enters them through the unified wizard.
  // Entries accumulate locally and are batch-inserted on completion, so
  // abandoning onboarding leaves no stray prior_credits rows.
  const [pendingRecords, setPendingRecords] = useState([])
  const [showWizard, setShowWizard]         = useState(false)
  // Requirement slots for the selected program. Loaded when the student leaves the start-term step so the
  // wizard can resolve transfer credits against the correct pool set (BUG-4).
  const [concSlots, setConcSlots]           = useState([])

  const [concentrations, setConcentrations] = useState([])
  // degree_plans rows: which plan exists for which program and catalog year
  const [degreePlans, setDegreePlans]       = useState([])
  const [concsLoading, setConcsLoading]     = useState(true)
  const [concsError, setConcsError]         = useState(null)

  useEffect(() => {
    async function fetchConcentrations() {
      const [programsRes, plansRes] = await Promise.all([
        selectWithOptional(
          columns => db.from('concentrations').select(columns).order('id', { ascending: true }),
          'id, code, name, total_hours',
          ['kind', 'degree', 'major_name', 'department', 'supersedes', 'last_catalog_year', 'description', 'college', 'major_code', 'is_base', 'aliases'],
        ),
        db.from('degree_plans').select('id, concentration_id, catalog_year, gened_program, total_hours, covers_earlier'),
      ])

      if (programsRes.error || plansRes.error) {
        setConcsError((programsRes.error ?? plansRes.error).message)
      } else {
        setConcentrations(programsRes.data)
        setDegreePlans(plansRes.data)
      }
      setConcsLoading(false)
    }
    fetchConcentrations()
  }, [])

  // The program is chosen first; the start term then has to be one the program has a plan for. The plan the student
  // follows is the program's latest one not newer than their entry year (catalogYears.js).
  const entryYear       = academicYearOf(startSeason, startYear)
  const selectedProgram = concentrations.find(c => c.code === selectedCode) ?? null
  const termsFor        = type => termChoices(type, { program: selectedProgram, plans: degreePlans })
  const choices         = studentType ? termsFor(studentType) : []

  function handleSelectProgram(program) {
    if (program.code !== selectedCode) {
      setSelectedCode(program.code)
      // the start term was chosen for another program: ask again rather than keep one this program may not have a plan for
      setStartSeason('')
      setStartYear('')
    }
  }

  function handleStudentTypeChange(type) {
    setStudentType(type)
    setStartSeason('')
    setStartYear('')
  }

  // Step 1 → 2: a program
  function handleGoToStep2() {
    if (!selectedCode) return
    setStep(2)
  }

  // Step 2 → 3: a start term. Its slots are loaded here: they say whether the math step applies.
  async function handleGoToStep3() {
    if (!studentType || !startSeason || !startYear) return
    await loadConcSlots()
    setStep(3)
  }

  // Step 3 → the math sequence (or the prior credits, when the plan has none). Every score is optional: with no ACT or
  // SAT Math score a student starts in MATH1000 (mathPlacement.js). A score that is entered must be a real one.
  function handleGoToStep4() {
    const fields = ['math', 'english', 'science', 'reading', 'composite']
    const errors = {}
    for (const f of fields) {
      const err = validateActScore(actScores[f])
      if (err) errors[f] = err
    }
    const satErr = validateSatMath(actScores.satMath)
    if (satErr) errors.satMath = satErr
    if (Object.keys(errors).length > 0) {
      setActErrors(errors)
      return
    }
    setActErrors({})
    setStep(hasMath ? 4 : 5)
  }

  // The math sequence → prior credits
  function handleGoToStep5() {
    setStep(5)
  }

  async function loadConcSlots() {
    if (!selectedProgram) return
    const plan = planForYear(degreePlans, selectedProgram.id, entryYear)
    const { data } = plan
      ? await fetchRequirementSlots(db, selectedProgram.id, plan.catalog_year, 'id, class_code, is_pool, map_semester')
      : { data: [] }
    setConcSlots(data ?? [])
    setHasMath(planHasMathChain(data ?? []))
  }

  // The scores math placement reads (blank means not taken)
  const placementScores = {
    act: actScores.math === '' ? null : Number(actScores.math),
    sat: actScores.satMath === '' ? null : Number(actScores.satMath),
  }

  // ── Step 4: fetch course data for math chain display ─────────────
  useEffect(() => {
    if (step !== 4) return
    const placement = resolveMathPlacementRow(placementScores)
    const chainCodes = getMathChains(mathCurriculumFor(concSlots, studentType))[placement.satisfies_course_code] ?? []
    const allCodes = [...chainCodes, ...MATH_FORK_CODES]
    setMathChainLoading(true)
    db
      .from('courses')
      .select('code, name, credits')
      .in('code', allCodes)
      .then(({ data }) => {
        setMathChainData(data ?? [])
        setMathChainLoading(false)
      })
    // `placementScores` is rebuilt every render; its inputs are the scores that change `step`, so it is left out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, studentType, concSlots])

  // ── Final save — persists concentration, start term, student type, ACT columns,
  // flushes prior_credits, then runs the degree-builder algorithm and writes
  // student_plan_slots positions.
  async function handleComplete(priorCreditRecords = []) {
    setLoading(true)
    setError(null)

    const concData = selectedProgram
    if (!concData) {
      setError('Selected program not found. Please go back and try again.')
      setLoading(false)
      return
    }

    // The plan this student follows: the program's latest plan not newer than their entry year. Its catalog
    // year (and the gen-ed program that plan uses) is stored on the profile and never recomputed.
    const plan = planForYear(degreePlans, concData.id, entryYear)
    if (!plan) {
      setError('That program has no degree plan for your entry term. Please choose another.')
      setLoading(false)
      return
    }
    const genEdProgram  = plan.gened_program

    const actFields     = actScoresToProfileFields(actScores)
    const actMathNum    = actFields.act_math
    const actEnglishNum = actFields.act_english

    // ── 1. Save profile ──────────────────────────────────────────────────────
    const profileFields = {
      concentration_id: concData.id,
      start_season:     startSeason,
      start_year:       startYear,
      student_type:     studentType,
      ...actFields,
    }
    let { error: updateError } = await db
      .from('student_profiles')
      .update({ ...profileFields, gened_program: genEdProgram, catalog_year: plan.catalog_year })
      .eq('id', profileId)
    // A database whose schema has not reached catalog years or gen-ed programs lacks those columns:
    // save without them (the student is read as following the original plan).
    if (isMissingProgramColumn(updateError)) {
      ;({ error: updateError } = await db
        .from('student_profiles')
        .update(profileFields)
        .eq('id', profileId))
    }
    // A database whose setup step has not added sat_math yet: save without it, unless an SAT score was entered.
    if (isMissingColumn(updateError)) {
      const { sat_math: satMath, ...withoutSat } = profileFields
      if (satMath != null) {
        setError('Saving an SAT score needs a database update. Restart the stack so its setup step can apply it.')
        setLoading(false)
        return
      }
      ;({ error: updateError } = await db
        .from('student_profiles')
        .update(withoutSat)
        .eq('id', profileId))
    }

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    // ── 2. Generate ACT-derived prior_credit rows and insert all ────────────
    let allRecords = [...priorCreditRecords]

    // Always a placement row: with no ACT or SAT Math score the student starts in MATH1000.
    const mathRow = resolveMathPlacementRow({ act: actMathNum, sat: actFields.sat_math })
    allRecords = [mathRow, ...allRecords]

    const englishRows = resolveActEnglishCredit(actEnglishNum)
    if (englishRows.length > 0) allRecords = [...englishRows, ...allRecords]

    if (allRecords.length > 0) {
      await db
        .from('prior_credits')
        .insert(allRecords.map(r => ({ ...r, plan_id: profileId })))
    }

    // ── 3. Fetch data needed for the degree-builder algorithm ────────────────
    // Only this plan's slice of the catalog (see plannerCatalog.js): the catalog is every university course.
    const slotsRes = await fetchRequirementSlots(db, concData.id, plan.catalog_year, 'id, class_code, is_pool, flex_credits, map_semester')
    const catalog = slotsRes.error
      ? { courses: [], prereqs: [], coreqs: [], error: null }
      : await fetchPlannerCatalog(db, slotsRes.data ?? [])

    if (slotsRes.error || catalog.error) {
      setError('Failed to load degree data. Please try again.')
      setLoading(false)
      return
    }

    const slots     = slotsRes.data   ?? []
    const courseMap = {}
    for (const c of catalog.courses) courseMap[c.code] = c

    // Grouped by group_index, with course substitutes applied (MATH1906
    // also satisfies MATH1910 requirements — see requirementMap.js).
    const prereqMap = buildRequirementMap(catalog.prereqs)
    const coreqMap  = buildRequirementMap(catalog.coreqs)

    // ── 4. Run the algorithm ─────────────────────────────────────────────────
    const { assignments, archived } = buildDegreePlan({
      slots,
      courseMap,
      prereqMap,
      coreqMap,
      priorCredits: allRecords.map(r => ({ ...r, plan_id: profileId })),
      studentProfile: {
        student_type: studentType,
        act_math:     actMathNum,
        sat_math:     actFields.sat_math,
        start_season: startSeason,
      },
    })

    // ── 5. Write student_plan_slots ──────────────────────────────────────────
    // Archived slots: set archived=true, archive_reason, no semester_number.
    // Placed slots: set semester_number, position_source='algorithm'.
    const planSlotRows = []

    for (const slot of slots) {
      const archiveReason = archived[slot.id]
      if (archiveReason) {
        planSlotRows.push({
          student_id:           profileId,
          requirement_slot_id:  slot.id,
          selected_course_code: slot.is_pool ? null : slot.class_code,
          status:               'planned',
          semester_number:      null,
          credits_remaining:    0,
          archived:             true,
          archive_reason:       archiveReason,
          position_source:      null,
        })
      } else if (assignments[slot.id] != null) {
        planSlotRows.push({
          student_id:           profileId,
          requirement_slot_id:  slot.id,
          selected_course_code: slot.is_pool ? null : slot.class_code,
          status:               'planned',
          semester_number:      assignments[slot.id],
          credits_remaining:    0,
          archived:             false,
          archive_reason:       null,
          position_source:      'algorithm',
        })
      }
    }

    if (planSlotRows.length > 0) {
      // Batch in chunks to stay within request payload limits
      const CHUNK = 100
      for (let i = 0; i < planSlotRows.length; i += CHUNK) {
        const chunk = planSlotRows.slice(i, i + CHUNK)
        const { error: upsertErr } = await db
          .from('student_plan_slots')
          .upsert(chunk, { onConflict: 'student_id, requirement_slot_id' })
        if (upsertErr) {
          console.error('[Onboarding] student_plan_slots upsert failed:', upsertErr)
          setError(`Failed to save degree plan: ${upsertErr.message}`)
          setLoading(false)
          return
        }
      }
    }

    onComplete({
      id:               profileId,
      concentration_id: concData.id,
      start_season:     startSeason,
      start_year:       startYear,
      student_type:     studentType,
      gened_program:    genEdProgram,
      catalog_year:     plan.catalog_year,
      ...actFields,
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
  const flow = hasMath ? FLOW_WITH_MATH : FLOW_WITHOUT_MATH
  const seasonsForYear = choices.find(c => c.year === startYear)?.seasons ?? []

  const STEP_TITLES = {
    1: 'What are you studying?',
    2: 'Tell us about yourself',
    3: 'Test Scores',
    4: 'Your Math Sequence',
    5: 'Any prior credits?',
  }
  const STEP_SUBS = {
    1: 'Pick your college, major and concentration. This determines your required courses and recommended plan.',
    2: 'Your start term picks the catalog year your degree plan follows.',
    3: 'Enter the scores you have and leave the rest blank. Your ACT or SAT Math score sets where your math starts; with neither, it starts in MATH 1000.',
    4: 'Based on your math placement, here are the courses in your math sequence.',
    5: "We'll use these to pre-fill your plan and skip false prereq warnings.",
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">

        <div className="onboarding-header">
          <p className="onboarding-eyebrow">{getBrand().welcomeEyebrow}</p>
          <h2 className="onboarding-title">{STEP_TITLES[step]}</h2>
          <p className="onboarding-sub">{STEP_SUBS[step]}</p>
          <div className="onboarding-steps">
            {flow.map((n, i) => (
              <div key={n} className={`onboarding-step ${flow.indexOf(step) >= i ? 'active' : ''}`} />
            ))}
          </div>
        </div>

        {/* ── Step 1: Program (college, major, concentration) ── */}
        {step === 1 && (
          <div className="onboarding-body">
            <div className="concentration-picker">
              <ProgramPicker
                programs={concentrations}
                plans={degreePlans}
                value={selectedCode}
                onChange={handleSelectProgram}
                loading={concsLoading}
                error={concsError}
              />
            </div>

            {error && <p className="onboarding-error">{error}</p>}

            <button
              className="onboarding-btn"
              onClick={handleGoToStep2}
              disabled={!selectedCode || concsLoading}
            >
              Continue
            </button>

            {/* Local backend only: a new device has no plan, so this is where a backup from another one is loaded. */}
            {isLocalBackend && (
              <p className="onboarding-import">
                Moving from another device?{' '}
                <ImportBackupButton
                  className="onboarding-import-btn"
                  onError={setError}
                >
                  Import a backup
                </ImportBackupButton>
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: Student type + start term, for the chosen program ── */}
        {step === 2 && (
          <div className="onboarding-body">
            <p className="onboarding-toggle-prompt">What best describes you?</p>
            <div className="onboarding-toggle-row">
              {STUDENT_TYPES.map(t => {
                const unavailable = termsFor(t.value).length === 0
                return (
                  <button
                    key={t.value}
                    className={`onboarding-toggle-btn ${studentType === t.value ? 'selected' : ''}`}
                    onClick={() => handleStudentTypeChange(t.value)}
                    disabled={unavailable}
                    title={unavailable ? `${selectedProgram?.name} has no plan for this kind of student` : undefined}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            {selectedProgram && STUDENT_TYPES.map(t => {
              const note = termsFor(t.value).length === 0 ? termUnavailableNote(t.value, selectedProgram, degreePlans, concentrations) : null
              return note && (
                <p key={t.value} className="program-note">
                  <strong>{t.label}:</strong> {note.text}{' '}
                  {note.replacement && (
                    <button
                      type="button"
                      className="program-link"
                      onClick={() => { handleSelectProgram(note.replacement); setStudentType(null) }}
                    >
                      Choose {note.replacement.name} instead
                    </button>
                  )}
                </p>
              )
            })}

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
                    {seasonsForYear.map(s => (
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
                    {choices.map(c => (
                      <option key={c.year} value={c.year}>{c.year}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

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
                disabled={!studentType || !startSeason || !startYear}
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
                { key: 'satMath',   label: 'SAT Math', min: SAT_MATH_RANGE.min, max: SAT_MATH_RANGE.max },
              ].map(({ key, label, min = 1, max = 36 }) => (
                <div key={key} className="onboarding-field">
                  <label className="onboarding-label">{label}</label>
                  <input
                    type="number"
                    className={`onboarding-input${actErrors[key] ? ' onboarding-input-error' : ''}`}
                    value={actScores[key]}
                    min={min}
                    max={max}
                    placeholder={`${min}–${max}`}
                    onKeyDown={e => {
                      // Block e, E, +, - which type="number" normally allows
                      if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault()
                    }}
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
                className="onboarding-btn"
                onClick={handleGoToStep4}
                disabled={loading}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Math chain display (only for a plan that includes Calculus I) ── */}
        {step === 4 && (() => {
          const placement = resolveMathPlacementRow(placementScores)
          const startCode = placement.satisfies_course_code
          const chainCodes = getMathChains(mathCurriculumFor(concSlots, studentType))[startCode] ?? []
          const noScore = actScores.math === '' && actScores.satMath === ''
          const courseMap = {}
          for (const c of mathChainData) courseMap[c.code] = c
          return (
            <div className="onboarding-body">
              {noScore && (
                <p className="wizard-step-hint">
                  With no ACT or SAT Math score you start in MATH 1000, Transitional Algebra. If you take the
                  ACT or SAT later, add the score in Settings and your plan updates.
                </p>
              )}
              {mathChainLoading ? (
                <p className="wizard-loading">Loading your math sequence…</p>
              ) : (
                <div className="math-chain-scroll">
                  <div className="math-chain">
                    {chainCodes.map((code, i) => {
                      const course = courseMap[code]
                      return (
                        <span key={code} className="math-chain-segment">
                          {i > 0 && <span className="math-chain-arrow" aria-hidden="true">→</span>}
                          <div className="math-chain-node">
                            <div className="math-chain-code">{code.replace('MATH', 'MATH ')}</div>
                            <div className="math-chain-name">{course?.name ?? '—'}</div>
                            <div className="math-chain-credits">{course?.credits ?? '?'} cr</div>
                          </div>
                        </span>
                      )
                    })}
                    <span className="math-chain-segment">
                      <span className="math-chain-arrow" aria-hidden="true">→</span>
                      <div className="math-chain-fork">
                        {MATH_FORK_CODES.map((code, i) => {
                          const course = courseMap[code]
                          return (
                            <span key={code}>
                              {i > 0 && <div className="math-chain-or">or</div>}
                              <div className="math-chain-node">
                                <div className="math-chain-code">{code.replace('MATH', 'MATH ')}</div>
                                <div className="math-chain-name">{course?.name ?? '—'}</div>
                                <div className="math-chain-credits">{course?.credits ?? '?'} cr</div>
                              </div>
                            </span>
                          )
                        })}
                      </div>
                    </span>
                  </div>
                </div>
              )}

              <div className="onboarding-btn-row">
                <button
                  className="onboarding-btn-secondary"
                  onClick={() => setStep(3)}
                >
                  Back
                </button>
                <button
                  className="onboarding-btn"
                  onClick={handleGoToStep5}
                >
                  Continue
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Step 5: Prior credits (skippable) ── */}
        {step === 5 && (
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
                onClick={() => setStep(hasMath ? 4 : 3)}
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
