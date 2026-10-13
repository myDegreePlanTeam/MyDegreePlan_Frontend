// programSlots.js
//
// Reads what the plan view needs about every program a student follows (lib/studentPrograms.js): each program's requirement slots for the
// plan year it follows, and its name and total hours. The merge itself is lib/programMerge.js; this is the I/O in front of it.
//
//   fetchProgramSlotSets(client, programs, columns, order) -> { data: [{ program, slots }], error }
//   fetchProgramInfo(client, programIds)                   -> { data: { [id]: { id, name, total_hours } }, error }

import { fetchRequirementSlots } from './requirementSlots.js'

/**
 * @param {object} client
 * @param {Array<{ programId: number, catalogYear: string }>} programs  from fetchStudentPrograms, primary first
 * @param {string} columns  select list, as for fetchRequirementSlots
 * @param {Array<{ column: string, ascending?: boolean }>} [order]
 */
export async function fetchProgramSlotSets(client, programs, columns, order = []) {
  const results = await Promise.all(programs.map(program => fetchRequirementSlots(client, program.programId, program.catalogYear, columns, order)))
  const failed = results.find(r => r.error)
  if (failed) return { data: [], error: failed.error }
  return { data: programs.map((program, i) => ({ program, slots: results[i].data ?? [] })), error: null }
}

export async function fetchProgramInfo(client, programIds) {
  const ids = [...new Set(programIds)]
  if (ids.length === 0) return { data: {}, error: null }
  const { data, error } = await client.from('concentrations').select('id, name, total_hours').in('id', ids)
  if (error) return { data: {}, error }
  return { data: Object.fromEntries((data ?? []).map(row => [row.id, row])), error: null }
}
