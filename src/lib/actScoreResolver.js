// ACT score → prior_credit row resolvers.
//
// resolveActMathPlacement: highest-tier-only (NOT cumulative).
// resolveActEnglishCredit: cumulative — every tier at or below the score is awarded.
// getActMathThreshold: reverse lookup — min score to place into a given course.

const ACT_MATH_TIERS = [
  { min: 29, course: 'MATH1910' },
  { min: 27, course: 'MATH1904' },
  { min: 25, course: 'MATH1730' },
  { min: 19, course: 'MATH1710' },
  { min:  1, course: 'MATH1000' },
]

export function resolveActMathPlacement(actMathScore) {
  if (!actMathScore) return null
  const tier = ACT_MATH_TIERS.find(t => actMathScore >= t.min)
  if (!tier) return null
  return {
    credit_type:           'act_placement',
    satisfies_course_code: tier.course,
    credits_awarded:       0,
    note:                  `ACT Math: score ${actMathScore}`,
  }
}

// Returns the minimum ACT Math score that places a student into courseCode,
// or null if the course is not in the placement ladder.
// Used by prereqChecker to build the hint string (e.g. "ACT Math 29+")
// so the threshold is always sourced from the tier table, not the DB description.
export function getActMathThreshold(courseCode) {
  const tier = ACT_MATH_TIERS.find(t => t.course === courseCode)
  return tier ? tier.min : null
}

export function resolveActEnglishCredit(actEnglishScore) {
  if (!actEnglishScore) return []
  const rows = []
  if (actEnglishScore >= 27) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  if (actEnglishScore >= 31) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1020', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  return rows
}
