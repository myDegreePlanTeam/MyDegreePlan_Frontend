// Which concentrations a student may pick. Pure; shared by Onboarding and the
// Settings "Change concentration" modal so the two cannot drift.
//
// Data Science & AI ('dsai') is closed to students on the Fall 2026+ curriculum.
// The only students who can be in it are 'returning' students, who by
// construction started before Fall 2026 (see RETURNING_YEARS in Onboarding).
// A student already on DSAI always keeps it visible as their current choice,
// so the modal never renders a plan whose own concentration is missing.

export const RETIRED_CONCENTRATION_CODES = ['dsai']

export function isConcentrationSelectable(code, studentType, currentCode = null) {
  if (!RETIRED_CONCENTRATION_CODES.includes(code)) return true
  return studentType === 'returning' || code === currentCode
}
