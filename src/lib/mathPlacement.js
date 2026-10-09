// mathPlacement.js
//
// Which math course a student starts in, from an ACT Math subscore or an SAT Math score. This is the one
// copy of the university's placement table; actScoreResolver.js, degreeBuilder.js, the prerequisite hint and
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

import { POOL_COURSES } from './poolResolver'

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
  if (planRequiresCalculusII(slots)) return 'returning'
  return studentType === 'returning' ? 'returning' : 'new'
}

/** Whether the plan's department map puts MATH1920 in a semester: Calculus II is required of every student on it (engineering). */
export function planRequiresCalculusII(slots) {
  return (slots ?? []).some(s => s.class_code === 'MATH1920' && s.map_semester != null)
}

// ── placement chains ─────────────────────────────────────────────────────────
//
// The math courses a student takes, from the placement course onward. Slots for the other chain courses are archived
// as 'not_applicable' by the degree builder; onboarding shows the chain. The Prototype's math_sequences.json repeats the
// two tables below for the seed side (it reads only the top track): keep them in step.

export const ALL_MATH_CHAIN_CODES = new Set([
  'MATH1000', 'MATH1710', 'MATH1720', 'MATH1730',
  'MATH1904', 'MATH1906', 'MATH1910', 'MATH1920', 'MATH2010',
])

const MATH_CHAINS = {
  new: {
    MATH1000: ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH2010'],
    MATH1710: ['MATH1710', 'MATH1720', 'MATH1910', 'MATH2010'],
    MATH1730: ['MATH1730', 'MATH1910', 'MATH2010'],
    MATH1904: ['MATH1904', 'MATH1906', 'MATH2010'],
    MATH1910: ['MATH1910', 'MATH2010'],
  },
  // MATH1920 sits between MATH1910 and MATH2010 (a returning student on the old curriculum)
  returning: {
    MATH1000: ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2010'],
    MATH1710: ['MATH1710', 'MATH1720', 'MATH1910', 'MATH1920', 'MATH2010'],
    MATH1730: ['MATH1730', 'MATH1910', 'MATH1920', 'MATH2010'],
    MATH1904: ['MATH1904', 'MATH1906', 'MATH2010'],
    MATH1910: ['MATH1910', 'MATH1920', 'MATH2010'],
  },
}

// From each placement to Calculus I (MATH1906 stands in for MATH1910 downstream: requirementMap.js)
const LEAD_IN = {
  MATH1000: ['MATH1000', 'MATH1710', 'MATH1720', 'MATH1910'],
  MATH1710: ['MATH1710', 'MATH1720', 'MATH1910'],
  MATH1730: ['MATH1730', 'MATH1910'],
  MATH1904: ['MATH1904', 'MATH1906'],
  MATH1910: ['MATH1910'],
}

/**
 * The placement-chain courses a student starting in `startCode` takes on this plan. A plan whose department map requires
 * Calculus II (engineering) is read from its own slots: the lead-in to Calculus I, then MATH1920 and MATH2010 where the
 * plan has them (Nuclear Engineering has no MATH2010; a student who starts in MATH1904 still takes MATH1920). Any other
 * plan follows the two tables above, as it always has.
 */
export function mathChainFor(startCode, slots, studentType) {
  if (planRequiresCalculusII(slots)) {
    const onward = ['MATH1920', 'MATH2010'].filter(code => slots.some(s => s.class_code === code))
    return [...(LEAD_IN[startCode] ?? LEAD_IN.MATH1910), ...onward]
  }
  return MATH_CHAINS[mathCurriculumFor(slots, studentType)][startCode] ?? ['MATH1910', 'MATH2010']
}

/**
 * What onboarding shows as the math sequence: the chain, then the rest of the plan's own required math in the department's
 * order (`later`: Calculus III and Differential Equations in the engineering maps), then the statistics choice when the plan
 * has a statistics slot (`fork`). None of the last two is assumed: a plan without them shows neither.
 */
export function mathSequenceFor(startCode, slots, studentType) {
  const chain = mathChainFor(startCode, slots, studentType)
  const taken = new Set(chain)
  const later = (slots ?? [])
    .filter(s => !s.is_pool && /^MATH[0-9]{4}$/.test(s.class_code) && !ALL_MATH_CHAIN_CODES.has(s.class_code) && !taken.has(s.class_code))
    .sort((a, b) => (a.map_semester ?? 99) - (b.map_semester ?? 99) || a.class_code.localeCompare(b.class_code))
    .map(s => s.class_code)
  const fork = (slots ?? []).some(s => s.is_pool && s.class_code === 'MATH_STATS') ? [...(POOL_COURSES.MATH_STATS ?? [])] : []
  return { chain, later: [...new Set(later)], fork }
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
