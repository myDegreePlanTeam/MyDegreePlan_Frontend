import { useState, useEffect } from 'react'
import { db } from '../lib/dataClient'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'
import { validateSatMath, SAT_MATH_RANGE, planHasMathChain } from '../lib/mathPlacement'
import { isMissingColumn, selectWithOptional } from '../lib/dbErrors'
import { academicYearOf, curriculumTypeForTerm, isApproximateFit, planForYear, termChoices } from '../lib/catalogYears'
import { majorKeyOf, termNotes } from '../lib/programBrowser'
import { onboardingSteps, stepBefore, stepAfter } from '../lib/programPicker'
import { buildFirstPlan, summarizeFirstPlan } from '../lib/firstPlan'
import { termPhase } from '../lib/termPhase'
import { fetchRequirementSlots, isMissingProgramColumn } from '../lib/requirementSlots'
import { fetchPlannerCatalog } from '../lib/plannerCatalog'
import { formatCourseCode } from '../lib/courseCodeFormat'
import { hoursText } from '../lib/hoursText'
import PriorCreditWizard from './PriorCreditWizard'
import ProgramPicker from './ProgramPicker'
import ImportBackupButton from './ImportBackupButton'
import { getBrand } from '../lib/brand'
import './Dashboard.css'
import './FirstRun.css'

function validateActScore(val) {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  if (!Number.isInteger(n) || n < 1 || n > 36) return 'Must be a whole number between 1 and 36'
  return null
}

const SCORE_FIELDS = [
  { key: 'math',      label: 'ACT Math'      },
  { key: 'english',   label: 'ACT English'   },
  { key: 'science',   label: 'ACT Science'   },
  { key: 'reading',   label: 'ACT Reading'   },
  { key: 'composite', label: 'ACT Composite' },
  { key: 'satMath',   label: 'SAT Math', min: SAT_MATH_RANGE.min, max: SAT_MATH_RANGE.max },
]

const TITLES = {
  'major': 'Choose your major',
  'term': 'When do you start?',
  'scores-and-credits': 'Scores and credits',
  'ready': 'Your plan is ready',
}
const SUBS = {
  'major': 'This decides your required courses and your recommended plan.',
  'term': 'Pick the semester you first started, or will start, this major. It decides the catalog year your plan follows.',
  'scores-and-credits': 'Enter the scores you have and leave the rest blank, then add any credit you already earned. Both are optional, and you can change them later in Settings.',
}

// First run, four screens (lib/programPicker.js onboardingSteps): the major (with its concentration), the first semester, test scores and
// credits already earned, then the plan to look over. Nothing is saved until the student opens the plan on the last screen: going back
// from there changes nothing (lib/firstPlan.js builds the plan from the choices; saveFirstPlan below writes it).

