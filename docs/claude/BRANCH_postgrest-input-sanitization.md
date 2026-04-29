# Branch: `fix/postgrest-input-sanitization`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: small helper module, two call-site updates, one test file.

---

## What This Branch Does

Closes the PostgREST `.or()` injection / breakage in the two course-search call
sites. Today both `AddCourseModal` and `PriorCreditWizard` interpolate raw user
input into a `.or()` filter:

```js
.or(`code.ilike.%${term}%,name.ilike.%${term}%`)
```

PostgREST treats commas, parentheses, and double quotes as structural inside
`.or()`. A user typing a comma or parenthesis (real course names contain
parentheses, e.g. `"Calculus II (with Lab)"`) produces an invalid filter the
server rejects; a malicious user could split the filter into unintended
predicates. RLS still scopes results, so exfiltration risk is low — the
user-visible bug is search silently breaking.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-12 (Medium)** — Raw user input interpolated into PostgREST `.or()`
   filters in `AddCourseModal` and `PriorCreditWizard`.

The fix wraps each ilike value in PostgREST's double-quote literal syntax
and strips characters that would break out of the quoted region.

---

## Out of Scope

Do not touch on this branch, even if noticed:

- Other Supabase queries in the codebase. Only `.or()` calls with raw user
  interpolation are affected — verified via grep, only the two named call
  sites match.
- Switching from `.or()` to two sequential `.ilike()` queries with
  client-side merge. The double-quote-literal approach is smaller-diff
  and preserves the single-query shape.
- Search ranking, `_` underscore handling, or `*` wildcard handling. These
  are search-behavior concerns, not safety.
- Adding RLS coverage (the only meaningful security control here is RLS;
  it's already in place per `rls_migration.sql`).

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/postgrest-input-sanitization`.
2. Run `npm run test`. Baseline: **10 files, 237 tests passed**. If it does
   not match, stop and report.
3. Read in full before editing:
   - `src/components/AddCourseModal.jsx` lines 30–64 (the search effect).
   - `src/components/PriorCreditWizard.jsx` lines 219–235 (`handleCourseSearch`).
   - `src/lib/supabaseClient.js` (just to confirm there's no shared query
     helper to extend instead).

---

## Implementation Order

Single bug, tightly scoped. One implementation commit.

---

## Plan

### Step 1 — Helper module

Create `src/lib/postgrestEscape.js`:

```js
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
// course-name search (no real code or course name contains a literal
// double quote or backslash).
//
// Use:
//   const safe = escapeIlikeValue(userInput)
//   .or(`code.ilike."%${safe}%",name.ilike."%${safe}%"`)

export function escapeIlikeValue(value) {
  return String(value ?? '').replace(/[\\"]/g, '')
}
```

### Step 2 — `AddCourseModal.jsx`

Update L43–48. Before:

```js
const q = `%${search.trim()}%`
const { data, error: fetchErr } = await supabase
  .from('courses')
  .select('code, name, credits, subject_code')
  .or(`code.ilike.${q},name.ilike.${q}`)
```

After:

```js
const q = `%${escapeIlikeValue(search.trim())}%`
const { data, error: fetchErr } = await supabase
  .from('courses')
  .select('code, name, credits, subject_code')
  .or(`code.ilike."${q}",name.ilike."${q}"`)
```

Add `import { escapeIlikeValue } from '../lib/postgrestEscape'` at the top.

### Step 3 — `PriorCreditWizard.jsx`

Update L226–230. Before:

```js
const term = val.trim()
const { data } = await supabase
  .from('courses')
  .select('code, name, credits')
  .or(`code.ilike.%${term}%,name.ilike.%${term}%`)
```

After:

```js
const term = escapeIlikeValue(val.trim())
const { data } = await supabase
  .from('courses')
  .select('code, name, credits')
  .or(`code.ilike."%${term}%",name.ilike."%${term}%"`)
```

Add `import { escapeIlikeValue } from '../lib/postgrestEscape'` at the top.

### Step 4 — Tests

New file `src/tests/postgrestEscape.test.js`. Cover:

- Plain alphanumeric input → unchanged.
- Comma in input → preserved (it's safe inside double quotes).
- Parenthesis in input → preserved (safe inside double quotes).
- Double quote in input → stripped.
- Backslash in input → stripped.
- Combined `\"` and `","` injection attempt → all dangerous chars stripped,
  leaving the comma/parens safely contained inside the wrapped quotes.
- Null/undefined input → empty string (defensive).
- Whitespace preserved (the caller trims before passing).

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/lib/postgrestEscape.js` | 12 | New module; one export |
| `src/components/AddCourseModal.jsx` | 12 | Import helper; wrap value in quotes |
| `src/components/PriorCreditWizard.jsx` | 12 | Import helper; wrap value in quotes |
| `src/tests/postgrestEscape.test.js` | 12 | New test file, ~7 cases |
| `docs/claude/bug.md` | — | Remove BUG-12 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move into Merged Branches table on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **10 files, 237 tests
passed**. After fix: 11 files (one new) with new test count.

---

## Commit Plan

One implementation commit, one close-out commit:

```
fix: escape user input in PostgREST .or() course-search filters (BUG-12)

docs: close out fix/postgrest-input-sanitization (BUG-12)
```

---

## Known Constraints

- The double-quote wrapping is part of PostgREST's filter syntax, not SQL.
  Inside the quoted region, ilike's `%` and `_` wildcards still work; the
  caller controls the `%` placement.
- Stripping `\"` and `\\` is destructive: a search for a course actually
  containing a quote would not match. No real TTU course name does, so
  acceptable.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`.

1. **Comma in search.** Open Add Course (any semester). Type a comma in the
   search box.
   - **Before fix:** the request fails (network error, empty results,
     console error) because PostgREST splits on the comma.
   - **After fix:** results return normally; the comma matches inside
     course names that happen to contain it (none in the live catalog —
     no results, but no error).

2. **Parenthesis in search.** Type `(` or `)` in the Add Course search.
   - **Before fix:** request fails.
   - **After fix:** matches course names containing parentheses.

3. **Double-quote sanity.** Type `"` in the Add Course search.
   - Expected: stripped on the client; query runs cleanly with empty filter
     value (matches everything via `%%`); returns the first 40 courses.
     No server error.

4. **Wizard transfer-credit search.** Open the prior-credit wizard's
   transfer step (currently disabled per BUG-26 interim). If accessible
   via a code path, verify the same behaviors. Skip if the wizard's
   transfer search is unreachable in production today.

---

## Post-branch Checklist

- [ ] `npm run test` green; record the new test count in the close-out commit.
- [ ] Manual verification scenarios 1–3 pass.
- [ ] `docs/claude/bug.md` — BUG-12 entry removed; severity counts updated
      (Medium 7 → 6, Total 11 → 10). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches
      table with today's date.
- [ ] `docs/claude/BRANCH_postgrest-input-sanitization.md` deleted in the
      close-out commit.
- [ ] Merge to `main`. Do not force-push.
