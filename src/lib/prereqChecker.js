// prereqChecker.js
// Given a course code, the prereqMap, and the set of satisfied course codes,
// returns an object describing whether prerequisites are met.
//
// Returns:
//   { satisfied: true }  — all prereqs met or no prereqs
//   { satisfied: false, missing: ['CSC1300', ...] }  — which groups are unmet

export function checkPrereqs(courseCode, prereqMap, satisfiedCodes) {
  const groups = prereqMap[courseCode]

  // No prerequisites recorded — course is freely available
  if (!groups || Object.keys(groups).length === 0) {
    return { satisfied: true }
  }

  const missing = []

  for (const groupIndex of Object.keys(groups)) {
    const group = groups[groupIndex]

    if (group.logic === 'AND') {
      // Every code in this group must be satisfied
      // (AND groups only ever have one code by our schema design)
      const unmet = group.codes.filter(code => !satisfiedCodes.has(code))
      if (unmet.length > 0) missing.push(...unmet)

    } else if (group.logic === 'OR') {
      // At least one code in this group must be satisfied
      const anyMet = group.codes.some(code => satisfiedCodes.has(code))
      if (!anyMet) missing.push(`(${group.codes.join(' or ')})`)
    }
  }

  if (missing.length > 0) {
    return { satisfied: false, missing }
  }

  return { satisfied: true }
}