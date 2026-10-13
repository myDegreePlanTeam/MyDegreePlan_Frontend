import { useState, useEffect } from 'react'
import { db } from '../lib/dataClient'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'
import { resolveMathPlacementRow, resolveActEnglishCredit, actScoresToProfileFields } from '../lib/actScoreResolver'
import { validateSatMath, SAT_MATH_RANGE } from '../lib/mathPlacement'
import { isMissingColumn, selectWithOptional } from '../lib/dbErrors'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { academicYearOf, curriculumTypeForTerm, isApproximateFit, planForYear, termChoices } from '../lib/catalogYears'
import { termNotes } from '../lib/programBrowser'
import { pickerModel, onboardingSteps, stepBefore, stepAfter } from '../lib/programPicker'
import { termPhase } from '../lib/termPhase'
import { fetchRequirementSlots, isMissingProgramColumn } from '../lib/requirementSlots'
import { fetchPlannerCatalog } from '../lib/plannerCatalog'
import PriorCreditWizard from './PriorCreditWizard'
import ProgramPicker from './ProgramPicker'
import ImportBackupButton from './ImportBackupButton'
import { getBrand } from '../lib/brand'
import './Dashboard.css'

// New-curriculum chains (incoming_freshman / transfer): MATH1920 not required.

function validateActScore(val) {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  if (!Number.isInteger(n) || n < 1 || n > 36) return 'Must be a whole number between 1 and 36'
  return null
}

// The steps, in order (lib/programPicker.js onboardingSteps): college (only when there is more than one), major, concentration (only
// when the major has more than one program), start term, test scores, prior credits. Each is its own screen.

