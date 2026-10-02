// The 2026-2027 degree maps print these terms next to the course; a test (degreeMaps.test.js) requires every offering in
// the specs to agree with these sets. AI 3000 / AI 3200 are CSC 4240 / CSC 4220 under their new codes, so they share the
// term. CSC 4780 is also "even years only" on the maps; that year parity is not enforced here.
export const FALL_ONLY = new Set([
  'CSC3220', 'CSC3570', 'CSC4240', 'CSC4585', 'CSC4770', 'AI3000', 'AI4200',
])

export const SPRING_ONLY = new Set([
  'CSC3100', 'CSC4220', 'CSC4260', 'CSC4575', 'CSC4750', 'CSC4760', 'CSC4780', 'AI3100', 'AI3200',
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
