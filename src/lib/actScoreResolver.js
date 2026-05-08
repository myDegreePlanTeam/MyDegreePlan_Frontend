// ACT score → prior_credit row resolvers.
//
// resolveActMathPlacement: highest-tier-only (NOT cumulative).
// resolveActEnglishCredit: cumulative — every tier at or below the score is awarded.

export function resolveActMathPlacement(actMathScore) {
  if (!actMathScore) return null
  const tiers = [
    { min: 29, course: 'MATH1910' },
    { min: 27, course: 'MATH1904' },
    { min: 25, course: 'MATH1730' },
    { min: 19, course: 'MATH1710' },
    { min:  1, course: 'MATH1000' },
  ]
  const tier = tiers.find(t => actMathScore >= t.min)
  if (!tier) return null
  return {
    credit_type:           'act_placement',
    satisfies_course_code: tier.course,
    credits_awarded:       0,
    note:                  `ACT Math: score ${actMathScore}`,
  }
}

export function resolveActEnglishCredit(actEnglishScore) {
  if (!actEnglishScore) return []
  const rows = []
  if (actEnglishScore >= 27) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  if (actEnglishScore >= 31) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1020', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  return rows
}
