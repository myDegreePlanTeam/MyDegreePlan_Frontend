// studentPrograms.js
//
// The programs a student follows: the primary one on the profile (student_profiles.concentration_id), then the ones they added, a
// second major or a minor (student_programs; PLAN_double-major-minor.md, D1). Every reader that wants the whole list goes through
// here, so none of them has to know where each program is stored.
//
//   fetchStudentPrograms(client, profile) -> { data: StudentProgram[], error }
//   programsFromRows(profile, rows)       -> StudentProgram[]                  (the pure half, for tests and for callers that already hold the rows)
//
//   StudentProgram { id, programId, role: 'major' | 'minor', primary, catalogYear, genedProgram, entrySeason, entryYear, position }
//     id           the student_programs row id; null for the primary, which lives on the profile
//     programId    concentrations.id
//     catalogYear  the plan year the program's slots belong to (resolved when it was added, never recomputed)
//
// The primary comes first and the added programs follow in the order they were added. A profile with no program yet has an empty list.
// student_programs is newer than the rest of the schema: a database that lacks it (an install whose setup step has not re-run) answers
// with the primary alone, as for a student who added nothing.

import { academicYearOf, catalogYearForProfile } from './catalogYears.js'
import { isMissingTable } from './dbErrors.js'

export const PROGRAM_COLUMNS = 'id, concentration_id, role, catalog_year, gened_program, entry_season, entry_year, position'

function primaryOf(profile) {
  if (profile?.concentration_id == null) return null
  return {
    id: null,
    programId: profile.concentration_id,
    role: 'major',
    primary: true,
    catalogYear: catalogYearForProfile(profile),
    genedProgram: profile.gened_program ?? 'legacy',
    entrySeason: profile.start_season ?? null,
    entryYear: profile.start_year ?? null,
    position: 0,
  }
}

/** The primary program of a profile followed by its added programs, from the student_programs rows. */
export function programsFromRows(profile, rows = []) {
  const primary = primaryOf(profile)
  if (!primary) return []
  const added = [...(rows ?? [])]
    // a row for the primary itself is a stray, never a second program
    .filter(row => String(row.concentration_id) !== String(primary.programId))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
    .map(row => ({
      id: row.id,
      programId: row.concentration_id,
      role: row.role === 'minor' ? 'minor' : 'major',
      primary: false,
      // A row written without its plan year follows the year of the term the student declared it.
      catalogYear: row.catalog_year ?? academicYearOf(row.entry_season, row.entry_year) ?? primary.catalogYear,
      genedProgram: row.gened_program ?? 'legacy',
      entrySeason: row.entry_season ?? null,
      entryYear: row.entry_year ?? null,
      position: row.position ?? 0,
    }))
  return [primary, ...added]
}

/**
 * @param {object} client   data client (see dataClient.js)
 * @param {object} profile  a student_profiles row: id, concentration_id, catalog_year, gened_program, start_season, start_year
 * @returns {Promise<{ data: object[], error: object|null }>}
 */
export async function fetchStudentPrograms(client, profile) {
  if (profile?.id == null) return { data: programsFromRows(profile, []), error: null }
  const { data, error } = await client
    .from('student_programs')
    .select(PROGRAM_COLUMNS)
    .eq('student_id', profile.id)
    .order('position', { ascending: true })
    .order('id', { ascending: true })
  if (isMissingTable(error)) return { data: programsFromRows(profile, []), error: null }
  if (error) return { data: [], error }
  return { data: programsFromRows(profile, data), error: null }
}
