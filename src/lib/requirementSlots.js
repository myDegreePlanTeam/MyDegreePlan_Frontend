// requirementSlots.js
//
// Loads a concentration's requirement_slots for the gen-ed program a student
// follows.  A concentration holds one complete slot set per program
// (requirement_slots.gened_program: 'legacy' | 'flight_foundations'); every
// reader of the template goes through here so none of them mixes the two sets.
//
// A program with no slots for the concentration falls back to legacy — Data
// Science & AI has no Flight Foundations set (it is closed to students entering
// Fall 2026+), and a concentration seeded before tier 21 has only legacy rows.

import { FF_PROGRAM_CODE, LEGACY_PROGRAM_CODE, getGenEdProgram } from './flightFoundations.js'

/**
 * True when a PostgREST error means the tier 21 column does not exist yet
 * (Postgres 42703, "column … gened_program does not exist").  Lets the app keep
 * working, as legacy-only, against a database the migration has not reached.
 */
export function isMissingProgramColumn(error) {
  return !!error && (error.code === '42703' || /gened_program/.test(error.message ?? ''))
}

/** The program a profile follows; anything unrecognised is legacy. */
export function programForProfile(profile) {
  return profile?.gened_program === FF_PROGRAM_CODE ? FF_PROGRAM_CODE : LEGACY_PROGRAM_CODE
}

/**
 * The program a student should start on, from their entry term — used when
 * onboarding writes the profile.  Unknown terms are legacy.
 */
export function programForEntryTerm(season, year) {
  return getGenEdProgram(season, year) ?? LEGACY_PROGRAM_CODE
}

/**
 * @param {object} client          data client (see dataClient.js)
 * @param {number} concentrationId
 * @param {string} program         'legacy' | 'flight_foundations'
 * @param {string} columns         select list; gened_program is always included
 * @param {Array<{column: string, ascending?: boolean}>} [order]
 * @returns {Promise<{ data, error, program }>}  program is the one actually loaded
 */
export async function fetchRequirementSlots(client, concentrationId, program, columns, order = []) {
  const select = /\bgened_program\b/.test(columns) ? columns : `${columns}, gened_program`

  const run = prog => {
    let query = client
      .from('requirement_slots')
      .select(select)
      .eq('concentration_id', concentrationId)
      .eq('gened_program', prog)
    for (const { column, ascending = true } of order) query = query.order(column, { ascending })
    return query
  }

  const wanted = program === FF_PROGRAM_CODE ? FF_PROGRAM_CODE : LEGACY_PROGRAM_CODE
  let result = await run(wanted)
  let loaded = wanted

  // Database not migrated to tier 21: every slot is legacy and there is no
  // gened_program column to select or filter on.
  if (isMissingProgramColumn(result.error)) {
    let legacyQuery = client
      .from('requirement_slots')
      .select(columns.replace(/,?\s*\bgened_program\b/, '').replace(/^\s*,\s*/, ''))
      .eq('concentration_id', concentrationId)
    for (const { column, ascending = true } of order) legacyQuery = legacyQuery.order(column, { ascending })
    return { ...(await legacyQuery), program: LEGACY_PROGRAM_CODE }
  }

  if (!result.error && wanted !== LEGACY_PROGRAM_CODE && (result.data ?? []).length === 0) {
    result = await run(LEGACY_PROGRAM_CODE)
    loaded = LEGACY_PROGRAM_CODE
  }

  return { ...result, program: loaded }
}
