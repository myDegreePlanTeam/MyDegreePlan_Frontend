// whatIfLoader.js
//
// The reads behind a what-if (lib/whatIf.js): a candidate program's slots for the plan year it would follow, its name and hours, and the
// catalog rows (courses, prerequisites, corequisites) its courses need, which the student's own plan may not have loaded. Nothing is written.
//
//   loadCandidate(client, row)                      -> { candidate, catalog }   row is a student_programs row (lib/addProgram.js newProgramRow)
//   loadCandidates(client, rows)                    -> { candidates, catalog, error }   many at once, one catalog read for all
//   extendBase(base, catalog)                       -> base with the candidate's courses and requirement maps added (the student's own win)
//   minorRows(minors, { studentId, season, year, plans })  -> the rows to try, one per minor with a plan for the term

import { fetchRequirementSlots } from './requirementSlots.js'
import { fetchProgramInfo } from './programSlots.js'
import { fetchPlannerCatalog } from './plannerCatalog.js'
import { buildRequirementMap } from './requirementMap.js'
import { newProgramRow } from './addProgram.js'

const SLOT_COLUMNS = 'id, semester_number, slot_order, class_code, is_pool, flex_credits, map_semester'
const SLOT_ORDER = [{ column: 'semester_number' }, { column: 'slot_order' }]

async function readSlots(client, row) {
  const { data, error } = await fetchRequirementSlots(client, row.concentration_id, row.catalog_year, SLOT_COLUMNS, SLOT_ORDER)
  return { slots: data ?? [], error }
}

function candidateOf(row, slots, info) {
  return {
    programId: row.concentration_id,
    role: row.role === 'minor' ? 'minor' : 'major',
    slots,
    totalHours: info?.total_hours ?? null,
    genedProgram: row.gened_program,
    name: info?.name ?? 'this program',
  }
}

function catalogOf(read) {
  return {
    courses: Object.fromEntries((read.courses ?? []).map(c => [c.code, c])),
    prereqMap: buildRequirementMap(read.prereqs ?? []),
    coreqMap: buildRequirementMap(read.coreqs ?? []),
  }
}

export async function loadCandidates(client, rows) {
  const reads = await Promise.all(rows.map(row => readSlots(client, row)))
  const failed = reads.find(r => r.error)
  if (failed) return { candidates: [], catalog: catalogOf({}), error: failed.error }
  const { data: info, error: infoError } = await fetchProgramInfo(client, rows.map(r => r.concentration_id))
  if (infoError) return { candidates: [], catalog: catalogOf({}), error: infoError }
  // One catalog read per candidate, not one for all: a minor's hours bucket names hundreds of courses, and a request that lists every
  // course of thirty minors would be longer than the Docker API accepts.
  const catalogReads = await Promise.all(reads.map(r => (r.slots.length ? fetchPlannerCatalog(client, r.slots) : {})))
  const failedCatalog = catalogReads.find(r => r.error)
  if (failedCatalog) return { candidates: [], catalog: catalogOf({}), error: failedCatalog.error }
  const merged = {
    courses: catalogReads.flatMap(r => r.courses ?? []),
    prereqs: catalogReads.flatMap(r => r.prereqs ?? []),
    coreqs: catalogReads.flatMap(r => r.coreqs ?? []),
  }
  return { candidates: rows.map((row, i) => candidateOf(row, reads[i].slots, info[row.concentration_id])), catalog: catalogOf(merged), error: null }
}

export async function loadCandidate(client, row) {
  const { candidates, catalog, error } = await loadCandidates(client, [row])
  return { candidate: candidates[0] ?? null, catalog, error }
}

/** The student's base with the candidates' catalog rows added. What the student's own plan already loaded wins. */
export function extendBase(base, catalog) {
  return {
    ...base,
    courses: { ...catalog.courses, ...base.courses },
    prereqMap: { ...catalog.prereqMap, ...base.prereqMap },
    coreqMap: { ...catalog.coreqMap, ...base.coreqMap },
  }
}

/** The student_programs rows to try for each minor that has a plan for the declared term. */
export function minorRows(minors, { studentId, season, year, plans }) {
  return minors.map(program => newProgramRow({ studentId, program, plans, season, year, role: 'minor' })).filter(Boolean)
}
