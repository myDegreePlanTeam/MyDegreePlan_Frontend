// dbErrors.js
//
// A column the app reads may not exist yet on an install whose setup step has not re-run (the Docker
// stack applies its schema at start). Postgres answers 42703 (undefined_column); the local backend never
// fails this way. Callers retry without the optional column rather than breaking the screen.

export function isMissingColumn(error) {
  return !!error && error.code === '42703'
}

/**
 * Runs `run(columns)` with the optional columns, and again without them if the database lacks one.
 * @param {(columns: string) => PromiseLike<{data, error}>} run
 * @param {string} baseColumns      columns every database has
 * @param {string[]} optionalColumns  columns added later (credits_max, requisite_text, ...)
 */
export async function selectWithOptional(run, baseColumns, optionalColumns = []) {
  let optional = [...optionalColumns]
  for (;;) {
    const result = await run([baseColumns, ...optional].join(', '))
    if (!optional.length || !isMissingColumn(result.error)) return result
    // Postgres names the column ("column concentrations.college does not exist"): drop only that one, so an install that
    // has the older optional columns keeps them. A message that names nothing we asked for drops them all, as before.
    const named = /column\s+"?(?:\w+\.)?(\w+)"?\s+does not exist/i.exec(result.error.message ?? '')?.[1]
    optional = named && optional.includes(named) ? optional.filter(c => c !== named) : []
  }
}
