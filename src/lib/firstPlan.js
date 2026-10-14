// firstPlan.js
//
// The plan first run builds, worked out before anything is saved (redesign Phase 7): the student looks it over on "Your plan is ready"
// and it is written only when they open it. Pure: Onboarding fetches the slots and the catalog slice, this turns the student's choices
// into the rows to write and the few facts the last screen shows.

import { resolveMathPlacementRow, resolveActEnglishCredit, actScoresToProfileFields } from './actScoreResolver.js'
import { resolveMathPlacement } from './mathPlacement.js'
import { buildDegreePlan } from './degreeBuilder.js'
import { buildRequirementMap } from './requirementMap.js'
import { computeSemesterTerms, formatTermLabel } from './semesterTerms.js'
import { semesterPhases, phaseOfSemester } from './termPhase.js'
import { formatCourseCode } from './courseCodeFormat.js'
import { firstDependentPick } from './pickReliance.js'

/**
 * @param {object} input
 *   profileId, program (concentrations row), plan (degree_plans row), slots (requirement_slots rows), courses / prereqs / coreqs (the
 *   plan's slice of the catalog), actScores (the form's strings), priorCreditRecords (from the wizard), startSeason, startYear, studentType
 * @returns {{ profileFields, extraProfileFields, records, planSlotRows, assignments, archived, courseMap, prereqMap, coreqMap, actFields }}
 *   profileFields       the columns every database has;  extraProfileFields  gened_program and catalog_year (an older database lacks them)
 *   records             every prior_credits row to insert: ACT English credit, the math placement, then the student's own
 */
export function buildFirstPlan({ profileId, program, plan, slots, courses, prereqs, coreqs, actScores, priorCreditRecords = [], startSeason, startYear, studentType }) {
  const actFields = actScoresToProfileFields(actScores)
  const profileFields = {
    concentration_id: program.id,
    start_season:     startSeason,
    start_year:       startYear,
    student_type:     studentType,
    ...actFields,
  }

  // Always a placement row: with no ACT or SAT Math score the student starts in MATH1000.
  const records = [
    ...resolveActEnglishCredit(actFields.act_english),
    resolveMathPlacementRow({ act: actFields.act_math, sat: actFields.sat_math }),
    ...priorCreditRecords,
  ]

  const courseMap = {}
  for (const c of courses) courseMap[c.code] = c

  // grouped by group_index, with course substitutes applied (requirementMap.js)
  const prereqMap = buildRequirementMap(prereqs)
  const coreqMap  = buildRequirementMap(coreqs)
  const { assignments, archived } = buildDegreePlan({
    slots,
    courseMap,
    prereqMap,
    coreqMap,
    priorCredits: records.map(r => ({ ...r, plan_id: profileId })),
    studentProfile: { student_type: studentType, act_math: actFields.act_math, sat_math: actFields.sat_math, start_season: startSeason },
  })

  // Archived slots carry archive_reason and no semester; placed slots carry the semester the algorithm chose.
  const planSlotRows = []
  for (const slot of slots) {
    const archiveReason = archived[slot.id]
    if (!archiveReason && assignments[slot.id] == null) continue
    planSlotRows.push({
      student_id:           profileId,
      requirement_slot_id:  slot.id,
      selected_course_code: slot.is_pool ? null : slot.class_code,
      status:               'planned',
      semester_number:      archiveReason ? null : assignments[slot.id],
      credits_remaining:    0,
      archived:             !!archiveReason,
      archive_reason:       archiveReason ?? null,
      position_source:      archiveReason ? null : 'algorithm',
    })
  }

  return {
    profileFields,
    extraProfileFields: { gened_program: plan.gened_program, catalog_year: plan.catalog_year },
    records, planSlotRows, assignments, archived, courseMap, prereqMap, coreqMap, actFields,
  }
}

/**
 * What "Your plan is ready" says about a built plan.
 * @returns {{ finish, semesterCount, totalHours, now: { label, hours, courses, phase }|null, math: { course, name, sentence }|null, picks,
 *             firstPick: { label, dependents, term }|null }}
 *   now    the first semester that is not over (the one the plan opens on);  picks  the choices still to make
 *   firstPick  the pick to start with: the earliest one a later course depends on (the same check the plan's Plan check strip makes,
 *              lib/pickReliance.js). Null when nothing depends on a pick, or when prereqMap / coreqMap / records are not given.
 */
export function summarizeFirstPlan({ plan, slots, courseMap, assignments, actFields, startSeason, startYear, today = new Date(), hasMathChain = true, prereqMap, coreqMap, records = [] }) {
  const placed = slots.filter(s => assignments[s.id] != null)
  const last = placed.reduce((max, s) => Math.max(max, assignments[s.id]), 0)
  const numbers = Array.from({ length: last }, (_, i) => i + 1)
  const terms = computeSemesterTerms(startSeason, Number(startYear), numbers)
  const phases = semesterPhases(terms, today)
  const nowNum = numbers.find(n => phaseOfSemester(phases, n) !== 'past') ?? null
  const hoursOf = slot => (slot.is_pool ? (slot.flex_credits ?? 3) : (courseMap[slot.class_code]?.credits ?? 0))
  const inNow = nowNum == null ? [] : placed.filter(s => assignments[s.id] === nowNum)

  const placement = resolveMathPlacement({ act: actFields.act_math, sat: actFields.sat_math })
  const into = formatCourseCode(placement.course)
  const dependentPick = prereqMap && coreqMap
    ? firstDependentPick({ slots: placed, semesterOf: s => assignments[s.id], planSlots: {}, freeAddSlots: [], prereqMap, coreqMap, priorCredits: records, courses: courseMap })
    : null

  const sentence = placement.source === 'act' ? `ACT Math ${placement.score} places you into ${into}.`
    : placement.source === 'sat' ? `SAT Math ${placement.score} places you into ${into}.`
    : `With no ACT or SAT Math score, math starts in ${into}.`

  return {
    finish: last ? formatTermLabel(terms[last]) : null,
    semesterCount: last,
    totalHours: plan.total_hours ?? null,
    now: nowNum == null ? null : {
      label: formatTermLabel(terms[nowNum]),
      phase: phaseOfSemester(phases, nowNum),
      hours: inNow.reduce((n, s) => n + hoursOf(s), 0),
      courses: inNow.length,
    },
    math: hasMathChain ? { course: placement.course, name: courseMap[placement.course]?.name ?? null, sentence } : null,
    picks: placed.filter(s => s.is_pool).length,
    firstPick: dependentPick
      ? { label: dependentPick.label, dependents: dependentPick.dependents, term: formatTermLabel(terms[dependentPick.semester]) }
      : null,
  }
}
