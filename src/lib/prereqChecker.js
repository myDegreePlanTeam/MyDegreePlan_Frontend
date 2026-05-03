// prereqChecker.js
// Given a course code, the prereqMap, and the set of satisfied course codes,
// returns an object describing whether prerequisites are met.
//
// Returns:
//   { satisfied: true }  — all prereqs met or no prereqs
//   { satisfied: false, missing: ['CSC1300', ...] }  — which groups are unmet
//
// Optional parameters (added in Tier 7 — all existing callers remain valid):
//
//   priorCredits (default [])
//     Array of prior_credit rows.  Any row whose satisfies_course_code is set
//     is treated as a course completed before the plan began (Semester 0).
//     This means ACT-credit, AP credit, transfer credit, etc. all satisfy
//     completion prereqs without a plan_slot needing to exist.
//
//   courseMap (default {})
//     Full course catalog map { [code]: { description, ... } }.
//     Used by classifyPrereq to detect placement-only or consent-only prereqs.
//     If a course's own description mentions ACT/SAT score thresholds or
//     "Consent of instructor", ALL its prereq groups are skipped — the planner
//     cannot verify placement or consent, so no warning is appropriate.

import { classifyPrereq } from './classifyPrereq.js'

// ── checkCoreqs ───────────────────────────────────────────────────────────────
// Checks whether corequisites for a course are satisfied by availableCodes.
//
// Corequisites may be taken in the SAME semester as the requiring course, so
// they are checked against availableCodes (completedCodes + same-semester codes)
// rather than completedCodes alone.
//
// Accepts two coreqMap shapes:
//   Flat list (legacy):  { [courseCode]: string[] }
//     — all entries are treated as AND requirements.
//   Grouped (current):   { [courseCode]: { [groupIndex]: { logic: 'AND'|'OR', codes: string[] } } }
//     — OR groups short-circuit when any one member is in availableCodes.
//
// Returns:
//   { satisfied: true }                         — all coreqs met or none required
//   { satisfied: false, missing: string[] }      — which codes/groups are absent
//
// Signature is intentionally kept separate from checkPrereqs so neither
// function's signature changes and all existing callers remain valid.

export function checkCoreqs(courseCode, coreqMap, availableCodes) {
  const required = coreqMap?.[courseCode] ?? []

  // ── Flat list (legacy/simple): all entries are AND requirements ───────────
  if (Array.isArray(required)) {
    if (required.length === 0) return { satisfied: true }
    const missing = required.filter(code => !availableCodes.has(code))
    if (missing.length > 0) return { satisfied: false, missing }
    return { satisfied: true }
  }

  // ── Grouped format: same shape as prereqMap ───────────────────────────────
  // OR groups short-circuit when any one member is in availableCodes.
  if (Object.keys(required).length === 0) return { satisfied: true }

  const missing = []
  for (const groupIndex of Object.keys(required)) {
    const group = required[groupIndex]

    if (group.logic === 'AND') {
      const unmet = group.codes.filter(code => !availableCodes.has(code))
      if (unmet.length > 0) missing.push(...unmet)

    } else if (group.logic === 'OR') {
      // Short-circuit: any one member satisfied → entire OR group clears
      const anyMet = group.codes.some(code => availableCodes.has(code))
      if (!anyMet) missing.push(`(${group.codes.join(' or ')})`)
    }
  }

  if (missing.length > 0) return { satisfied: false, missing }
  return { satisfied: true }
}

// ── Internal helper ──────────────────────────────────────────────────────────
// Returns true if `code` is listed as a corequisite for `courseCode` in the
// provided coreqMap.  Handles both flat-list and grouped coreqMap shapes.
// Used by checkPrereqs to suppress prereq warnings for codes that the coreq
// checker already owns.

function isCoreqForCourse(courseCode, code, coreqMap) {
  const coreqs = coreqMap[courseCode]
  if (!coreqs) return false
  if (Array.isArray(coreqs)) return coreqs.includes(code)
  // Grouped format: { [groupIndex]: { logic, codes } }
  return Object.values(coreqs).some(group => group.codes.includes(code))
}

// ── checkPrereqs ──────────────────────────────────────────────────────────────

export function checkPrereqs(
  courseCode,
  prereqMap,
  satisfiedCodes,
  priorCredits = [],
  courseMap    = {},
  coreqMap     = {}
) {
  const groups = prereqMap[courseCode]

  // No prerequisites recorded — course is freely available
  if (!groups || Object.keys(groups).length === 0) {
    return { satisfied: true }
  }

  // ── Placement / consent classification ───────────────────────────
  // consent: planner cannot verify instructor approval → always suppress.
  // placement: suppress ONLY if the student has recorded a matching
  //   act_placement prior credit (satisfies_course_code === courseCode,
  //   credits_awarded === 0).  Without one, fall through to normal prereq
  //   group checking so the standard "Needs: MATH1730 or …" warning appears.
  const classification = classifyPrereq(courseCode, null, courseMap)
  if (classification === 'consent') {
    return { satisfied: true }
  }
  if (classification === 'placement') {
    const hasPlacement = (priorCredits ?? []).some(
      pc => pc.credit_type === 'act_placement'
         && pc.satisfies_course_code === courseCode
    )
    if (hasPlacement) return { satisfied: true }
    // No recorded placement — fall through to evaluate course prereqs
  }

  // ── Enhance satisfiedCodes with prior credits ─────────────────────
  // Prior credits are treated as completed in "Semester 0" — before the
  // plan begins.  Any course code they cover is added to the satisfied set.
  let enhanced = satisfiedCodes
  const creditCodes = (priorCredits ?? [])
    .filter(pc => pc.satisfies_course_code)
    .map(pc => pc.satisfies_course_code)

  if (creditCodes.length > 0) {
    enhanced = new Set(satisfiedCodes)
    for (const code of creditCodes) enhanced.add(code)
  }

  // ── Check each prerequisite group ────────────────────────────────
  const missing = []

  for (const groupIndex of Object.keys(groups)) {
    const group = groups[groupIndex]

    if (group.logic === 'AND') {
      // Every code in this group must be satisfied
      // (AND groups only ever have one code by our schema design)
      // Suppress warning for a code that is also listed as a coreq — the coreq
      // checker already owns it and will warn if co-enrollment is missing.
      const unmet = group.codes.filter(
        code => !enhanced.has(code) && !isCoreqForCourse(courseCode, code, coreqMap)
      )
      if (unmet.length > 0) missing.push(...unmet)

    } else if (group.logic === 'OR') {
      // At least one code in this group must be satisfied.
      // A code that is also a coreq counts as satisfied here — the coreq
      // checker verifies actual co-enrollment independently.
      const anyMet = group.codes.some(
        code => enhanced.has(code) || isCoreqForCourse(courseCode, code, coreqMap)
      )
      if (!anyMet) missing.push(`(${group.codes.join(' or ')})`)
    }
  }

  if (missing.length > 0) {
    return { satisfied: false, missing }
  }

  return { satisfied: true }
}
