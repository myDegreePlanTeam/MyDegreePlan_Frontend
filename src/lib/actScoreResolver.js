// ACT / SAT score → prior_credit row resolvers.
//
// The placement table itself lives in mathPlacement.js.
//
// resolveMathPlacementRow: the placement row for a student's ACT and SAT Math scores, always (no score
//   places into MATH1000). Highest placement wins when both scores are on file.
// resolveActMathPlacement: the ACT-only form; null when there is no ACT Math score.
// resolveActEnglishCredit: cumulative — every tier at or below the score is awarded.
// getActMathThreshold: reverse lookup — min score to place into a given course.

import { resolveMathPlacement, getActMathThreshold as thresholdFor } from './mathPlacement'

const placementRow = (course, note) => ({
  credit_type:           'act_placement',
  satisfies_course_code: course,
  credits_awarded:       0,
  note,
})

/** The act_placement row for a student's scores. credit_type stays 'act_placement': it is the ACT/SAT score gate. */
export function resolveMathPlacementRow({ act = null, sat = null } = {}) {
  const placement = resolveMathPlacement({ act, sat })
  const note = placement.source === 'act' ? `ACT Math: score ${placement.score}`
    : placement.source === 'sat' ? `SAT Math: score ${placement.score}`
    : 'No ACT or SAT Math score on file'
  return placementRow(placement.course, note)
}

export function resolveActMathPlacement(actMathScore) {
  if (!actMathScore) return null
  const placement = resolveMathPlacement({ act: actMathScore })
  if (placement.source !== 'act') return null
  return placementRow(placement.course, `ACT Math: score ${actMathScore}`)
}

// Returns the minimum ACT Math score that places a student into courseCode,
// or null if the course is not in the placement ladder.
// Used by prereqChecker to build the hint string (e.g. "ACT Math 29+")
// so the threshold is always sourced from the tier table, not the DB description.
export const getActMathThreshold = thresholdFor

// Onboarding form state ({ math, english, science, reading, composite, satMath } as
// strings) → the student_profiles score columns as numbers (null if blank).
// Onboarding uses this for both the DB update and the profile it hands back to
// Dashboard, so the in-memory profile always has every score.
export function actScoresToProfileFields(actScores) {
  const num = v => (v !== '' && v !== null && v !== undefined ? Number(v) : null)
  return {
    act_math:      num(actScores.math),
    act_english:   num(actScores.english),
    act_science:   num(actScores.science),
    act_reading:   num(actScores.reading),
    act_composite: num(actScores.composite),
    sat_math:      num(actScores.satMath),
  }
}

export function resolveActEnglishCredit(actEnglishScore) {
  if (!actEnglishScore) return []
  const rows = []
  if (actEnglishScore >= 27) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  if (actEnglishScore >= 31) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1020', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  return rows
}
