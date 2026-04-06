import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getScienceWarnings, getGenEdStatus } from '../lib/poolResolver'
import Semester from './Semester'
import SlotModal from './SlotModal'
import CourseDetailModal from './CourseDetailModal'
import { DegreeplanSkeleton } from './Skeletons'
import './Dashboard.css'

export default function DegreePlan({ profile, onProfileChange }) {
  const [slots, setSlots]               = useState([])
  const [courses, setCourses]           = useState({})
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [activeSlot, setActiveSlot]     = useState(null)
  const [planSlots, setPlanSlots]       = useState({})
  const [planStatuses, setPlanStatuses] = useState({})
  const [prereqMap, setPrereqMap]       = useState({})
  const [coreqMap, setCoreqMap]         = useState({})
  const [activeDetail, setActiveDetail] = useState(null)
  const [semesterNotes, setSemesterNotes] = useState({})
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [switching, setSwitching]             = useState(false)
  // ── Undo stack (session-only — intentionally does not survive refresh) ────────
  // Stores the most recent pool slot selection so the student can reverse it once.
  // Shape: { slot, courseCode } | null
  const [lastSelection, setLastSelection] = useState(null)

  useEffect(() => {
    setLoading(true)

    async function loadPlan() {
      // ── Step 1: fetch requirement slots ─────────────────────────
      const { data: slotData, error: slotError } = await supabase
        .from('requirement_slots')
        .select('id, semester_number, slot_order, class_code, is_pool, flex_credits')
        .eq('concentration_id', profile.concentration_id)
        .order('semester_number', { ascending: true })
        .order('slot_order',      { ascending: true })

      if (slotError) {
        setError(slotError.message)
        setLoading(false)
        return
      }

      // ── Step 2: collect real course codes from slots ─────────────
      const realCodes = slotData
        .filter(s => !s.is_pool)
        .map(s => s.class_code)

      // ── Step 3: collect all pool course codes from poolResolver ──
      const { POOL_COURSES } = await import('../lib/poolResolver')
      const poolCodes = Object.values(POOL_COURSES)
        .filter(arr => arr !== null)
        .flat()

      // Combine and deduplicate
      const allCodes = [...new Set([...realCodes, ...poolCodes])]

      // ── Step 4: fetch all courses in one query ───────────────────
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('code, name, credits, subject_code, standing_req, description')
        .in('code', allCodes)

      if (courseError) {
        setError(courseError.message)
        setLoading(false)
        return
      }

      // ── Step 5: build courseMap keyed by code ────────────────────
      const courseMap = {}
      for (const course of courseData) {
        courseMap[course.code] = course
      }

      // ── Step 6: fetch prerequisite entries for all courses ───────
      // allCodes is still in scope here — this is why Step 6 must
      // live inside loadPlan, not outside it
      const { data: prereqData, error: prereqError } = await supabase
        .from('prerequisite_entries')
        .select('course_code, group_index, logic, required_code')
        .in('course_code', allCodes)

      if (prereqError) {
        setError(prereqError.message)
        setLoading(false)
        return
      }

      // Build prereqMap: { 'CSC1310': { 0: { logic: 'AND', codes: ['CSC1300'] } } }
      const prereqMapBuilt = {}
      for (const entry of prereqData) {
        if (!prereqMapBuilt[entry.course_code]) {
          prereqMapBuilt[entry.course_code] = {}
        }
        if (!prereqMapBuilt[entry.course_code][entry.group_index]) {
          prereqMapBuilt[entry.course_code][entry.group_index] = {
            logic: entry.logic,
            codes: [],
          }
        }
        prereqMapBuilt[entry.course_code][entry.group_index].codes.push(entry.required_code)
      }

      // ── Step 6b: fetch corequisite entries ───────────────────────
      // Corequisites don't use AND/OR logic, so the map is a simple
      // { courseCode: [requiredCode, ...] } — no group structure needed.
      const { data: coreqData } = await supabase
        .from('corequisite_entries')
        .select('course_code, required_code')
        .in('course_code', allCodes)

      const coreqMapBuilt = {}
      for (const entry of coreqData ?? []) {
        if (!coreqMapBuilt[entry.course_code]) {
          coreqMapBuilt[entry.course_code] = []
        }
        coreqMapBuilt[entry.course_code].push(entry.required_code)
      }

      // ── Step 7: load saved student selections and statuses ───────
      const slotIds = slotData.map(s => s.id)
      const { data: savedSlots, error: savedSlotsError } = await supabase
        .from('student_plan_slots')
        .select('requirement_slot_id, selected_course_code, status')
        .eq('student_id', profile.id)
        .in('requirement_slot_id', slotIds)

      if (savedSlotsError) {
        setError(savedSlotsError.message)
        setLoading(false)
        return
      }

      const planSlotsMap    = {}
      const planStatusesMap = {}
      for (const row of savedSlots) {
        planSlotsMap[row.requirement_slot_id]    = row.selected_course_code
        planStatusesMap[row.requirement_slot_id] = row.status
      }

      // ── Step 7b: load semester notes ────────────────────────────
      const { data: notesData } = await supabase
        .from('student_semester_notes')
        .select('semester_number, note_text')
        .eq('student_id', profile.id)
        .eq('concentration_id', profile.concentration_id)

      const semNotesMap = {}
      for (const row of notesData ?? []) {
        semNotesMap[row.semester_number] = row.note_text
      }

      // ── Step 8: set all state at once ────────────────────────────
      setSlots(slotData)
      setCourses(courseMap)
      setPrereqMap(prereqMapBuilt)
      setCoreqMap(coreqMapBuilt)
      setPlanSlots(planSlotsMap)
      setPlanStatuses(planStatusesMap)
      setSemesterNotes(semNotesMap)
      setLoading(false)
    }

    loadPlan()
  }, [profile.concentration_id])

  // ── Group slots by semester number ──────────────────────────────
  const semesterMap = slots.reduce((acc, slot) => {
    const sem = slot.semester_number
    if (!acc[sem]) acc[sem] = []
    acc[sem].push(slot)
    return acc
  }, {})

  const semesterNumbers = Object.keys(semesterMap)
    .map(Number)
    .sort((a, b) => a - b)

  // ── Compute science sequence warnings ───────────────────────────
  // Recomputes whenever a science slot selection changes. The result is a
  // { [slotId]: { type, sequenceName? } } map passed down to Semester → SlotRow.
  const scienceWarnings = useMemo(
    () => getScienceWarnings(planSlots, slots),
    [planSlots, slots]
  )

  // ── Compute GEN_ED sub-requirement status ────────────────────────
  // Recomputes whenever any GEN_ED slot selection changes.
  // Result is an array of { category, label, filled, required, satisfied, atRisk }
  // rendered in the sticky header so it's always visible.
  const genEdStatus = useMemo(
    () => getGenEdStatus(planSlots, slots, courses),
    [planSlots, slots, courses]
  )

  // ── Compute credit totals for the progress bar ───────────────────
  // Required slots always contribute (they're always on the plan).
  // Pool slots only contribute once a course has been chosen.
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
      if (planStatuses[slot.id] === 'completed') {
        completed += credits
      } else {
        planned += credits
      }
    }
    return { completed, planned }
  }, [slots, planSlots, planStatuses, courses])

  // ── Save a course selection to Supabase ──────────────────────────
  // Preserves the existing status so re-selecting a pool slot doesn't
  // reset a course the student already marked in-progress or done.
  async function handleSave(slot, course) {
    const existingStatus = planStatuses[slot.id] ?? 'planned'
    const { error } = await supabase
      .from('student_plan_slots')
      .upsert({
        student_id:           profile.id,
        requirement_slot_id:  slot.id,
        selected_course_code: course.code,
        status:               existingStatus,
      }, { onConflict: 'student_id, requirement_slot_id' })

    if (!error) {
      setPlanSlots(prev    => ({ ...prev,    [slot.id]: course.code      }))
      setPlanStatuses(prev => ({ ...prev,    [slot.id]: existingStatus   }))
      setActiveSlot(null)
      // Record this selection so the header undo button can reverse it.
      // Overwrites any previous entry — undo is single-step only.
      setLastSelection({ slot, courseCode: course.code })
    }
  }

  // ── Cycle a slot's status in Supabase ────────────────────────────
  // For required slots this creates the row on first click.
  // For pool slots it updates the existing row.
  async function handleStatusChange(slot, newStatus) {
    const courseCode = slot.is_pool ? planSlots[slot.id] : slot.class_code
    if (slot.is_pool && !courseCode) return

    const { error } = await supabase
      .from('student_plan_slots')
      .upsert({
        student_id:           profile.id,
        requirement_slot_id:  slot.id,
        selected_course_code: courseCode,
        status:               newStatus,
      }, { onConflict: 'student_id, requirement_slot_id' })

    if (!error) {
      setPlanStatuses(prev => ({ ...prev, [slot.id]: newStatus }))
    }
  }

  // ── Remove a pool slot selection ─────────────────────────────────
  // Deletes the student_plan_slots row and clears local state so the
  // slot immediately goes back to its empty "Click to select" state.
  async function handleRemove(slot) {
    const { error } = await supabase
      .from('student_plan_slots')
      .delete()
      .eq('student_id', profile.id)
      .eq('requirement_slot_id', slot.id)

    if (!error) {
      setPlanSlots(prev    => { const n = { ...prev }; delete n[slot.id]; return n })
      setPlanStatuses(prev => { const n = { ...prev }; delete n[slot.id]; return n })
      setActiveSlot(null)
    }
  }

  // ── Undo the most recent pool slot selection ─────────────────────
  // Reverses handleSave by calling handleRemove on the recorded slot.
  // handleRemove deletes the student_plan_slots row and clears local state,
  // which is exactly what undo needs to do. After the remove completes we
  // clear lastSelection so the button immediately disables.
  async function handleUndo() {
    if (!lastSelection) return
    await handleRemove(lastSelection.slot)
    setLastSelection(null)
  }

  // ── Route a slot click to the right panel ────────────────────────
  // Empty pool slot  → SlotModal (course selection)
  // Filled pool slot → CourseDetailModal with change/remove actions
  // Required slot    → CourseDetailModal read-only
  function handleSlotClick(slot) {
    if (slot.is_pool && !planSlots[slot.id]) {
      setActiveSlot(slot)
    } else {
      setActiveDetail(slot)
    }
  }

  // ── Transition from detail view back to selection modal ───────────
  // Called when the student hits "Change" inside the detail panel.
  function handleChangeSelection() {
    const slot = activeDetail
    setActiveDetail(null)
    setActiveSlot(slot)
  }

  // ── Save or update a semester note ───────────────────────────────
  // Uses upsert so it works identically whether a row already exists
  // or is being created for the first time.
  async function handleNoteSave(semesterNumber, noteText) {
    const { error } = await supabase
      .from('student_semester_notes')
      .upsert({
        student_id:       profile.id,
        concentration_id: profile.concentration_id,
        semester_number:  semesterNumber,
        note_text:        noteText,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'student_id, concentration_id, semester_number' })

    if (!error) {
      setSemesterNotes(prev => ({ ...prev, [semesterNumber]: noteText }))
    }
  }

  // ── Switch the student's concentration ───────────────────────────
  // Three writes happen in sequence:
  //   1. Update student_profiles so the DB reflects the new choice.
  //   2. Delete all student_plan_slots — the new concentration has
  //      different requirement_slot IDs so old selections are useless
  //      and would pollute the plan if left behind.
  //   3. Call onProfileChange with the new profile object. Dashboard
  //      calls setProfile, DegreePlan receives a new profile prop,
  //      and useEffect([profile.concentration_id]) fires — reloading
  //      the plan from scratch with the correct requirement slots.
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

    setSwitching(false)
    setShowSwitchModal(false)
    setLastSelection(null)   // new concentration has different slot IDs — undo would point at a ghost
    onProfileChange({ ...profile, concentration_id: newConc.id, concentrations: newConc })
  }

  // ── Render ───────────────────────────────────────────────────────

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
        <div className="degreeplan-grid">
          {semesterNumbers.map(semNum => (
            <Semester
              key={semNum}
              semesterNumber={semNum}
              slots={semesterMap[semNum]}
              courseMap={courses}
              planSlots={planSlots}
              planStatuses={planStatuses}
              onSlotClick={handleSlotClick}
              onStatusChange={handleStatusChange}
              scienceWarnings={scienceWarnings}
              note={semesterNotes[semNum] ?? ''}
              onNoteSave={handleNoteSave}
            />
          ))}
        </div>
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

      {showSwitchModal && (
        <ConcentrationModal
          currentId={profile.concentration_id}
          onSwitch={handleConcentrationSwitch}
          onClose={() => setShowSwitchModal(false)}
          switching={switching}
        />
      )}

    </div>
  )
}

