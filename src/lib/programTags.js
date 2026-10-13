// programTags.js
//
// What the plan grid says about which program a course belongs to, when a student follows more than one (PLAN_double-major-minor.md,
// Phase 3). Pure. `programsOf` is { [slotId]: programId[] } from lib/programMerge.js: every program a visible slot counts toward.
//
//   programLabels(programs, info)            -> { [programId]: short label }
//   tagsForSlots(programsOf, labels, programs) -> { [slotId]: string[] }   empty for a student with one program: nothing to tell apart
//   dimmedSlots(slots, programsOf, filterId) -> { [slotId]: true }          the slots NOT serving the program picked in the filter
//   filterOptions(programs, labels)          -> [{ id, label }]            the program chips of the filter, primary first

/**
 * A short label for each program: its department (CSC, MNE) when that tells the programs apart, else its name. Two programs of one
 * department (a major and a minor of it) are told apart by name.
 * @param {Array<{ programId: number }>} programs  from lib/studentPrograms.js
 * @param {Record<number, { name?: string, department?: string|null }>} info
 */
export function programLabels(programs, info = {}) {
  const departmentOf = p => info[p.programId]?.department || null
  const count = new Map()
  for (const p of programs) count.set(departmentOf(p), (count.get(departmentOf(p)) ?? 0) + 1)
  return Object.fromEntries(programs.map(p => {
    const department = departmentOf(p)
    const unique = department && count.get(department) === 1
    return [p.programId, unique ? department : (info[p.programId]?.name ?? 'Program')]
  }))
}

export function tagsForSlots(programsOf = {}, labels = {}, programs = []) {
  if (programs.length < 2) return {}
  return Object.fromEntries(Object.entries(programsOf).map(([slotId, ids]) => [slotId, ids.map(id => labels[id]).filter(Boolean)]))
}

export function dimmedSlots(slots = [], programsOf = {}, filterId = null) {
  if (filterId == null) return {}
  return Object.fromEntries(slots.filter(s => !(programsOf[s.id] ?? []).some(id => String(id) === String(filterId))).map(s => [s.id, true]))
}

export function filterOptions(programs = [], labels = {}) {
  if (programs.length < 2) return []
  return programs.map(p => ({ id: p.programId, label: labels[p.programId] ?? 'Program' }))
}
