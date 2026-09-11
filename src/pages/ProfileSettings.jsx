import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { buildDegreePlan } from '../lib/degreeBuilder'
import { buildRequirementMap } from '../lib/requirementMap'
import { resolveActMathPlacement, resolveActEnglishCredit } from '../lib/actScoreResolver'
import './Auth.css'
import '../components/Dashboard.css'

function validateActScore(val) {
  if (val === '' || val === null || val === undefined) return 'Required'
  const n = Number(val)
  if (!Number.isInteger(n) || n < 1 || n > 36) return 'Must be a whole number between 1 and 36'
  return null
}

const ACT_FIELDS = [
  { key: 'act_math',      label: 'ACT Math'      },
  { key: 'act_english',   label: 'ACT English'   },
  { key: 'act_science',   label: 'ACT Science'   },
  { key: 'act_reading',   label: 'ACT Reading'   },
  { key: 'act_composite', label: 'ACT Composite' },
]

export default function ProfileSettings() {
  const navigate   = useNavigate()
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(false)
  const [profile,   setProfile]   = useState(null)
  const [scores,    setScores]    = useState({ act_math: '', act_english: '', act_science: '', act_reading: '', act_composite: '' })
  const [scoreErrors, setScoreErrors] = useState({})

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { navigate('/login', { replace: true }); return }

      const { data, error: err } = await supabase
        .from('student_profiles')
        .select('id, concentration_id, student_type, start_season, start_year, act_math, act_english, act_science, act_reading, act_composite')
        .eq('user_id', session.user.id)
        .single()

      if (err) { setError(err.message); setLoading(false); return }
      setProfile(data)
      setScores({
        act_math:      data.act_math      ?? '',
        act_english:   data.act_english   ?? '',
        act_science:   data.act_science   ?? '',
        act_reading:   data.act_reading   ?? '',
        act_composite: data.act_composite ?? '',
      })
      setLoading(false)
    }
    load()
  }, [navigate])

  async function handleSave(e) {
    e.preventDefault()
    const errs = {}
    for (const { key } of ACT_FIELDS) {
      const err = validateActScore(scores[key])
      if (err) errs[key] = err
    }
    if (Object.keys(errs).length > 0) { setScoreErrors(errs); return }
    setScoreErrors({})
    setSaving(true)
    setError(null)
    setSuccess(false)

    const numScores = {}
    for (const { key } of ACT_FIELDS) numScores[key] = Number(scores[key])

    // ── 1. Update student_profiles ─────────────────────────────────────────
    const { error: updateErr } = await supabase
      .from('student_profiles')
      .update(numScores)
      .eq('id', profile.id)

    if (updateErr) { setError(updateErr.message); setSaving(false); return }

    // ── 2. Update ACT-derived prior_credits ────────────────────────────────
    // Remove old ACT-derived rows, then re-insert for the new scores.
    await supabase
      .from('prior_credits')
      .delete()
      .eq('plan_id', profile.id)
      .in('credit_type', ['act_placement', 'act_credit'])

    const newPriorRows = []
    const mathRow = resolveActMathPlacement(numScores.act_math)
    if (mathRow) newPriorRows.push({ ...mathRow, plan_id: profile.id })
    const englishRows = resolveActEnglishCredit(numScores.act_english)
    for (const r of englishRows) newPriorRows.push({ ...r, plan_id: profile.id })
    if (newPriorRows.length > 0) {
      await supabase.from('prior_credits').insert(newPriorRows)
    }

    // ── 3. Fetch data for algorithm re-run ─────────────────────────────────
    const [slotsRes, coursesRes, prereqRes, coreqRes, priorRes, studentSlotsRes] = await Promise.all([
      supabase.from('requirement_slots').select('id, class_code, is_pool, flex_credits').eq('concentration_id', profile.concentration_id),
      // standing_req drives the builder's junior/senior placement — without it
      // CSC3040 jumped ahead of COMM_REQ and the pool front-fill never ran.
      supabase.from('courses').select('code, credits, standing_req'),
      supabase.from('prerequisite_entries').select('course_code, group_index, logic, required_code'),
      supabase.from('corequisite_entries').select('course_code, group_index, logic, required_code'),
      supabase.from('prior_credits').select('id, credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded').eq('plan_id', profile.id),
      supabase.from('student_plan_slots').select('requirement_slot_id, position_source, selected_course_code, status, credits_remaining').eq('student_id', profile.id),
    ])

    // The existing rows are needed to keep the student's selections below;
    // recalculating without them would wipe those and overwrite dragged slots.
    if (slotsRes.error || coursesRes.error || prereqRes.error || coreqRes.error || priorRes.error || studentSlotsRes.error) {
      setError('Failed to reload degree data. Please refresh the page.')
      setSaving(false)
      return
    }

    const slots = slotsRes.data ?? []
    const courseMap = {}
    for (const c of (coursesRes.data ?? [])) courseMap[c.code] = c

    // Grouped by group_index, with course substitutes applied (MATH1906
    // also satisfies MATH1910 requirements — see requirementMap.js).
    const prereqMap = buildRequirementMap(prereqRes.data)
    const coreqMap  = buildRequirementMap(coreqRes.data)

    // Slots the student has manually dragged — the algorithm must not overwrite these.
    const studentSourcedIds = new Set(
      (studentSlotsRes.data ?? [])
        .filter(r => r.position_source === 'student')
        .map(r => r.requirement_slot_id)
    )

    // The re-run only moves slots. Keep each row's course choice, status, and
    // remaining credits — it used to write selected_course_code: null to every
    // pool slot, wiping the student's picks on each ACT change.
    const existingRows = {}
    for (const r of studentSlotsRes.data ?? []) existingRows[r.requirement_slot_id] = r
    const keptFields = slot => ({
      selected_course_code: existingRows[slot.id]?.selected_course_code ?? (slot.is_pool ? null : slot.class_code),
      status:               existingRows[slot.id]?.status ?? 'planned',
      credits_remaining:    existingRows[slot.id]?.credits_remaining ?? 0,
    })

    // ── 4. Re-run algorithm ────────────────────────────────────────────────
    const { assignments, archived } = buildDegreePlan({
      slots,
      courseMap,
      prereqMap,
      coreqMap,
      priorCredits: priorRes.data ?? [],
      studentProfile: {
        student_type: profile.student_type,
        act_math:     numScores.act_math,
        start_season: profile.start_season,
      },
    })

    // ── 5. Write updated student_plan_slots (skip student-dragged rows) ────
    const planSlotRows = []
    for (const slot of slots) {
      if (studentSourcedIds.has(slot.id)) continue  // respect student customization
      const archiveReason = archived[slot.id]
      if (archiveReason) {
        planSlotRows.push({
          student_id: profile.id, requirement_slot_id: slot.id, ...keptFields(slot),
          semester_number: null,
          archived: true, archive_reason: archiveReason, position_source: null,
        })
      } else if (assignments[slot.id] != null) {
        planSlotRows.push({
          student_id: profile.id, requirement_slot_id: slot.id, ...keptFields(slot),
          semester_number: assignments[slot.id],
          archived: false, archive_reason: null, position_source: 'algorithm',
        })
      }
    }

    if (planSlotRows.length > 0) {
      const CHUNK = 100
      for (let i = 0; i < planSlotRows.length; i += CHUNK) {
        const { error: upsertErr } = await supabase
          .from('student_plan_slots')
          .upsert(planSlotRows.slice(i, i + CHUNK), { onConflict: 'student_id, requirement_slot_id' })
        if (upsertErr) {
          console.error('[ProfileSettings] student_plan_slots upsert failed:', upsertErr)
          setError(`Failed to save degree plan: ${upsertErr.message}`)
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    setSuccess(true)
    setProfile(prev => ({ ...prev, ...numScores }))
  }

  if (loading) return <div className="onboarding-shell"><div className="onboarding-card" style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div></div>

  return (
    <div className="onboarding-shell">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <p className="onboarding-eyebrow">TTU Degree Planner</p>
          <h2 className="onboarding-title">Profile Settings</h2>
          <p className="onboarding-sub">Update your ACT scores. Your degree plan will be recalculated automatically.</p>
        </div>

        <div className="onboarding-body">
          <form onSubmit={handleSave} noValidate>
            <div className="onboarding-act-grid">
              {ACT_FIELDS.map(({ key, label }) => (
                <div key={key} className="onboarding-field">
                  <label className="onboarding-label">{label}</label>
                  <input
                    type="number"
                    className={`onboarding-input${scoreErrors[key] ? ' onboarding-input-error' : ''}`}
                    value={scores[key]}
                    min={1}
                    max={36}
                    placeholder="1–36"
                    onKeyDown={e => {
                      if (['e', 'E', '+', '-', '.'].includes(e.key)) e.preventDefault()
                    }}
                    onChange={e => {
                      setScores(prev => ({ ...prev, [key]: e.target.value }))
                      if (scoreErrors[key]) setScoreErrors(prev => ({ ...prev, [key]: null }))
                    }}
                  />
                  {scoreErrors[key] && <p className="onboarding-field-error">{scoreErrors[key]}</p>}
                </div>
              ))}
            </div>

            {error && <p className="onboarding-error">{error}</p>}
            {success && (
              <p style={{ color: 'var(--success, #28a745)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
                Scores updated and degree plan recalculated.
              </p>
            )}

            <div className="onboarding-btn-row" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="onboarding-btn-secondary"
                onClick={() => navigate('/dashboard')}
                disabled={saving}
              >
                Back to Plan
              </button>
              <button
                type="submit"
                className="onboarding-btn"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save & Recalculate'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
