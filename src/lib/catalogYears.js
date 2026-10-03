// catalogYears.js
//
// Which degree plan a student follows, which programs they may choose, and how programs are grouped for the
// picker. Pure: it works on the rows of the `concentrations` (programs) and `degree_plans` tables.
//
// A catalog year is an academic year, "2026-2027": Fall 2026 through Summer 2027. A student is bound to the
// catalog of the year they entered. Each program has one degree plan per catalog year it was revised in; a
// student follows the latest plan that is not newer than their entry year. The year of the plan they actually
// follow is stored on their profile (student_profiles.catalog_year) when they onboard and never recomputed, so
// adding a newer plan later cannot move an existing student's slots.

const YEAR = /^(\d{4})-(\d{4})$/

/** First calendar year of "2026-2027", or null if it is not a catalog year. */
export function yearStart(catalogYear) {
  const m = YEAR.exec(catalogYear ?? '')
  return m && Number(m[2]) === Number(m[1]) + 1 ? Number(m[1]) : null
}

/** The catalog year of an entry term: Fall 2026 is 2026-2027, Spring or Summer 2026 is 2025-2026. */
export function academicYearOf(season, year) {
  // Number('') and Number(null) are 0: a blank year is no year, not the year 0.
  if (year === '' || year == null) return null
  const y = Number(year)
  if (!Number.isInteger(y) || y < 1900 || !['Fall', 'Spring', 'Summer'].includes(season)) return null
  const start = season === 'Fall' ? y : y - 1
  return `${start}-${start + 1}`
}

export function compareCatalogYears(a, b) {
  return (yearStart(a) ?? -Infinity) - (yearStart(b) ?? -Infinity)
}

/**
 * The degree plan a student entering in `entryYear` follows in a program: the latest plan not newer than their
 * entry year. A student who entered before the program's first plan follows that plan when it `covers_earlier`
 * (the first plan stands for every older catalog year); otherwise the program was not offered to them.
 * @param {Array} plans         degree_plans rows
 * @param {number} concentrationId
 * @param {string} entryYear    a catalog year
 * @returns {object|null}
 */
export function planForYear(plans, concentrationId, entryYear) {
  const entry = yearStart(entryYear)
  if (entry === null) return null
  const own = (plans ?? [])
    .filter(p => p.concentration_id === concentrationId && yearStart(p.catalog_year) !== null)
    .sort((a, b) => compareCatalogYears(a.catalog_year, b.catalog_year))
  if (own.length === 0) return null
  const eligible = own.filter(p => yearStart(p.catalog_year) <= entry)
  if (eligible.length > 0) return eligible.at(-1)
  return own[0].covers_earlier ? own[0] : null
}

/** False once a program is closed to the student's catalog year (last_catalog_year, e.g. DSAI after 2025-2026). */
export function isProgramOpen(program, entryYear) {
  if (!program?.last_catalog_year) return true
  const entry = yearStart(entryYear)
  return entry !== null && entry <= yearStart(program.last_catalog_year)
}

/**
 * The programs a student entering in `entryYear` may choose: open to that year, and with a plan for it.
 * The student's current program (`currentId`) is always kept so a settings screen never shows a plan whose own
 * program is missing.
 */
export function availablePrograms(programs, plans, entryYear, { currentId = null } = {}) {
  return (programs ?? []).filter(p =>
    p.id === currentId
    || (isProgramOpen(p, entryYear) && planForYear(plans, p.id, entryYear) !== null))
}

/**
 * Programs grouped under the major they belong to, in id order, for the picker. A major with concentrations
 * lists them together; a major that is its own program is a group of one.
 * @returns {Array<{ majorName: string, degree: string|null, department: string|null, programs: Array }>}
 */
export function groupByMajor(programs) {
  const groups = []
  for (const p of programs ?? []) {
    const name = p.major_name ?? p.name
    let group = groups.find(g => g.majorName === name)
    if (!group) {
      group = { majorName: name, degree: p.degree ?? null, department: p.department ?? null, programs: [] }
      groups.push(group)
    }
    group.programs.push(p)
  }
  return groups
}

/** "Computer Science, B.S.": a major and its degree the way the catalog writes them (B.S.M.E. and B.S.B.A. exist too). */
export function degreeTitle(group) {
  return [group.majorName, group.degree].filter(Boolean).join(', ')
}

// ── start terms ──────────────────────────────────────────────────────────────

