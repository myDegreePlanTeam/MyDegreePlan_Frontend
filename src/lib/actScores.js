// actScores.js
// Save ACT scores and re-place the plan around them. Moved out of the old
// /settings page (ProfileSettings.jsx) when ACT scores became a card on the
// Settings tab; the behavior is unchanged:
//   1. update student_profiles
//   2. replace ACT-derived prior_credits (act_placement / act_credit)
//   3. re-run the degree builder, keeping every row's course choice, status,
//      and remaining credits, and skipping slots the student dragged

import { db, platform } from './dataClient'
import { platformWords } from './platform'
import { buildDegreePlan } from './degreeBuilder'
import { buildRequirementMap } from './requirementMap'
import { fetchStudentPrograms } from './studentPrograms'
import { fetchProgramSlotSets, fetchProgramInfo } from './programSlots'
import { mergePrograms, addedSlotIdsOf } from './programMerge'
import { resolveMathPlacementRow, resolveActEnglishCredit } from './actScoreResolver'
import { resolveMathPlacement, validateSatMath, SAT_MATH_RANGE } from './mathPlacement'
import { isMissingColumn } from './dbErrors'
import { fetchPlannerCatalog } from './plannerCatalog'

export const ACT_FIELDS = [
  { key: 'act_composite', label: 'Composite'   },
  { key: 'act_english',   label: 'English'     },
  { key: 'act_math',      label: 'Mathematics' },
  { key: 'act_reading',   label: 'Reading'     },
  { key: 'act_science',   label: 'Science'     },
  // SAT Math places a student like ACT Math does; either one (or neither) is fine.
  { key: 'sat_math',      label: 'SAT Math', min: SAT_MATH_RANGE.min, max: SAT_MATH_RANGE.max },
]

// Scores are optional: a student may have taken the ACT, the SAT, both or neither.
export function validateActScore(val) {
  if (val === '' || val === null || val === undefined) return null
  const n = Number(val)
  if (!Number.isInteger(n) || n < 1 || n > 36) return 'Must be a whole number between 1 and 36'
  return null
}

export function validateScore(key, val) {
  return key === 'sat_math' ? validateSatMath(val) : validateActScore(val)
}

// One-line note shown next to each score: what it does in this planner.
export function describeActScore(key, score) {
  const n = Number(score)
  if (!score || !Number.isInteger(n)) return 'not recorded'
  if (key === 'act_math') return `places into ${resolveMathPlacement({ act: n }).course}`
  if (key === 'sat_math') return `places into ${resolveMathPlacement({ sat: n }).course}`
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
  let { error: updateErr } = await db
    .from('student_profiles')
    .update(numScores)
    .eq('id', profile.id)
  // A database whose setup step has not added sat_math yet: save the ACT scores without it.
  if (isMissingColumn(updateErr)) {
    if (numScores.sat_math != null) return 'Saving an SAT score needs a database update. Restart the stack so its setup step can apply it.'
    const { sat_math: _unused, ...withoutSat } = numScores
    ;({ error: updateErr } = await db.from('student_profiles').update(withoutSat).eq('id', profile.id))
  }
  if (updateErr) return updateErr.message

  // Remove old ACT-derived rows, then re-insert for the new scores.
  await db
    .from('prior_credits')
    .delete()
    .eq('plan_id', profile.id)
    .in('credit_type', ['act_placement', 'act_credit'])

  const newPriorRows = []
  // Always a placement row: with no ACT or SAT Math score the student starts in MATH1000.
  const mathRow = resolveMathPlacementRow({ act: numScores.act_math, sat: numScores.sat_math })
  newPriorRows.push({ ...mathRow, plan_id: profile.id })
  for (const r of resolveActEnglishCredit(numScores.act_english)) {
    newPriorRows.push({ ...r, plan_id: profile.id })
  }
  if (newPriorRows.length > 0) {
    await db.from('prior_credits').insert(newPriorRows)
  }

  // The catalog holds every university course; the builder only needs this plan's (see plannerCatalog.js).
  // standing_req drives the builder's junior/senior placement — without it CSC3040 jumped ahead of
  // COMM_REQ and the pool front-fill never ran.
  // Every program the student follows (the one on the profile, and a secondary major or a minor added to it): the plan is re-placed as one.
  const programsRes = await fetchStudentPrograms(db, profile)
  const setsRes = programsRes.error
    ? { data: [], error: programsRes.error }
    : await fetchProgramSlotSets(db, programsRes.data, 'id, class_code, is_pool, flex_credits, map_semester')
  const rawSlots = (setsRes.data ?? []).flatMap(set => set.slots)
  const slotsRes = { data: rawSlots, error: setsRes.error }
  const [catalog, priorRes, studentSlotsRes] = await Promise.all([
    slotsRes.error ? { courses: [], prereqs: [], coreqs: [], error: null } : fetchPlannerCatalog(db, rawSlots),
    db.from('prior_credits').select('id, credit_type, satisfies_course_code, satisfies_pool, note, credits_awarded').eq('plan_id', profile.id),
    db.from('student_plan_slots').select('requirement_slot_id, position_source, selected_course_code, status, credits_remaining').eq('student_id', profile.id),
  ])

  // The existing rows are needed to keep the student's selections below;
  // recalculating without them would wipe those and overwrite dragged slots.
  if (slotsRes.error || catalog.error || priorRes.error || studentSlotsRes.error) {
    return `Failed to reload degree data. ${platformWords(platform).reloadHint}`
  }
  if (setsRes.data.length === 0) return null   // no program chosen yet: nothing to place

  const courseMap = {}
  for (const c of catalog.courses) courseMap[c.code] = c

  // One slot list for every program (lib/programMerge.js): a course two programs need is one slot, general education comes from the primary.
  // With no added program this is the primary's own slots, as before.
  const { data: programInfo } = await fetchProgramInfo(db, programsRes.data.map(p => p.programId))
  const pickedByStudent = Object.fromEntries((studentSlotsRes.data ?? []).filter(r => r.selected_course_code).map(r => [r.requirement_slot_id, r.selected_course_code]))
  const [primarySet, ...addedSets] = setsRes.data
  const merged = mergePrograms(
    { programId: primarySet.program.programId, slots: primarySet.slots, genedProgram: primarySet.program.genedProgram, totalHours: programInfo[primarySet.program.programId]?.total_hours },
    addedSets.map(({ program, slots: set }) => ({ programId: program.programId, role: program.role, slots: set, genedProgram: program.genedProgram, totalHours: programInfo[program.programId]?.total_hours })),
    { courses: courseMap, planSlots: pickedByStudent },
  )
  const slots = merged.slots

  // Grouped by group_index, with course substitutes applied (MATH1906
  // also satisfies MATH1910 requirements — see requirementMap.js).
  const prereqMap = buildRequirementMap(catalog.prereqs)
  const coreqMap  = buildRequirementMap(catalog.coreqs)

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
    addedSlotIds: addedSlotIdsOf(merged.programsOf, primarySet.program.programId),
    courseMap,
    prereqMap,
    coreqMap,
    priorCredits: priorRes.data ?? [],
    studentProfile: {
      student_type: profile.student_type,
      act_math:     numScores.act_math,
      sat_math:     numScores.sat_math,
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
    const { error: upsertErr } = await db
      .from('student_plan_slots')
      .upsert(planSlotRows.slice(i, i + CHUNK), { onConflict: 'student_id, requirement_slot_id' })
    if (upsertErr) {
      console.error('[saveActScoresAndRebuild] student_plan_slots upsert failed:', upsertErr)
      return `Failed to save degree plan: ${upsertErr.message}`
    }
  }

  return null
}
