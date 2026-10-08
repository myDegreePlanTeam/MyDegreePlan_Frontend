import { useEffect, useState, useMemo, useRef } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import { db } from '../lib/dataClient'
import { getScienceWarnings, getPoolLimitWarnings, POOL_LABELS, POOL_COURSES, REQUIREMENT_POOLS } from '../lib/poolResolver'
import { plannerCodes, fetchCourseDetail } from '../lib/plannerCatalog'
import { applyChosenHours } from '../lib/creditHours'
import { selectWithOptional, isMissingColumn } from '../lib/dbErrors'
import { computeSemesterTerms, formatTermLabel, lastNonSummerTerm, advanceTerm, termForDate, isSameTerm } from '../lib/semesterTerms'
import { semesterPhases, statusForPhase, splitCreditsByPhase } from '../lib/termPhase'
import { UNDO_LIMIT, stampUndo, pruneUndo, isUndoApplicable, loadUndo, saveUndo } from '../lib/undoStore'
import { isEnrollmentAllowed, getSeasonRestriction } from '../lib/semesterRestrictions'
import { checkPrereqs, checkCoreqsProvisional } from '../lib/prereqChecker'
import { getMoveConflicts } from '../lib/dragConflicts'
import { resolveTransferCredits, resolveTransferDetails, computePlanCredits, getTakenCodes, creditsBeforeSemester, summarizePriorCredits } from '../lib/transferCredits'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { fetchRequirementSlots } from '../lib/requirementSlots'
import { approximatePlanOf, catalogYearForProfile } from '../lib/catalogYears'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'
import { buildPlanIssues, countIssuesBySemester, FULL_TIME_MIN, HEAVY_LOAD_MAX } from '../lib/planIssues'
import Semester from './Semester'
import { calculateCredits } from '../lib/semesterCredits'
import { getPoolRemainder } from '../lib/poolRemainder'
import SlotModal from './SlotModal'
import CoursePanel from './CoursePanel'
import AddCourseModal from './AddCourseModal'
import { DegreeplanSkeleton } from './Skeletons'
import PriorCreditWizard from './PriorCreditWizard'
import ExportPlanButton from './ExportPlanButton'
import PlanPdfPreview from './PlanPdfPreview'
import Sidebar from './shell/Sidebar'
import IssuesView from './shell/IssuesView'
import AdvisementView from './shell/AdvisementView'
import SettingsView, { ConcentrationModal, ResetModal } from './shell/SettingsView'
import './Dashboard.css'
import './shell/AppShell.css'

// Credit-hour thresholds for academic standing
const STANDING_THRESHOLDS = { junior: 60, senior: 90 }

// student_free_add_slots columns every database has. fills_slot_id links a
// follow-up pick to the Free Elective slot it spends hours from. It is in the
// Docker baseline schema; an install whose setup container has not re-run since
// lacks it, so plans still load there, without links.
const FREE_ADD_COLUMNS = 'id, course_code, semester_number, status'

function isMissingFillsSlotColumn(error) {
  return !!error && (error.code === '42703' || /fills_slot_id/.test(error.message ?? ''))
}

async function fetchFreeAddSlots(studentId) {
  const query = columns => db
    .from('student_free_add_slots')
    .select(columns)
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  const result = await query(`${FREE_ADD_COLUMNS}, fills_slot_id, credits`)
  return isMissingFillsSlotColumn(result.error) ? query(FREE_ADD_COLUMNS) : result
}

// student_plan_slots.selected_credits (hours chosen for a ranged course) is newer than the rest of the table.
// A database that lacks it is written without it; only a pick that has hours to record needs the column.
async function upsertPlanSlot(payload, hours = null) {
  const target = { onConflict: 'student_id, requirement_slot_id' }
  const result = await db.from('student_plan_slots').upsert({ ...payload, selected_credits: hours }, target)
  if (isMissingColumn(result.error) && hours == null) return db.from('student_plan_slots').upsert(payload, target)
  return result
}

// Human-readable labels for prior credit types
const CREDIT_TYPE_LABELS = {
  ap_credit:       'AP',
  transfer_credit: 'Transfer',
  test_out:        'CLEP',
  ib_credit:       'IB',
  act_placement:   'ACT',
  act_credit:      'ACT',
  cambridge:       'Cambridge',
}

