import { useEffect, useState, useMemo, useRef } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { supabase } from '../lib/supabaseClient'
import { getScienceWarnings, getGenEdStatus } from '../lib/poolResolver'
import { checkPrereqs } from '../lib/prereqChecker'
import Semester from './Semester'
import SlotModal from './SlotModal'
import CourseDetailModal from './CourseDetailModal'
import AddCourseModal from './AddCourseModal'
import { DegreeplanSkeleton } from './Skeletons'
import CompletionBadge from './CompletionBadge'
import usePlanCompleteness from '../lib/usePlanCompleteness'
import './Dashboard.css'

export default function DegreePlan({ profile, onProfileChange }) {
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
  const [prereqMap, setPrereqMap]                 = useState({})
  const [coreqMap, setCoreqMap]                   = useState({})
  const [activeDetail, setActiveDetail]           = useState(null)
  const [semesterNotes, setSemesterNotes]         = useState({})
  const [showSwitchModal, setShowSwitchModal]     = useState(false)
  const [switching, setSwitching]                 = useState(false)
  // addCourseTarget: number | null — which semester the Add Course modal is open for
  const [addCourseTarget, setAddCourseTarget]     = useState(null)
  // draggedSlotId: id of the slot currently being dragged (for DragOverlay label)
  const [draggedSlotId, setDraggedSlotId]         = useState(null)

  const [lastSelection, setLastSelection]         = useState(null)
  const [saveError, setSaveError]                 = useState(null)
  const saveErrorTimerRef                         = useRef(null)

  function showSaveError(msg) {
    setSaveError(msg)
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current)
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 5000)
  }

  // ── dnd-kit sensors ──────────────────────────────────────────────
  // Use PointerSensor with a 5px activation distance so normal clicks on the
  // grip handle don't accidentally trigger a drag on tap/touch.
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

      // Step 2 — student's saved selections + semester overrides + credits remaining
      const slotIds = slotData.map(s => s.id)
      const { data: savedSlots, error: savedSlotsError } = await supabase
        .from('student_plan_slots')
        .select('requirement_slot_id, selected_course_code, status, semester_number, credits_remaining')
        .eq('student_id', profile.id)
        .in('requirement_slot_id', slotIds)

      if (savedSlotsError) { setError(savedSlotsError.message); setLoading(false); return }

      const planSlotsMap             = {}
      const planStatusesMap          = {}
      const planSemesterOverridesMap = {}
      const planCreditsRemainingMap  = {}
      for (const row of savedSlots) {
        planSlotsMap[row.requirement_slot_id]    = row.selected_course_code
        planStatusesMap[row.requirement_slot_id] = row.status
        if (row.semester_number != null)
          planSemesterOverridesMap[row.requirement_slot_id] = row.semester_number
        if (row.credits_remaining > 0)
          planCreditsRemainingMap[row.requirement_slot_id] = row.credits_remaining
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
      const { data: coreqData } = await supabase
        .from('corequisite_entries')
        .select('course_code, required_code')
        .in('course_code', allCodes)

      const coreqMapBuilt = {}
      for (const entry of coreqData ?? []) {
        if (!coreqMapBuilt[entry.course_code]) coreqMapBuilt[entry.course_code] = []
        coreqMapBuilt[entry.course_code].push(entry.required_code)
      }

      // Step 7 — semester notes
      const { data: notesData } = await supabase
        .from('student_semester_notes')
        .select('semester_number, note_text')
        .eq('student_id', profile.id)
        .eq('concentration_id', profile.concentration_id)

      const semNotesMap = {}
      for (const row of notesData ?? []) semNotesMap[row.semester_number] = row.note_text

      // Step 8 — commit all state at once
      setSlots(slotData)
      setCourses(courseMap)
      setPrereqMap(prereqMapBuilt)
      setCoreqMap(coreqMapBuilt)
      setPlanSlots(planSlotsMap)
      setPlanStatuses(planStatusesMap)
      setPlanSemesterOverrides(planSemesterOverridesMap)
      setPlanCreditsRemaining(planCreditsRemainingMap)
      setFreeAddSlots(freeAdds ?? [])
      setSemesterNotes(semNotesMap)
      setLoading(false)
    }

    loadPlan()
  }, [profile.concentration_id])

  // ── Build semesterMap using per-student semester overrides ────────
  // A dragged slot's effective semester comes from planSemesterOverrides if set,
  // otherwise falls back to the template semester_number from requirement_slots.
  const semesterMap = useMemo(() => {
    return slots.reduce((acc, slot) => {
      const sem = planSemesterOverrides[slot.id] ?? slot.semester_number
      if (!acc[sem]) acc[sem] = []
      acc[sem].push(slot)
      return acc
    }, {})
  }, [slots, planSemesterOverrides])

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

  // ── Science sequence warnings ─────────────────────────────────────
  const scienceWarnings = useMemo(
    () => getScienceWarnings(planSlots, slots),
    [planSlots, slots]
  )

  // ── GEN_ED sub-requirement status ─────────────────────────────────
  const genEdStatus = useMemo(
    () => getGenEdStatus(planSlots, slots, courses),
    [planSlots, slots, courses]
  )

  // ── Plan completeness ─────────────────────────────────────────────
  const { isComplete } = usePlanCompleteness(slots, planSlots, genEdStatus)

  // ── Credit totals ─────────────────────────────────────────────────
  const creditTotals = useMemo(() => {
    let completed = 0
    let planned   = 0
    for (const slot of slots) {
      let credits
      if (slot.is_pool) {
        const code = planSlots[slot.id]
        if (!code) continue
        credits = courses[code]?.credits ?? slot.flex_credits ?? 3
      } else {
        credits = courses[slot.class_code]?.credits ?? 0
      }
      if (planStatuses[slot.id] === 'completed') completed += credits
      else planned += credits
    }
    // Include free-add slots in totals
    for (const fa of freeAddSlots) {
      const credits = courses[fa.course_code]?.credits ?? 0
      if (fa.status === 'completed') completed += credits
      else planned += credits
    }
    return { completed, planned }
  }, [slots, planSlots, planStatuses, courses, freeAddSlots])

  // ── Reactive prerequisite warnings ───────────────────────────────
  // Runs after ANY slot move, free-add, or course selection.
  // For each active course, computes whether its prereqs are satisfied
  // by courses in earlier semesters. Result:
  //   { [slotId|'fa_'+freeAddId]: string[] }  (missing prereq codes)
  //
  // We use a string key 'fa_' + id for free-add rows so Semester can
  // look up warnings without conflating numeric requirement-slot IDs.
  const prereqWarnings = useMemo(() => {
    // Collect all "placed" courses with their effective semester
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
      // Satisfied = any course whose effective semester is strictly before this one
      const satisfiedCodes = new Set(
        placed.filter(p => p.sem < item.sem).map(p => p.code)
      )
      const result = checkPrereqs(item.code, prereqMap, satisfiedCodes)
      if (!result.satisfied) warnings[item.key] = result.missing
    }
    return warnings
  }, [slots, planSlots, freeAddSlots, planSemesterOverrides, prereqMap])

  // ── Save a pool/required course selection (optimistic) ────────────
  // Flex-slot logic: if the chosen course covers fewer credits than the
  // slot's flex_credits total, record the remainder so the UI can show
  // "X cr remaining". If the course over-satisfies, creditsRemaining = 0.
  function handleSave(slot, course) {
    const existingStatus = planStatuses[slot.id] ?? 'planned'

    // Flex-slot credit remainder
    let creditsRemaining = 0
    if (slot.is_pool && slot.flex_credits > 0) {
      const diff = slot.flex_credits - course.credits
      creditsRemaining = diff > 0 ? diff : 0
    }

    const prevSlots              = planSlots
    const prevStatuses           = planStatuses
    const prevCreditsRemaining   = planCreditsRemaining

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
  // Inserts into student_free_add_slots; optimistic state update first.
  async function handleAddCourse(semesterNumber, course) {
    setAddCourseTarget(null)  // close modal immediately

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

    // Update courseMap if this course wasn't previously loaded
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

  function handleDragEnd({ active, over }) {
    setDraggedSlotId(null)
    if (!over) return

    const { type, slotId } = active.data.current
    const newSemester = over.id   // droppable id = semester number

    if (type === 'requirement_slot') {
      const slot = slots.find(s => s.id === slotId)
      if (!slot) return
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
    }
  }

  // ── Concentration switch ──────────────────────────────────────────
  async function handleConcentrationSwitch(newConc) {
    setSwitching(true)

    const { error: updateErr } = await supabase
      .from('student_profiles')
      .update({ concentration_id: newConc.id })
      .eq('id', profile.id)
    if (updateErr) { setSwitching(false); return }

    const { error: deleteErr } = await supabase
      .from('student_plan_slots')
      .delete()
      .eq('student_id', profile.id)
    if (deleteErr) { setSwitching(false); return }

    // Also clear free-add slots on switch (they're concentration-specific context)
    await supabase.from('student_free_add_slots').delete().eq('student_id', profile.id)

    setSwitching(false)
    setShowSwitchModal(false)
    setLastSelection(null)
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

  // Label for the DragOverlay: resolve from slot or free-add
  const draggedLabel = (() => {
    if (!draggedSlotId) return null
    const slot = slots.find(s => s.id === draggedSlotId)
    if (slot) {
      const code = slot.is_pool ? (planSlots[slot.id] ?? slot.class_code) : slot.class_code
      return code
    }
    const fa = freeAddSlots.find(f => f.id === draggedSlotId)
    return fa?.course_code ?? null
  })()

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
              className="degreeplan-settings"
              onClick={() => setShowSwitchModal(true)}
            >
              Change concentration
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

        {/* DndContext wraps the grid so semesters can be drop targets */}
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="degreeplan-grid">
            {semesterNumbers.map(semNum => (
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
                note={semesterNotes[semNum] ?? ''}
                onNoteSave={handleNoteSave}
              />
            ))}
          </div>

          {/* DragOverlay: ghost that follows the cursor during a drag */}
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
          onAdd={course => handleAddCourse(addCourseTarget, course)}
          onClose={() => setAddCourseTarget(null)}
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
              Switching to <strong>{selected.name}</strong> will clear all your
              current course selections. This cannot be undone.
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
