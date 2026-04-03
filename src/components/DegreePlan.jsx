import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Semester from './Semester'
import './Dashboard.css'

export default function DegreePlan({ profile }) {
  const [slots, setSlots]       = useState([])
  const [courses, setCourses]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    async function loadPlan() {
      // ── Step 1: fetch all requirement slots for this concentration ──
      // ordered by semester_number then slot_order so they come back
      // in the correct display sequence
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

      // ── Step 2: collect all real course codes (non-pool slots) ──────
      // We only need to look up courses for slots that have a real
      // course code — pool slots like GEN_ED don't have a courses row
      const realCodes = slotData
        .filter(s => !s.is_pool)
        .map(s => s.class_code)

      // Remove duplicates — some courses appear in multiple semesters
      const uniqueCodes = [...new Set(realCodes)]

      // ── Step 3: fetch those courses in one query ────────────────────
      // .in() is SQL's WHERE code IN (...) — fetches multiple rows
      // matching any value in the array
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('code, name, credits, subject_code')
        .in('code', uniqueCodes)

      if (courseError) {
        setError(courseError.message)
        setLoading(false)
        return
      }

      // ── Step 4: convert course array into a lookup object ───────────
      // Instead of searching through an array every time we need a course,
      // we build an object keyed by course code for instant lookup:
      // { 'CSC1300': { code, name, credits, subject_code }, ... }
      const courseMap = {}
      for (const course of courseData) {
        courseMap[course.code] = course
      }

      setSlots(slotData)
      setCourses(courseMap)
      setLoading(false)
    }

    loadPlan()
  }, [profile.concentration_id])
  // We depend on concentration_id — if it ever changes (unlikely but
  // possible if a student switches concentrations later), this
  // re-fetches automatically

  // ── Group slots by semester number ─────────────────────────────────
  // .reduce() transforms a flat array into an object grouped by key.
  // Result: { 1: [slot, slot, slot], 2: [slot, slot], ... }
  const semesterMap = slots.reduce((acc, slot) => {
    const sem = slot.semester_number
    if (!acc[sem]) acc[sem] = []
    acc[sem].push(slot)
    return acc
  }, {})

  // Get sorted semester numbers for rendering in order
  const semesterNumbers = Object.keys(semesterMap)
    .map(Number)
    .sort((a, b) => a - b)

  // ── Render ──────────────────────────────────────────────────────────

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
            />
          ))}
        </div>
      </main>

    </div>
  )
}