export default function Onboarding({ profileId, onComplete }) {
  const [step, setStep]                   = useState('college')
  const [selectedCode, setSelectedCode]   = useState(null)
  // what is chosen at the picker's earlier steps, and whether the program was found by search (which skips the steps in between)
  const [collegeCode, setCollegeCode]     = useState(null)
  const [majorKey, setMajorKey]           = useState(null)
  const [showClosed, setShowClosed]       = useState(false)
  const [foundBySearch, setFoundBySearch] = useState(false)
  const [startSeason, setStartSeason]     = useState('')
  const [startYear, setStartYear]         = useState('')
  // Not asked: the first semester decides the curriculum (catalogYears.js, curriculumTypeForTerm).
  const studentType = curriculumTypeForTerm(startSeason, startYear)
  const [actScores, setActScores]         = useState({ math: '', english: '', science: '', reading: '', composite: '', satMath: '' })
  const [actErrors, setActErrors]         = useState({})
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)


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
  const choices         = termChoices({ program: selectedProgram, plans: degreePlans })
  const notes           = selectedProgram ? termNotes(selectedProgram, degreePlans, concentrations) : []
  // a start term that is over: its semesters are shown as passed (lib/termPhase.js)
  const startedInPast   = !!startSeason && !!startYear && termPhase({ season: startSeason, year: Number(startYear) }, new Date()) === 'past'
  // a start term before the program's first degree map: the plan will be that map, and the student is told so now
  const entryPlan       = selectedProgram && entryYear ? planForYear(degreePlans, selectedProgram.id, entryYear) : null
  const approximate     = !!entryPlan && isApproximateFit({ entryYear, planYear: entryPlan.catalog_year, genedProgram: entryPlan.gened_program, coversEarlier: entryPlan.covers_earlier })

  // What the picker shows at each of its steps, and the steps this student will go through.
  const model = pickerModel({ programs: concentrations, plans: degreePlans, value: selectedCode, showClosed, collegeCode, majorKey })
  const steps = onboardingSteps(model)
  const current = steps.includes(step) ? step : steps[0]

  function handleSelectProgram(program) {
    // null: the picker dropped a closed program it was hiding
    if (!program) {
      setSelectedCode(null)
      setFoundBySearch(false)
      return
    }
    if (program.code !== selectedCode) {
      setSelectedCode(program.code)
      // the start term was chosen for another program: ask again rather than keep one this program may not have a plan for
      setStartSeason('')
      setStartYear('')
    }
  }

  // A college chosen: the major and program under another college no longer apply.
  function handleCollege(code) {
    if (code !== collegeCode) { setMajorKey(null); setSelectedCode(null); setFoundBySearch(false) }
    setCollegeCode(code)
  }

  // A major chosen: a major with one program is the program; one with several asks for the concentration next.
  function handleMajor(major) {
    if (!major) { setMajorKey(null); return }
    if (major.key !== majorKey) setFoundBySearch(false)
    setMajorKey(major.key)
    if (major.programs.length === 1) handleSelectProgram(major.programs[0])
    else if (!major.programs.some(p => p.code === selectedCode)) setSelectedCode(null)
  }

  // A search result is a whole program: it fills in the college and major and skips the steps between.
  function handleSearchPick(program) {
    handleSelectProgram(program)
    setCollegeCode(program.college ?? null)
    setMajorKey(null)
    setFoundBySearch(true)
  }

  // Whether the program step on screen can be left: what it asks for is chosen, or a search already found the whole program
  const searched = foundBySearch && !!selectedCode
  const canLeaveProgramStep = current === 'college' ? !!model.college || searched
    : current === 'major' ? !!model.major || searched
    : !!selectedCode

  function handleProgramContinue() {
    if (!canLeaveProgramStep) return
    setStep(searched && (current === 'college' || current === 'major') ? 'term' : stepAfter(steps, current))
  }

  // Start term → test scores. The program's slots are loaded here: the prior-credit wizard needs them.
  async function handleGoToScores() {
    if (!startSeason || !startYear) return
    await loadConcSlots()
    setStep('scores')
  }

  // Test scores → prior credits. Every score is optional: with no ACT or
  // SAT Math score a student starts in MATH1000 (mathPlacement.js). A score that is entered must be a real one.
  function handleGoToCredits() {
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
    setStep('credits')
  }

  async function loadConcSlots() {
    if (!selectedProgram) return
    const plan = planForYear(degreePlans, selectedProgram.id, entryYear)
    const { data } = plan
      ? await fetchRequirementSlots(db, selectedProgram.id, plan.catalog_year, 'id, class_code, is_pool, map_semester')
      : { data: [] }
    setConcSlots(data ?? [])
  }

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

  const flow = steps
  const seasonsForYear = choices.find(c => c.year === startYear)?.seasons ?? []

  const STEP_TITLES = {
    college: 'Which college?',
    major: 'What are you studying?',
    concentration: model.major?.concentrationRequired ? 'Choose your concentration' : 'Any concentration?',
    term: 'When do you start?',
    scores: 'Test Scores',
    credits: 'Any prior credits?',
  }
  const STEP_SUBS = {
    college: 'Start with the college your major is in, or search for your major or concentration. This determines your required courses and recommended plan.',
    major: 'Pick your major. This determines your required courses and recommended plan.',
    concentration: 'Your major has more than one path. Pick the one you are following.',
    term: 'Pick the semester you first started, or will start, this degree program. It picks the catalog year your degree plan follows.',
    scores: 'Enter the scores you have and leave the rest blank. Your ACT or SAT Math score sets where your math starts; with neither, it starts in MATH 1000.',
    credits: "We'll use these to pre-fill your plan and skip false prereq warnings.",
  }
  const isFirstStep = current === steps[0]

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">

        <div className="onboarding-header">
          <p className="onboarding-eyebrow">{getBrand().welcomeEyebrow}</p>
          <h2 className="onboarding-title">{STEP_TITLES[current]}</h2>
          <p className="onboarding-sub">{STEP_SUBS[current]}</p>
          <div className="onboarding-steps">
            {flow.map((n, i) => (
              <div key={n} className={`onboarding-step ${flow.indexOf(current) >= i ? 'active' : ''}`} />
            ))}
          </div>
        </div>

        {/* ── The program, one level at a time: college, major, concentration ── */}
        {(current === 'college' || current === 'major' || current === 'concentration') && (
          <div className="onboarding-body">
            <div className="concentration-picker">
              <ProgramPicker
                programs={concentrations}
                plans={degreePlans}
                stage={current}
                value={selectedCode}
                collegeCode={collegeCode}
                majorKey={majorKey}
                searchable={isFirstStep}
                showClosed={showClosed}
                onShowClosed={setShowClosed}
                onCollege={handleCollege}
                onMajor={handleMajor}
                onChange={handleSelectProgram}
                onSearchPick={handleSearchPick}
                loading={concsLoading}
                error={concsError}
              />
            </div>

            {error && <p className="onboarding-error">{error}</p>}

            <div className="onboarding-btn-row">
              {!isFirstStep && (
                <button className="onboarding-btn-secondary" onClick={() => setStep(stepBefore(steps, current))}>
                  Back
                </button>
              )}
              <button
                className="onboarding-btn"
                onClick={handleProgramContinue}
                disabled={!canLeaveProgramStep || concsLoading}
              >
                Continue
              </button>
            </div>

            {/* A new device or install has no plan, so this is where a backup from another one is loaded. */}
            {isFirstStep && (
              <p className="onboarding-import">
                Moving from another device or install?{' '}
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

        {/* ── First semester, for the chosen program ── */}
        {current === 'term' && (
          <div className="onboarding-body">
            <p className="onboarding-toggle-prompt">Your first semester in this program</p>

            {notes.map((note, i) => (
              <p key={i} className="program-note">
                {note.text}{' '}
                {note.replacement && (
                  <button
                    type="button"
                    className="program-link"
                    onClick={() => handleSearchPick(note.replacement)}
                  >
                    Choose {note.replacement.name} instead
                  </button>
                )}
              </p>
            ))}

            <div className="season-year-row">
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

              <div className="onboarding-field">
                <label className="onboarding-label">Semester</label>
                <select
                  className="onboarding-select"
                  value={startSeason}
                  onChange={e => setStartSeason(e.target.value)}
                  disabled={!startYear}
                >
                  <option value="">Select semester</option>
                  {seasonsForYear.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {startedInPast && (
              <p className="program-note" role="note">
                <strong>Past semesters count as passed.</strong> The semesters before the current one are shown as done. If you did not
                pass a course, remove it from your plan or move it to a later semester to retake it.
              </p>
            )}

            {approximate && (
              <p className="program-note" role="note">
                <strong>Approximate plan:</strong> you started before the {entryPlan.catalog_year} catalog, the first degree map {selectedProgram.name} has.
                Your plan follows that map, so some requirements may differ from the ones you entered under: confirm them with your advisor.
              </p>
            )}

            {error && <p className="onboarding-error">{error}</p>}

            <div className="onboarding-btn-row">
              <button
                className="onboarding-btn-secondary"
                onClick={() => setStep(stepBefore(steps, 'term'))}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="onboarding-btn"
                onClick={handleGoToScores}
                disabled={!startSeason || !startYear}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── ACT and SAT scores ── */}
        {current === 'scores' && (
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
                onClick={() => setStep('term')}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="onboarding-btn"
                onClick={handleGoToCredits}
                disabled={loading}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Prior credits (skippable) ── */}
        {current === 'credits' && (
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
                onClick={() => setStep('scores')}
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
          existingCredits={pendingRecords}
          onSave={handleWizardSave}
          onClose={() => setShowWizard(false)}
          planSlots={{}}
          slots={concSlots}
        />
      )}
    </div>
  )
}
