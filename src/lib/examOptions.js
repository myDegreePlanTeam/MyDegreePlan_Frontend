// examOptions.js
//
// An exam whose credit is one of several courses. Tech's AP table lists "PHYS 2010 or 2110" and "BIOL 1010 & 1020 or
// BIOL 1113 & 1123" and does not say how to choose, so test_equivalencies marks the rows of each alternative with an
// option_key. The rows of one exam that share a key are one choice; the exam awards the rows with no key plus the rows of
// the single choice the student takes. Pure functions over the awards the prior credit wizard has loaded.
//
// An award here is { awarded_course_code, credits_awarded, satisfies_pool, option_key }, where satisfies_pool is already the
// pool of the student's plan (mapSatisfiesPoolForPlan).

/**
 * Whether an equivalency row awards its course at a score. A row applies from its min_score upward (Biology 4 adds BIOL 1020
 * to what a 3 earns); one that a higher score REPLACES carries superseded_at and stops there (Calculus AB: a 3 earns
 * MATH 1830, a 4 earns MATH 1910 instead). A row with no min_score has no threshold.
 */
export function appliesAtScore(row, score) {
  if (row.min_score == null) return true
  return row.min_score <= score && (row.superseded_at == null || score < row.superseded_at)
}

/** The distinct option keys of a list of awards, in the order they first appear. */
export function optionKeysOf(awards) {
  return [...new Set((awards ?? []).map(a => a.option_key).filter(Boolean))]
}

/** The awards a choice produces: the ones that are not alternatives, plus the chosen alternative's. */
export function awardsForOption(awards, optionKey) {
  return (awards ?? []).filter(a => !a.option_key || a.option_key === optionKey)
}

/**
 * Which choice the student's plan decides, if it decides one. An option scores 2 for each of its courses that is a required
 * course of the plan (a slot with that exact code, not archived) and 1 for each that fills an open pool slot the plan has
 * (PHYS 2010 or 2110 for the science pool). The choice with the strictly highest score wins; a tie, or no score, leaves the
 * decision to the student.
 *
 * @param {Array} awards   every award of the exam and score, alternatives included
 * @param {Array} slots    the plan's requirement_slots ({ id, class_code, is_pool })
 * @param {Object} planArchived  { [slotId]: true } for slots a prior credit already covers
 * @returns {{ key: string, reason: 'required'|'pool' }|null}
 */
export function chooseOption(awards, slots, planArchived = {}) {
  const keys = optionKeysOf(awards)
  if (keys.length < 2) return null
  const open = (slots ?? []).filter(s => !planArchived[s.id])
  const scored = keys.map(key => {
    let required = 0
    let pool = 0
    for (const a of awards.filter(x => x.option_key === key)) {
      if (open.some(s => !s.is_pool && s.class_code === a.awarded_course_code)) required++
      else if (a.satisfies_pool && open.some(s => s.is_pool && s.class_code === a.satisfies_pool)) pool++
    }
    return { key, score: required * 2 + pool, reason: required > 0 ? 'required' : 'pool' }
  }).sort((a, b) => b.score - a.score)
  if (scored[0].score === 0 || scored[0].score === scored[1].score) return null
  return { key: scored[0].key, reason: scored[0].reason }
}
