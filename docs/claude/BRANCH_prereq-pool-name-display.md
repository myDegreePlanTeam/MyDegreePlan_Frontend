# Branch: `fix/prereq-pool-name-display`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: a new pure display helper in `poolResolver.js`, plus replacing seven
> `missing.join(', ')` call sites in `SlotModal.jsx` and `Semester.jsx`.
> No checker signature change, no schema change, no migration.

---

## What This Branch Does

Closes BUG-37: when a course's missing prereq is satisfiable by any course
in a pool (e.g. CSC3040 needs `COMM2025` or `PC2500`, both COMM_REQ
members), the warning surface lists raw codes ("Needs: COMM2025, PC2500")
which freshmen do not recognise. The fix collapses pool-member codes inside
an OR group into the pool's display label ("Needs: Communications") so the
hint is readable without sacrificing precision when the OR group mixes pool
members with individual courses.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-37 (Medium)** — Prereq warnings list individual pool member codes
   instead of the pool name.

`checkPrereqs`/`checkCoreqs` already emit OR groups as a single
parenthesised string (e.g. `"(COMM2025 or PC2500)"`). The display layer
re-derives pool membership from `POOL_COURSES` and rewrites those strings.
**No change to `checkPrereqs` / `checkCoreqs` signatures or return shape**
— per `CLAUDE.md`'s standing rule.

---

## Out of Scope

Do not touch on this branch:

- `src/lib/prereqChecker.js` — neither signature nor return shape changes.
  CLAUDE.md is explicit: the signature must never change.
- `src/lib/classifyPrereq.js` — placement/consent suppression is unaffected.
- `src/lib/poolResolver.js` `POOL_COURSES`, `POOL_LABELS`,
  `resolvePool`, `resolveSatisfiesPool`, `resolveScience`, etc. — these are
  read by the new helper but do not change. Only one new export is added.
- The standing-hint surface (`course.standingHint` in SlotModal) — different
  copy, not part of this bug.
- `getGenEdStatus` and Step 4 wizard sub-pool labelling — that's BUG-43,
  Package K, separate branch.
- `prereqWarnings` / `coreqWarnings` memos in DegreePlan.jsx — they keep
  feeding raw `missing` arrays through to children. The transformation
  happens at render time on the consumer side so each surface picks its own
  copy ("Needs:" vs "Prereq not met:") without conflating the data.
