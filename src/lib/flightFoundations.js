// flightFoundations.js
//
// Tennessee Tech's "Flight Foundations" general education program — the baseline
// every major on campus follows for entering students from Fall 2026 on.
// Pure functions only: no Supabase calls, no React, no side effects.
//
// Sources (all three agree, apart from the notes flagged below):
//   https://undergrad.catalog.tntech.edu/ugrequirements/requirements  (hours, rules)
//   https://undergrad.catalog.tntech.edu/ugrequirements/gened         (course lists)
//   https://www.tntech.edu/strategic/flight-foundations.php           (language cap, SLOs)
//   https://www.tntech.edu/strategic/flight-foundations-courses.php   (course lists)
//
// Program shape: 41 hours = 37 fixed by category + 4 flexible.  The 4 flex hours
// may only be spent inside the three ranged categories (Humanities, Scientific
// Reasoning, Financial/Digital Literacy), "no more, no less".  Their minimums
// total 13 and their maximums 21, so the ranged categories carry exactly 17 hrs
// of the 41 (13 minimum + 4 flex).
//
// Data notes (course eligibility is on the published pages only — Coursedog has no
// gen-ed attribute on course records, and its internal FF course sets lag the
// pages):
//   - POLS1100 appears on the tntech.edu list but not the catalog gen-ed page.
//     It is an active 3-hr course, so it is included.
//   - PHYS2110/PHYS2120 list 4 hrs on the pages but 5 in the catalog; MUS2080
//     lists 3 hrs on the pages but 2 in the catalog; DLED2000 is a 1–3 hr variable
//     course.  Default credits below follow the pages; every evaluation takes the
//     caller's actual credits when they are known.
//   - No course is eligible for more than one category (checked against the pages).

// ── Program constants ─────────────────────────────────────────────────────────

export const FF_PROGRAM_CODE = 'flight_foundations'
export const LEGACY_PROGRAM_CODE = 'legacy'

export const FF_TOTAL_HOURS = 41

// First entering term on Flight Foundations.  The legacy program stays in effect
// for students entering through Summer 2026.
export const FF_FIRST_ENTRY_TERM = { season: 'Fall', year: 2026 }

// ── Categories ────────────────────────────────────────────────────────────────
// min === max  → fixed category (hours count "no more, no less").
// min <  max   → ranged category; draws on the shared flex hours.
// COMM_COMP and COMM_ORAL together form the 9-hr Communication category; they are
// tracked separately because the program fixes 6 composition + 3 oral hours.

export const FF_CATEGORIES = [
  {
    code: 'COMM_COMP', group: 'Communication', label: 'English Composition', min: 6, max: 6,
    courses: ['ENGL1010', 'ENGL1020'],
  },
  {
    code: 'COMM_ORAL', group: 'Communication', label: 'Oral Communication', min: 3, max: 3,
    courses: ['COMM2025', 'PC2500', 'NURS2600'],
  },
  {
    code: 'QR', group: 'Quantitative Reasoning and Analysis', label: 'Quantitative Reasoning and Analysis', min: 3, max: 3,
    courses: [
      'MATH1010', 'MATH1420', 'MATH1530', 'MATH1630', 'MATH1710', 'MATH1720', 'MATH1730',
      'MATH1830', 'MATH1845', 'MATH1904', 'MATH1910',
    ],
  },
  {
    code: 'HIST', group: 'Historical Foundations', label: 'Historical Foundations', min: 6, max: 6,
    courses: ['HIST2010', 'HIST2020'],
  },
  {
    code: 'SOC', group: 'Social and Behavioral Sciences', label: 'Social and Behavioral Sciences', min: 6, max: 6,
    courses: [
      'ECON2010', 'ECON2020', 'ESS1100', 'EXPW2015', 'GEOG1012', 'GEOG1130', 'JOUR1110',
      'NURS2400', 'POLS1030', 'POLS1100', 'PSY1030', 'SOC1010', 'WGS2010',
    ],
  },
  {
    code: 'HUM', group: 'Humanities and Cultural Expression', label: 'Humanities and Cultural Expression', min: 6, max: 9,
    courses: [
      'ART1035', 'ART2000', 'ART2020', 'ART3170', 'ART3190', 'ENGL2130', 'ENGL2235', 'ENGL2330',
      'ENGL2400', 'ENGL2550', 'FLST2520', 'FREN1010', 'FREN2510', 'GERM1010', 'GERM2520',
      'HIST1310', 'HIST2210', 'HIST2220', 'HIST2310', 'HIST2320', 'MUS1030', 'PHIL1030', 'PHIL2250',
      'RELS2010', 'SPAN1010', 'SPAN1015', 'SPAN2510', 'SPAN2550', 'THEA1030',
    ],
  },
  {
    code: 'SCI', group: 'Scientific Reasoning', label: 'Scientific Reasoning', min: 4, max: 8,
    courses: [
      'ASTR1010', 'ASTR1020', 'BIOL1010', 'BIOL1020', 'BIOL1090', 'BIOL1113', 'BIOL1123',
      'BIOL2010', 'BIOL2020', 'BIOL2310', 'CHEM1010', 'CHEM1020', 'CHEM1090', 'CHEM1110',
      'CHEM1120', 'CHEM1410', 'CHEM1710', 'GEOG2100', 'GEOL1040', 'GEOL1045', 'GEOL1090',
      'PHYS1090', 'PHYS2010', 'PHYS2020', 'PHYS2110', 'PHYS2120',
    ],
  },
  {
    code: 'LIT', group: 'Financial Literacy or Digital Literacy', label: 'Financial Literacy or Digital Literacy', min: 3, max: 4,
    courses: [
      'CSC2220', 'CSC2570', 'DLED2000', 'DS2810', 'ENGL2600', 'PC2600', 'FIN2000', 'HEC3011',
      'JOUR1500', 'MUS2080', 'PRST3130',
    ],
  },
]

