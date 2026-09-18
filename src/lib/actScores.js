// actScores.js
// Save ACT scores and re-place the plan around them. Moved out of the old
// /settings page (ProfileSettings.jsx) when ACT scores became a card on the
// Settings tab; the behavior is unchanged:
//   1. update student_profiles
//   2. replace ACT-derived prior_credits (act_placement / act_credit)
//   3. re-run the degree builder, keeping every row's course choice, status,
//      and remaining credits, and skipping slots the student dragged

import { supabase } from './supabaseClient'
import { buildDegreePlan } from './degreeBuilder'
import { buildRequirementMap } from './requirementMap'
import { resolveActMathPlacement, resolveActEnglishCredit } from './actScoreResolver'

export const ACT_FIELDS = [
  { key: 'act_composite', label: 'Composite'   },
  { key: 'act_english',   label: 'English'     },
  { key: 'act_math',      label: 'Mathematics' },
  { key: 'act_reading',   label: 'Reading'     },
  { key: 'act_science',   label: 'Science'     },
]

export function validateActScore(val) {
  if (val === '' || val === null || val === undefined) return 'Required'
  const n = Number(val)
  if (!Number.isInteger(n) || n < 1 || n > 36) return 'Must be a whole number between 1 and 36'
  return null
}

// One-line note shown next to each score: what it does in this planner.
export function describeActScore(key, score) {
  const n = Number(score)
  if (!score || !Number.isInteger(n)) return 'not recorded'
  if (key === 'act_math') {
    const row = resolveActMathPlacement(n)
    return row ? `places into ${row.satisfies_course_code}` : 'no placement'
  }
  if (key === 'act_english') {
    const rows = resolveActEnglishCredit(n)
    return rows.length > 0
      ? `credit for ${rows.map(r => r.satisfies_course_code).join(' + ')}`
      : 'no course credit'
  }
  return 'recorded'
}

// Returns null on success or an error message.
export async function saveActScoresAndRebuild(profile, numScores) {
  const { error: updateErr } = await supabase
    .from('student_profiles')
    .update(numScores)
    .eq('id', profile.id)
  if (updateErr) return updateErr.message

  // Remove old ACT-derived rows, then re-insert for the new scores.
  await supabase
    .from('prior_credits')
    .delete()
    .eq('plan_id', profile.id)
    .in('credit_type', ['act_placement', 'act_credit'])

  const newPriorRows = []
  const mathRow = resolveActMathPlacement(numScores.act_math)
  if (mathRow) newPriorRows.push({ ...mathRow, plan_id: profile.id })
  for (const r of resolveActEnglishCredit(numScores.act_english)) {
    newPriorRows.push({ ...r, plan_id: profile.id })
  }
  if (newPriorRows.length > 0) {
    await supabase.from('prior_credits').insert(newPriorRows)
  }

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
    return 'Failed to reload degree data. Please refresh the page.'
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

  const CHUNK = 100
  for (let i = 0; i < planSlotRows.length; i += CHUNK) {
    const { error: upsertErr } = await supabase
      .from('student_plan_slots')
      .upsert(planSlotRows.slice(i, i + CHUNK), { onConflict: 'student_id, requirement_slot_id' })
    if (upsertErr) {
      console.error('[saveActScoresAndRebuild] student_plan_slots upsert failed:', upsertErr)
      return `Failed to save degree plan: ${upsertErr.message}`
    }
  }

  return null
}
