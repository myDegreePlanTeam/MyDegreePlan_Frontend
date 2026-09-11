// requirementMap.js
//
// Builds the prereq / coreq maps every consumer uses from the database rows
// (prerequisite_entries / corequisite_entries) and applies course
// substitutions on the way, so no caller can skip them.
//
//   map shape: { [courseCode]: { [groupIndex]: { logic: 'AND'|'OR', codes: string[] } } }
//
// Pure functions — no Supabase calls, no side effects.

// A requirement on the key course is also met by any listed substitute.
// MATH1904 + MATH1906 (Extended Calculus IA/IB) together equal MATH1910 — the
// catalog says so in MATH1906's description — and MATH1906 requires MATH1904,
// so listing MATH1906 alone stands for the pair. Applies to every course that
// requires MATH1910, including ones added to the catalog later.
export const REQUIREMENT_SUBSTITUTES = {
  MATH1910: ['MATH1906'],
}

// Group DB rows into a requirement map, then apply substitutes.
export function buildRequirementMap(rows, substitutes = REQUIREMENT_SUBSTITUTES) {
  const map = {}
  for (const row of rows ?? []) {
    const groups = (map[row.course_code] ??= {})
    const group  = (groups[row.group_index] ??= { logic: row.logic, codes: [] })
    group.codes.push(row.required_code)
  }
  return withSubstitutes(map, substitutes)
}

// Returns a copy of `map` where an OR group also accepts the substitutes of
// its members, and an AND member with substitutes moves into its own OR group
// (MATH1910 → MATH1910 or MATH1906) — the rest of an AND group must still
// all be met.
export function withSubstitutes(map, substitutes = REQUIREMENT_SUBSTITUTES) {
  const out = {}
  for (const [course, groups] of Object.entries(map)) {
    const next = {}
    let nextIndex = Math.max(-1, ...Object.keys(groups).map(Number)) + 1

    for (const [key, group] of Object.entries(groups)) {
      if (group.logic === 'OR') {
        const codes = [...group.codes]
        for (const code of group.codes) {
          for (const sub of substitutes[code] ?? []) {
            if (!codes.includes(sub)) codes.push(sub)
          }
        }
        next[key] = { logic: 'OR', codes }
        continue
      }

      const kept    = group.codes.filter(c => !substitutes[c])
      const swapped = group.codes
        .filter(c => substitutes[c])
        .map(c => ({ logic: 'OR', codes: [c, ...substitutes[c]] }))
      if (kept.length > 0)         next[key] = { logic: 'AND', codes: kept }
      else if (swapped.length > 0) next[key] = swapped.shift()
      for (const g of swapped) next[nextIndex++] = g
    }

    out[course] = next
  }
  return out
}