// Hours a course carries toward its category when the caller gives no credits.
// Everything not listed here is 3.
const DEFAULT_CREDITS = {
  MATH1730: 5,
  MATH1910: 4,
  ASTR1010: 4, ASTR1020: 4,
  BIOL1010: 4, BIOL1020: 4, BIOL1090: 4, BIOL1113: 4, BIOL1123: 4,
  BIOL2010: 4, BIOL2020: 4, BIOL2310: 4,
  CHEM1010: 4, CHEM1020: 4, CHEM1090: 4, CHEM1110: 4, CHEM1120: 4, CHEM1410: 4, CHEM1710: 4,
  GEOG2100: 4, GEOL1040: 4, GEOL1045: 4, GEOL1090: 4,
  PHYS1090: 4, PHYS2010: 4, PHYS2020: 4, PHYS2110: 4, PHYS2120: 4,
}

// Introductory foreign-language courses.  Flight Foundations lets only 3 hrs of
// these count toward Humanities and Cultural Expression.
export const FF_INTRO_LANGUAGE_COURSES = ['FREN1010', 'GERM1010', 'SPAN1010', 'SPAN1015']
export const FF_INTRO_LANGUAGE_CAP = 3

// Cross-listed course codes: one course under two codes, so it counts once.
const CROSS_LISTS = [['ENGL2600', 'PC2600']]

// ── Lookups ───────────────────────────────────────────────────────────────────

const CATEGORY_BY_CODE = new Map(FF_CATEGORIES.map(c => [c.code, c]))

const CATEGORY_BY_COURSE = new Map()
for (const cat of FF_CATEGORIES) {
  for (const course of cat.courses) CATEGORY_BY_COURSE.set(course, cat.code)
}

const CANONICAL_CODE = new Map()
for (const group of CROSS_LISTS) {
  for (const code of group) CANONICAL_CODE.set(code, group[0])
}

const RANGED = FF_CATEGORIES.filter(c => c.min < c.max)

// Hours above the category minimums that the program lets a student spend:
// 41 − (fixed hours + ranged minimums).  Derived, not hardcoded, so the category
// table stays the single source of truth.
export const FF_FLEX_HOURS =
  FF_TOTAL_HOURS - FF_CATEGORIES.reduce((sum, c) => sum + c.min, 0)

/** The FF category a course belongs to ('HUM', 'SCI', …), or null. */
export function getFlightFoundationsCategory(courseCode) {
  return CATEGORY_BY_COURSE.get(courseCode) ?? null
}

/** Category definition by code, or null. */
export function getFlightFoundationsCategoryInfo(categoryCode) {
  return CATEGORY_BY_CODE.get(categoryCode) ?? null
}

/** Course codes eligible for a category ([] for an unknown category). */
export function listFlightFoundationsCourses(categoryCode) {
  return [...(CATEGORY_BY_CODE.get(categoryCode)?.courses ?? [])]
}

/** Every course code eligible anywhere in Flight Foundations. */
export function isFlightFoundationsCourse(courseCode) {
  return CATEGORY_BY_COURSE.has(courseCode)
}