export default function DegreePlan({ profile, onProfileChange }) {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [slots, setSlots]                         = useState([])
  // baseCourses: the catalog rows as loaded. `courses` (below) is the same map with the student's chosen
  // hours applied for a course that carries a range of credit hours (see creditHours.js).
  const [baseCourses, setCourses]                 = useState({})
  const [loading, setLoading]                     = useState(true)
  const [error, setError]                         = useState(null)
  // view: which sidebar tab is showing
  const [view, setView]                           = useState('plan')
  // selection: the course row open in the side panel —
  //   { kind: 'slot', id: requirementSlotId } | { kind: 'free', id: freeAddId } | null
  const [selection, setSelection]                 = useState(null)
  const [lastSavedAt, setLastSavedAt]             = useState(null)
  const [planSlots, setPlanSlots]                 = useState({})
  const [planCreditsRemaining, setPlanCreditsRemaining] = useState({})
  // planSemesterOverrides: { reqSlotId: number } — student's drag-moved semesters
  const [planSemesterOverrides, setPlanSemesterOverrides] = useState({})
  // freeAddSlots: [{id, course_code, semester_number, status}]
  const [freeAddSlots, setFreeAddSlots]           = useState([])
  // priorCredits: [{id, credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded}]
  const [priorCredits, setPriorCredits]           = useState([])
  const [prereqMap, setPrereqMap]                 = useState({})
  const [coreqMap, setCoreqMap]                   = useState({})
  const [semesterNotes, setSemesterNotes]         = useState({})
  const [showSwitchModal, setShowSwitchModal]     = useState(false)
  const [switching, setSwitching]                 = useState(false)
  const [showResetModal, setShowResetModal]       = useState(false)
  const [resetting, setResetting]                 = useState(false)
  // conflictModal: { title, reasons: string[] } | null
  const [conflictModal, setConflictModal]         = useState(null)
  const [resetKey, setResetKey]                   = useState(0)
  const [extraSemesters, setExtraSemesters]         = useState([])
  const [extraSemesterTerms, setExtraSemesterTerms] = useState({})
  // addCourseTarget: number | null — which semester the Add Course modal is open for
  const [addCourseTarget, setAddCourseTarget]     = useState(null)
  // draggedSlotId: id of the slot currently being dragged (for DragOverlay label)
  const [draggedSlotId, setDraggedSlotId]         = useState(null)
  // showWizard: true when the guided prior credit wizard is open
  const [showWizard, setShowWizard]               = useState(false)
  // planSelectedCredits: { [slotId]: hours } the student chose for a ranged pool pick
  const [planSelectedCredits, setPlanSelectedCredits] = useState({})
  const courses = useMemo(
    () => applyChosenHours(baseCourses, { freeAdds: freeAddSlots, planSlots, planSelectedCredits }),
    [baseCourses, freeAddSlots, planSlots, planSelectedCredits],
  )

  // planArchived: { [slotId]: archiveReason | true } — slots removed from grid by
  // a prior credit (Concept 2 / Bug 2) or by the degree builder
  // ('not_applicable' math-chain courses). Persisted as archived=true plus
  // archive_reason in student_plan_slots. Always truthy when archived.
  //
  // TODO: individual course completion status will be driven by Banner transcript
  // data on university integration. Do not add manual per-course completion
  // toggles until that integration defines the source of truth.
  const [planArchived, setPlanArchived]           = useState({})

  // semesterExpanded: { [semNum]: boolean } — local collapse/expand state
  // Past semesters start collapsed (the effect after semesterPhase).
  const [semesterExpanded, setSemesterExpanded]   = useState({})

  const [undoStack, setUndoStack]                 = useState([])
  const [saveError, setSaveError]                 = useState(null)
  const saveErrorTimerRef                         = useRef(null)

  function showSaveError(msg) {
    setSaveError(msg)
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current)
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 5000)
  }

  // Every record carries a `label` — the Undo button reads "Undo — <label>".
  // The stack is kept in the browser between visits (lib/undoStore.js), so a record carries the time it was made.
  function pushUndo(record) {
    setUndoStack(prev => [...prev.slice(-(UNDO_LIMIT - 1)), stampUndo(record)])
  }

  function markSaved() {
    setLastSavedAt(new Date())
  }

  function slotCode(slot) {
    if (!slot) return 'course'
    return slot.is_pool
      ? (planSlots[slot.id] ?? POOL_LABELS[slot.class_code] ?? slot.class_code)
      : slot.class_code
  }

  // ── syncArchivedSlots ─────────────────────────────────────────────
  // Called after any prior_credit add/remove.  Resolves which slots should
  // be archived (removed from grid) and persists to student_plan_slots.
  // Pass the freshly-computed priorCredits array to avoid stale closure issues.
  async function syncArchivedSlots(newPriorCredits) {
    if (!slots.length) return

    const newTransferFilled = resolveTransferCredits(newPriorCredits, planSlots, slots)

    // Only prior-credit archives are ours to undo. 'not_applicable' slots were
    // archived by the degree builder (math chain) and no prior credit covers them.
    const toArchive   = slots.filter(s => newTransferFilled[s.id] && !planArchived[s.id])
    const toUnarchive = slots.filter(s =>
      planArchived[s.id] && planArchived[s.id] !== 'not_applicable' && !newTransferFilled[s.id]
    )

    if (toArchive.length > 0) {
      await Promise.all(toArchive.map(slot =>
        db.from('student_plan_slots').upsert({
          student_id:           profile.id,
          requirement_slot_id:  slot.id,
          selected_course_code: slot.is_pool
            ? (planSlots[slot.id] ?? null)
            : slot.class_code,
          semester_number:      planSemesterOverrides[slot.id]  ?? null,
          credits_remaining:    planCreditsRemaining[slot.id]   ?? 0,
          archived:             true,
          archive_reason:       'prior_credit',
        }, { onConflict: 'student_id, requirement_slot_id' })
      ))
    }

    if (toUnarchive.length > 0) {
      await db.from('student_plan_slots')
        .update({ archived: false, archive_reason: null })
        .eq('student_id', profile.id)
        .in('requirement_slot_id', toUnarchive.map(s => s.id))
    }

    setPlanArchived(prev => {
      const next = { ...prev }
      for (const slot of toArchive)   next[slot.id] = true
      for (const slot of toUnarchive) delete next[slot.id]
      return next
    })
  }

  // ── dnd-kit sensors ──────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // ── Load plan data ───────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)

    async function loadPlan() {
      // Step 1 — requirement slots (template)
      const { data: slotData, error: slotError } = await fetchRequirementSlots(
        db,
        profile.concentration_id,
        catalogYearForProfile(profile),
        'id, semester_number, slot_order, class_code, is_pool, flex_credits, map_semester',
        [{ column: 'semester_number' }, { column: 'slot_order' }],
      )

      if (slotError) { setError(slotError.message); setLoading(false); return }

      // Step 2 — student's saved selections + overrides + archived status
      const slotIds = slotData.map(s => s.id)
      const { data: savedSlots, error: savedSlotsError } = await selectWithOptional(
        columns => db
          .from('student_plan_slots')
          .select(columns)
          .eq('student_id', profile.id)
          .in('requirement_slot_id', slotIds),
        'requirement_slot_id, selected_course_code, status, semester_number, credits_remaining, archived, archive_reason',
        ['selected_credits'],
      )

      if (savedSlotsError) { setError(savedSlotsError.message); setLoading(false); return }

      const planSlotsMap             = {}
      const planSemesterOverridesMap = {}
      const planCreditsRemainingMap  = {}
      const planArchivedMap          = {}
      const planSelectedCreditsMap   = {}
      for (const row of savedSlots) {
        planSlotsMap[row.requirement_slot_id]    = row.selected_course_code
        if (row.semester_number != null)
          planSemesterOverridesMap[row.requirement_slot_id] = row.semester_number
        if (row.credits_remaining > 0)
          planCreditsRemainingMap[row.requirement_slot_id] = row.credits_remaining
        if (row.archived)
          planArchivedMap[row.requirement_slot_id] = row.archive_reason || true
        if (row.selected_credits != null)
          planSelectedCreditsMap[row.requirement_slot_id] = row.selected_credits
      }

      // Step 3 — free-add slots
      const { data: freeAdds, error: freeAddError } = await fetchFreeAddSlots(profile.id)

      if (freeAddError) { setError(freeAddError.message); setLoading(false); return }

      // Step 4 — collect all course codes to fetch
      const allCodes = plannerCodes(slotData, (freeAdds ?? []).map(f => f.course_code))

      // Step 5 — fetch courses
      const { data: courseData, error: courseError } = await selectWithOptional(
        columns => db.from('courses').select(columns).in('code', allCodes),
        'code, name, credits, subject_code, standing_req, description',
        ['credits_max'],
      )

      if (courseError) { setError(courseError.message); setLoading(false); return }
      const courseMap = {}
      for (const course of courseData) courseMap[course.code] = course

      // Step 6 — prerequisites
      const { data: prereqData, error: prereqError } = await db
        .from('prerequisite_entries')
        .select('course_code, group_index, logic, required_code')
        .in('course_code', allCodes)

      if (prereqError) { setError(prereqError.message); setLoading(false); return }

      // Grouped by group_index, with course substitutes applied (MATH1906
      // also satisfies MATH1910 requirements — see requirementMap.js).
      const prereqMapBuilt = buildRequirementMap(prereqData)

      // Step 6b — corequisites
      // Fetch group_index and logic so OR groups can short-circuit correctly.
      const { data: coreqData } = await db
        .from('corequisite_entries')
        .select('course_code, required_code, group_index, logic')
        .in('course_code', allCodes)

      const coreqMapBuilt = buildRequirementMap(coreqData)

      // Step 7 — semester notes and the terms of added semesters
      const { data: notesData } = await db
        .from('student_semester_notes')
        .select('semester_number, note_text, term_season, term_year')
        .eq('student_id', profile.id)
        .eq('concentration_id', profile.concentration_id)

      const semNotesMap     = {}
      const extraTermsMap   = {}
      for (const row of notesData ?? []) {
        semNotesMap[row.semester_number] = row.note_text
        if (row.term_season && row.term_year)
          extraTermsMap[row.semester_number] = { season: row.term_season, year: row.term_year }
      }

      // Step 7.5 — prior credits (placement gates + transfer/AP credits)
      const { data: priorCreditsData, error: pcError } = await db
        .from('prior_credits')
        .select('id, credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded')
        .eq('plan_id', profile.id)
        .order('created_at', { ascending: true })

      if (pcError) { setError(pcError.message); setLoading(false); return }

      // Step 7.6 — place slots that have no semester.
      // requirement_slots.semester_number is NULL under the flat templates, so a
      // slot's position lives only in student_plan_slots. When those rows are
      // missing (plan wiped by a re-seed, concentration switch, onboarding
      // before the degree builder existed) every slot resolves to no semester
      // and the grid renders empty. Run the degree builder and persist its
      // placement for just those slots; saved positions are left alone.
      const unplaced = slotData.filter(s =>
        !planArchivedMap[s.id] &&
        (planSemesterOverridesMap[s.id] ?? s.semester_number) == null
      )
      if (unplaced.length > 0) {
        const { assignments, archived } = buildDegreePlan({
          slots:        slotData,
          courseMap,
          prereqMap:    prereqMapBuilt,
          coreqMap:     coreqMapBuilt,
          priorCredits: priorCreditsData ?? [],
          studentProfile: {
            student_type: profile.student_type,
            act_math:     profile.act_math,
            sat_math:     profile.sat_math,
            start_season: profile.start_season,
          },
        })

        const placedRows = []
        for (const slot of unplaced) {
          const row = {
            student_id:           profile.id,
            requirement_slot_id:  slot.id,
            selected_course_code: planSlotsMap[slot.id] ?? (slot.is_pool ? null : slot.class_code),
            credits_remaining:    planCreditsRemainingMap[slot.id] ?? 0,
          }
          if (archived[slot.id]) {
            planArchivedMap[slot.id] = archived[slot.id]
            placedRows.push({ ...row, semester_number: null, archived: true,
              archive_reason: archived[slot.id], position_source: null })
          } else if (assignments[slot.id] != null) {
            planSemesterOverridesMap[slot.id] = assignments[slot.id]
            placedRows.push({ ...row, semester_number: assignments[slot.id], archived: false,
              archive_reason: null, position_source: 'algorithm' })
          }
        }

        const { error: placeError } = await db
          .from('student_plan_slots')
          .upsert(placedRows, { onConflict: 'student_id, requirement_slot_id' })
        if (placeError) {
          // The grid still renders from the computed positions; they are
          // recomputed on the next load until the save succeeds.
          console.error('[loadPlan] student_plan_slots upsert failed:', placeError)
          showSaveError(`Couldn't save your plan layout: ${placeError.message}`)
        }
      }

      // Step 8 — commit all state at once
      // MATH1920 and other inapplicable math-chain courses are archived by the
      // degree-builder algorithm at onboarding (archive_reason = 'not_applicable').
      // They appear in planArchivedMap and are filtered out of the grid via
      // semesterMap. No separate client-side filter is needed here.
      setSlots(slotData)
      setCourses(courseMap)
      setPrereqMap(prereqMapBuilt)
      setCoreqMap(coreqMapBuilt)
      setPlanSlots(planSlotsMap)
      setPlanSelectedCredits(planSelectedCreditsMap)
      setPlanSemesterOverrides(planSemesterOverridesMap)
      setPlanCreditsRemaining(planCreditsRemainingMap)
      setPlanArchived(planArchivedMap)
      setFreeAddSlots(freeAdds ?? [])
      setSemesterNotes(semNotesMap)
      setPriorCredits(priorCreditsData ?? [])
      setExtraSemesterTerms(extraTermsMap)
      // the undo stack of the last visit, less any record whose slot or added course is gone
      setUndoStack(pruneUndo(loadUndo(profile)).filter(r => isUndoApplicable(r, { slots: slotData, freeAddSlots: freeAdds ?? [] })))
      setLoading(false)
    }

    loadPlan()
    // Reload only when the program or a reset changes; the rest of `profile` is read once per load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.concentration_id, resetKey])

  // ── One-shot archive sync after initial load (BUG-23) ─────────────
  // Prior credits inserted during onboarding bypass handleAddPriorCredit,
  // so syncArchivedSlots never runs on them — leaving covered slots
  // visible on the grid on first load.  This effect detects and repairs
  // that state once slots + priorCredits are loaded.
  useEffect(() => {
    if (loading)                 return
    if (!slots.length)           return
    if (priorCredits.length === 0) return

    const targetArchived = resolveTransferCredits(priorCredits, planSlots, slots)
    const needsSync = slots.some(s => targetArchived[s.id] && !planArchived[s.id])
    if (needsSync) syncArchivedSlots(priorCredits)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, slots, priorCredits, planArchived])

  // ── Build semesterMap — archived and unplaced slots excluded ────────────
  // Archived slots (prior credit or not_applicable) are removed from the grid.
  // loadPlan places every slot with no resolved semester (Step 7.6); a slot
  // that still has none is omitted rather than rendered under "null".
  const semesterMap = useMemo(() => {
    return slots.reduce((acc, slot) => {
      if (planArchived[slot.id]) return acc
      const sem = planSemesterOverrides[slot.id] ?? slot.semester_number
      if (sem == null) return acc   // algorithm hasn't placed this slot yet
      if (!acc[sem]) acc[sem] = []
      acc[sem].push(slot)
      return acc
    }, {})
  }, [slots, planSemesterOverrides, planArchived])

  const freeAddBySemester = useMemo(() => {
    return freeAddSlots.reduce((acc, s) => {
      if (!acc[s.semester_number]) acc[s.semester_number] = []
      acc[s.semester_number].push(s)
      return acc
    }, {})
  }, [freeAddSlots])

  const semesterNumbers = useMemo(() => {
    const all = new Set([
      ...Object.keys(semesterMap).map(Number),
      ...Object.keys(freeAddBySemester).map(Number),
    ])
    return [...all].sort((a, b) => a - b)
  }, [semesterMap, freeAddBySemester])

  const maxTemplateSem = semesterNumbers.length > 0 ? Math.max(...semesterNumbers) : 0

  const allSemesterNumbers = useMemo(() => {
    return [...new Set([...semesterNumbers, ...extraSemesters])].sort((a, b) => a - b)
  }, [semesterNumbers, extraSemesters])

  // Derive the canonical semester list from algorithm-assigned positions
  // (planSemesterOverrides) with the template hint as fallback for slots not
  // yet written by the balancer.  This ensures semester term labels track the
  // algorithm's output rather than the static seed-data layout.
  const templateSemNums = useMemo(
    () => {
      const effective = slots.map(s => planSemesterOverrides[s.id] ?? s.semester_number)
      return [...new Set(effective)].filter(n => n != null).sort((a, b) => a - b)
    },
    [slots, planSemesterOverrides]
  )

  const semesterTerms = useMemo(
    () => computeSemesterTerms(profile.start_season, profile.start_year, templateSemNums, extraSemesterTerms),
    [profile.start_season, profile.start_year, templateSemNums, extraSemesterTerms]
  )

  // ── Past, current and future terms, from the calendar ─────────────────
  // A course in a past term counts as passed, one in the current term is in progress, one in a later term is planned
  // (lib/termPhase.js). A student who did not pass a course removes it or moves it to a later term. Nothing is marked.
  const [today] = useState(() => new Date())
  const semesterPhase = useMemo(() => semesterPhases(semesterTerms, today), [semesterTerms, today])
  const planStatuses = useMemo(() => {
    const statuses = {}
    for (const slot of slots) {
      statuses[slot.id] = statusForPhase(semesterPhase[planSemesterOverrides[slot.id] ?? slot.semester_number])
    }
    return statuses
  }, [slots, planSemesterOverrides, semesterPhase])
  const statusOfFreeAdd = fa => statusForPhase(semesterPhase[fa.semester_number])

  // Keep the undo stack in the browser. Not while loading: the stack of the last visit is read when the plan has loaded.
  useEffect(() => {
    if (!loading) saveUndo(profile, undoStack)
  }, [loading, undoStack, profile])

  // Past semesters start collapsed, once, when the plan has loaded; the student can still open them.
  const collapsedPastRef = useRef(false)
  useEffect(() => {
    if (loading || collapsedPastRef.current) return
    collapsedPastRef.current = true
    const past = Object.entries(semesterPhase).filter(([, phase]) => phase === 'past').map(([n]) => [n, false])
    if (past.length) setSemesterExpanded(prev => ({ ...Object.fromEntries(past), ...prev }))
  }, [loading, semesterPhase])

  // ── Science sequence warnings ─────────────────────────────────────
  const scienceWarnings = useMemo(
    () => getScienceWarnings(planSlots, slots),
    [planSlots, slots]
  )

  // ── Non-archived slots (archived = covered by a prior credit) ──────
  const activeSlots = useMemo(
    () => slots.filter(s => !planArchived[s.id]),
    [slots, planArchived]
  )

  // ── Codes already in the plan (BUG-34) ─────────────────────────────
  // Mirrors computePlanCredits dedup keyspace. Passed to AddCourseModal so
  // the picker greys out duplicates of template, pool, free-add, or
  // credit-bearing prior_credits entries. Archived slots don't count: a
  // prior credit covering one is caught by the prior-credit pass, and a
  // 'not_applicable' course isn't in the plan, so it may be added freely.
  const takenCodes = useMemo(
    () => getTakenCodes(planSlots, activeSlots, priorCredits, freeAddSlots),
    [planSlots, activeSlots, priorCredits, freeAddSlots]
  )

  // ── Free Elective hours no course covers yet ──────────────────────
  // { [slotId]: hours }. A Free Elective is an hours bucket (8 in the Flight
  // Foundations Core plan): a short course fills part of it and the rest stays
  // owed, shown as another choice row under the slot. For an unfilled slot it
  // is the slot's own open hours. Derived from the picks, never stored.
  const remainders = useMemo(() => {
    const out = {}
    for (const slot of activeSlots) {
      const hours = getPoolRemainder(slot, planSlots, courses, freeAddSlots)
      if (hours > 0) out[slot.id] = hours
    }
    return out
  }, [activeSlots, planSlots, courses, freeAddSlots])

  // ── Pool limits (the Area of Emphasis hours, for Mechanical Engineering) ──
  const poolLimitWarnings = useMemo(
    () => getPoolLimitWarnings(planSlots, slots, courses, planArchived),
    [planSlots, slots, courses, planArchived]
  )

  // ── Transfer credit slot satisfaction ────────────────────────────
  const transferFilled = useMemo(
    () => resolveTransferCredits(priorCredits, planSlots, slots),
    [priorCredits, planSlots, slots]
  )

  // ── Credit totals ─────────────────────────────────────────────────
  // computePlanCredits dedups across prior_credits, plan_slots, and
  // free-add slots — a course code contributes once, with prior credits
  // winning over plan slots and plan slots winning over free-add (BUG-6).
  // Only active slots count: an archived slot is either covered by a prior
  // credit (counted in pass 1) or not part of this student's degree
  // (not_applicable math-chain courses).
  const creditTotals = useMemo(() => {
    const { breakdown } = computePlanCredits(
      planSlots, priorCredits, activeSlots, courses, freeAddSlots
    )
    // earned = prior credit and courses in past terms; the rest is still ahead
    const semesterOfItem = item => item.slotId != null
      ? (planSemesterOverrides[item.slotId] ?? activeSlots.find(sl => sl.id === item.slotId)?.semester_number)
      : freeAddSlots.find(f => f.id === item.freeAddId)?.semester_number
    return splitCreditsByPhase(breakdown, semesterOfItem, semesterPhase)
  }, [activeSlots, planSlots, planSemesterOverrides, semesterPhase, courses, freeAddSlots, priorCredits])

  // ── Transfer details (richer info for badge labels) ───────────────
  const transferDetails = useMemo(
    () => resolveTransferDetails(priorCredits, planSlots, slots),
    [priorCredits, planSlots, slots]
  )

  // ── Reactive prerequisite warnings (Bug 4 fix) ───────────────────
  // completedCodes = codes placed in strictly earlier semesters.
  // The completion toggle (planSemesterCompleted) is purely a UI affordance
  // (collapse the card); it does not feed satisfaction into the prereq
  // checker. BUG-13: previously a later completed semester satisfied
  // prereqs of earlier-semester courses regardless of direction.
  // Archived and unplaced slots are left out: their semester is null, and
  // `null < n` is true, so they used to count as completed before everything.
  // Prior-credit courses still satisfy prereqs through priorCredits.
  // An unfilled requirement-pool slot in an earlier semester provisionally
  // meets a prereq its pool offers (CSC3040 after an empty Communications
  // slot); poolReliance records which slots that leaned on, and which courses
  // leaned on them, for the Issues tab's "incomplete selection" entries.
  const { prereqWarnings, poolReliance } = useMemo(() => {
    const placed  = []
    const pending = []

    for (const slot of activeSlots) {
      const sem  = planSemesterOverrides[slot.id] ?? slot.semester_number
      const code = slot.is_pool ? planSlots[slot.id] : slot.class_code
      if (sem == null) continue
      if (code) placed.push({ key: slot.id, code, sem })
      else if (slot.is_pool && REQUIREMENT_POOLS.has(slot.class_code)) {
        pending.push({ key: slot.id, sem, codes: POOL_COURSES[slot.class_code] ?? [] })
      }
    }
    for (const fa of freeAddSlots) {
      placed.push({ key: `fa_${fa.id}`, code: fa.course_code, sem: fa.semester_number })
    }

    const warnings = {}
    const reliance = {}
    for (const item of placed) {
      const completedCodes = new Set(
        placed
          .filter(p => p.sem < item.sem)
          .map(p => p.code)
      )
      const pendingPools = pending.filter(p => p.sem < item.sem)
      const result = checkPrereqs(item.code, prereqMap, completedCodes, priorCredits, courses, coreqMap, pendingPools)
      if (!result.satisfied) warnings[item.key] = result.missing
      for (const key of result.relyingOn ?? []) (reliance[key] ??= []).push(item.code)
    }
    return { prereqWarnings: warnings, poolReliance: reliance }
  }, [activeSlots, planSlots, freeAddSlots, planSemesterOverrides, prereqMap, priorCredits, courses, coreqMap])

  // ── Reactive corequisite warnings (Bug 4 fix) ────────────────────
  // availableCodes = completedCodes (strictly earlier) + same-semester codes
  // Corequisites check against availableCodes (same-semester enrollment counts).
  // BUG-13: the completion toggle does not feed satisfaction in either
  // direction; only positional ordering does. Archived and unplaced slots are
  // left out, as in prereqWarnings.
  // An unfilled requirement-pool slot in the same or an earlier semester provisionally meets a corequisite its pool
  // offers (CSC3220 with the Statistics slot), as it does for prerequisites; coreqReliance records which slots that
  // leaned on, for the same "incomplete selection" entries.
  const { coreqWarnings, coreqReliance } = useMemo(() => {
    const placed = []
    const pending = []

    for (const slot of activeSlots) {
      const sem  = planSemesterOverrides[slot.id] ?? slot.semester_number
      const code = slot.is_pool ? planSlots[slot.id] : slot.class_code
      if (code && sem != null) placed.push({ key: slot.id, code, sem })
      else if (sem != null && slot.is_pool && REQUIREMENT_POOLS.has(slot.class_code)) {
        pending.push({ key: slot.id, sem, codes: POOL_COURSES[slot.class_code] ?? [] })
      }
    }
    for (const fa of freeAddSlots) {
      placed.push({ key: `fa_${fa.id}`, code: fa.course_code, sem: fa.semester_number })
    }

    const priorCodes = priorCredits
      .filter(pc => pc.satisfies_course_code)
      .map(pc => pc.satisfies_course_code)

    const warnings = {}
    const reliance = {}
    for (const item of placed) {
      const completedCodes = new Set([
        ...placed
          .filter(p => p.sem < item.sem)
          .map(p => p.code),
        ...priorCodes,
      ])

      const availableCodes = new Set([
        ...completedCodes,
        ...placed
          .filter(p => p.sem === item.sem && p.code !== item.code)
          .map(p => p.code),
      ])

      const result = checkCoreqsProvisional(item.code, coreqMap, availableCodes, pending.filter(p => p.sem <= item.sem))
      if (!result.satisfied) warnings[item.key] = result.missing
      for (const key of result.relyingOn ?? []) (reliance[key] ??= []).push(item.code)
    }
    return { coreqWarnings: warnings, coreqReliance: reliance }
  }, [activeSlots, planSlots, freeAddSlots, planSemesterOverrides, coreqMap, priorCredits])

  // ── Standing requirement warnings ────────────────────────────────
  // creditsBeforeSemester skips archived slots and counts unfilled pool slots
  // at their expected hours (shared with SlotModal's course picker).
  const standingWarnings = useMemo(() => {
    const plan = { slots, planSlots, planSemesterOverrides, planArchived, priorCredits, courses, freeAddSlots }
    const warnings = {}

    for (const slot of activeSlots) {
      const sem  = planSemesterOverrides[slot.id] ?? slot.semester_number
      const code = slot.is_pool ? planSlots[slot.id] : slot.class_code
      if (!code || sem == null) continue

      const course = courses[code]
      if (!course?.standing_req) continue

      const threshold = STANDING_THRESHOLDS[course.standing_req]
      if (!threshold) continue

      if (creditsBeforeSemester(sem, plan) < threshold) {
        warnings[slot.id] = course.standing_req
      }
    }
    return warnings
  }, [slots, activeSlots, planSlots, planArchived, freeAddSlots, planSemesterOverrides, courses, priorCredits])

  // ── Save a pool/required course selection (optimistic) ────────────
  // hours: how many credit hours the student chose for a course that carries a range (null otherwise)
  function handleSave(slot, course, hours = null) {
    let creditsRemaining = 0
    if (slot.is_pool && slot.flex_credits > 0) {
      const diff = slot.flex_credits - (hours ?? course.credits)
      creditsRemaining = diff > 0 ? diff : 0
    }

    const prevSlots            = planSlots
    const prevCreditsRemaining = planCreditsRemaining
    const prevSelectedCredits  = planSelectedCredits

    pushUndo({
      type: 'pool_select', slotId: slot.id, label: `Chose ${course.code}`,
      prevCourseCode: planSlots[slot.id] ?? null,
      prevCreditsRemaining: planCreditsRemaining[slot.id] ?? 0,
      prevSelectedCredits: planSelectedCredits[slot.id] ?? null,
    })
    setPlanSlots(prev          => ({ ...prev, [slot.id]: course.code }))
    setPlanCreditsRemaining(prev => ({ ...prev, [slot.id]: creditsRemaining }))
    setPlanSelectedCredits(prev => {
      const next = { ...prev }
      if (hours != null) next[slot.id] = hours
      else delete next[slot.id]
      return next
    })

    upsertPlanSlot({
        student_id:           profile.id,
        requirement_slot_id:  slot.id,
        selected_course_code: course.code,
        semester_number:      planSemesterOverrides[slot.id] ?? null,
        credits_remaining:    creditsRemaining,
      }, hours)
      .then(({ error }) => {
        if (error) {
          setPlanSlots(prevSlots)
          setPlanCreditsRemaining(prevCreditsRemaining)
          setPlanSelectedCredits(prevSelectedCredits)
          showSaveError(hours != null && isMissingColumn(error)
            ? 'Choosing credit hours needs a database update. Restart the stack so its setup step can apply it.'
            : 'Course selection could not be saved. Please try again.')
        } else {
          markSaved()
        }
      })
  }

  // ── Remove a pool slot selection ──────────────────────────────────
  async function handleRemove(slot) {
    const { error } = await db
      .from('student_plan_slots')
      .delete()
      .eq('student_id', profile.id)
      .eq('requirement_slot_id', slot.id)

    if (!error) {
      setPlanSlots(prev    => { const n = { ...prev }; delete n[slot.id]; return n })
      setPlanCreditsRemaining(prev => { const n = { ...prev }; delete n[slot.id]; return n })
      markSaved()
    } else {
      showSaveError('Could not clear the selection. Please try again.')
    }
  }

  // ── Undo the most recent action ───────────────────────────────────
  async function handleUndo() {
    if (!undoStack.length) return
    const record = undoStack[undoStack.length - 1]
    setUndoStack(prev => prev.slice(0, -1))
    // a stored record can outlive the course it refers to (removed since, or the plan was rebuilt)
    if (!isUndoApplicable(record, { slots, freeAddSlots })) {
      showSaveError('That change can no longer be undone: the course is no longer in your plan.')
      return
    }

    if (record.type === 'pool_select') {
      if (record.prevCourseCode === null) {
        await handleRemove(slots.find(s => s.id === record.slotId))
      } else {
        setPlanSlots(prev => ({ ...prev, [record.slotId]: record.prevCourseCode }))
        setPlanCreditsRemaining(prev => ({ ...prev, [record.slotId]: record.prevCreditsRemaining ?? 0 }))
        setPlanSelectedCredits(prev => {
          const next = { ...prev }
          if (record.prevSelectedCredits != null) next[record.slotId] = record.prevSelectedCredits
          else delete next[record.slotId]
          return next
        })
        await upsertPlanSlot({
          student_id: profile.id, requirement_slot_id: record.slotId,
          selected_course_code: record.prevCourseCode,
          semester_number: planSemesterOverrides[record.slotId] ?? null,
          credits_remaining: record.prevCreditsRemaining ?? 0,
        }, record.prevSelectedCredits ?? null)
      }

    } else if (record.type === 'free_add') {
      const fa = freeAddSlots.find(f => f.id === record.freeAddId)
      if (fa) handleRemoveFreeAdd(fa)

    } else if (record.type === 'note') {
      setSemesterNotes(prev => ({ ...prev, [record.semNum]: record.prevNote }))
      await db.from('student_semester_notes').upsert({
        student_id: profile.id, concentration_id: profile.concentration_id,
        semester_number: record.semNum, note_text: record.prevNote,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id, concentration_id, semester_number' })

    } else if (record.type === 'drag_slot') {
      const prevSem = record.prevSemester
      setPlanSemesterOverrides(prev => ({ ...prev, [record.slotId]: prevSem }))
      const slot = slots.find(s => s.id === record.slotId)
      await db.from('student_plan_slots').upsert({
        student_id: profile.id, requirement_slot_id: record.slotId,
        selected_course_code: slot?.is_pool ? planSlots[record.slotId] ?? null : slot?.class_code ?? null,
        semester_number: prevSem,
        credits_remaining: planCreditsRemaining[record.slotId] ?? 0,
      }, { onConflict: 'student_id, requirement_slot_id' })

    } else if (record.type === 'drag_free') {
      setFreeAddSlots(list => list.map(f => f.id === record.freeAddId ? { ...f, semester_number: record.prevSemester } : f))
      await db.from('student_free_add_slots').update({ semester_number: record.prevSemester }).eq('id', record.freeAddId)
    }
    markSaved()
  }

  // ── Add a free-add course to a semester ──────────────────────────
  // fillsSlot: the Free Elective slot a follow-up pick spends hours from.
  // Resolves to the new row, or undefined when nothing was added.
  // hours: the credit hours the student chose for a course that carries a range (null otherwise)
  async function handleAddCourse(semesterNumber, course, fillsSlot = null, hours = null) {
    setAddCourseTarget(null)

    // BUG-34: defensive guard. The modal already greys taken codes out, but
    // stale state or a keyboard-activation race could let one through.
    if (takenCodes.has(course.code)) {
      showSaveError(`${course.code} is already in your plan.`)
      return
    }

    const { data, error } = await db
      .from('student_free_add_slots')
      .insert({
        student_id:      profile.id,
        course_code:     course.code,
        semester_number: semesterNumber,
        status:          'planned',
        ...(fillsSlot ? { fills_slot_id: fillsSlot.id } : {}),
        ...(hours != null ? { credits: hours } : {}),
      })
      .select(`${FREE_ADD_COLUMNS}${fillsSlot ? ', fills_slot_id' : ''}${hours != null ? ', credits' : ''}`)
      .single()

    if (error) {
      showSaveError(fillsSlot && isMissingFillsSlotColumn(error)
        ? 'Choosing a second course needs a database update. Restart the stack so its setup step can apply it.'
        : hours != null && isMissingColumn(error)
          ? 'Choosing credit hours needs a database update. Restart the stack so its setup step can apply it.'
          : 'Could not add course. Please try again.')
      return
    }

    // The search result carries only a name and hours. Load the rest so the course is checked against its
    // prerequisites now, not after the next page load.
    if (data) {
      const loaded = await fetchCourseDetail(db, course.code)
      if (!loaded.error && loaded.course) {
        setCourses(prev => ({ ...prev, [course.code]: loaded.course }))
        setPrereqMap(prev => ({ ...prev, ...buildRequirementMap(loaded.prereqs) }))
        setCoreqMap(prev => ({ ...prev, ...buildRequirementMap(loaded.coreqs) }))
      } else if (!baseCourses[course.code]) {
        setCourses(prev => ({ ...prev, [course.code]: course }))
      }
    }

    setFreeAddSlots(prev => [...prev, data])
    if (data) pushUndo({ type: 'free_add', freeAddId: data.id, label: `Added ${course.code}` })
    markSaved()
    return data
  }

  // ── Fill the hours a Free Elective's earlier pick left open ───────
  // Adds the course as a free-add in the slot's own term, linked to the slot
  // so its hours come out of the slot's remainder.
  async function handleAddRemainder(slot, course, hours = null) {
    const semNum = planSemesterOverrides[slot.id] ?? slot.semester_number
    const added  = await handleAddCourse(semNum, course, slot, hours)
    if (added) setSelection({ kind: 'free', id: added.id })
  }

  // ── Remove a free-add slot ────────────────────────────────────────
  function handleRemoveFreeAdd(freeAdd) {
    const prev = freeAddSlots
    setFreeAddSlots(list => list.filter(f => f.id !== freeAdd.id))
    setSelection(sel => (sel?.kind === 'free' && sel.id === freeAdd.id ? null : sel))

    db
      .from('student_free_add_slots')
      .delete()
      .eq('id', freeAdd.id)
      .then(({ error }) => {
        if (error) {
          setFreeAddSlots(prev)
          showSaveError('Could not remove course. Please try again.')
        } else {
          markSaved()
        }
      })
  }

  // ── Prior credit CRUD ─────────────────────────────────────────────
  // Accepts a single credit-data object OR an array of them.
  // Passing an array inserts all rows in one call and updates
  // priorCredits state once — avoiding the stale-closure overwrite that
  // occurs when callers loop and call this function once per award.
  async function handleAddPriorCredit(creditDataOrArray) {
    const items   = Array.isArray(creditDataOrArray) ? creditDataOrArray : [creditDataOrArray]
    const inserts = items.map(item => ({ ...item, plan_id: profile.id }))

    const { data, error } = await db
      .from('prior_credits')
      .insert(inserts)
      .select('id, credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded')

    if (error) {
      showSaveError('Could not add credit. Please try again.')
      return
    }

    const newCredits = [...priorCredits, ...(data ?? [])]
    setPriorCredits(newCredits)
    await syncArchivedSlots(newCredits)
    markSaved()
  }

  async function handleRemovePriorCredit(id) {
    const prev       = priorCredits
    const newCredits = priorCredits.filter(pc => pc.id !== id)
    setPriorCredits(newCredits)

    const { error } = await db
      .from('prior_credits')
      .delete()
      .eq('id', id)

    if (error) {
      setPriorCredits(prev)
      showSaveError('Could not remove credit. Please try again.')
      return
    }

    await syncArchivedSlots(newCredits)
    markSaved()
  }

  // ── Global collapse / expand control ─────────────────────────────
  // Undefined means expanded (see isExpanded on Semester), so "any open"
  // is "any not explicitly false".
  const anyExpanded = allSemesterNumbers.some(n => semesterExpanded[n] !== false)

  function toggleAll() {
    const next = {}
    for (const semNum of allSemesterNumbers) next[semNum] = !anyExpanded
    setSemesterExpanded(next)
  }

  // ── Semester notes ────────────────────────────────────────────────
  function handleNoteSave(semesterNumber, noteText) {
    pushUndo({
      type: 'note', semNum: semesterNumber, prevNote: semesterNotes[semesterNumber] ?? '',
      label: `Note on ${formatTermLabel(semesterTerms[semesterNumber]) ?? `semester ${semesterNumber}`}`,
    })
    const prevNotes = semesterNotes
    setSemesterNotes(prev => ({ ...prev, [semesterNumber]: noteText }))

    db
      .from('student_semester_notes')
      .upsert({
        student_id:       profile.id,
        concentration_id: profile.concentration_id,
        semester_number:  semesterNumber,
        note_text:        noteText,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'student_id, concentration_id, semester_number' })
      .then(({ error }) => {
        if (error) {
          setSemesterNotes(prevNotes)
          showSaveError('Semester note could not be saved. Please try again.')
        } else {
          markSaved()
        }
      })
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────

  function handleDragStart({ active }) {
    setDraggedSlotId(active.id)
  }

  // ── Prereq/coreq conflict check for drag moves ──────────────────────────
  // The reasons a move would break a requisite, or [] if it is fine (lib/dragConflicts.js).
  function getDragConflicts(slotId, newSemester) {
    return getMoveConflicts({
      slotId, newSemester, slots, planSlots, planArchived, planSemesterOverrides,
      freeAddSlots, priorCredits, prereqMap, coreqMap,
    })
  }

  // ── Move a course to another semester ─────────────────────────────
  // Shared by drag-and-drop and the course panel's "Move to term" list.
  // Season restrictions and prereq/coreq conflicts are checked here, so both
  // entry points enforce the same rules. A season restriction is final; a
  // prereq/coreq conflict is explained and the student may move anyway
  // (`override`): the way to a plan often passes through a state the checks
  // refuse, and the plan flags the broken requisite on the Issues tab regardless.
  function moveToSemester(type, slotId, newSemester, { override = false } = {}) {
    if (type === 'requirement_slot') {
      const slot = slots.find(s => s.id === slotId)
      if (!slot) return
      if (planArchived[slotId]) return   // archived slots cannot be moved
      const currentSemester = planSemesterOverrides[slotId] ?? slot.semester_number
      if (currentSemester === newSemester) return

      const courseCode   = slot.is_pool ? planSlots[slotId] : slot.class_code
      const targetSeason = semesterTerms[newSemester]?.season
      if (!isEnrollmentAllowed(courseCode, targetSeason)) {
        showSaveError(`${courseCode} is ${getSeasonRestriction(courseCode)}-only and cannot be placed in a ${targetSeason} semester.`)
        return
      }

      // ── Prereq/coreq conflicts ────────────────────────────────────────────
      // The move is held back before any state update and the student is told why
      // (atomicity guarantee per Q2). "Move anyway" in the modal repeats it with `override`.
      const conflicts = override ? [] : getDragConflicts(slotId, newSemester)
      if (conflicts.length > 0) {
        setConflictModal({
          title: `${courseCode} to ${formatTermLabel(semesterTerms[newSemester]) ?? `Semester ${newSemester}`} breaks a requisite`,
          reasons: conflicts,
          move: { type, slotId, newSemester },
        })
        return
      }

      pushUndo({ type: 'drag_slot', slotId, prevSemester: currentSemester, label: `Moved ${courseCode ?? slotCode(slot)}` })
      const prevOverrides = planSemesterOverrides
      setPlanSemesterOverrides(prev => ({ ...prev, [slotId]: newSemester }))

      db
        .from('student_plan_slots')
        .upsert({
          student_id:           profile.id,
          requirement_slot_id:  slotId,
          selected_course_code: courseCode ?? null,
          semester_number:      newSemester,
          credits_remaining:    planCreditsRemaining[slotId] ?? 0,
          position_source:      'student',
        }, { onConflict: 'student_id, requirement_slot_id' })
        .then(({ error }) => {
          if (error) {
            setPlanSemesterOverrides(prevOverrides)
            showSaveError('Could not move slot. Please try again.')
          } else {
            markSaved()
          }
        })

    } else if (type === 'free_add') {
      const fa = freeAddSlots.find(f => f.id === slotId)
      if (!fa || fa.semester_number === newSemester) return

      const faTargetSeason = semesterTerms[newSemester]?.season
      if (!isEnrollmentAllowed(fa.course_code, faTargetSeason)) {
        showSaveError(`${fa.course_code} is ${getSeasonRestriction(fa.course_code)}-only and cannot be placed in a ${faTargetSeason} semester.`)
        return
      }

      pushUndo({ type: 'drag_free', freeAddId: slotId, prevSemester: fa.semester_number, label: `Moved ${fa.course_code}` })
      const prevFreeAdds = freeAddSlots
      setFreeAddSlots(list =>
        list.map(f => f.id === slotId ? { ...f, semester_number: newSemester } : f)
      )

      db
        .from('student_free_add_slots')
        .update({ semester_number: newSemester })
        .eq('id', slotId)
        .then(({ error }) => {
          if (error) {
            setFreeAddSlots(prevFreeAdds)
            showSaveError('Could not move course. Please try again.')
          } else {
            markSaved()
          }
        })
    }
  }

  async function handleDragEnd({ active, over }) {
    setDraggedSlotId(null)
    if (!over) return

    const { type, slotId } = active.data.current

    // ── Drop on Transfer Credits panel ───────────────────────────────
    if (over.id === 'transfer_credits') {
      if (type === 'prior_credit') return   // already in panel; ignore

      if (type === 'requirement_slot') {
        const slot = slots.find(s => s.id === slotId)
        if (!slot) return
        if (planArchived[slotId]) return   // archived slots cannot be dragged
        const courseCode = slot.is_pool ? planSlots[slotId] : slot.class_code
        if (!courseCode) return

        // BUG-24 dedup: if this course is already covered by a prior credit,
        // don't create a duplicate row.  Re-run the archive sync so the slot
        // gets archived if it isn't already (covers the BUG-23 reload case).
        if (priorCredits.some(pc => pc.satisfies_course_code === courseCode)) {
          await syncArchivedSlots(priorCredits)
          return
        }

        const course         = courses[courseCode]
        const creditsAwarded = course?.credits ?? 3
        const semLabel       = planSemesterOverrides[slotId] ?? slot.semester_number

        // Optimistic archive: hide slot immediately so the dnd-kit snap-back frame
        // shows the slot already gone rather than the original position.
        const prevArchived  = planArchived
        const prevPlanSlots = planSlots
        setPlanArchived(prev => ({ ...prev, [slot.id]: true }))
        if (slot.is_pool) {
          setPlanSlots(prev => { const n = { ...prev }; delete n[slot.id]; return n })
        }

        await handleAddPriorCredit({
          credit_type:           'transfer_credit',
          satisfies_course_code: courseCode,
          satisfies_pool:        slot.is_pool ? slot.class_code : null,
          note:                  `Dragged from Semester ${semLabel}`,
          credits_awarded:       creditsAwarded,
        })

        // Explicitly archive the source slot.  After BUG-42, both Rule 1
        // (non-pool) and Rule 2 (pool) match regardless of fill state, so
        // syncArchivedSlots will already have archived this slot above.
        // This upsert remains as defensive belt-and-suspenders and is
        // idempotent if the resolver already produced the same archive state.
        const { error: archErr } = await db.from('student_plan_slots').upsert({
          student_id:           profile.id,
          requirement_slot_id:  slot.id,
          selected_course_code: courseCode,
          semester_number:      planSemesterOverrides[slot.id]  ?? null,
          credits_remaining:    planCreditsRemaining[slot.id]   ?? 0,
          archived:             true,
          archive_reason:       'prior_credit',
        }, { onConflict: 'student_id, requirement_slot_id' })
        if (archErr) {
          // Both the prior-credit insert and the belt-and-suspenders upsert failed.
          // Roll back the optimistic hide so the slot reappears rather than silently
          // staying hidden with no DB record.
          setPlanArchived(prevArchived)
          if (slot.is_pool) setPlanSlots(prevPlanSlots)
        }
        // On success: no further setPlanArchived call needed — already done optimistically.

      } else if (type === 'free_add') {
        const fa = freeAddSlots.find(f => f.id === slotId)
        if (!fa) return

        // BUG-24 dedup: if a prior credit already covers this course,
        // drop the free-add row without inserting a duplicate.
        if (priorCredits.some(pc => pc.satisfies_course_code === fa.course_code)) {
          handleRemoveFreeAdd(fa)
          return
        }

        const course = courses[fa.course_code]
        await handleAddPriorCredit({
          credit_type:           'transfer_credit',
          satisfies_course_code: fa.course_code,
          satisfies_pool:        null,
          note:                  `Dragged from Semester ${fa.semester_number}`,
          credits_awarded:       course?.credits ?? 3,
        })
        handleRemoveFreeAdd(fa)
      }
      return
    }

    // ── Drop on a semester card (normal reorder) ──────────────────────
    const newSemester = over.id

    if (type === 'requirement_slot' || type === 'free_add') {
      moveToSemester(type, slotId, newSemester)

    } else if (type === 'prior_credit') {
      // ── Drag prior credit row back to a semester ──────────────────
      const { priorCreditId } = active.data.current
      const pc = priorCredits.find(p => p.id === priorCreditId)
      if (!pc) return

      // Pre-compute which slots will be freed when this credit is removed.
      // If a requirement slot unarchives, it reappears in its original semester
      // and no free-add is needed.  If nothing unarchives, add as free-add.
      const newCreditsWithout = priorCredits.filter(p => p.id !== priorCreditId)
      const wouldStillArchive = resolveTransferCredits(newCreditsWithout, planSlots, slots)
      const freedSlots        = slots.filter(s => planArchived[s.id] && !wouldStillArchive[s.id])

      // Atomicity guard (BUG-44): if handleAddCourse would be called but would
      // immediately fail (course already in plan), block the entire drag before
      // any DB write rather than deleting the prior credit and leaving no record.
      // act_placement entries (credits_awarded = 0) are excluded from takenCodes
      // Pass 1, so takenCodes reflects only requirement-slot and free-add coverage.
      if (
        freedSlots.length === 0 &&
        pc.satisfies_course_code &&
        courses[pc.satisfies_course_code] &&
        takenCodes.has(pc.satisfies_course_code)
      ) {
        showSaveError(`${pc.satisfies_course_code} is already in your plan.`)
        return
      }

      await handleRemovePriorCredit(priorCreditId)

      if (freedSlots.length === 0 && pc.satisfies_course_code && courses[pc.satisfies_course_code]) {
        await handleAddCourse(newSemester, courses[pc.satisfies_course_code])
      }
    }
  }

  // ── clearPlanData ─────────────────────────────────────────────────
  async function clearPlanData() {
    const { error } = await db
      .from('student_plan_slots').delete().eq('student_id', profile.id)
    if (error) return error
    await db.from('student_free_add_slots').delete().eq('student_id', profile.id)
    await db.from('student_semester_notes').delete().eq('student_id', profile.id)
    return null
  }

  // ── Reset plan ────────────────────────────────────────────────────
  async function handleResetPlan() {
    setResetting(true)
    const err = await clearPlanData()
    if (err) { setResetting(false); return }

    // Re-run the placement algorithm so the plan restores to its
    // algorithm-determined state rather than coming back empty.
    const { assignments, archived: archivedMap } = buildDegreePlan({
      slots,
      courseMap: courses,
      prereqMap,
      coreqMap,
      priorCredits,
      studentProfile: {
        student_type: profile.student_type,
        act_math:     profile.act_math,
        sat_math:     profile.sat_math,
        start_season: profile.start_season,
      },
    })

    const planSlotRows = []
    for (const slot of slots) {
      const archiveReason = archivedMap[slot.id]
      if (archiveReason) {
        planSlotRows.push({
          student_id:           profile.id,
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
          student_id:           profile.id,
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

    const CHUNK = 100
    for (let i = 0; i < planSlotRows.length; i += CHUNK) {
      const { error: upsertErr } = await db
        .from('student_plan_slots')
        .upsert(planSlotRows.slice(i, i + CHUNK), { onConflict: 'student_id, requirement_slot_id' })
      if (upsertErr) {
        console.error('[handleResetPlan] student_plan_slots upsert failed:', upsertErr)
        setError(`Failed to reset degree plan: ${upsertErr.message}`)
        setResetting(false)
        return
      }
    }

    setUndoStack([])
    setExtraSemesters([])
    setExtraSemesterTerms({})
    setResetting(false)
    setShowResetModal(false)
    setResetKey(k => k + 1)
  }

  // ── Concentration switch ──────────────────────────────────────────
  // plan: the degree_plans row the new program follows for this student's entry year (null if unknown)
  async function handleConcentrationSwitch(newConc, plan = null) {
    setSwitching(true)

    // The new program's plan may be a different catalog year, so the profile follows it. A database without
    // the catalog_year / gened_program columns switches by program alone.
    const planFields = plan ? { catalog_year: plan.catalog_year, gened_program: plan.gened_program } : {}
    let { error: updateErr } = await db
      .from('student_profiles')
      .update({ concentration_id: newConc.id, ...planFields })
      .eq('id', profile.id)
    if (isMissingColumn(updateErr) && plan) {
      ;({ error: updateErr } = await db
        .from('student_profiles')
        .update({ concentration_id: newConc.id })
        .eq('id', profile.id))
    }
    if (updateErr) { setSwitching(false); return }

    const deleteErr = await clearPlanData()
    if (deleteErr) { setSwitching(false); return }

    setSwitching(false)
    setShowSwitchModal(false)
    setUndoStack([])
    setExtraSemesters([])
    setExtraSemesterTerms({})
    onProfileChange({ ...profile, concentration_id: newConc.id, ...planFields, concentrations: newConc })
  }

  // ── Render ────────────────────────────────────────────────────────

  if (loading) return <DegreeplanSkeleton />

  if (error) {
    return (
      <div className="dashboard-error">
        <p>Something went wrong: {error}</p>
      </div>
    )
  }

  const totalHours   = profile.concentrations.total_hours
  const completedPct = Math.min((creditTotals.completed / totalHours) * 100, 100)
  const plannedPct   = Math.min((creditTotals.planned   / totalHours) * 100, 100 - completedPct)

  const graduation   = lastNonSummerTerm(semesterTerms, allSemesterNumbers)
  const gradSemNum   = [...allSemesterNumbers].reverse().find(n => isSameTerm(semesterTerms[n], graduation))
  const nowTerm      = termForDate(today)
  const firstTerm    = formatTermLabel(semesterTerms[allSemesterNumbers[0]])

  // ── Per-semester view data ────────────────────────────────────────
  const semLabels = {}
  allSemesterNumbers.forEach((n, idx) => {
    semLabels[n] = formatTermLabel(semesterTerms[n]) ?? `Semester ${idx + 1}`
  })
  const semCredits = n =>
    calculateCredits(semesterMap[n] ?? [], freeAddBySemester[n] ?? [], courses, planSlots, freeAddSlots)
  const semItems = n => [
    ...(semesterMap[n] ?? []).flatMap(slot => [
      { key: slot.id, code: slotCode(slot) },
      ...(planSlots[slot.id] && remainders[slot.id] > 0
        ? [{ key: `rem_${slot.id}`, code: POOL_LABELS[slot.class_code] ?? slot.class_code }]
        : []),
    ]),
    ...(freeAddBySemester[n] ?? []).map(fa => ({ key: `fa_${fa.id}`, code: fa.course_code })),
  ]

  // Pool slots with no course chosen yet. Ones a prerequisite leans on carry
  // the dependent course codes so the issue can say why it matters.
  const incompleteSlots = {}
  for (const slot of activeSlots) {
    if (!slot.is_pool || planSlots[slot.id]) continue
    incompleteSlots[slot.id] = {
      label:      POOL_LABELS[slot.class_code] ?? slot.class_code,
      dependents: [...new Set([...(poolReliance[slot.id] ?? []), ...(coreqReliance[slot.id] ?? [])])],
    }
  }
  // Free Elective hours still open after a pick
  for (const slot of activeSlots) {
    if (planSlots[slot.id] && remainders[slot.id] > 0) {
      incompleteSlots[`rem_${slot.id}`] = {
        label:      POOL_LABELS[slot.class_code] ?? slot.class_code,
        dependents: [],
      }
    }
  }

  const issues = buildPlanIssues({
    semesters: allSemesterNumbers.map(n => ({
      semNum: n, label: semLabels[n], credits: semCredits(n),
      completed: semesterPhase[n] === 'past', items: semItems(n),
    })),
    prereqWarnings, coreqWarnings, standingWarnings, scienceWarnings, poolLimitWarnings, incompleteSlots,
  })
  const issueCounts = countIssuesBySemester(issues)

  const lastUndo = undoStack[undoStack.length - 1]

  const draggedLabel = (() => {
    if (!draggedSlotId) return null
    const slot = slots.find(s => s.id === draggedSlotId)
    if (slot) return slotCode(slot)
    const fa = freeAddSlots.find(f => f.id === draggedSlotId)
    if (fa) return fa.course_code ?? null
    const pc = priorCredits.find(p => p.id === draggedSlotId)
    return pc?.satisfies_course_code ?? pc?.note ?? null
  })()

  // ── Selected course (side panel) ──────────────────────────────────
  // A 'remainder' selection is the follow-up choice row under a filled Free
  // Elective: it points at the slot but has no course of its own yet. It goes
  // away once the slot's hours are covered.
  const selRemainder = selection?.kind === 'remainder'
  const selSlotRow = selection?.kind === 'slot' || selRemainder
    ? slots.find(s => s.id === selection.id && !planArchived[s.id]) ?? null
    : null
  const selFollowUpHours = selRemainder && selSlotRow && planSlots[selSlotRow.id]
    ? (remainders[selSlotRow.id] ?? 0)
    : 0
  const selSlot = selRemainder && selFollowUpHours === 0 ? null : selSlotRow
  const selFree = selection?.kind === 'free'
    ? freeAddSlots.find(f => f.id === selection.id) ?? null
    : null
  const selKey    = selSlot
    ? (selRemainder ? `rem_${selSlot.id}` : selSlot.id)
    : selFree ? `fa_${selFree.id}` : null
  const selSem    = selSlot ? (planSemesterOverrides[selSlot.id] ?? selSlot.semester_number) : selFree?.semester_number
  const selCode   = selSlot
    ? (selRemainder ? null : (selSlot.is_pool ? planSlots[selSlot.id] : selSlot.class_code))
    : selFree?.course_code
  const selCourse = selCode ? courses[selCode] : null
  const selIsEmptyPool = !!selSlot?.is_pool && (selRemainder || !planSlots[selSlot.id])

  // Every term, with whether the selected course may move there. Uses the
  // same rules moveToSemester enforces (season, then prereq/coreq conflicts).
  const moveTargets = selCode ? allSemesterNumbers.map(n => {
    const base = { semNum: n, name: semLabels[n] }
    if (n === selSem) return { ...base, note: 'here', tone: 'here', disabled: true, isHere: true }
    if (!isEnrollmentAllowed(selCode, semesterTerms[n]?.season)) {
      return { ...base, note: `${getSeasonRestriction(selCode)} only`, tone: 'bad', disabled: true }
    }
    if (selSlot) {
      const conflicts = getDragConflicts(selSlot.id, n)
      if (conflicts.length > 0) {
        // still choosable: moveToSemester explains the conflict and offers "Move anyway"
        return { ...base, note: 'breaks a requisite', tone: 'bad', disabled: false, reason: conflicts.join('\n') }
      }
    }
    const before = semCredits(n)
    const after  = before + (selCourse?.credits ?? 0)
    const tone   = after > HEAVY_LOAD_MAX || after < FULL_TIME_MIN ? 'warn' : 'ok'
    return { ...base, note: `${before} → ${after} cr${semesterPhase[n] === 'past' ? ' · past term' : ''}`, tone, disabled: false }
  }) : []

  function selectSlot(slot) {
    setSelection(sel => (sel?.kind === 'slot' && sel.id === slot.id ? null : { kind: 'slot', id: slot.id }))
  }
  function selectRemainder(slot) {
    setSelection(sel => (sel?.kind === 'remainder' && sel.id === slot.id ? null : { kind: 'remainder', id: slot.id }))
  }
  function selectFreeAdd(fa) {
    setSelection(sel => (sel?.kind === 'free' && sel.id === fa.id ? null : { kind: 'free', id: fa.id }))
  }

  function navigateTo(nextView) {
    setView(nextView)
    setSelection(null)
  }

  function openIssue(issue) {
    setView('plan')
    setSemesterExpanded(prev => ({ ...prev, [issue.semNum]: true }))
    if (issue.key == null) { setSelection(null); return }
    const key = String(issue.key)
    if (key.startsWith('rem_')) {
      setSelection({ kind: 'remainder', id: Number(key.slice(4)) })
      return
    }
    setSelection(key.startsWith('fa_')
      ? { kind: 'free', id: freeAddSlots.find(f => `fa_${f.id}` === key)?.id }
      : { kind: 'slot', id: issue.key })
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem('theme', next)
    setTheme(next)
  }

  const coursePanel = view === 'plan' && selKey != null && (
    <CoursePanel
      key={`${selKey}:${selCode ?? 'empty'}`}
      eyebrow={semLabels[selSem] ?? ''}
      title={selIsEmptyPool ? (POOL_LABELS[selSlot.class_code] ?? selSlot.class_code) : selCode}
      subtitle={selIsEmptyPool
        ? `Choose a course · ${selRemainder ? selFollowUpHours : (remainders[selSlot.id] ?? selSlot.flex_credits ?? 3)} cr${selRemainder ? ' left to fill' : ''}`
        : `${selCourse?.name ?? 'Course not in catalog'}${selCourse ? ` · ${selCourse.credits} cr` : ''}`}
      course={selCourse}
      courseMap={courses}
      prereqMap={prereqMap}
      coreqMap={coreqMap}
      status={selSlot ? planStatuses[selSlot.id] : (selFree ? statusOfFreeAdd(selFree) : null)}
      phase={semesterPhase[selSem] ?? 'future'}
      warnings={{
        prereq:   prereqWarnings[selKey],
        coreq:    coreqWarnings[selKey],
        standing: standingWarnings[selKey],
        science:  scienceWarnings[selKey],
      }}
      countsToward={selFree
        ? (selFree.fills_slot_id != null
            ? `${POOL_LABELS[slots.find(s => s.id === selFree.fills_slot_id)?.class_code] ?? 'Free Elective'} requirement · fills hours your earlier pick left open`
            : 'Added by you · counts toward total degree hours')
        : selSlot.is_pool
          ? `${POOL_LABELS[selSlot.class_code] ?? selSlot.class_code} requirement`
          : `Major requirement · ${profile.concentrations.name}`}
      moveTargets={moveTargets}
      isPool={!!selSlot?.is_pool}
      isFreeAdd={!!selFree}
      startInPicker={selIsEmptyPool}
      picker={(onBack, hideBack) => selSlot && (
        <SlotModal
          key={selSlot.id}
          embedded
          hideBack={hideBack}
          slot={selSlot}
          courseMap={courses}
          studentId={profile.id}
          planSlots={planSlots}
          slots={slots}
          prereqMap={prereqMap}
          coreqMap={coreqMap}
          priorCredits={priorCredits}
          planSemesterOverrides={planSemesterOverrides}
          planArchived={planArchived}
          freeAddSlots={freeAddSlots}
          followUpHours={selFollowUpHours}
          onSave={selRemainder ? handleAddRemainder : handleSave}
          onRemove={handleRemove}
          onClose={onBack}
        />
      )}
      onMove={n => moveToSemester(selSlot ? 'requirement_slot' : 'free_add', selSlot?.id ?? selFree.id, n)}
      onRemove={() => (selFree ? handleRemoveFreeAdd(selFree) : handleRemove(selSlot))}
      onClose={() => setSelection(null)}
    />
  )

  // Same inputs feed the Advisement tab's PDF preview and its download button,
  // so what the student sees is what they export.
  const pdfExportProps = {
    semesterNumbers: allSemesterNumbers,
    semesterMap,
    freeAddBySemester,
    planSlots,
    courses,
    semesterTerms,
    profile,
    graduation,
    semesterCompleted: Object.fromEntries(Object.entries(semesterPhase).map(([n, phase]) => [n, phase === 'past'])),
    priorCredits,
    remainders,
  }

  return (
    <div className="ds-app">
      <Sidebar
        view={view}
        onNavigate={navigateTo}
        issueCount={issues.length}
        lastSavedAt={lastSavedAt}
      />

      <main className="ds-main">
        {view === 'plan' && (
          <div className="ds-plan">
            <div className="ds-plan-header">
              <div className="ds-plan-heading">
                <p className="ds-eyebrow">{profile.concentrations.name}</p>
                <h2 className="ds-h2">{allSemesterNumbers.length <= 8 ? 'Four-Year Plan' : 'Degree Plan'}</h2>
                <p className="ds-sub" style={{ whiteSpace: 'nowrap' }}>
                  {firstTerm && graduation
                    ? `${firstTerm} → ${graduation.season} ${graduation.year}`
                    : `Started ${profile.start_season} ${profile.start_year}`}
                  {` · ${totalHours} hours`}
                </p>
              </div>
              <div className="ds-progress">
                <div
                  className="ds-progress-track"
                  role="img"
                  aria-label={`${creditTotals.completed} credits done, ${creditTotals.planned} planned, of ${totalHours}`}
                >
                  <div className="ds-progress-done"    style={{ width: `${completedPct}%` }} />
                  <div className="ds-progress-planned" style={{ width: `${plannedPct}%` }} />
                </div>
                <div className="ds-progress-legend">
                  <span className="ds-legend-done">{creditTotals.completed} done</span>
                  <span className="ds-sep">·</span>
                  <span className="ds-legend-planned">{creditTotals.planned} planned</span>
                  <span className="ds-sep">·</span>
                  <span>{totalHours} required</span>
                  <span className="ds-sep">·</span>
                  <span>{Math.round(completedPct)}% complete</span>
                </div>
              </div>
              <div className="ds-header-actions">
                <button className="ds-btn-ghost" onClick={toggleAll}>
                  {anyExpanded ? 'Collapse all' : 'Expand all'}
                </button>
                <button
                  className="ds-btn-primary ds-undo"
                  onClick={handleUndo}
                  disabled={!lastUndo}
                  title={lastUndo ? `${undoStack.length} action(s) can be undone` : 'Nothing to undo'}
                >
                  <span style={{ fontSize: 13, flexShrink: 0 }} aria-hidden="true">↺</span>
                  <span className="ds-undo-label">
                    {lastUndo ? `Undo — ${lastUndo.label ?? 'last change'}` : 'Nothing to undo'}
                  </span>
                </button>
              </div>
            </div>

            {approximatePlanOf(profile) && (
              <p className="ds-plan-note" role="note">
                <strong>Approximate plan.</strong> It follows the {approximatePlanOf(profile).plan} degree map. You started in {profile.start_season} {profile.start_year}, under an earlier
                catalog, so some requirements may differ: confirm them with your advisor.
              </p>
            )}

            <div className="ds-plan-body">
              <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <PriorCourseworkStrip
                  credits={priorCredits}
                  onRemove={handleRemovePriorCredit}
                  onAddClick={() => setShowWizard(true)}
                  dragActive={!!draggedSlotId}
                />

                <div className="ds-grid">
                  {allSemesterNumbers.map(semNum => {
                    return (
                      <Semester
                        key={semNum}
                        semesterNumber={semNum}
                        slots={semesterMap[semNum] ?? []}
                        freeAddSlots={(freeAddBySemester[semNum] ?? []).map(f => ({ ...f, status: statusOfFreeAdd(f) }))}
                        courseMap={courses}
                        planSlots={planSlots}
                        planStatuses={planStatuses}
                        allFreeAddSlots={freeAddSlots}
                        remainders={remainders}
                        onSelectSlot={selectSlot}
                        onSelectRemainder={selectRemainder}
                        onSelectFreeAdd={selectFreeAdd}
                        selectedKey={selKey}
                        onAddCourse={() => setAddCourseTarget(semNum)}
                        scienceWarnings={scienceWarnings}
                        poolLimitWarnings={poolLimitWarnings}
                        prereqWarnings={prereqWarnings}
                        coreqWarnings={coreqWarnings}
                        standingWarnings={standingWarnings}
                        transferFilled={transferFilled}
                        transferDetails={transferDetails}
                        note={semesterNotes[semNum] ?? ''}
                        onNoteSave={handleNoteSave}
                        isExpanded={semesterExpanded[semNum] !== false}
                        onToggleExpand={() =>
                          setSemesterExpanded(prev => ({
                            ...prev,
                            [semNum]: !(prev[semNum] !== false),
                          }))
                        }
                        isPast={semesterPhase[semNum] === 'past'}
                        termLabel={semLabels[semNum]}
                        isCurrent={isSameTerm(semesterTerms[semNum], nowTerm)}
                        isGraduation={semNum === gradSemNum}
                        issueCount={issueCounts[semNum] ?? 0}
                        onDelete={extraSemesters.includes(semNum)
                          ? async () => {
                              await db.from('student_semester_notes')
                                .delete().eq('student_id', profile.id).eq('semester_number', semNum)
                              setExtraSemesters(prev => prev.filter(n => n !== semNum))
                              setExtraSemesterTerms(prev => { const next = { ...prev }; delete next[semNum]; return next })
                            }
                          : null}
                      />
                    )
                  })}

                  <button
                    className="ds-add-sem"
                    onClick={() => {
                      const base = extraSemesters.length > 0 ? Math.max(...extraSemesters) : maxTemplateSem
                      const newSemNum = base + 1
                      const lastSemNum = allSemesterNumbers.length > 0 ? Math.max(...allSemesterNumbers) : null
                      const newTerm = advanceTerm(lastSemNum != null ? semesterTerms[lastSemNum] : null)
                      setExtraSemesters(prev => [...prev, newSemNum])
                      if (newTerm) setExtraSemesterTerms(prev => ({ ...prev, [newSemNum]: newTerm }))
                    }}
                  >
                    + Add semester
                  </button>
                </div>

                <DragOverlay>
                  {draggedLabel && (
                    <div className="ds-drag-overlay">{draggedLabel}</div>
                  )}
                </DragOverlay>
              </DndContext>
            </div>
          </div>
        )}

        {view === 'issues' && (
          <IssuesView issues={issues} onOpenIssue={openIssue} />
        )}

        {view === 'advising' && (
          <AdvisementView
            concentrationName={profile.concentrations.name}
            exportButton={<ExportPlanButton className="ds-btn-primary" {...pdfExportProps} />}
            preview={<PlanPdfPreview {...pdfExportProps} />}
          />
        )}

        {view === 'settings' && (
          <SettingsView
            profile={profile}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenConcentration={() => setShowSwitchModal(true)}
            onOpenReset={() => setShowResetModal(true)}
            onActSaved={numScores => {
              setUndoStack([])
              markSaved()
              onProfileChange({ ...profile, ...numScores })
              setResetKey(k => k + 1)
            }}
          />
        )}
      </main>

      {coursePanel}

      {addCourseTarget !== null && (
        <AddCourseModal
          semesterNumber={addCourseTarget}
          takenCodes={takenCodes}
          semesterSeason={semesterTerms[addCourseTarget]?.season ?? null}
          onAdd={(course, hours) => handleAddCourse(addCourseTarget, course, null, hours ?? null)}
          onClose={() => setAddCourseTarget(null)}
        />
      )}

      {showWizard && (
        <PriorCreditWizard
          existingCredits={priorCredits}
          onSave={handleAddPriorCredit}
          onClose={() => setShowWizard(false)}
          planSlots={planSlots}
          slots={slots}
          planSemesterOverrides={planSemesterOverrides}
          planArchived={planArchived}
        />
      )}

      {showResetModal && (
        <ResetModal
          onConfirm={handleResetPlan}
          onClose={() => setShowResetModal(false)}
          resetting={resetting}
        />
      )}

      {showSwitchModal && (
        <ConcentrationModal
          profile={profile}
          onSwitch={handleConcentrationSwitch}
          onClose={() => setShowSwitchModal(false)}
          switching={switching}
        />
      )}

      {saveError && (
        <div className="save-error-toast" role="alert">
          <span>{saveError}</span>
          <button
            className="save-error-toast-close"
            onClick={() => {
              setSaveError(null)
              clearTimeout(saveErrorTimerRef.current)
            }}
          >✕</button>
        </div>
      )}

      {conflictModal && (
        <div className="ds-modal-backdrop" onClick={() => setConflictModal(null)}>
          <div className="ds-modal" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="ds-modal-head">
              <p className="ds-eyebrow">Requisite conflict</p>
              <h3 className="ds-modal-title">{conflictModal.title}</h3>
              <p className="ds-sub" style={{ fontSize: 11 }}>
                Nothing has moved yet. You can move it anyway (a plan sometimes has to pass through a state like this);
                the Issues tab will keep flagging the requisite until it is met.
              </p>
            </div>
            <ul className="ds-panel-list" style={{ margin: 0, padding: '16px 22px 16px 38px' }}>
              {conflictModal.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
            </ul>
            <div className="ds-modal-foot">
              <button className="ds-btn-ghost" onClick={() => setConflictModal(null)}>Cancel</button>
              {conflictModal.move && (
                <button
                  className="ds-btn-primary"
                  onClick={() => {
                    const { type, slotId, newSemester } = conflictModal.move
                    setConflictModal(null)
                    moveToSemester(type, slotId, newSemester, { override: true })
                  }}
                >
                  Move anyway
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PriorCourseworkStrip ───────────────────────────────────────────────────────
// Collapsible list of prior credits on the Plan tab. It is also the drop
// target that turns a dragged course into transfer credit, so it opens a
// visible drop zone whenever a drag is in progress.

function PriorCreditRow({ pc, countedAs, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   pc.id,
    data: { type: 'prior_credit', priorCreditId: pc.id, courseCode: pc.satisfies_course_code },
  })
  const isPlacement = (pc.credits_awarded ?? 0) === 0
  return (
    <div
      ref={setNodeRef}
      className={`ds-prior-row${isDragging ? ' ds-prior-row-dragging' : ''}${countedAs ? ' ds-prior-row-dup' : ''}`}
      {...listeners}
      {...attributes}
    >
      <span className="ds-prior-code">{pc.satisfies_course_code ?? '—'}</span>
      <span className="ds-prior-cr">{isPlacement ? 'placement' : `${pc.credits_awarded} cr`}</span>
      <span className="ds-prior-note" title={pc.note ?? ''}>{pc.note ?? CREDIT_TYPE_LABELS[pc.credit_type] ?? pc.credit_type}</span>
      {countedAs
        ? <span className="ds-prior-dup" title={`${pc.satisfies_course_code} is also covered by ${countedAs}. Its hours count once.`}>already counted</span>
        : <span />}
      <button
        className="ds-prior-remove"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onRemove(pc.id)}
        title="Remove this credit"
        aria-label={`Remove ${pc.satisfies_course_code ?? 'credit'}`}
      >
        ✕
      </button>
    </div>
  )
}

function PriorCourseworkStrip({ credits, onRemove, onAddClick, dragActive }) {
  const [open, setOpen] = useState(false)
  const { setNodeRef, isOver } = useDroppable({ id: 'transfer_credits' })

  const { totalHours: creditHours, duplicateOf } = summarizePriorCredits(credits)
  const noteOf = id => credits.find(pc => pc.id === id)?.note ?? 'another entry'

  return (
    <div
      ref={setNodeRef}
      className={[
        'ds-prior',
        dragActive && 'ds-prior-dropready',
        isOver && 'ds-prior-over',
      ].filter(Boolean).join(' ')}
    >
      <button className="ds-prior-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ds-prior-title">Prior coursework</span>
        {dragActive ? (
          <span className="ds-prior-hint">{isOver ? 'Release to record as transfer credit' : 'Drop here to record as transfer credit'}</span>
        ) : (
          <span className="ds-sem-cr">
            {credits.length === 0 ? 'none' : `${credits.length} ${credits.length === 1 ? 'entry' : 'entries'} · ${creditHours} cr`}
          </span>
        )}
        <span className="ds-sem-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="ds-prior-body">
          {credits.length === 0 ? (
            <p className="ds-prior-empty">
              No prior coursework recorded. Add AP, IB, CLEP, or transfer credit, or drag a course from the grid onto this panel.
            </p>
          ) : (
            <>
              <div className="ds-prior-cols" aria-hidden="true">
                <span>Course</span><span>Hours</span><span>Source</span><span /><span />
              </div>
              {groupAndSortPriorCredits(credits).map(group => (
                <div key={group.type}>
                  <div className="ds-prior-group">{group.label}</div>
                  {group.entries.map(pc => (
                    <PriorCreditRow key={pc.id} pc={pc} countedAs={duplicateOf[pc.id] ? noteOf(duplicateOf[pc.id]) : null} onRemove={onRemove} />
                  ))}
                </div>
              ))}
            </>
          )}
          <button className="ds-prior-add" onClick={onAddClick}>+ Add prior credit</button>
        </div>
      )}
    </div>
  )
}
