// requirementSlots.js
//
// Loads a program's requirement_slots for one catalog year. A program holds one complete slot set per catalog
// year it has a degree plan for (requirement_slots.catalog_year; see catalogYears.js for how a student's plan is
// chosen). Every reader of the template goes through here so no screen mixes two sets.
//
// A database whose setup step has not added catalog_year yet has only the gen-ed program to tell the two
// original sets apart (legacy / flight_foundations); the read falls back to that.

import { FF_PROGRAM_CODE, LEGACY_PROGRAM_CODE } from './flightFoundations.js'
import { yearStart } from './catalogYears.js'
import { isMissingColumn } from './dbErrors.js'

/**
 * True when a PostgREST error means a column the app reads does not exist yet (Postgres 42703, or one naming
 * gened_program). Lets the app keep working against a database the schema has not reached.
 */
export function isMissingProgramColumn(error) {
  return !!error && (error.code === '42703' || /gened_program|catalog_year/.test(error.message ?? ''))
}

// The two sets that existed before catalog years: Fall 2026 on is Flight Foundations, earlier is legacy.
function genedProgramForYear(catalogYear) {
  return (yearStart(catalogYear) ?? 0) >= 2026 ? FF_PROGRAM_CODE : LEGACY_PROGRAM_CODE
}

/**
 * @param {object} client          data client (see dataClient.js)
 * @param {number} concentrationId the program
 * @param {string} catalogYear     the plan's catalog year, e.g. '2026-2027'
 * @param {string} columns         select list
 * @param {Array<{column: string, ascending?: boolean}>} [order]
 * @returns {Promise<{ data, error, catalogYear }>}
 */
export async function fetchRequirementSlots(client, concentrationId, catalogYear, columns, order = []) {
  const apply = query => {
    // semester_number and slot_order are NULL for most template slots (the degree builder places them), so they tie across almost every
    // row; Postgres returns ties in any order while the local engine returns insertion order, which showed a Docker student a semester's
    // courses in a different order than the web (and could shuffle it when the seed re-ran). id, the last key, makes it the same everywhere.
    const keys = order.some(key => key.column === 'id') ? order : [...order, { column: 'id', ascending: true }]
    for (const { column, ascending = true } of keys) query = query.order(column, { ascending })
    return query
  }
  let cols = columns
  const base = () => client.from('requirement_slots').select(cols).eq('concentration_id', concentrationId)

  const result = await apply(base().eq('catalog_year', catalogYear))
  if (!isMissingColumn(result.error)) return { ...result, catalogYear }

  // A database whose setup step has not added map_semester yet reads without it (no department path). If that
  // is not the missing column, the database is older still (no catalog_year), and the rest reads without it too.
  if (/\bmap_semester\b/.test(columns)) {
    cols = columns.split(',').map(c => c.trim()).filter(c => c !== 'map_semester').join(', ')
    const retry = await apply(base().eq('catalog_year', catalogYear))
    if (!isMissingColumn(retry.error)) return { ...retry, catalogYear }
  }

  // Database without catalog_year: the slots are the original two sets, told apart by gen-ed program.
  const wanted = genedProgramForYear(catalogYear)
  const byProgram = program => apply(base().eq('gened_program', program))
  let legacy = await byProgram(wanted)
  if (isMissingColumn(legacy.error)) legacy = await apply(base())          // not even gened_program: all legacy
  else if (!legacy.error && wanted !== LEGACY_PROGRAM_CODE && (legacy.data ?? []).length === 0) legacy = await byProgram(LEGACY_PROGRAM_CODE)
  return { ...legacy, catalogYear }
}