// ── Program selection ─────────────────────────────────────────────────────────
// A student follows the gen-ed program in effect when they enter.  Entry term is
// the plan's start season/year (student_profiles.start_season / start_year).
// Returns null while the entry term is unknown so callers can decide a fallback.

export function getGenEdProgram(season, year) {
  if (!season || !year) return null
  const y = Number(year)
  if (!Number.isFinite(y)) return null
  if (y > FF_FIRST_ENTRY_TERM.year) return FF_PROGRAM_CODE
  if (y < FF_FIRST_ENTRY_TERM.year) return LEGACY_PROGRAM_CODE
  // 2026: only Fall onward is Flight Foundations; Spring and Summer 2026 are legacy.
  return season === FF_FIRST_ENTRY_TERM.season ? FF_PROGRAM_CODE : LEGACY_PROGRAM_CODE
}

// ── Evaluation ────────────────────────────────────────────────────────────────
//
// evaluateFlightFoundations(entries)
//   entries — [{ code, credits? }]: every course the student has completed or
//             planned.  A code is counted once (first entry wins, so put prior
//             credit first).  credits ≤ 0 or missing falls back to the defaults.
//
// Counting rules:
//   1. Each course counts toward its one category; courses outside Flight
//      Foundations are ignored (they are major or elective courses).
//   2. A category counts at most `max` hours; the excess still counts toward the
//      degree total elsewhere but not toward Flight Foundations.
//   3. At most FF_INTRO_LANGUAGE_CAP hours of introductory foreign language count
//      toward Humanities.
//   4. Hours above a ranged category's minimum are flex hours.  Only FF_FLEX_HOURS
//      of them count in total, so a student cannot "buy" a missing minimum in one
//      category with surplus in another.
//   5. The program is satisfied when every category meets its minimum and the flex
//      hours are all spent — equivalently, when totalEarned === 41.
//
// Returns:
//   {
//     categories: [{ code, group, label, min, max, raw, earned, excess, remaining,
//                    satisfied, courses: [{ code, credits }] }],
//     totalRequired, totalEarned, totalRemaining,
//     flex:  { total, used, remaining },
//     languageExcess,            // intro-language hrs beyond the Humanities cap
//     nonFlightFoundation,       // codes ignored (not FF-eligible)
//     satisfied,
//   }
//
//   raw       hours the student has in the category (before any cap)
//   earned    hours counted toward the category, capped at max and (Humanities)
//             the language cap — before the shared flex ceiling is applied
//   excess    raw − earned
//   remaining hours still needed to reach the category minimum

export function evaluateFlightFoundations(entries = []) {
  const seen = new Set()
  const byCategory = new Map(FF_CATEGORIES.map(c => [c.code, []]))
  const nonFlightFoundation = []

  for (const entry of entries ?? []) {
    const rawCode = entry?.code
    if (!rawCode) continue
    const code = CANONICAL_CODE.get(rawCode) ?? rawCode
    if (seen.has(code)) continue
    seen.add(code)

    const categoryCode = CATEGORY_BY_COURSE.get(code) ?? CATEGORY_BY_COURSE.get(rawCode)
    if (!categoryCode) {
      nonFlightFoundation.push(rawCode)
      continue
    }
    const given = Number(entry.credits)
    const credits = given > 0 ? given : (DEFAULT_CREDITS[code] ?? 3)
    byCategory.get(categoryCode).push({ code: rawCode, credits })
  }

  // Introductory language: only the first 3 hrs count toward Humanities.
  let languageExcess = 0
  const humCourses = byCategory.get('HUM')
  const languageRaw = humCourses
    .filter(c => FF_INTRO_LANGUAGE_COURSES.includes(c.code))
    .reduce((sum, c) => sum + c.credits, 0)
  if (languageRaw > FF_INTRO_LANGUAGE_CAP) languageExcess = languageRaw - FF_INTRO_LANGUAGE_CAP

  const categories = FF_CATEGORIES.map(cat => {
    const courses = byCategory.get(cat.code)
    const raw = courses.reduce((sum, c) => sum + c.credits, 0)
    const countable = cat.code === 'HUM' ? raw - languageExcess : raw
    const earned = Math.min(countable, cat.max)
    return {
      code:      cat.code,
      group:     cat.group,
      label:     cat.label,
      min:       cat.min,
      max:       cat.max,
      raw,
      earned,
      excess:    raw - earned,
      remaining: Math.max(0, cat.min - earned),
      satisfied: earned >= cat.min,
      courses,
    }
  })

  // Flex: the hours each ranged category holds above its own minimum.
  const flexHeld = categories
    .filter(c => c.min < c.max)
    .reduce((sum, c) => sum + Math.max(0, c.earned - c.min), 0)
  const flexUsed = Math.min(flexHeld, FF_FLEX_HOURS)

  const minimumsCounted = categories.reduce((sum, c) => sum + Math.min(c.earned, c.min), 0)
  const totalEarned = minimumsCounted + flexUsed
  const satisfied = categories.every(c => c.satisfied) && flexUsed === FF_FLEX_HOURS

  return {
    categories,
    totalRequired:  FF_TOTAL_HOURS,
    totalEarned,
    totalRemaining: FF_TOTAL_HOURS - totalEarned,
    flex: { total: FF_FLEX_HOURS, used: flexUsed, remaining: FF_FLEX_HOURS - flexUsed },
    languageExcess,
    nonFlightFoundation,
    satisfied,
  }
}