export default function Onboarding({ profileId, onComplete }) {
  const steps = onboardingSteps()
  const [step, setStep]                   = useState(steps[0])
  const [selectedCode, setSelectedCode]   = useState(null)
  // the major opened to choose a concentration, before a program is chosen
  const [majorKey, setMajorKey]           = useState(null)
  const [showClosed, setShowClosed]       = useState(false)
  const [startSeason, setStartSeason]     = useState('')
  const [startYear, setStartYear]         = useState('')
  // Not asked: the first semester decides the curriculum (catalogYears.js, curriculumTypeForTerm).
  const studentType = curriculumTypeForTerm(startSeason, startYear)
  const [actScores, setActScores]         = useState({ math: '', english: '', science: '', reading: '', composite: '', satMath: '' })
  const [actErrors, setActErrors]         = useState({})
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState(null)

  // Credits already earned: entered through the wizard, kept here, and written with the plan. Abandoning first run leaves no rows behind.
  const [pendingRecords, setPendingRecords] = useState([])
  const [showWizard, setShowWizard]         = useState(false)
  // Requirement slots for the selected program. Loaded when the student leaves the start-term step so the
  // wizard can resolve transfer credits against the correct pool set (BUG-4).
  const [concSlots, setConcSlots]           = useState([])
  // The plan built from the choices, shown on the last screen and written when the student opens it.
  const [built, setBuilt]                   = useState(null)

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

  const current = steps.includes(step) ? step : steps[0]

  function handleSelectProgram(program) {
    // null: the picker dropped a closed program it was hiding
    if (!program) { setSelectedCode(null); return }
    if (program.code !== selectedCode) {
      setSelectedCode(program.code)
      // the start term was chosen for another program: ask again rather than keep one this program may not have a plan for
      setStartSeason('')
      setStartYear('')
    }
  }

  // A major chosen: a major with one program is the program; one with several shows its concentrations to choose from.
  function handleMajor(major) {
    if (!major) { setMajorKey(null); return }
    setMajorKey(major.key)
    if (major.programs.length === 1) handleSelectProgram(major.programs[0])
    else if (!major.programs.some(p => p.code === selectedCode)) setSelectedCode(null)
  }

  // A search result is a whole program: it chooses the major and the concentration at once.
  function handleSearchPick(program) {
    handleSelectProgram(program)
    setMajorKey(majorKeyOf(program))
  }

  // Start term → scores and credits. The program's slots are loaded here: the prior-credit wizard needs them.
  async function handleGoToScores() {
    if (!startSeason || !startYear) return
    await loadConcSlots()
    setStep(stepAfter(steps, 'term'))
  }

  async function loadConcSlots() {
    if (!selectedProgram) return
    const plan = planForYear(degreePlans, selectedProgram.id, entryYear)
    const { data } = plan
      ? await fetchRequirementSlots(db, selectedProgram.id, plan.catalog_year, 'id, class_code, is_pool, map_semester')
      : { data: [] }
    setConcSlots(data ?? [])
  }

  // Every score is optional: with no ACT or SAT Math score a student starts in MATH1000 (mathPlacement.js). A score that is entered
  // must be a real one.
  function scoreErrors() {
    const errors = {}
    for (const f of ['math', 'english', 'science', 'reading', 'composite']) {
      const err = validateActScore(actScores[f])
      if (err) errors[f] = err
    }
    const satErr = validateSatMath(actScores.satMath)
    if (satErr) errors.satMath = satErr
    return errors
  }

  // Scores and credits → the plan to look over. Reads the plan's slots and its slice of the catalog and builds the plan; writes nothing.
  async function handleBuild() {
    const errors = scoreErrors()
    setActErrors(errors)
    if (Object.keys(errors).length > 0) return

    setLoading(true)
    setError(null)
    const fail = message => { setError(message); setLoading(false) }

    if (!selectedProgram) return fail('Selected program not found. Please go back and try again.')
    // The plan this student follows: the program's latest plan not newer than their entry year. Its catalog
    // year (and the gen-ed program that plan uses) is stored on the profile and never recomputed.
    const plan = planForYear(degreePlans, selectedProgram.id, entryYear)
    if (!plan) return fail('That program has no degree plan for your entry term. Please choose another.')

    // Only this plan's slice of the catalog (see plannerCatalog.js): the catalog is every university course.
    const slotsRes = await fetchRequirementSlots(db, selectedProgram.id, plan.catalog_year, 'id, class_code, is_pool, flex_credits, map_semester')
    const catalog = slotsRes.error
      ? { courses: [], prereqs: [], coreqs: [], error: null }
      : await fetchPlannerCatalog(db, slotsRes.data ?? [], { courseColumns: 'code, name, credits, standing_req' })   // the name is for the last screen
    if (slotsRes.error || catalog.error) return fail('Failed to load degree data. Please try again.')

    const slots = slotsRes.data ?? []
    const result = buildFirstPlan({
      profileId, program: selectedProgram, plan, slots,
      courses: catalog.courses, prereqs: catalog.prereqs, coreqs: catalog.coreqs,
      actScores, priorCreditRecords: pendingRecords, startSeason, startYear, studentType,
    })
    const summary = summarizeFirstPlan({
      plan, slots, courseMap: result.courseMap, assignments: result.assignments, actFields: result.actFields,
      startSeason, startYear, hasMathChain: planHasMathChain(slots),
    })
    setBuilt({ ...result, plan, program: selectedProgram, summary })
    setLoading(false)
    setStep('ready')
  }

  // ── Save — the profile, the prior credits, then the plan's slots. Runs only when the student opens the plan. ──
  async function saveFirstPlan() {
    if (!built) return
    setLoading(true)
    setError(null)
    const fail = message => { setError(message); setLoading(false) }
    const { profileFields, extraProfileFields, records, planSlotRows, plan, program, actFields } = built

    // ── 1. The profile ──
    let { error: updateError } = await db
      .from('student_profiles')
      .update({ ...profileFields, ...extraProfileFields })
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
      if (satMath != null) return fail('Saving an SAT score needs a database update. Restart the stack so its setup step can apply it.')
      ;({ error: updateError } = await db
        .from('student_profiles')
        .update(withoutSat)
        .eq('id', profileId))
    }
    if (updateError) return fail(updateError.message)

    // ── 2. Prior credits: the placement row, ACT English credit, and the student's own ──
    if (records.length > 0) {
      await db
        .from('prior_credits')
        .insert(records.map(r => ({ ...r, plan_id: profileId })))
    }

    // ── 3. student_plan_slots, in chunks to stay within request payload limits ──
    const CHUNK = 100
    for (let i = 0; i < planSlotRows.length; i += CHUNK) {
      const { error: upsertErr } = await db
        .from('student_plan_slots')
        .upsert(planSlotRows.slice(i, i + CHUNK), { onConflict: 'student_id, requirement_slot_id' })
      if (upsertErr) {
        console.error('[Onboarding] student_plan_slots upsert failed:', upsertErr)
        return fail(`Failed to save degree plan: ${upsertErr.message}`)
      }
    }

    onComplete({
      id:               profileId,
      ...profileFields,
      ...extraProfileFields,
      ...actFields,
      catalog_year:     plan.catalog_year,
      concentrations:   program,
    })
  }

  // PriorCreditWizard hands us an array of
  // { credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded }
  // records. They are kept here and written with the plan.
  function handleWizardSave(records) {
    setPendingRecords(prev => [...prev, ...records])
  }

  function handleRemovePending(index) {
    setPendingRecords(prev => prev.filter((_, i) => i !== index))
  }

  // ── Render ────────────────────────────────────────────────────────

  const seasonsForYear = choices.find(c => c.year === startYear)?.seasons ?? []
  const stepNumber = steps.indexOf(current) + 1
  const summary = built?.summary

  return (
    <div className="fr-shell">
      <div className="fr-card">

        <header className="fr-header">
          <div className="fr-header-top">
            <p className="fr-brand">{getBrand().welcomeEyebrow}</p>
            <p className="fr-step">Step {stepNumber} of {steps.length}</p>
          </div>
          <div className="fr-progress" aria-hidden="true">
            {steps.map((name, i) => <span key={name} className={`fr-progress-seg${i < stepNumber ? ' fr-progress-on' : ''}`} />)}
          </div>
          <h2 className="fr-title">{TITLES[current]}</h2>
          <p className="fr-sub">
            {current === 'ready' && built
              ? `${built.program.name}, starting ${startSeason} ${startYear}. You can change any of this later in Settings.`
              : SUBS[current]}
          </p>
        </header>

        {/* ── 1. The major, and its concentration ── */}
        {current === 'major' && (
          <div className="fr-body">
            <ProgramPicker
              programs={concentrations}
              plans={degreePlans}
              value={selectedCode}
              majorKey={majorKey}
              showClosed={showClosed}
              onShowClosed={setShowClosed}
              onMajor={handleMajor}
              onChange={handleSelectProgram}
              onSearchPick={handleSearchPick}
              loading={concsLoading}
              error={concsError}
            />

            {error && <p className="fr-error" role="alert">{error}</p>}

            <div className="fr-actions">
              {/* A new device or install has no plan, so this is where a backup from another one is loaded. */}
              <p className="fr-import">
                Moving from another device or install?{' '}
                <ImportBackupButton className="fr-link" onError={setError}>
                  Import a backup
                </ImportBackupButton>
              </p>
              <button className="fr-btn fr-btn-primary" onClick={() => selectedCode && setStep(stepAfter(steps, 'major'))} disabled={!selectedCode || concsLoading}>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── 2. First semester, for the chosen major ── */}
        {current === 'term' && (
          <div className="fr-body">
            {notes.map((note, i) => (
              <p key={i} className="fr-note">
                {note.text}{' '}
                {note.replacement && (
                  <button type="button" className="fr-link" onClick={() => { handleSearchPick(note.replacement); setStep('major') }}>
                    Choose {note.replacement.name} instead
                  </button>
                )}
              </p>
            ))}

            <div className="fr-row">
              <label className="fr-field">
                <span className="fr-label">Year</span>
                <select
                  className="fr-select"
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
              </label>

              <label className="fr-field">
                <span className="fr-label">Semester</span>
                <select
                  className="fr-select"
                  value={startSeason}
                  onChange={e => setStartSeason(e.target.value)}
                  disabled={!startYear}
                >
                  <option value="">Select semester</option>
                  {seasonsForYear.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            {startedInPast && (
              <p className="fr-note" role="note">
                <strong>Past semesters count as passed.</strong> The semesters before the current one are shown as done. If you did not
                pass a course, remove it from your plan or move it to a later semester to retake it.
              </p>
            )}

            {approximate && (
              <p className="fr-note" role="note">
                <strong>Approximate plan:</strong> you started before the {entryPlan.catalog_year} catalog, the first degree map {selectedProgram.name} has.
                Your plan follows that map, so some requirements may differ from the ones you entered under: confirm them with your advisor.
              </p>
            )}

            {error && <p className="fr-error" role="alert">{error}</p>}

            <div className="fr-actions">
              <button className="fr-btn" onClick={() => setStep(stepBefore(steps, 'term'))} disabled={loading}>Back</button>
              <button className="fr-btn fr-btn-primary" onClick={handleGoToScores} disabled={!startSeason || !startYear}>Continue</button>
            </div>
          </div>
        )}

        {/* ── 3. Test scores, and credits already earned ── */}
        {current === 'scores-and-credits' && (
          <div className="fr-body">
            <section aria-labelledby="fr-scores">
              <h3 className="fr-section" id="fr-scores">Test scores</h3>
              <p className="fr-hint">Your ACT or SAT Math score decides where your math starts. With neither, it starts in MATH 1000.</p>
              <div className="fr-scores">
                {SCORE_FIELDS.map(({ key, label, min = 1, max = 36 }) => (
                  <label key={key} className="fr-field">
                    <span className="fr-label">{label}</span>
                    <input
                      type="number"
                      className={`fr-input${actErrors[key] ? ' fr-input-error' : ''}`}
                      value={actScores[key]}
                      min={min}
                      max={max}
                      placeholder={`${min}–${max}`}
                      aria-invalid={actErrors[key] ? 'true' : undefined}
                      onKeyDown={e => {
                        // Block e, E, +, - which type="number" normally allows
                        if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault()
                      }}
                      onChange={e => {
                        setActScores(prev => ({ ...prev, [key]: e.target.value }))
                        if (actErrors[key]) setActErrors(prev => ({ ...prev, [key]: null }))
                      }}
                    />
                    {actErrors[key] && <span className="fr-field-error">{actErrors[key]}</span>}
                  </label>
                ))}
              </div>
            </section>

            <section aria-labelledby="fr-credits">
              <h3 className="fr-section" id="fr-credits">Credits you already have</h3>
              <p className="fr-hint">AP, IB, CLEP or Cambridge exams, and courses you transferred. They fill requirements in your plan, so nothing is planned twice.</p>

              {pendingRecords.length === 0 ? (
                <p className="fr-empty">None added yet.</p>
              ) : (
                <div className="fr-credit-groups">
                  {groupAndSortPriorCredits(
                    pendingRecords.map((rec, i) => ({ ...rec, _pendingIndex: i }))
                  ).map(group => (
                    <div key={group.type}>
                      <p className="fr-credit-group">{group.label}</p>
                      <ul className="fr-credit-list">
                        {group.entries.map(rec => (
                          <li key={rec._pendingIndex} className="fr-credit">
                            <span className="fr-credit-main">
                              <span className="fr-credit-code">{rec.satisfies_course_code ? formatCourseCode(rec.satisfies_course_code) : 'Placement only'}</span>
                              {rec.note && <span className="fr-credit-note">{rec.note}</span>}
                            </span>
                            <span className="fr-credit-hours">{(rec.credits_awarded ?? 0) === 0 ? 'No hours' : hoursText(rec.credits_awarded)}</span>
                            <button
                              type="button"
                              className="fr-link"
                              onClick={() => handleRemovePending(rec._pendingIndex)}
                              aria-label={`Remove ${rec.satisfies_course_code ? formatCourseCode(rec.satisfies_course_code) : 'entry'}`}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" className="fr-btn fr-add-credit" onClick={() => setShowWizard(true)} disabled={loading}>
                Add a credit
              </button>
            </section>

            {error && <p className="fr-error" role="alert">{error}</p>}

            <div className="fr-actions">
              <button className="fr-btn" onClick={() => setStep(stepBefore(steps, 'scores-and-credits'))} disabled={loading}>Back</button>
              <button className="fr-btn fr-btn-primary" onClick={handleBuild} disabled={loading}>
                {loading ? 'Building your plan…' : 'Build my plan'}
              </button>
            </div>
          </div>
        )}

        {/* ── 4. The plan to look over. Nothing is saved until "Open my plan". ── */}
        {current === 'ready' && summary && (
          <div className="fr-body">
            <div className="fr-ready">
              <section className="fr-fact fr-fact-finish" aria-label="When you finish">
                <p className="fr-fact-label">You finish</p>
                <p className="fr-fact-big">{summary.finish ?? 'Not worked out'}</p>
                <p className="fr-fact-text">
                  {summary.semesterCount} {summary.semesterCount === 1 ? 'semester' : 'semesters'}
                  {summary.totalHours != null && ` · ${hoursText(summary.totalHours)}`}
                </p>
              </section>

              {summary.now && (
                <section className="fr-fact">
                  <h3 className="fr-fact-title">
                    {summary.now.phase === 'current' ? 'This semester' : 'Your first semester'}: {hoursText(summary.now.hours)}, {summary.now.courses} {summary.now.courses === 1 ? 'course' : 'courses'}
                  </h3>
                  <p className="fr-fact-text">
                    {summary.now.phase === 'current' ? `${summary.now.label} is under way.` : `${summary.now.label} starts your plan.`}{' '}
                    Courses you have not chosen yet are marked “Pick a course”.
                  </p>
                </section>
              )}

              {summary.math && (
                <section className="fr-fact">
                  <h3 className="fr-fact-title">Your math starts in {summary.math.name ?? formatCourseCode(summary.math.course)}</h3>
                  <p className="fr-fact-text">{summary.math.sentence}</p>
                </section>
              )}

              {summary.picks > 0 && (
                <section className="fr-fact">
                  <h3 className="fr-fact-title">{summary.picks} course {summary.picks === 1 ? 'pick is' : 'picks are'} still to make</h3>
                  <p className="fr-fact-text">Plan check, at the top of your plan, says which one to start with. The rest can wait.</p>
                </section>
              )}
            </div>

            {error && <p className="fr-error" role="alert">{error}</p>}

            <div className="fr-actions">
              <button className="fr-btn" onClick={() => { setError(null); setStep(stepBefore(steps, 'ready')) }} disabled={loading}>Back</button>
              <button className="fr-btn fr-btn-primary" onClick={saveFirstPlan} disabled={loading}>
                {loading ? 'Saving…' : 'Open my plan'}
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
