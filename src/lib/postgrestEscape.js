// postgrestEscape.js
//
// PostgREST treats commas, parentheses, and double quotes as structural
// delimiters inside .or() filters. To pass a literal user-supplied value,
// wrap it in double quotes per the PostgREST docs:
//
//     ?or=(code.ilike."%foo,bar%",name.ilike."%foo,bar%")
//
// Inside the quoted region, double quotes and backslashes must be removed
// or escaped. We strip them — the loss of fidelity is acceptable for a
// course-name search (no real TTU course code or name contains a literal
// double quote or backslash).
//
// Use:
//   const safe = escapeIlikeValue(userInput)
//   .or(`code.ilike."%${safe}%",name.ilike."%${safe}%"`)
//
// Closes BUG-12.

export function escapeIlikeValue(value) {
  return String(value ?? '').replace(/[\\"]/g, '')
}
