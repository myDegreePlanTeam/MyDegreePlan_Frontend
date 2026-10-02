// mathPlacement.js
//
// Which math course a student starts in, from an ACT Math subscore or an SAT Math score. This is the one
// copy of Tennessee Tech's placement table; actScoreResolver.js, degreeBuilder.js, the prerequisite hint and
// the Settings card all read it. (MyDegreePlan_Prototype/math_sequences.json repeats the ACT tiers for the
// seed side: keep the two in step.)
//
// Source: the College of Engineering and the Math Department. They reassess it every year, so `effective`
// says which year's table this is; change the numbers here and nowhere else.
//
//   ACT Math 29+  (SAT Math 680+)       MATH 1910  Calculus I
//   ACT Math 27+  (SAT Math 640+)       MATH 1904  Extended Calculus
//   ACT Math 25+  (SAT Math 590+)       MATH 1845  Technical Calculus (Engineering Technology majors only)
//   ACT Math 25+  (SAT Math 590+)       MATH 1730  Pre-Calculus
//   MATH 1710 passed with a C or higher MATH 1720  Pre-Calculus Trigonometry
//   ACT Math 19-24 (SAT Math 510-580)   MATH 1710  Pre-Calculus Algebra
//   ACT Math 18 or less, SAT Math 500 or less, or no score   MATH 1000  Transitional Algebra
//
// MATH 1730 is equivalent to MATH 1710 plus MATH 1720.

export const MATH_PLACEMENT = {
  effective: '2026-2027',

  // Highest first. `act` and `sat` are the lowest score that places a student into `course`.
  tiers: [
    { course: 'MATH1910', act: 29, sat: 680 },
    { course: 'MATH1904', act: 27, sat: 640 },
    { course: 'MATH1730', act: 25, sat: 590 },
    { course: 'MATH1710', act: 19, sat: 510 },
    { course: 'MATH1000', act: 1,  sat: 0 },
  ],

  // No ACT or SAT Math score on file.
  noScore: 'MATH1000',

  // Placed at the same score as another tier but for a different audience; a CSC plan never uses these.
  alsoAt: [
    { course: 'MATH1845', act: 25, sat: 590, onlyFor: 'Engineering Technology majors' },
  ],

  // Not a placement: what a passing grade (C or higher) opens next.
  progression: [{ after: 'MATH1710', course: 'MATH1720' }],

  // Courses that cover the same content as a pair. A requirement for either course of the pair is met by the
  // equivalent (see REQUIREMENT_SUBSTITUTES in requirementMap.js).
  equivalents: { MATH1730: ['MATH1710', 'MATH1720'] },
}

/**
 * Which math curriculum a plan follows: 'new' (Fall 2026+ Computer Science: no MATH1920) or 'returning' (MATH1920 sits between
 * MATH1910 and MATH2010). A plan whose department map puts MATH1920 in a semester requires it, so it is 'returning' for every
 * student: the engineering majors take Calculus I, II and III. Otherwise the student's own type decides, as before.
 * The Prototype's specLib.mathCurriculumOf reads the same evidence, so the validator and the app agree.
 */
export function mathCurriculumFor(slots, studentType) {
  if ((slots ?? []).some(s => s.class_code === 'MATH1920' && s.map_semester != null)) return 'returning'
  return studentType === 'returning' ? 'returning' : 'new'
}

/**
 * Whether a plan includes Calculus I, the course every placement chain leads to (MATH 1000, 1710, 1730 and 1904 all end
 * there). A plan without it (a Music or Nursing plan) has no placement sequence to show, so onboarding skips that step.
 */
export function planHasMathChain(slots) {
  const calculusI = MATH_PLACEMENT.tiers[0].course
  return (slots ?? []).some(s => s.class_code === calculusI)
}

const TIERS = MATH_PLACEMENT.tiers
const rank = course => TIERS.findIndex(t => t.course === course)

const isScore = n => Number.isFinite(n) && n > 0

/** The tier an ACT Math subscore places into, or null when there is no usable score. */
export function tierForAct(score) {
  const n = Number(score)
  return isScore(n) ? TIERS.find(t => n >= t.act) ?? null : null
}

/** The tier an SAT Math score places into, or null when there is no usable score. */
export function tierForSat(score) {
  const n = Number(score)
  return isScore(n) ? TIERS.find(t => n >= t.sat) ?? null : null
}

/**
 * The math course a student starts in. With both an ACT and an SAT Math score the higher placement wins:
 * the student may use whichever helps.
 * @param {{ act?: number|string|null, sat?: number|string|null }} scores
 * @returns {{ course: string, source: 'act'|'sat'|'none', score: number|null }}
 */
export function resolveMathPlacement({ act = null, sat = null } = {}) {
  const fromAct = tierForAct(act)
  const fromSat = tierForSat(sat)
  if (fromAct && (!fromSat || rank(fromAct.course) <= rank(fromSat.course))) {
    return { course: fromAct.course, source: 'act', score: Number(act) }
  }
  if (fromSat) return { course: fromSat.course, source: 'sat', score: Number(sat) }
  return { course: MATH_PLACEMENT.noScore, source: 'none', score: null }
}

/** The lowest ACT Math score that places into `course`, or null if it is not a placement course. */
export function getActMathThreshold(course) {
  return TIERS.find(t => t.course === course)?.act ?? null
}

/** The lowest SAT Math score that places into `course`, or null if it is not a placement course. */
export function getSatMathThreshold(course) {
  return TIERS.find(t => t.course === course)?.sat ?? null
}

/** The requirement substitutes the equivalents imply: { MATH1710: ['MATH1730'], MATH1720: ['MATH1730'] }. */
export function equivalentSubstitutes(equivalents = MATH_PLACEMENT.equivalents) {
  const out = {}
  for (const [whole, parts] of Object.entries(equivalents)) {
    for (const part of parts) (out[part] ??= []).push(whole)
  }
  return out
}

export const ACT_MATH_RANGE = { min: 1, max: 36 }
export const SAT_MATH_RANGE = { min: 200, max: 800 }

/** A message for an SAT Math score that cannot be real, or null (blank is fine: the score is optional). */
export function validateSatMath(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < SAT_MATH_RANGE.min || n > SAT_MATH_RANGE.max) {
    return `Must be a whole number between ${SAT_MATH_RANGE.min} and ${SAT_MATH_RANGE.max}`
  }
  return null
}
