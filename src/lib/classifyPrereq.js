// classifyPrereq.js
//
// Given a course code and a prereq code, classifies the relationship so the
// prereqChecker knows whether to emit a warning.
//
// Returns one of:
//   'placement' — satisfied by ACT/SAT score; planner cannot verify, never warn
//   'consent'   — requires instructor approval; planner cannot verify, never warn
//   'completion'— must have completed the prereq course (normal enforcement)
//
// How classification works:
//   We look at courseCode's own description.  If the catalog text mentions an
//   ACT/SAT score threshold ("ACT Math score", "ACT mathematics score", etc.)
//   the entire prereq requirement for that course can be satisfied by placement,
//   so we suppress warnings regardless of which prereqCode is being checked.
//   Same logic applies to "Consent of instructor" language.
//
// The prereqCode parameter is included in the signature for future per-prereq
// classification (e.g. if the DB gains a placement_only column on individual
// prerequisite_entries rows).  Currently unused.

const ACT_PATTERNS = [
  /act math(ematics)?\s+score/i,
  /act mathematics score/i,
  /act score of/i,
  /sat math/i,
  /placement test/i,
]

const CONSENT_PATTERNS = [
  /consent of instructor/i,
  /instructor['']?s?\s+consent/i,
  /permission of (the )?instructor/i,
  /permission of (the )?department/i,
]

/**
 * classifyPrereq(courseCode, prereqCode, courseMap)
 *
 * @param {string}  courseCode   – the course being taken (e.g. 'MATH1910')
 * @param {string|null} prereqCode – the prerequisite course (e.g. 'MATH1730')
 *                                   currently unused; reserved for future use
 * @param {Object}  courseMap    – { [code]: { description, ... } }
 * @returns {'placement'|'consent'|'completion'}
 */
export function classifyPrereq(courseCode, prereqCode, courseMap = {}) {
  const course = courseMap[courseCode]
  if (!course) return 'completion'

  const desc = course.description ?? ''

  if (CONSENT_PATTERNS.some(p => p.test(desc))) return 'consent'
  if (ACT_PATTERNS.some(p => p.test(desc)))     return 'placement'

  return 'completion'
}
