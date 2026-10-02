// programBrowser.js
//
// How a student finds their program: colleges, then majors, then a major's concentrations, or a search across all of
// them. Pure: it works on the rows of the `concentrations` (programs) table and the college list in data/colleges.json
// (generated from the Prototype repo's degree-specs/colleges.json by `npm run build:catalog`).
//
// A program row carries `college` (a college code), `major_code` (what groups a major with its concentrations: a major
// name used by two degrees is two majors), `is_base` (the program that is the major itself, with no concentration) and
// `aliases` (extra words search matches). A database whose setup step has not added those columns yet returns none of them: the
// helpers then group by `major_name` under one "Other programs" college, so the picker still works.

import collegeList from '../data/colleges.json'
import { compareCatalogYears, yearStart } from './catalogYears'

export const OTHER_COLLEGE = { code: 'other', name: 'Other programs', short: 'Other programs', url: null }

const slug = text => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const byName = (a, b) => a.name.localeCompare(b.name)

/** The major a program belongs to: its code, else its name (an older database has only `major_name`). */
export const majorKeyOf = p => p.major_code ?? slug(p.major_name ?? p.name)

/**
 * Programs grouped college → major, for the picker.
 * @param {Array} programs concentrations rows
 * @param {Array} [colleges] the college list (default: the generated one)
 * @returns {Array<{ college: object, majors: Array<{ key, majorName, degree, department, base, concentrations, programs, concentrationRequired }> }>}
 *   colleges in the list's order (programs with no known college last); majors alphabetical; in a major the base program
 *   first, then the concentrations alphabetical. A major with a base program offers it as "no concentration"; one without
 *   requires a concentration.
 */
export function groupByCollege(programs, colleges = collegeList) {
  const known = new Map(colleges.map((c, i) => [c.code, { college: c, index: i, majors: new Map() }]))
  const other = { college: OTHER_COLLEGE, index: colleges.length, majors: new Map() }
  for (const p of programs ?? []) {
    const bucket = known.get(p.college) ?? other
    const key = majorKeyOf(p)
    let major = bucket.majors.get(key)
    if (!major) {
      major = { key, majorName: p.major_name ?? p.name, degree: p.degree ?? null, department: p.department ?? null, programs: [] }
      bucket.majors.set(key, major)
    }
    major.programs.push(p)
  }
  const out = []
  for (const bucket of [...known.values(), other].sort((a, b) => a.index - b.index)) {
    if (!bucket.majors.size) continue
    const majors = [...bucket.majors.values()].map(m => {
      const flagged = m.programs.filter(p => p.is_base)
      // one program on its own is the major, whether or not the database says so
      const base = flagged[0] ?? (m.programs.length === 1 ? m.programs[0] : null)
      const concentrations = m.programs.filter(p => p !== base).sort(byName)
      return {
        ...m,
        base,
        concentrations,
        programs: [...(base ? [base] : []), ...concentrations],
        concentrationRequired: !base && concentrations.length > 0,
      }
    }).sort((a, b) => a.majorName.localeCompare(b.majorName) || String(a.degree).localeCompare(String(b.degree)))
    out.push({ college: bucket.college, majors })
  }
  return out
}

const words = text => String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * Programs matching a search, best first. Every word typed must start some word of the program's name, major, degree,
 * department, aliases or college ("cyber sec", "mech eng", "cs"). A name or major word counts for more than the rest.
 */
export function searchPrograms(programs, query, colleges = collegeList) {
  const terms = words(query)
  if (!terms.length) return []
  const collegeOf = new Map(colleges.map(c => [c.code, c]))
  const scored = []
  for (const p of programs ?? []) {
    const c = collegeOf.get(p.college)
    const strong = [...words(p.name), ...words(p.major_name), ...words(p.aliases)]
    const weak = [...words(p.degree), ...words(p.department), ...words(c?.short), ...words(c?.name)]
    let score = 0
    let ok = true
    for (const t of terms) {
      if (strong.some(w => w.startsWith(t))) score += 3
      else if (weak.some(w => w.startsWith(t))) score += 1
      else { ok = false; break }
    }
    if (ok) scored.push({ p, score })
  }
  return scored.sort((a, b) => b.score - a.score || byName(a.p, b.p)).map(x => x.p)
}

/**
 * Why a student type has no start term for a program, in words, and the program to offer instead when one replaces it.
 * Said out loud on the start-term step: a student must never be left wondering why a button is dead.
 * @returns {{ text: string, replacement: object|null }}
 */
export function termUnavailableNote(studentType, program, plans, programs = []) {
  const years = (plans ?? []).filter(p => p.concentration_id === program.id && yearStart(p.catalog_year) !== null)
    .map(p => p.catalog_year).sort(compareCatalogYears)
  if (!years.length) return { text: `${program.name} has no degree plan yet.`, replacement: null }
  if (studentType === 'returning') {
    return { text: `${program.name}'s plans begin with the ${years[0]} catalog, so a student who started earlier has no plan here yet.`, replacement: null }
  }
  if (program.last_catalog_year) {
    const replacement = (programs ?? []).find(p => p.supersedes === program.code) ?? null
    return { text: `${program.name} closed to new students after the ${program.last_catalog_year} catalog${replacement ? `; ${replacement.name} replaces it` : ''}.`, replacement }
  }
  return { text: `${program.name} has no plan for a start in these years.`, replacement: null }
}

/** "Engineering › Mechanical Engineering › ME Aerospace", the path a selection is shown as. */
export function programPath(program, colleges = collegeList) {
  if (!program) return null
  const college = colleges.find(c => c.code === program.college)
  const major = program.major_name ?? null
  return [college?.short ?? null, major, program.name === major ? null : program.name].filter(Boolean).join(' › ')
}
