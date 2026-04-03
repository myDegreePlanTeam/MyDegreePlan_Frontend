import SlotModal from './SlotModal'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Semester from './Semester'
import './Dashboard.css'

export default function DegreePlan({ profile }) {
  const [slots, setSlots]               = useState([])
  const [courses, setCourses]           = useState({})
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [activeSlot, setActiveSlot]     = useState(null)
  const [planSlots, setPlanSlots]       = useState({})
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

      // ── Step 7: set all state at once ────────────────────────────
      setSlots(slotData)
      setCourses(courseMap)
      setPrereqMap(prereqMapBuilt)
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

  // ── Save a course selection to Supabase ──────────────────────────
  async function handleSave(slot, course) {
    const { error } = await supabase
      .from('student_plan_slots')
      .upsert({
        student_id:           profile.id,
        requirement_slot_id:  slot.id,
        selected_course_code: course.code,
        status:               'planned',
      }, { onConflict: 'student_id, requirement_slot_id' })

    if (!error) {
      setPlanSlots(prev => ({
        ...prev,
        [slot.id]: course.code,
      }))
      setActiveSlot(null)
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

  return (
    <div className="degreeplan-shell">

      <header className="degreeplan-header">
        <div className="degreeplan-header-inner">
          <div>
            <p className="degreeplan-eyebrow">Tennessee Tech University</p>
            <h1 className="degreeplan-title">{profile.concentrations.name}</h1>
            <p className="degreeplan-meta">
              {profile.concentrations.total_hours} credit hours
              &nbsp;·&nbsp;
              Started {profile.start_season} {profile.start_year}
            </p>
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
              onSlotClick={setActiveSlot}
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