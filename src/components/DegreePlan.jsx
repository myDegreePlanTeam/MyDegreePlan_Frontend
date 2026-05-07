import { useEffect, useState, useMemo, useRef } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import { supabase } from '../lib/supabaseClient'
import { getScienceWarnings, getGenEdStatus } from '../lib/poolResolver'
import { checkPrereqs, checkCoreqs } from '../lib/prereqChecker'
import { resolveTransferCredits, resolveTransferDetails, computePlanCredits, getTakenCodes } from '../lib/transferCredits'
import { groupAndSortPriorCredits } from '../lib/priorCreditOrdering'
import Semester from './Semester'
import SlotModal from './SlotModal'
import CourseDetailModal from './CourseDetailModal'
import AddCourseModal from './AddCourseModal'
import { DegreeplanSkeleton } from './Skeletons'
import CompletionBadge from './CompletionBadge'
import usePlanCompleteness from '../lib/usePlanCompleteness'
import PriorCreditWizard from './PriorCreditWizard'
import './Dashboard.css'

// Credit-hour thresholds for academic standing
const STANDING_THRESHOLDS = { junior: 60, senior: 90 }

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
  const [courses, setCourses]                     = useState({})
  const [loading, setLoading]                     = useState(true)
  const [error, setError]                         = useState(null)
  const [activeSlot, setActiveSlot]               = useState(null)
  const [planSlots, setPlanSlots]                 = useState({})
  const [planStatuses, setPlanStatuses]           = useState({})
  const [planCreditsRemaining, setPlanCreditsRemaining] = useState({})
  // planSemesterOverrides: { reqSlotId: number } — student's drag-moved semesters
  const [planSemesterOverrides, setPlanSemesterOverrides] = useState({})
  // freeAddSlots: [{id, course_code, semester_number, status}]
  const [freeAddSlots, setFreeAddSlots]           = useState([])
  // priorCredits: [{id, credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded}]
  const [priorCredits, setPriorCredits]           = useState([])
  const [prereqMap, setPrereqMap]                 = useState({})
  const [coreqMap, setCoreqMap]                   = useState({})
  const [activeDetail, setActiveDetail]           = useState(null)
  const [semesterNotes, setSemesterNotes]         = useState({})
  const [showSwitchModal, setShowSwitchModal]     = useState(false)
  const [switching, setSwitching]                 = useState(false)
  const [showResetModal, setShowResetModal]       = useState(false)
  const [resetting, setResetting]                 = useState(false)
  const [resetKey, setResetKey]                   = useState(0)
  const [extraSemesterCount, setExtraSemesterCount] = useState(0)
  // addCourseTarget: number | null — which semester the Add Course modal is open for
  const [addCourseTarget, setAddCourseTarget]     = useState(null)
  // draggedSlotId: id of the slot currently being dragged (for DragOverlay label)
  const [draggedSlotId, setDraggedSlotId]         = useState(null)
  // showWizard: true when the guided prior credit wizard is open
  const [showWizard, setShowWizard]               = useState(false)

  // planArchived: { [slotId]: true } — slots removed from grid by a prior credit
  // (Concept 2 / Bug 2). Persisted as archived=true, archive_reason='prior_credit'
  // in student_plan_slots.
  //
  // TODO: individual course completion status will be driven by Banner transcript
  // data on university integration. Do not add manual per-course completion
  // toggles until that integration defines the source of truth.
  const [planArchived, setPlanArchived]           = useState({})

  // planSemesterCompleted: { [semNum]: boolean } — student-toggled completion
  // (Concept 1 / Bug 1). Persisted as completed_by_student in student_semester_notes.
  const [planSemesterCompleted, setPlanSemesterCompleted] = useState({})

  // semesterExpanded: { [semNum]: boolean } — local collapse/expand state
  // Initialized from planSemesterCompleted (completed = collapsed by default).
  const [semesterExpanded, setSemesterExpanded]   = useState({})

  const [lastSelection, setLastSelection]         = useState(null)
  const [saveError, setSaveError]                 = useState(null)
  const saveErrorTimerRef                         = useRef(null)

  function showSaveError(msg) {
    setSaveError(msg)
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current)
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 5000)
  }

  // ── syncArchivedSlots ─────────────────────────────────────────────
  // Called after any prior_credit add/remove.  Resolves which slots should
  // be archived (removed from grid) and persists to student_plan_slots.
  // Pass the freshly-computed priorCredits array to avoid stale closure issues.
  async function syncArchivedSlots(newPriorCredits) {
    if (!slots.length) return

    const newTransferFilled = resolveTransferCredits(newPriorCredits, planSlots, slots)

    const toArchive   = slots.filter(s => newTransferFilled[s.id] && !planArchived[s.id])
    const toUnarchive = slots.filter(s => planArchived[s.id]       && !newTransferFilled[s.id])

    if (toArchive.length > 0) {
      await Promise.all(toArchive.map(slot =>
        supabase.from('student_plan_slots').upsert({
          student_id:           profile.id,
          requirement_slot_id:  slot.id,
          selected_course_code: slot.is_pool
            ? (planSlots[slot.id] ?? null)
            : slot.class_code,
          status:               planStatuses[slot.id]          ?? 'planned',
          semester_number:      planSemesterOverrides[slot.id]  ?? null,
          credits_remaining:    planCreditsRemaining[slot.id]   ?? 0,
          archived:             true,
          archive_reason:       'prior_credit',
        }, { onConflict: 'student_id, requirement_slot_id' })
      ))
    }

    if (toUnarchive.length > 0) {
      await supabase.from('student_plan_slots')
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
      const { data: slotData, error: slotError } = await supabase
        .from('requirement_slots')
        .select('id, semester_number, slot_order, class_code, is_pool, flex_credits')
        .eq('concentration_id', profile.concentration_id)
        .order('semester_number', { ascending: true })
        .order('slot_order',      { ascending: true })

      if (slotError) { setError(slotError.message); setLoading(false); return }

      // Step 2 — student's saved selections + overrides + archived status
      const slotIds = slotData.map(s => s.id)
      const { data: savedSlots, error: savedSlotsError } = await supabase
        .from('student_plan_slots')
        .select('requirement_slot_id, selected_course_code, status, semester_number, credits_remaining, archived, archive_reason')
        .eq('student_id', profile.id)
        .in('requirement_slot_id', slotIds)

      if (savedSlotsError) { setError(savedSlotsError.message); setLoading(false); return }

      const planSlotsMap             = {}
      const planStatusesMap          = {}
      const planSemesterOverridesMap = {}
      const planCreditsRemainingMap  = {}
      const planArchivedMap          = {}
      for (const row of savedSlots) {
        planSlotsMap[row.requirement_slot_id]    = row.selected_course_code
        planStatusesMap[row.requirement_slot_id] = row.status
        if (row.semester_number != null)
          planSemesterOverridesMap[row.requirement_slot_id] = row.semester_number
        if (row.credits_remaining > 0)
          planCreditsRemainingMap[row.requirement_slot_id] = row.credits_remaining
        if (row.archived)
          planArchivedMap[row.requirement_slot_id] = true
      }

      // Step 3 — free-add slots
      const { data: freeAdds, error: freeAddError } = await supabase
        .from('student_free_add_slots')
        .select('id, course_code, semester_number, status')
        .eq('student_id', profile.id)
        .order('created_at', { ascending: true })

      if (freeAddError) { setError(freeAddError.message); setLoading(false); return }

      // Step 4 — collect all course codes to fetch
      const { POOL_COURSES } = await import('../lib/poolResolver')
      const realCodes  = slotData.filter(s => !s.is_pool).map(s => s.class_code)
      const poolCodes  = Object.values(POOL_COURSES).filter(arr => arr !== null).flat()
      const freeAddCodes = (freeAdds ?? []).map(f => f.course_code)
      const allCodes   = [...new Set([...realCodes, ...poolCodes, ...freeAddCodes])]

      // Step 5 — fetch courses
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('code, name, credits, subject_code, standing_req, description')
        .in('code', allCodes)

      if (courseError) { setError(courseError.message); setLoading(false); return }
      const courseMap = {}
      for (const course of courseData) courseMap[course.code] = course

      // Step 6 — prerequisites
      const { data: prereqData, error: prereqError } = await supabase
        .from('prerequisite_entries')
        .select('course_code, group_index, logic, required_code')
        .in('course_code', allCodes)

      if (prereqError) { setError(prereqError.message); setLoading(false); return }

      const prereqMapBuilt = {}
      for (const entry of prereqData) {
        if (!prereqMapBuilt[entry.course_code]) prereqMapBuilt[entry.course_code] = {}
        if (!prereqMapBuilt[entry.course_code][entry.group_index]) {
          prereqMapBuilt[entry.course_code][entry.group_index] = { logic: entry.logic, codes: [] }
        }
        prereqMapBuilt[entry.course_code][entry.group_index].codes.push(entry.required_code)
      }

      // Step 6b — corequisites
      // Fetch group_index and logic so OR groups can short-circuit correctly.
      const { data: coreqData } = await supabase
        .from('corequisite_entries')
        .select('course_code, required_code, group_index, logic')
        .in('course_code', allCodes)

      const coreqMapBuilt = {}
      for (const entry of coreqData ?? []) {
        if (!coreqMapBuilt[entry.course_code]) coreqMapBuilt[entry.course_code] = {}
        const gi = entry.group_index
        if (!coreqMapBuilt[entry.course_code][gi]) {
          coreqMapBuilt[entry.course_code][gi] = { logic: entry.logic, codes: [] }
        }
        coreqMapBuilt[entry.course_code][gi].codes.push(entry.required_code)
      }

      // Step 7 — semester notes + completion state
      const { data: notesData } = await supabase
        .from('student_semester_notes')
        .select('semester_number, note_text, completed_by_student')
        .eq('student_id', profile.id)
        .eq('concentration_id', profile.concentration_id)

      const semNotesMap     = {}
      const semCompletedMap = {}
      for (const row of notesData ?? []) {
        semNotesMap[row.semester_number] = row.note_text
        if (row.completed_by_student) semCompletedMap[row.semester_number] = true
      }

      // Step 7.5 — prior credits (placement gates + transfer/AP credits)
      const { data: priorCreditsData, error: pcError } = await supabase
        .from('prior_credits')
        .select('id, credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded')
        .eq('plan_id', profile.id)
        .order('created_at', { ascending: true })

      if (pcError) { setError(pcError.message); setLoading(false); return }

      // Build initial expanded state: completed semesters start collapsed
      const allSemNums = [...new Set([
        ...slotData.map(s => s.semester_number),
        ...(freeAdds ?? []).map(f => f.semester_number),
      ])]
      const expandedMap = {}
      for (const semNum of allSemNums) {
        expandedMap[semNum] = !semCompletedMap[semNum]
      }

      // Step 8 — commit all state at once
      setSlots(slotData)
      setCourses(courseMap)
      setPrereqMap(prereqMapBuilt)
      setCoreqMap(coreqMapBuilt)
      setPlanSlots(planSlotsMap)
      setPlanStatuses(planStatusesMap)
      setPlanSemesterOverrides(planSemesterOverridesMap)
      setPlanCreditsRemaining(planCreditsRemainingMap)
      setPlanArchived(planArchivedMap)
      setFreeAddSlots(freeAdds ?? [])
      setSemesterNotes(semNotesMap)
      setPlanSemesterCompleted(semCompletedMap)
      setSemesterExpanded(expandedMap)
      setPriorCredits(priorCreditsData ?? [])
      setLoading(false)
    }

    loadPlan()
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

  // ── Build semesterMap — archived slots excluded ───────────────────
  // Concept 2: prior-credit archived slots are not in the future plan grid.
  const semesterMap = useMemo(() => {
    return slots.reduce((acc, slot) => {
      if (planArchived[slot.id]) return acc   // removed from grid by prior credit
      const sem = planSemesterOverrides[slot.id] ?? slot.semester_number
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
    const extra = Array.from(
      { length: extraSemesterCount },
      (_, i) => maxTemplateSem + i + 1
    )
    return [...new Set([...semesterNumbers, ...extra])].sort((a, b) => a - b)
  }, [semesterNumbers, extraSemesterCount, maxTemplateSem])

  // ── Science sequence warnings ─────────────────────────────────────
  const scienceWarnings = useMemo(
    () => getScienceWarnings(planSlots, slots),
    [planSlots, slots]
  )

  // ── GEN_ED sub-requirement status ─────────────────────────────────
  const genEdStatus = useMemo(
    () => getGenEdStatus(planSlots, slots, courses, priorCredits),
    [planSlots, slots, courses, priorCredits]
  )

  // ── Codes already in the plan (BUG-34) ─────────────────────────────
  // Mirrors computePlanCredits dedup keyspace. Passed to AddCourseModal so
  // the picker greys out duplicates of template, pool, free-add, or
  // credit-bearing prior_credits entries.
  const takenCodes = useMemo(
    () => getTakenCodes(planSlots, slots, priorCredits, freeAddSlots),
    [planSlots, slots, priorCredits, freeAddSlots]
  )

  // ── Plan completeness (non-archived slots only) ───────────────────
  const activeSlots = useMemo(
    () => slots.filter(s => !planArchived[s.id]),
    [slots, planArchived]
  )
  const { isComplete } = usePlanCompleteness(activeSlots, planSlots, genEdStatus)

  // ── Transfer credit slot satisfaction ────────────────────────────
  const transferFilled = useMemo(
    () => resolveTransferCredits(priorCredits, planSlots, slots),
    [priorCredits, planSlots, slots]
  )

  // ── Credit totals ─────────────────────────────────────────────────
  // computePlanCredits dedups across prior_credits, plan_slots, and
  // free-add slots — a course code contributes once, with prior credits
  // winning over plan slots and plan slots winning over free-add (BUG-6).
  const creditTotals = useMemo(() => {
    const { breakdown } = computePlanCredits(
      planSlots, priorCredits, slots, courses, freeAddSlots
    )

    let completed = 0
    let planned   = 0

    for (const item of breakdown) {
      if (item.source === 'transfer') {
        completed += item.credits
      } else if (item.source === 'free_add') {
        if (item.status === 'completed') completed += item.credits
        else                             planned   += item.credits
      } else {
        const status = item.slotId != null
          ? (planStatuses[item.slotId] ?? 'planned')
          : 'planned'
        if (status === 'completed') completed += item.credits
        else                        planned   += item.credits
      }
    }

    return { completed, planned }
  }, [slots, planSlots, planStatuses, courses, freeAddSlots, priorCredits])

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
  const prereqWarnings = useMemo(() => {
    const placed = []

    for (const slot of slots) {
      const sem  = planSemesterOverrides[slot.id] ?? slot.semester_number
      const code = slot.is_pool ? planSlots[slot.id] : slot.class_code
      if (code) placed.push({ key: slot.id, code, sem })
    }
    for (const fa of freeAddSlots) {
      placed.push({ key: `fa_${fa.id}`, code: fa.course_code, sem: fa.semester_number })
    }

    const warnings = {}
    for (const item of placed) {
      const completedCodes = new Set(
        placed
          .filter(p => p.sem < item.sem)
          .map(p => p.code)
      )
      const result = checkPrereqs(item.code, prereqMap, completedCodes, priorCredits, courses, coreqMap)
      if (!result.satisfied) warnings[item.key] = result.missing
    }
    return warnings
  }, [slots, planSlots, freeAddSlots, planSemesterOverrides, prereqMap, priorCredits, courses, coreqMap])

  // ── Reactive corequisite warnings (Bug 4 fix) ────────────────────
  // availableCodes = completedCodes (strictly earlier) + same-semester codes
  // Corequisites check against availableCodes (same-semester enrollment counts).
  // BUG-13: the completion toggle does not feed satisfaction in either
  // direction; only positional ordering does.
  const coreqWarnings = useMemo(() => {
    const placed = []

    for (const slot of slots) {
      const sem  = planSemesterOverrides[slot.id] ?? slot.semester_number
      const code = slot.is_pool ? planSlots[slot.id] : slot.class_code
      if (code) placed.push({ key: slot.id, code, sem })
    }
    for (const fa of freeAddSlots) {
      placed.push({ key: `fa_${fa.id}`, code: fa.course_code, sem: fa.semester_number })
    }

    const priorCodes = priorCredits
      .filter(pc => pc.satisfies_course_code)
      .map(pc => pc.satisfies_course_code)

    const warnings = {}
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

      const result = checkCoreqs(item.code, coreqMap, availableCodes)
      if (!result.satisfied) warnings[item.key] = result.missing
    }
    return warnings
  }, [slots, planSlots, freeAddSlots, planSemesterOverrides, coreqMap, priorCredits])

  // ── Standing requirement warnings ────────────────────────────────
  const standingWarnings = useMemo(() => {
    const priorCreditHrs = priorCredits.reduce(
      (sum, pc) => sum + (pc.credits_awarded ?? 0), 0
    )
    const warnings = {}

    for (const slot of slots) {
      const sem  = planSemesterOverrides[slot.id] ?? slot.semester_number
      const code = slot.is_pool ? planSlots[slot.id] : slot.class_code
      if (!code) continue

      const course = courses[code]
      if (!course?.standing_req) continue

      const threshold = STANDING_THRESHOLDS[course.standing_req]
      if (!threshold) continue

      let creditsBefore = priorCreditHrs
      for (const s of slots) {
        const sSem = planSemesterOverrides[s.id] ?? s.semester_number
        if (sSem >= sem) continue
        if (s.is_pool) {
          const c = planSlots[s.id]
          creditsBefore += c ? (courses[c]?.credits ?? 0) : 0
        } else {
          creditsBefore += courses[s.class_code]?.credits ?? 0
        }
      }
      for (const fa of freeAddSlots) {
        if (fa.semester_number < sem) {
          creditsBefore += courses[fa.course_code]?.credits ?? 0
        }
      }

      if (creditsBefore < threshold) {
        warnings[slot.id] = course.standing_req
      }
    }
    return warnings
  }, [slots, planSlots, freeAddSlots, planSemesterOverrides, courses, priorCredits])

  // ── Per-semester warning gate ─────────────────────────────────────
  // A semester cannot be marked complete if it has unresolved prereq/coreq warnings.
  const semesterHasWarnings = useMemo(() => {
    const result = {}
    for (const semNum of semesterNumbers) {
      const slotKeys = (semesterMap[semNum] ?? []).map(s => s.id)
      const faKeys   = (freeAddBySemester[semNum] ?? []).map(fa => `fa_${fa.id}`)
      result[semNum] = [...slotKeys, ...faKeys].some(k =>
        (prereqWarnings[k]?.length > 0) || (coreqWarnings[k]?.length > 0)
      )
    }
    return result
  }, [semesterNumbers, semesterMap, freeAddBySemester, prereqWarnings, coreqWarnings])

  // ── Save a pool/required course selection (optimistic) ────────────
  function handleSave(slot, course) {
    const existingStatus = planStatuses[slot.id] ?? 'planned'

    let creditsRemaining = 0
    if (slot.is_pool && slot.flex_credits > 0) {
      const diff = slot.flex_credits - course.credits
      creditsRemaining = diff > 0 ? diff : 0
    }

    const prevSlots            = planSlots
    const prevStatuses         = planStatuses
    const prevCreditsRemaining = planCreditsRemaining

    setPlanSlots(prev          => ({ ...prev, [slot.id]: course.code }))
    setPlanStatuses(prev       => ({ ...prev, [slot.id]: existingStatus }))
    setPlanCreditsRemaining(prev => ({ ...prev, [slot.id]: creditsRemaining }))
    setActiveSlot(null)
    setLastSelection({ slot, courseCode: course.code })

    supabase
      .from('student_plan_slots')
      .upsert({
        student_id:           profile.id,
        requirement_slot_id:  slot.id,
        selected_course_code: course.code,
        status:               existingStatus,
        semester_number:      planSemesterOverrides[slot.id] ?? null,
        credits_remaining:    creditsRemaining,
      }, { onConflict: 'student_id, requirement_slot_id' })
      .then(({ error }) => {
        if (error) {
          setPlanSlots(prevSlots)
          setPlanStatuses(prevStatuses)
          setPlanCreditsRemaining(prevCreditsRemaining)
          setLastSelection(null)
          showSaveError('Course selection could not be saved. Please try again.')
        }
      })
  }

  // ── Cycle a slot's status ─────────────────────────────────────────
  // TODO: individual course completion status will be driven by Banner transcript
  // data on university integration. Do not add manual per-course completion
  // toggles until that integration defines the source of truth.
  function handleStatusChange(slot, newStatus) {
    const courseCode = slot.is_pool ? planSlots[slot.id] : slot.class_code
    if (slot.is_pool && !courseCode) return

    const prevStatuses = planStatuses
    setPlanStatuses(prev => ({ ...prev, [slot.id]: newStatus }))

    supabase
      .from('student_plan_slots')
      .upsert({
        student_id:           profile.id,
        requirement_slot_id:  slot.id,
        selected_course_code: courseCode,
        status:               newStatus,
        semester_number:      planSemesterOverrides[slot.id] ?? null,
        credits_remaining:    planCreditsRemaining[slot.id] ?? 0,
      }, { onConflict: 'student_id, requirement_slot_id' })
      .then(({ error }) => {
        if (error) {
          setPlanStatuses(prevStatuses)
          showSaveError('Status change could not be saved. Please try again.')
        }
      })
  }

  // ── Cycle a free-add slot's status ───────────────────────────────
  function handleFreeAddStatusChange(freeAdd, newStatus) {
    const prev = freeAddSlots
    setFreeAddSlots(list =>
      list.map(f => f.id === freeAdd.id ? { ...f, status: newStatus } : f)
    )
    supabase
      .from('student_free_add_slots')
      .update({ status: newStatus })
      .eq('id', freeAdd.id)
      .then(({ error }) => {
        if (error) {
          setFreeAddSlots(prev)
          showSaveError('Status change could not be saved. Please try again.')
        }
      })
  }

  // ── Remove a pool slot selection ──────────────────────────────────
  async function handleRemove(slot) {
    const { error } = await supabase
      .from('student_plan_slots')
      .delete()
      .eq('student_id', profile.id)
      .eq('requirement_slot_id', slot.id)

    if (!error) {
      setPlanSlots(prev    => { const n = { ...prev }; delete n[slot.id]; return n })
      setPlanStatuses(prev => { const n = { ...prev }; delete n[slot.id]; return n })
      setPlanCreditsRemaining(prev => { const n = { ...prev }; delete n[slot.id]; return n })
      setActiveSlot(null)
    }
  }

  // ── Undo the most recent pool slot selection ──────────────────────
  async function handleUndo() {
    if (!lastSelection) return
    await handleRemove(lastSelection.slot)
    setLastSelection(null)
  }

  // ── Add a free-add course to a semester ──────────────────────────
  async function handleAddCourse(semesterNumber, course) {
    setAddCourseTarget(null)

    // BUG-34: defensive guard. The modal already greys taken codes out, but
    // stale state or a keyboard-activation race could let one through.
    if (takenCodes.has(course.code)) {
      showSaveError(`${course.code} is already in your plan.`)
      return
    }

    const { data, error } = await supabase
      .from('student_free_add_slots')
      .insert({
        student_id:      profile.id,
        course_code:     course.code,
        semester_number: semesterNumber,
        status:          'planned',
      })
      .select('id, course_code, semester_number, status')
      .single()

    if (error) {
      showSaveError('Could not add course. Please try again.')
      return
    }

    if (data && !courses[course.code]) {
      setCourses(prev => ({ ...prev, [course.code]: course }))
    }

    setFreeAddSlots(prev => [...prev, data])
  }

  // ── Remove a free-add slot ────────────────────────────────────────
  function handleRemoveFreeAdd(freeAdd) {
    const prev = freeAddSlots
    setFreeAddSlots(list => list.filter(f => f.id !== freeAdd.id))

    supabase
      .from('student_free_add_slots')
      .delete()
      .eq('id', freeAdd.id)
      .then(({ error }) => {
        if (error) {
          setFreeAddSlots(prev)
          showSaveError('Could not remove course. Please try again.')
        }
      })
  }

  // ── Prior credit CRUD ─────────────────────────────────────────────
  // Accepts a single credit-data object OR an array of them.
  // Passing an array inserts all rows in one Supabase call and updates
  // priorCredits state once — avoiding the stale-closure overwrite that
  // occurs when callers loop and call this function once per award.
  async function handleAddPriorCredit(creditDataOrArray) {
    const items   = Array.isArray(creditDataOrArray) ? creditDataOrArray : [creditDataOrArray]
    const inserts = items.map(item => ({ ...item, plan_id: profile.id }))

    const { data, error } = await supabase
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
  }

  async function handleRemovePriorCredit(id) {
    const prev       = priorCredits
    const newCredits = priorCredits.filter(pc => pc.id !== id)
    setPriorCredits(newCredits)

    const { error } = await supabase
      .from('prior_credits')
      .delete()
      .eq('id', id)

    if (error) {
      setPriorCredits(prev)
      showSaveError('Could not remove credit. Please try again.')
      return
    }

    await syncArchivedSlots(newCredits)
  }

  // ── Semester completion toggle ────────────────────────────────────
  // Concept 1: semester-level completion toggled by student.
  // Rule B: completing also batch-sets all slot statuses to 'completed';
  // undoing reverts to 'planned'.
  async function handleSemesterComplete(semNum, value) {
    const prevCompleted = planSemesterCompleted
    const prevExpanded  = semesterExpanded
    const prevStatuses  = planStatuses
    const prevFreeAdds  = freeAddSlots

    const newStatus    = value ? 'completed' : 'planned'
    const semSlotIds   = (semesterMap[semNum] ?? []).map(s => s.id)

    // Optimistic updates
    setPlanSemesterCompleted(prev => ({ ...prev, [semNum]: value }))
    setSemesterExpanded(prev => ({ ...prev, [semNum]: !value }))
    if (semSlotIds.length > 0) {
      setPlanStatuses(prev => {
        const next = { ...prev }
        for (const id of semSlotIds) next[id] = newStatus
        return next
      })
    }
    setFreeAddSlots(list =>
      list.map(f => f.semester_number === semNum ? { ...f, status: newStatus } : f)
    )

    // Persist semester completion flag
    const { error: noteErr } = await supabase
      .from('student_semester_notes')
      .upsert({
        student_id:           profile.id,
        concentration_id:     profile.concentration_id,
        semester_number:      semNum,
        note_text:            semesterNotes[semNum] ?? '',
        updated_at:           new Date().toISOString(),
        completed_by_student: value,
      }, { onConflict: 'student_id, concentration_id, semester_number' })

    if (noteErr) {
      setPlanSemesterCompleted(prevCompleted)
      setSemesterExpanded(prevExpanded)
      setPlanStatuses(prevStatuses)
      setFreeAddSlots(prevFreeAdds)
      showSaveError('Semester completion could not be saved. Please try again.')
      return
    }

    // Rule B: batch update template slot statuses
    if (semSlotIds.length > 0) {
      const { error: slotErr } = await supabase
        .from('student_plan_slots')
        .update({ status: newStatus })
        .eq('student_id', profile.id)
        .in('requirement_slot_id', semSlotIds)

      if (slotErr) {
        setPlanStatuses(prevStatuses)
        showSaveError('Slot statuses could not be updated. Please try again.')
        return
      }
    }

    // Rule B: batch update free-add slot statuses
    const { error: faErr } = await supabase
      .from('student_free_add_slots')
      .update({ status: newStatus })
      .eq('student_id', profile.id)
      .eq('semester_number', semNum)

    if (faErr) {
      setFreeAddSlots(prevFreeAdds)
      showSaveError('Some free-add slot statuses could not be updated.')
    }
  }

  // ── Global collapse / expand controls ────────────────────────────
  function collapseCompleted() {
    setSemesterExpanded(prev => {
      const next = { ...prev }
      for (const semNum of allSemesterNumbers) {
        if (planSemesterCompleted[semNum]) next[semNum] = false
      }
      return next
    })
  }

  function expandAll() {
    const next = {}
    for (const semNum of allSemesterNumbers) next[semNum] = true
    setSemesterExpanded(next)
  }

  function collapseAll() {
    const next = {}
    for (const semNum of allSemesterNumbers) next[semNum] = false
    setSemesterExpanded(next)
  }

  // ── Route a slot click ────────────────────────────────────────────
  function handleSlotClick(slot) {
    if (slot.is_pool && !planSlots[slot.id]) {
      setActiveSlot(slot)
    } else {
      setActiveDetail(slot)
    }
  }

  function handleChangeSelection() {
    const slot = activeDetail
    setActiveDetail(null)
    setActiveSlot(slot)
  }

  // ── Semester notes ────────────────────────────────────────────────
  function handleNoteSave(semesterNumber, noteText) {
    const prevNotes = semesterNotes
    setSemesterNotes(prev => ({ ...prev, [semesterNumber]: noteText }))

    supabase
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
        }
      })
  }

  // ── Drag-and-drop handlers ────────────────────────────────────────

  function handleDragStart({ active }) {
    setDraggedSlotId(active.id)
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
        const { error: archErr } = await supabase.from('student_plan_slots').upsert({
          student_id:           profile.id,
          requirement_slot_id:  slot.id,
          selected_course_code: courseCode,
          status:               planStatuses[slot.id]          ?? 'planned',
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

    if (type === 'requirement_slot') {
      const slot = slots.find(s => s.id === slotId)
      if (!slot) return
      if (planArchived[slotId]) return   // archived slots cannot be moved
      const currentSemester = planSemesterOverrides[slotId] ?? slot.semester_number
      if (currentSemester === newSemester) return

      const prevOverrides = planSemesterOverrides
      setPlanSemesterOverrides(prev => ({ ...prev, [slotId]: newSemester }))

      const courseCode = slot.is_pool ? planSlots[slotId] : slot.class_code
      supabase
        .from('student_plan_slots')
        .upsert({
          student_id:           profile.id,
          requirement_slot_id:  slotId,
          selected_course_code: courseCode ?? null,
          status:               planStatuses[slotId] ?? 'planned',
          semester_number:      newSemester,
          credits_remaining:    planCreditsRemaining[slotId] ?? 0,
        }, { onConflict: 'student_id, requirement_slot_id' })
        .then(({ error }) => {
          if (error) {
            setPlanSemesterOverrides(prevOverrides)
            showSaveError('Could not move slot. Please try again.')
          }
        })

    } else if (type === 'free_add') {
      const fa = freeAddSlots.find(f => f.id === slotId)
      if (!fa || fa.semester_number === newSemester) return

      const prevFreeAdds = freeAddSlots
      setFreeAddSlots(list =>
        list.map(f => f.id === slotId ? { ...f, semester_number: newSemester } : f)
      )

      supabase
        .from('student_free_add_slots')
        .update({ semester_number: newSemester })
        .eq('id', slotId)
        .then(({ error }) => {
          if (error) {
            setFreeAddSlots(prevFreeAdds)
            showSaveError('Could not move course. Please try again.')
          }
        })

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
    const { error } = await supabase
      .from('student_plan_slots').delete().eq('student_id', profile.id)
    if (error) return error
    await supabase.from('student_free_add_slots').delete().eq('student_id', profile.id)
    await supabase.from('student_semester_notes').delete().eq('student_id', profile.id)
    return null
  }

  // ── Reset plan ────────────────────────────────────────────────────
  async function handleResetPlan() {
    setResetting(true)
    const err = await clearPlanData()
    if (err) { setResetting(false); return }
    setLastSelection(null)
    setExtraSemesterCount(0)
    setResetting(false)
    setShowResetModal(false)
    setResetKey(k => k + 1)
  }

  // ── Concentration switch ──────────────────────────────────────────
  async function handleConcentrationSwitch(newConc) {
    setSwitching(true)

    const { error: updateErr } = await supabase
      .from('student_profiles')
      .update({ concentration_id: newConc.id })
      .eq('id', profile.id)
    if (updateErr) { setSwitching(false); return }

    const deleteErr = await clearPlanData()
    if (deleteErr) { setSwitching(false); return }

    setSwitching(false)
    setShowSwitchModal(false)
    setLastSelection(null)
    setExtraSemesterCount(0)
    onProfileChange({ ...profile, concentration_id: newConc.id, concentrations: newConc })
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

  const maxSemester  = semesterNumbers.length > 0 ? Math.max(...semesterNumbers) : 0
  const graduation   = projectGraduation(profile.start_season, profile.start_year, maxSemester)

  const draggedLabel = (() => {
    if (!draggedSlotId) return null
    const slot = slots.find(s => s.id === draggedSlotId)
    if (slot) {
      const code = slot.is_pool ? (planSlots[slot.id] ?? slot.class_code) : slot.class_code
      return code
    }
    const fa = freeAddSlots.find(f => f.id === draggedSlotId)
    if (fa) return fa.course_code ?? null
    const pc = priorCredits.find(p => p.id === draggedSlotId)
    return pc?.satisfies_course_code ?? pc?.note ?? null
  })()


  const completedSemesterCount = allSemesterNumbers.filter(n => planSemesterCompleted[n]).length

  return (
    <div className="degreeplan-shell">

      <header className="degreeplan-header">
        <div className="degreeplan-header-inner">
          <div>
            <p className="degreeplan-eyebrow">Tennessee Tech University</p>
            <h1 className="degreeplan-title">{profile.concentrations.name}</h1>
            <p className="degreeplan-meta">
              Started {profile.start_season} {profile.start_year}
              {graduation && (
                <>
                  <span className="credit-label-dot"> · </span>
                  <span className="degreeplan-graduation">
                    Projected graduation: {graduation.season} {graduation.year}
                  </span>
                </>
              )}
            </p>
            <div className="credit-bar-wrap">
              <div className="credit-bar-track">
                <div className="credit-bar-completed" style={{ width: `${completedPct}%` }} />
                <div className="credit-bar-planned"   style={{ width: `${plannedPct}%`   }} />
              </div>
              <p className="credit-bar-label">
                <span className="credit-label-completed">{creditTotals.completed} completed</span>
                <span className="credit-label-dot">·</span>
                <span className="credit-label-planned">{creditTotals.planned} planned</span>
                <span className="credit-label-dot">·</span>
                {totalHours} total
              </p>
            </div>
            <GenEdTracker categories={genEdStatus} />
          </div>
          <div className="degreeplan-header-actions">
            <button
              className="degreeplan-undo"
              onClick={handleUndo}
              disabled={!lastSelection}
              title={lastSelection ? `Undo: remove ${lastSelection.courseCode}` : 'Nothing to undo'}
            >
              ↩ Undo
            </button>
            <button
              className="degreeplan-reset"
              onClick={() => setShowResetModal(true)}
            >
              Reset plan
            </button>
            <button
              className="degreeplan-settings"
              onClick={() => setShowSwitchModal(true)}
            >
              Change concentration
            </button>
            <button className="degreeplan-signout" onClick={() => {
              const next = theme === 'dark' ? 'light' : 'dark'
              document.documentElement.dataset.theme = next
              localStorage.setItem('theme', next)
              setTheme(next)
            }}>
              {theme === 'dark' ? '☀ Light' : '☾ Dark'}
            </button>
            <button className="degreeplan-signout" onClick={async () => {
              await supabase.auth.signOut()
            }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="degreeplan-main">
        <CompletionBadge
          isComplete={isComplete}
          concentrationName={profile.concentrations.name}
        />

        {/* DndContext wraps both panels + grid so the transfer zone receives drops */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* ── Prior Coursework panel ── */}
          <TransferCreditsPanel
            credits={priorCredits}
            onRemove={handleRemovePriorCredit}
            onAddClick={() => setShowWizard(true)}
          />

          {/* ── Global grid controls ── */}
          <div className="degreeplan-grid-controls">
            {completedSemesterCount > 0 && (
              <button
                className="grid-control-btn"
                onClick={collapseCompleted}
                title="Collapse all completed semesters"
              >
                Collapse completed
              </button>
            )}
            <button
              className="grid-control-btn"
              onClick={expandAll}
              title="Expand all semesters"
            >
              Expand all
            </button>
            <button
              className="grid-control-btn"
              onClick={collapseAll}
              title="Collapse all semesters"
            >
              Collapse all
            </button>
          </div>

          <div className="degreeplan-grid">
            {allSemesterNumbers.map((semNum, idx) => {
              const priorComplete = allSemesterNumbers
                .slice(0, idx)
                .every(n => planSemesterCompleted[n])
              return (
                <Semester
                  key={semNum}
                  semesterNumber={semNum}
                  slots={semesterMap[semNum] ?? []}
                  freeAddSlots={freeAddBySemester[semNum] ?? []}
                  courseMap={courses}
                  planSlots={planSlots}
                  planStatuses={planStatuses}
                  planCreditsRemaining={planCreditsRemaining}
                  onSlotClick={handleSlotClick}
                  onStatusChange={handleStatusChange}
                  onFreeAddStatusChange={handleFreeAddStatusChange}
                  onRemoveFreeAdd={handleRemoveFreeAdd}
                  onAddCourse={() => setAddCourseTarget(semNum)}
                  scienceWarnings={scienceWarnings}
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
                  isCompleted={!!planSemesterCompleted[semNum]}
                  onMarkComplete={value => handleSemesterComplete(semNum, value)}
                  hasWarnings={!!semesterHasWarnings[semNum]}
                  priorSemestersAllComplete={priorComplete}
                  displayNumber={idx + 1}
                />
              )
            })}
          </div>

          <div className="degreeplan-add-semester-wrap">
            <button
              className="degreeplan-add-semester-btn"
              onClick={() => setExtraSemesterCount(c => c + 1)}
            >
              + Add semester
            </button>
          </div>

          <DragOverlay>
            {draggedLabel && (
              <div className="slot-drag-overlay">{draggedLabel}</div>
            )}
          </DragOverlay>
        </DndContext>
      </main>

      {activeSlot && (
        <SlotModal
          slot={activeSlot}
          courseMap={courses}
          studentId={profile.id}
          planSlots={planSlots}
          slots={slots}
          prereqMap={prereqMap}
          coreqMap={coreqMap}
          priorCredits={priorCredits}
          planSemesterOverrides={planSemesterOverrides}
          onSave={handleSave}
          onRemove={handleRemove}
          onClose={() => setActiveSlot(null)}
        />
      )}

      {activeDetail && (() => {
        const slot   = activeDetail
        const course = slot.is_pool
          ? courses[planSlots[slot.id]]
          : courses[slot.class_code]
        return (
          <CourseDetailModal
            slot={slot}
            course={course}
            courseMap={courses}
            prereqMap={prereqMap}
            coreqMap={coreqMap}
            isPool={slot.is_pool}
            onChangeSelection={handleChangeSelection}
            onRemove={slot => { handleRemove(slot); setActiveDetail(null) }}
            onClose={() => setActiveDetail(null)}
          />
        )
      })()}

      {addCourseTarget !== null && (
        <AddCourseModal
          semesterNumber={addCourseTarget}
          takenCodes={takenCodes}
          onAdd={course => handleAddCourse(addCourseTarget, course)}
          onClose={() => setAddCourseTarget(null)}
        />
      )}

      {showWizard && (
        <PriorCreditWizard
          onSave={handleAddPriorCredit}
          onClose={() => setShowWizard(false)}
          planSlots={planSlots}
          slots={slots}
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
          currentId={profile.concentration_id}
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

    </div>
  )
}

// ── Graduation timeline projection ────────────────────────────────────────────

function projectGraduation(startSeason, startYear, numSemesters) {
  if (!startSeason || !startYear || !numSemesters) return null
  const offset = numSemesters - 1
  const k      = Math.floor(offset / 2)
  if (startSeason === 'Fall') {
    return offset % 2 === 0
      ? { season: 'Fall',   year: startYear + k }
      : { season: 'Spring', year: startYear + k + 1 }
  } else {
    return offset % 2 === 0
      ? { season: 'Spring', year: startYear + k }
      : { season: 'Fall',   year: startYear + k }
  }
}

// ── GenEdTracker ───────────────────────────────────────────────────────────────

function GenEdTracker({ categories }) {
  if (!categories || categories.length === 0) return null
  return (
    <div className="gen-ed-tracker">
      {categories.map(cat => {
        const state = cat.satisfied ? 'satisfied'
                    : cat.atRisk   ? 'risk'
                    : cat.filled > 0 ? 'progress'
                    : 'empty'
        return (
          <div key={cat.category} className={`gen-ed-chip gen-ed-chip-${state}`}>
            <span className="gen-ed-chip-label">{cat.label}</span>
            <span className="gen-ed-chip-count">{cat.filled} / {cat.required} hrs</span>
          </div>
        )
      })}
    </div>
  )
}

// ── PriorCreditDraggableRow ────────────────────────────────────────────────────

function PriorCreditDraggableRow({ pc, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   pc.id,
    data: { type: 'prior_credit', priorCreditId: pc.id, courseCode: pc.satisfies_course_code },
  })
  const isPlacement = (pc.credits_awarded ?? 0) === 0
  return (
    <div
      ref={setNodeRef}
      className={`prior-credit-row${isDragging ? ' prior-credit-row-dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <span className={`credit-type-chip credit-type-${pc.credit_type}`}>
        {CREDIT_TYPE_LABELS[pc.credit_type] ?? pc.credit_type}
      </span>
      <span className="prior-credit-code">{pc.satisfies_course_code ?? '—'}</span>
      {pc.note && (
        <>
          <span className="prior-credit-sep" aria-hidden="true">·</span>
          <span className="prior-credit-note">{pc.note}</span>
        </>
      )}
      <span className="prior-credit-sep" aria-hidden="true">·</span>
      {isPlacement ? (
        <span className="prior-credit-hrs prior-credit-hrs-gate">Gate only</span>
      ) : (
        <span className="prior-credit-hrs">{pc.credits_awarded} cr</span>
      )}
      <button
        className="prior-credit-remove"
        onPointerDown={e => e.stopPropagation()}
        onClick={() => onRemove(pc.id)}
        title="Remove this credit"
        aria-label="Remove credit"
      >
        ✕
      </button>
    </div>
  )
}

// ── TransferCreditsPanel ───────────────────────────────────────────────────────

function TransferCreditsPanel({ credits, onRemove, onAddClick }) {
  const [open, setOpen] = useState(true)

  const { setNodeRef, isOver } = useDroppable({ id: 'transfer_credits' })

  return (
    <div
      className={`prior-credits-panel${isOver ? ' prior-credits-panel-drag-over' : ''}`}
      style={{ maxWidth: 1200, margin: '0 auto 1rem' }}
      ref={setNodeRef}
    >
      <div className="prior-credits-panel-header" onClick={() => setOpen(o => !o)}>
        <div className="prior-credits-panel-title">
          <span>Prior Coursework</span>
          {credits.length > 0 && (
            <span className="prior-credits-count">{credits.length}</span>
          )}
        </div>
        <div className="prior-credits-panel-right">
          {isOver && (
            <span className="prior-credits-drop-hint">Drop to transfer</span>
          )}
          <span className="prior-credits-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="prior-credits-body">
          {credits.length === 0 ? (
            <p className="prior-credits-empty">
              No prior coursework recorded. Drag a filled course here, or use Add Prior Credit.
            </p>
          ) : (
            <div className="prior-credits-groups">
              {groupAndSortPriorCredits(credits).map(group => (
                <div key={group.type} className="prior-credits-group">
                  <div className="prior-credits-group-header">{group.label}</div>
                  <div className="prior-credits-list">
                    {group.entries.map(pc => (
                      <PriorCreditDraggableRow key={pc.id} pc={pc} onRemove={onRemove} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="prior-credits-add-btn" onClick={onAddClick}>
            + Add Prior Credit
          </button>
        </div>
      )}
    </div>
  )
}

// ── ConcentrationModal ─────────────────────────────────────────────────────────

function ConcentrationModal({ currentId, onSwitch, onClose, switching }) {
  const [concentrations, setConcentrations] = useState([])
  const [selected, setSelected]             = useState(null)
  const [loadingConcs, setLoadingConcs]     = useState(true)
  const [fetchError, setFetchError]         = useState(null)

  useEffect(() => {
    async function fetchConcentrations() {
      const { data, error } = await supabase
        .from('concentrations')
        .select('id, code, name, total_hours')
        .order('id', { ascending: true })
      if (error) { setFetchError(error.message); setLoadingConcs(false); return }
      setConcentrations(data)
      const current = data.find(c => c.id === currentId)
      if (current) setSelected(current)
      setLoadingConcs(false)
    }
    fetchConcentrations()
  }, [])

  const isDifferent = selected && selected.id !== currentId

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Settings</p>
            <h3 className="modal-title">Change concentration</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-course-list" style={{ padding: '1.25rem 1.5rem' }}>
          {loadingConcs ? (
            <p className="modal-empty">Loading concentrations...</p>
          ) : fetchError ? (
            <p className="modal-empty" style={{ color: 'var(--danger)' }}>{fetchError}</p>
          ) : (
            <div className="concentration-grid">
              {concentrations.map(c => (
                <button
                  key={c.id}
                  className={`concentration-card ${selected?.id === c.id ? 'selected' : ''}`}
                  onClick={() => setSelected(c)}
                >
                  {c.id === currentId && (
                    <span className="concentration-current-badge">Current</span>
                  )}
                  <span className="concentration-name">{c.name}</span>
                </button>
              ))}
            </div>
          )}
          {isDifferent && (
            <div className="concentration-switch-warning">
              Switching to <strong>{selected.name}</strong> will clear your
              current course selections. Prior credits and placement scores are kept.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <div className="modal-footer-btns">
            <button className="onboarding-btn-secondary" onClick={onClose} disabled={switching}>
              Cancel
            </button>
            <button
              className="onboarding-btn"
              onClick={() => isDifferent && onSwitch(selected)}
              disabled={!isDifferent || switching}
            >
              {switching ? 'Switching...' : 'Switch concentration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ResetModal ─────────────────────────────────────────────────────────────────

function ResetModal({ onConfirm, onClose, resetting }) {
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Plan settings</p>
            <h3 className="modal-title">Reset this plan?</h3>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-course-list" style={{ padding: '1.25rem 1.5rem' }}>
          <p className="modal-reset-body">
            This will clear all your course selections, free-add courses, and semester notes
            for this concentration. Prior credits and placement scores are kept.
          </p>
        </div>
        <div className="modal-footer">
          <div className="modal-footer-btns">
            <button className="onboarding-btn-secondary" onClick={onClose} disabled={resetting}>
              Cancel
            </button>
            <button
              className="degreeplan-modal-danger"
              onClick={onConfirm}
              disabled={resetting}
            >
              {resetting ? 'Resetting...' : 'Reset plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
