// courseSearch.js
//
// Course search over the full catalog, one kind at a time (see courseKinds.js). The query matches code or
// name; because the kind is not a column, a generous batch is fetched in code order and filtered here, so the
// result list is not emptied by a kind that sorts late.

import { escapeIlikeValue } from './postgrestEscape'
import { countByKind, courseKind } from './courseKinds'
import { selectWithOptional } from './dbErrors'

const FETCH_LIMIT = 400
const BASE_COLUMNS = 'code, name, credits, subject_code'

/**
 * @returns {Promise<{ rows: Array, all: Array, counts: {undergraduate: number, graduate: number, placeholder: number},
 *                     more: boolean, error: object|null }>}
 *   rows    up to `limit` matches of the chosen kind
 *   all     every match fetched, any kind (see rowsOfKind)
 *   counts  matches of each kind within the fetched batch, for the tab labels
 *   more    true when the batch was full, so counts may undercount
 */
export async function searchCourses(db, text, kind = 'undergraduate', { limit = 40 } = {}) {
  const term = `%${escapeIlikeValue(text.trim())}%`
  const { data, error } = await selectWithOptional(
    columns => db
      .from('courses')
      .select(columns)
      .or(`code.ilike."${term}",name.ilike."${term}"`)
      .order('code', { ascending: true })
      .limit(FETCH_LIMIT),
    BASE_COLUMNS,
    ['credits_max'],
  )
  if (error) return { rows: [], all: [], counts: countByKind([]), more: false, error }
  const all = data ?? []
  return {
    rows: rowsOfKind(all, kind, limit),
    all,
    counts: countByKind(all),
    more: all.length >= FETCH_LIMIT,
    error: null,
  }
}

/** The first `limit` rows of one kind, so a screen can switch tabs without searching again. */
export function rowsOfKind(all, kind, limit = 40) {
  return all.filter(c => courseKind(c.code) === kind).slice(0, limit)
}
