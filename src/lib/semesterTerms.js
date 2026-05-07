// Template semesters: Fall → Spring alternating (no Summer in templates)
// Fall → Spring: year +1; Spring/Summer → Fall: year unchanged
const ADVANCE = {
  Fall:   y => ({ season: 'Spring', year: y + 1 }),
  Spring: y => ({ season: 'Fall',   year: y }),
  Summer: y => ({ season: 'Fall',   year: y }),
}

// templateSemNums: sorted int[] from requirement_slots (not free-adds, not extras)
// extraTerms: { [semNum]: { season, year } } — user-added semesters only
export function computeSemesterTerms(startSeason, startYear, templateSemNums, extraTerms = {}) {
  const result = {}
  let season = startSeason
  let year   = startYear
  for (const n of templateSemNums) {
    result[n] = { season, year }
    const next = ADVANCE[season](year)
    season = next.season
    year   = next.year
  }
  for (const [n, term] of Object.entries(extraTerms)) {
    if (term?.season && term?.year) result[n] = term
  }
  return result
}

export function formatTermLabel(term) {
  return term ? `${term.season} ${term.year}` : null
}

// Returns the next term in the Fall → Spring → Fall sequence
export function advanceTerm(term) {
  if (!term) return null
  return ADVANCE[term.season](term.year)
}

// For graduation display: last non-Summer semester in the sorted list
export function lastNonSummerTerm(termMap, allSemNums) {
  const candidates = allSemNums.filter(n => termMap[n]?.season !== 'Summer')
  if (!candidates.length) return null
  return termMap[candidates[candidates.length - 1]]
}
