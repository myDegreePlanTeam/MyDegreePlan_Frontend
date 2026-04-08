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
// The coreqMap shape built in DegreePlan.jsx is:
//   { [courseCode]: string[] }  — flat list of required codes (no group logic)
//
// Returns:
//   { satisfied: true }                         — all coreqs met or none required
//   { satisfied: false, missing: string[] }      — which codes are absent
//
// Signature is intentionally kept separate from checkPrereqs so neither
// function's signature changes and all existing callers remain valid.

export function checkCoreqs(courseCode, coreqMap, availableCodes) {
  const required = coreqMap?.[courseCode] ?? []
  if (required.length === 0) return { satisfied: true }

  const missing = required.filter(code => !availableCodes.has(code))
  if (missing.length > 0) return { satisfied: false, missing }
  return { satisfied: true }
}

// ── checkPrereqs ──────────────────────────────────────────────────────────────

export function checkPrereqs(
  courseCode,
  prereqMap,
  satisfiedCodes,
  priorCredits = [],
  courseMap    = {}
) {
  const groups = prereqMap[courseCode]

  // No prerequisites recorded — course is freely available
  if (!groups || Object.keys(groups).length === 0) {
    return { satisfied: true }
  }

  // ── Placement / consent classification ───────────────────────────
  // If the course itself is placement-gated or consent-gated, suppress ALL
  // prereq warnings for it.  The planner cannot verify ACT scores or
  // instructor approvals, so emitting warnings would undermine user trust.
  const classification = classifyPrereq(courseCode, null, courseMap)
  if (classification === 'placement' || classification === 'consent') {
    return { satisfied: true }
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
      const unmet = group.codes.filter(code => !enhanced.has(code))
      if (unmet.length > 0) missing.push(...unmet)

    } else if (group.logic === 'OR') {
      // At least one code in this group must be satisfied
      const anyMet = group.codes.some(code => enhanced.has(code))
      if (!anyMet) missing.push(`(${group.codes.join(' or ')})`)
    }
  }

  if (missing.length > 0) {
    return { satisfied: false, missing }
  }

  return { satisfied: true }
}
