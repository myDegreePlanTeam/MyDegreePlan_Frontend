export const FALL_ONLY = new Set([
  'CSC3220', 'CSC3570', 'CSC4240', 'CSC4585', 'CSC4770',
])

export const SPRING_ONLY = new Set([
  'CSC3100', 'CSC4220', 'CSC4260', 'CSC4575', 'CSC4750', 'CSC4760', 'CSC4780',
])

// Returns 'Fall', 'Spring', or null
export function getSeasonRestriction(courseCode) {
  if (FALL_ONLY.has(courseCode))   return 'Fall'
  if (SPRING_ONLY.has(courseCode)) return 'Spring'
  return null
}

// null semesterSeason → allow (unknown term — don't block)
// Summer → only unrestricted courses allowed
export function isEnrollmentAllowed(courseCode, semesterSeason) {
  const r = getSeasonRestriction(courseCode)
  if (!r || !semesterSeason)         return true
  if (semesterSeason === 'Summer')   return false
  return r === semesterSeason
}
