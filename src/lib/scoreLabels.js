// scoreLabels.js
//
// How a score threshold is written for a student. test_equivalencies stores the lowest score that earns each award
// (min_score), so an AP exam with thresholds 3 and 4 has two choices: a 3, and a 4 or 5. Writing both as "3+" and "4+"
// makes the first look as if it covered a 4 as well. The label of a threshold says what it covers:
//
//   [3]        3+      (a 3, 4 or 5 all earn the same)
//   [3, 4]     3, 4+
//   [3, 4, 5]  3, 4, 5
//   [3, 5]     3–4, 5
//   [4, 5]     4, 5
//
// Only AP has a known top score here; for the other exams (IB, CLEP) every threshold keeps its plain "N+".

export const TOP_SCORE = { ap_credit: 5 }

/**
 * @param {number[]} thresholds  min_score values of one exam
 * @param {string}   [creditType]  the exam's test_type
 * @returns {Object} { [threshold]: label }
 */
export function scoreLabels(thresholds, creditType) {
  const sorted = [...new Set(thresholds)].sort((a, b) => a - b)
  const top = TOP_SCORE[creditType]
  const labels = {}
  sorted.forEach((score, i) => {
    if (top === undefined) { labels[score] = `${score}+`; return }
    const next = sorted[i + 1]
    if (next !== undefined) labels[score] = next - 1 === score ? `${score}` : `${score}–${next - 1}`
    else labels[score] = score >= top ? `${score}` : `${score}+`
  })
  return labels
}