// ── Plan adapter ──────────────────────────────────────────────────────────────
// Gathers the courses in a student's plan the same way computePlanCredits does —
// prior credits first, then plan slots, then free-adds, each course code once —
// and evaluates them.
//
// Same argument order as computePlanCredits(planSlots, priorCredits, slots,
// courses, freeAddSlots); `courses` is the courseMap ({ [code]: { credits } }).
//
// `planArchived` ({ [slotId]: reason }) slots are skipped.  A slot archived by a
// prior credit is represented by that prior credit (counted first); a slot
// archived as not_applicable is a course the student will not take — the math
// chain below their placement — and must not count.

export function evaluateFlightFoundationsForPlan(
  planSlots, priorCredits, slots, courses, freeAddSlots = [], planArchived = {},
) {
  const entries = []
  const seen = new Set()
  const add = (code, credits) => {
    if (!code || seen.has(code)) return
    seen.add(code)
    entries.push({ code, credits })
  }

  for (const pc of priorCredits ?? []) {
    if ((pc?.credits_awarded ?? 0) <= 0) continue
    add(pc.satisfies_course_code, pc.credits_awarded)
  }

  for (const slot of slots ?? []) {
    if (planArchived?.[slot.id]) continue
    const code = slot.is_pool ? planSlots?.[slot.id] : slot.class_code
    if (!code) continue
    add(code, courses?.[code]?.credits)
  }

  for (const fa of freeAddSlots ?? []) {
    add(fa?.course_code, courses?.[fa?.course_code]?.credits)
  }

  return evaluateFlightFoundations(entries)
}

// ── Display status ────────────────────────────────────────────────────────────
// The shape the gen-ed panels read (same keys as getGenEdStatus rows, plus the
// range and the shared flex hours), one row per Flight Foundations category.
//
//   { program, satisfied, totalEarned, totalRequired, flex, categories: [
//       { category, label, group, filled, required, max, satisfied, remaining } ] }
//
// `filled` is the hours counted toward the category (capped at its maximum),
// `required` its minimum.  Open seats are not modelled here: unlike the legacy
// three-bucket check there is no fixed seat count to run short of, because the
// fixed categories are filled by dedicated slots and Humanities / Science /
// Literacy flex within their ranges.

export function getFlightFoundationsStatus(
  planSlots, priorCredits, slots, courses, freeAddSlots = [], planArchived = {},
) {
  const ev = evaluateFlightFoundationsForPlan(
    planSlots, priorCredits, slots, courses, freeAddSlots, planArchived,
  )
  return {
    program:       FF_PROGRAM_CODE,
    satisfied:     ev.satisfied,
    totalEarned:   ev.totalEarned,
    totalRequired: ev.totalRequired,
    flex:          ev.flex,
    categories:    ev.categories.map(c => ({
      category:  c.code,
      label:     c.label,
      group:     c.group,
      filled:    c.earned,
      required:  c.min,
      max:       c.max,
      satisfied: c.satisfied,
      remaining: c.remaining,
    })),
  }
}

// ── Plan slot codes ───────────────────────────────────────────────────────────
// Pool codes Flight Foundations templates use, and the category each one fills.
// Historical Foundations has no pool: HIST2010 / HIST2020 are fixed slots.

export const FF_POOL_CATEGORIES = {
  FF_SOCIAL:     'SOC',
  FF_HUMANITIES: 'HUM',
  FF_LITERACY:   'LIT',
}