- Any rewording of the existing warning prefixes ("Needs:", "⚠ Prereq not
  met:", "⚠ Coreq not met:"). Same prefixes, just nicer right-hand text.
- New CSS — reuse `modal-prereq-hint`, `slot-prereq-warning`,
  `slot-coreq-warning`.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/prereq-pool-name-display`.
2. Run `npm run test`. Baseline: **11 files, 246 tests passed**. If it does
   not match, stop and report.
3. Read in full before editing:
   - `src/lib/prereqChecker.js` lines 60–77 (`checkCoreqs` OR branch) and
     149–158 (`checkPrereqs` OR branch). Confirm: OR groups emit
     `"(A or B or C)"` strings into `missing`; AND groups push bare codes.
   - `src/lib/poolResolver.js` lines 11–172 (`POOL_COURSES`) and 177–188
     (`POOL_LABELS`). Both are the inputs to the new helper.
   - `src/components/SlotModal.jsx` lines 159–189 (`annotate`) and
     lines 370–384 (modal hint render).
   - `src/components/Semester.jsx` lines 250–456 — the six other
     `missing.join(', ')` sites across pool-slot, non-pool-slot, and
     free-add row variants (lines 316, 321, 377, 382, 451, 456).

---

## Implementation Order

Single bug, three commits:

1. **Helper + tests** — add `formatMissingForDisplay` to `poolResolver.js`,
   write the test suite, no consumers changed yet.
2. **Wire consumers** — replace all seven `.join(', ')` call sites in
   `SlotModal.jsx` and `Semester.jsx` with the helper.
3. **Close-out** — `bug.md`, `BRANCH_QUEUE.md`, delete planning docs.

The split keeps the pure logic reviewable independent of the JSX edits.
Test suite must pass at every commit boundary.

---

## Plan

### Step 1 — `src/lib/poolResolver.js`

Add a new pure helper near the bottom of the file (after
`resolveFreeElective`). No existing code changes.

```js
// ── formatMissingForDisplay ───────────────────────────────────────────────────
// BUG-37: Rewrites the `missing` array returned by checkPrereqs/checkCoreqs
// into a freshman-readable string.  Pool members inside an OR group collapse
// to the pool's display label so "Needs: COMM2025, PC2500" reads as
// "Needs: Communications" — codes outside any pool stay verbatim.
//
// Input shape (per prereqChecker.js):
//   - bare code:      'CSC1300'
//   - OR group:       '(A or B or C)'
//
// Rules for OR groups:
//   - Group every code by its containing pool (POOL_COURSES). A code may be
//     in zero pools (becomes "individual"), exactly one pool (collapse
//     candidate), or multiple pools (use the FIRST pool that has 2+ of the
//     group's codes — falls through to individual otherwise).
//   - For each pool that has 2+ codes in this group, replace those codes
//     with POOL_LABELS[poolCode]. A single pool member alone is NOT
//     collapsed — the prereq genuinely names that one course.
//   - The output OR group joins remaining tokens with ' or '.  When the
//     group reduces to a single token, drop the parentheses entirely.
//
// Returns a single comma-joined string, ready for direct substitution into
// the existing UI surfaces in SlotModal.jsx and Semester.jsx.
export function formatMissingForDisplay(missing) {
  if (!Array.isArray(missing) || missing.length === 0) return ''
  return missing.map(formatOne).join(', ')
}

function formatOne(entry) {
  if (typeof entry !== 'string') return String(entry)
  const m = entry.match(/^\((.+)\)$/)
  if (!m) return entry                                    // bare code
  const codes = m[1].split(' or ').map(s => s.trim()).filter(Boolean)
  if (codes.length <= 1) return entry                     // malformed — leave alone

  // Find a pool that owns 2+ of these codes.
  let chosenPool = null
  let chosenMembers = null
  for (const [poolCode, poolList] of Object.entries(POOL_COURSES)) {
    if (!Array.isArray(poolList)) continue                // skip FREE_ELECTIVE (null)
    const owned = codes.filter(c => poolList.includes(c))
    if (owned.length >= 2 && (!chosenMembers || owned.length > chosenMembers.length)) {
      chosenPool    = poolCode
      chosenMembers = owned
    }
  }

  if (!chosenPool) return entry                           // no collapse opportunity

  const remaining = codes.filter(c => !chosenMembers.includes(c))
  const tokens    = [POOL_LABELS[chosenPool], ...remaining]
  if (tokens.length === 1) return tokens[0]               // single label — no parens
  return `(${tokens.join(' or ')})`
}
```

The helper is exported alongside the existing pool helpers. `POOL_COURSES`
and `POOL_LABELS` are already in scope at the top of the file — no new
imports.

### Step 2 — Test coverage

New file: `src/tests/formatMissingForDisplay.test.js`. Suite covers:

1. Empty input → `''`.
2. Null / undefined input → `''`.
3. Bare code passes through unchanged → `'CSC1300'`.
4. Multiple bare codes → joined with `', '` → `'CSC1300, MATH1910'`.
5. OR group with 2 COMM_REQ members → `'Communications'` (no parens).
6. OR group with 3 GEN_ED History codes → `'General Education'`.
7. OR group with mixed COMM_REQ + non-pool code (`'(COMM2025 or PC2500 or MATH1910)'`)
   → `'(Communications or MATH1910)'` (parens kept, label first).
8. OR group with single pool member (only `'COMM2025'` in group) → leave
   verbatim (no collapse on solo member).
9. OR group with codes from two different pools (e.g. one COMM_REQ + one
   ENG_LIT, both alone) → leave verbatim (no pool has 2+ here).
10. Mixed input (bare code + OR group) → comma-joined and each piece
    formatted independently.

Test count: **246 → 256**.

### Step 3 — `src/components/SlotModal.jsx` (line 377)

Replace:
```jsx
Needs: {course.missing.join(', ')}
```
With:
```jsx
Needs: {formatMissingForDisplay(course.missing)}
```
Add to imports at the top of the file:
```js
import { formatMissingForDisplay } from '../lib/poolResolver'
```

### Step 4 — `src/components/Semester.jsx` (six call sites)

Lines 316, 321, 377, 382, 451, 456 each contain a
`missing.join(', ')` — replace each with
`formatMissingForDisplay(missing)`. Add the import alongside whatever
`poolResolver` exports the file already pulls in (or as a fresh import if
none).

These six sites are pool-slot prereq, pool-slot coreq, non-pool-slot
prereq, non-pool-slot coreq, free-add prereq, free-add coreq. Same
mechanical edit at each.

---

## Open Questions (resolved)

> Per the meta-prompt's quality rules — record judgment calls so a reviewer
> can challenge them.

**Q1 — Mixed pool + individual courses in one OR group.** Flagged in
PACKAGES.md: "how to handle prereqs that mix pool members with individual
courses in one OR group."

*Decision:* Collapse the pool members to the label, keep the individual
course code, join with " or " inside parens. Example:
`"(COMM2025 or PC2500 or MATH1910)"` → `"(Communications or MATH1910)"`.

*Rationale:* preserves the OR semantics for the remaining individual
course; reads as "any Communications class, or specifically MATH1910."
Dropping the individual course would be wrong (it's a real alternative);
listing all codes individually defeats the bug fix.

**Q2 — Single pool member in an OR group.** A group like
`"(COMM2025 or MATH1910)"` has one pool member (COMM_REQ) and one
non-member.

*Decision:* Do not collapse. The prereq named *that specific* COMM_REQ
course, not "any COMM_REQ course." Showing "Communications" would imply
a freedom the prereq does not grant.

*Operational rule:* collapse triggers only when ≥2 codes from the same
pool are present in one OR group.

**Q3 — Pool label phrasing.** POOL_LABELS values are nouns ("Natural
Science", "Communications"). Adding " class" or " course" reads more
naturally for some pools but awkwardly for others ("CSC Lower Elective
class" is wrong).

*Decision:* Use `POOL_LABELS` verbatim. The full warning text becomes
`"Needs: Communications"` / `"⚠ Prereq not met: Natural Science"`. If a
later UX pass wants pool-specific phrasings, introduce a parallel
`POOL_PREREQ_LABELS` map; not blocking for this branch.

**Q4 — Multi-pool overlap.** If `chosenMembers` could fit two different
pools (rare but possible — e.g. CSC2220 is in both `CSC_LOWER_ELECTIVE`
and `CSC_ELECTIVE`), the helper picks whichever pool has more codes in
the group, ties broken by `Object.entries` iteration order.

*Decision:* This is acceptable for the prototype's catalog. The audit
note in `bug.md` lines 538–541 already flags multi-pool overlap as a
known catalog property; choosing a deterministic (if arbitrary) pool is
fine. If a future catalog grows ambiguous OR groups, revisit.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/lib/poolResolver.js` | 37 | Add `formatMissingForDisplay` export + private `formatOne` helper |
| `src/tests/formatMissingForDisplay.test.js` | 37 | New test file, 10 cases |
| `src/components/SlotModal.jsx` | 37 | One import + one render swap (line 377) |
| `src/components/Semester.jsx` | 37 | One import + six render swaps (lines 316, 321, 377, 382, 451, 456) |
| `docs/claude/bug.md` | — | Remove BUG-37 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move into Merged Branches table on close-out |
| `docs/claude/PACKAGES.md` | — | Mark Package I complete on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **11 files, 246 tests
passed**. After fix: **12 files, 256 tests passed** (one new test file with
10 cases; existing files unchanged).

Manual verification (below) is the bar for the rendering surfaces.

---

## Commit Plan

```
fix: collapse pool members in prereq warnings to a single label (BUG-37)

refactor: route SlotModal and Semester prereq hints through formatMissingForDisplay

docs: close out fix/prereq-pool-name-display (BUG-37)
```

Commit 1 lands the helper + tests. Commit 2 wires consumers. Commit 3
closes out. Both behavior commits keep tests green.

---

## Known Constraints

- `checkPrereqs` and `checkCoreqs` signatures and return shapes are
  unchanged. CLAUDE.md core principle: signature is load-bearing.
- `POOL_COURSES` and `POOL_LABELS` remain the single source of truth.
- The helper is pure — no React, no Supabase, no module-level state.
- The OR-group string format `(A or B or C)` is the existing wire format
  between `prereqChecker.js` and the display layer; this branch parses it
  but does not change it.
- Coreq warnings reuse the same helper (their `missing` array uses the
  identical string format).

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Use a CSC plan that
includes CSC3040 (Cybersecurity / DSAI plans). CSC3040's prereq chain
includes the `COMM2025 OR PC2500` group.

1. **Pool collapse on slot row warning (primary repro).**
   - Open a plan with CSC3040 placed in a semester *before* any
     COMM_REQ course is satisfied.
   - **Before fix:** the slot row shows
     `⚠ Prereq not met: COMM2025, PC2500`.
   - **After fix:** the slot row shows
     `⚠ Prereq not met: Communications`.

2. **Pool collapse inside the modal.**
   - Open a `CSC_UPPER_ELECTIVE` (or any) slot earlier than the COMM_REQ
     prereq is satisfied. Look for a course that depends on the
     COMM_REQ pool.
   - **Before fix:** the locked-row hint shows
     `Needs: COMM2025, PC2500`.
   - **After fix:** `Needs: Communications`.

3. **Mixed OR group regression.**
   - If a course in your live catalog has an OR group that mixes a pool
     member with an individual course code (rare), confirm the hint
     reads e.g. `Communications or MATH1910` (label first, individual
     code preserved). If no such course exists in the catalog, this is
     covered by unit test case 7 only.

4. **Bare code regression.**
   - Place a course (e.g. CSC2100) before its single prereq is met.
   - **Expected:** `⚠ Prereq not met: CSC1300` — unchanged from before
     the fix.

5. **Multiple missing groups regression.**
   - Place a course with two unsatisfied prereq groups (one bare, one
     OR-pool).
   - **Expected:** comma-joined display, e.g.
     `⚠ Prereq not met: CSC1300, Communications`.

6. **Coreq regression.**
   - If any course's coreq emits an OR group covered by a pool, confirm
     the same collapse applies to `⚠ Coreq not met: …`.
   - If no such course exists today, the unit tests cover the helper
     either way (it does not branch on prereq vs coreq).

7. **Free-add row regression.**
   - Add a course via free-add whose prereq emits a pool-member OR
     group; confirm the free-add row's warning collapses identically.

---

## Post-branch Checklist

- [ ] `npm run test` reports 12 files, 256 tests passed.
- [ ] Manual verification scenarios 1–7 pass (or are explicitly noted as
      "no live catalog course exercises this; unit tests cover").
- [ ] `docs/claude/bug.md` — BUG-37 entry removed; severity counts
      updated (Medium 8 → 7, Total 15 → 14). Do not renumber remaining
      bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches
      table with today's date.
- [ ] `docs/claude/PACKAGES.md` — Package I marked ✅ COMPLETE; sequence
      strikethrough updated to `~~J~~ → ~~I~~ → K → L → M`. Repo-state
      bug-count update appended.
- [ ] `docs/claude/BRANCH_prereq-pool-name-display.md` deleted in the
      close-out commit.
- [ ] `docs/claude/PROMPT_prereq-pool-name-display.md` deleted in the
      close-out commit (per the 2026-04-29 docs convention).
- [ ] Merge to `main` `--ff-only`. Do not force-push. Do not push to
      origin without explicit go-ahead.
