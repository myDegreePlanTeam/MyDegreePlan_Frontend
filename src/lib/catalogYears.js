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

/** "B.S. Computer Science" */
export function degreeTitle(group) {
  return [group.degree, group.majorName].filter(Boolean).join(' ')
}

// Profiles saved before catalog years existed carry only their gen-ed program. Those two programs were
// exactly two plans: legacy (every entrant before Fall 2026) and Flight Foundations (Fall 2026 on).
const COMPAT_YEAR = { legacy: '2025-2026', flight_foundations: '2026-2027' }

/** The catalog year of the plan a profile's slots belong to. */
export function catalogYearForProfile(profile) {
  if (profile?.catalog_year) return profile.catalog_year
  return COMPAT_YEAR[profile?.gened_program] ?? COMPAT_YEAR.legacy
}