// ── Graduation timeline projection ────────────────────────────────────────────
// TTU operates Fall/Spring only for the standard plan — no Summer.
// Starting from startSeason/startYear, each semester advances one term.
// offset = numSemesters - 1 terms forward from the start.
//
// Fall start, offset k terms:
//   even offset → same season (Fall),  year = startYear + k/2
//   odd  offset → Spring,              year = startYear + Math.floor(k/2) + 1
//
// Spring start, offset k terms:
//   even offset → same season (Spring), year = startYear + k/2
//   odd  offset → Fall,                 year = startYear + Math.floor(k/2)

function projectGraduation(startSeason, startYear, numSemesters) {
  if (!startSeason || !startYear || !numSemesters) return null
  const offset = numSemesters - 1
  const k      = Math.floor(offset / 2)
  if (startSeason === 'Fall') {
    return offset % 2 === 0
      ? { season: 'Fall',   year: startYear + k }
      : { season: 'Spring', year: startYear + k + 1 }
  } else {
    // Spring start
    return offset % 2 === 0
      ? { season: 'Spring', year: startYear + k }
      : { season: 'Fall',   year: startYear + k }
  }
}

// ── GenEdTracker ───────────────────────────────────────────────────────────────
// Renders three compact chips — one per GEN_ED sub-category — showing how many
// credit hours the student has filled toward the 6-hr minimum.
//
// Chip states:
//   satisfied  → green  (filled >= 6)
//   atRisk     → red    (can't reach 6 given remaining empty slots)
//   progress   → gold   (in-flight but still achievable)
//   empty      → muted  (nothing selected yet, still achievable)

function GenEdTracker({ categories }) {
  // Only show the tracker when at least one GEN_ED slot exists in the plan
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
// Fetches all concentrations from Supabase on mount — single source of truth.
// Pre-selects the student's current concentration so they can see where they are.
// The warning banner and the confirm button only activate when the student picks
// a *different* concentration, so there's no scary text until a change is made.

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

      if (error) {
        setFetchError(error.message)
        setLoadingConcs(false)
        return
      }

      setConcentrations(data)
      // Pre-select the student's current concentration
      const current = data.find(c => c.id === currentId)
      if (current) setSelected(current)
      setLoadingConcs(false)
    }

    fetchConcentrations()
  }, [])

  // True only when the student has picked a concentration different from current
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
          <button className="modal-close" onClick={onClose}>✕</button>
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
            <button
              className="onboarding-btn-secondary"
              onClick={onClose}
              disabled={switching}
            >
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