/**
 * The first catalog year of the new curriculum (Flight Foundations gen-ed, the 2026 math table). A student who starts in
 * Fall 2026 or later is a new student; one who started before is a returning student, whatever the calendar says today.
 */
export const NEW_CURRICULUM_YEAR = 2026
const SEASONS = ['Fall', 'Spring', 'Summer']
const RETURNING_SPAN = 10   // a returning student may have started up to this many years before the switch
const NEW_SPAN = 6          // and a new one may start up to this many years after it

/** Whether a student starting in this term can follow the program: it is open to that catalog year and has a plan for it. */
export function termAvailable(program, plans, season, year) {
  const entry = academicYearOf(season, year)
  return entry !== null && isProgramOpen(program, entry) && planForYear(plans, program.id, entry) !== null
}

/**
 * The start terms a student of this type can choose, as [{ year, seasons }] in year order. With a program, only the terms in
 * which that program has a plan: a program whose first plan is 2026-2027 has none for a returning student, and that is
 * said out loud rather than hidden. Without one: every term the student type allows.
 */
export function termChoices(studentType, { program = null, plans = [] } = {}) {
  const returning = studentType === 'returning'
  const first = returning ? NEW_CURRICULUM_YEAR - RETURNING_SPAN : NEW_CURRICULUM_YEAR
  const last = returning ? NEW_CURRICULUM_YEAR : NEW_CURRICULUM_YEAR + NEW_SPAN
  const choices = []
  for (let year = first; year <= last; year++) {
    let seasons = SEASONS
    if (year === NEW_CURRICULUM_YEAR) seasons = returning ? ['Spring', 'Summer'] : ['Fall']
    if (program) seasons = seasons.filter(season => termAvailable(program, plans, season, year))
    if (seasons.length) choices.push({ year, seasons })
  }
  return choices
}

/** The newest catalog year any plan is for, or null. */
export function latestCatalogYear(plans) {
  return (plans ?? []).reduce((best, p) => (yearStart(p.catalog_year) !== null && (best === null || compareCatalogYears(p.catalog_year, best) > 0) ? p.catalog_year : best), null)
}

/**
 * The programs a student can choose before saying when they start: those with a plan, split into the ones still open to
 * the newest catalog year and the ones closed to it (DSAI after 2025-2026). A closed program is still a real choice for a
 * returning student, so it is separated, not dropped.
 */
export function splitByOffering(programs, plans) {
  const latest = latestCatalogYear(plans)
  const withPlan = (programs ?? []).filter(p => (plans ?? []).some(pl => pl.concentration_id === p.id))
  return { current: withPlan.filter(p => isProgramOpen(p, latest)), closed: withPlan.filter(p => !isProgramOpen(p, latest)) }
}

/**
 * Whether a plan is only an approximate fit for the term a student started in: a program's first plan stands in for every
 * earlier year (`covers_earlier`), and when that first plan is Flight Foundations it is a catalog the student did not enter under
 * (they started under the legacy gen-ed). The plan is still the department's best map for them, and they are told to confirm it.
 * A legacy first plan covering earlier entrants is the department's own arrangement, not an approximation.
 */
export function isApproximateFit({ entryYear, planYear, genedProgram, coversEarlier = true }) {
  return !!coversEarlier && genedProgram === 'flight_foundations' && yearStart(entryYear) !== null && yearStart(planYear) !== null
    && compareCatalogYears(entryYear, planYear) < 0
}

/** The same question for a saved profile: { entry, plan } catalog years when its plan is an approximate fit, else null. */
export function approximatePlanOf(profile) {
  const entry = academicYearOf(profile?.start_season, profile?.start_year)
  const plan = catalogYearForProfile(profile)
  return entry && isApproximateFit({ entryYear: entry, planYear: plan, genedProgram: profile.gened_program }) ? { entry, plan } : null
}

// Profiles saved before catalog years existed carry only their gen-ed program. Those two programs were
// exactly two plans: legacy (every entrant before Fall 2026) and Flight Foundations (Fall 2026 on).
const COMPAT_YEAR = { legacy: '2025-2026', flight_foundations: '2026-2027' }

/** The catalog year of the plan a profile's slots belong to. */
export function catalogYearForProfile(profile) {
  if (profile?.catalog_year) return profile.catalog_year
  return COMPAT_YEAR[profile?.gened_program] ?? COMPAT_YEAR.legacy
}
