import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { POOL_COURSES } from '../lib/poolResolver'
import Semester from './Semester'
import SlotModal from './SlotModal'
import './Dashboard.css'

export default function DegreePlan({ profile }) {
  const [slots, setSlots]               = useState([])
  const [courses, setCourses]           = useState({})
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [activeSlot, setActiveSlot]     = useState(null)
  const [planSlots, setPlanSlots]       = useState({})
  const [planStatuses, setPlanStatuses] = useState({})
  const [prereqMap, setPrereqMap]       = useState({})

  useEffect(() => {
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
        .select('code, name, credits, subject_code')
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

      // ── Step 8: set all state at once ────────────────────────────
      setSlots(slotData)
      setCourses(courseMap)
      setPrereqMap(prereqMapBuilt)
      setPlanSlots(planSlotsMap)
      setPlanStatuses(planStatusesMap)
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

  // ── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="dashboard-loading">
        <p>Loading your degree plan...</p>
      </div>
    )
  }

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

  return (
    <div className="degreeplan-shell">

      <header className="degreeplan-header">
        <div className="degreeplan-header-inner">
          <div>
            <p className="degreeplan-eyebrow">Tennessee Tech University</p>
            <h1 className="degreeplan-title">{profile.concentrations.name}</h1>
            <p className="degreeplan-meta">
              Started {profile.start_season} {profile.start_year}
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
          </div>
          <button className="degreeplan-signout" onClick={async () => {
            await supabase.auth.signOut()
          }}>
            Sign out
          </button>
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
              onSlotClick={setActiveSlot}
              onStatusChange={handleStatusChange}
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
          onClose={() => setActiveSlot(null)}
        />
      )}

    </div>
  )
}
