# Branch: `fix/ap-chem-stem-filter`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: one filter line in the wizard's Step 2 exam-loader effect. No schema
> change, no migration, no tests.

---

## What This Branch Does

Closes BUG-35 for the prototype: hide the `Chemistry (Non-STEM)` AP exam row
from the prior-credit wizard's exam list. The seed in
`MyDegreePlan_Prototype/test_equivalencies.sql` ships two AP Chemistry rows —
`Chemistry (STEM)` (awards CHEM1110/CHEM1120, member of the SCIENCE pool) and
`Chemistry (Non-STEM)` (awards CHEM1010/CHEM1020, not in the SCIENCE pool).
Every concentration in this prototype is CSC (a STEM major), so the non-STEM
row is never the correct choice and only adds confusion.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-35 (Medium)** — AP Chemistry offered as both `STEM` and `Non-STEM`
   rows for CSC majors.

The fix: filter exam names matching `(Non-STEM)` in the wizard's Step 2
loader. The filter applies unconditionally — every concentration in this
prototype is STEM. The proper long-term implementation (a `stem_only` column
on `test_equivalencies`, plus a `stem` flag on `concentrations`, plus the
filter gated by the active concentration's flag) is documented in BUG-35's
audit entry and remains deferred until the catalog grows non-STEM programs.

---

## Out of Scope

Do not touch on this branch:

- IB `Chemistry SL` vs `Chemistry HL`. The IB program offers two distinct
  exams (Standard Level and Higher Level) and students know which one they
  registered for. The dual rows there are correct.
- CLEP `test_out` Chemistry. It awards CHEM1010/CHEM1020 unconditionally
  today (`test_equivalencies.sql:226–227`) — that is a separate question
  about whether STEM students should claim CLEP Chem at all. Not this bug.
- Any schema change. No new columns, no new migrations.
- The `Chemistry (STEM)` row, its score thresholds, or its credit awards.
- Other test_equivalencies rows not matching `(Non-STEM)`.
- Step 3 / Step 4 wizard rendering — already correct after BUG-39.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/ap-chem-stem-filter`.
2. Run `npm run test`. Baseline: **11 files, 245 tests passed**. If it does
   not match, stop and report.
3. Read in full before editing:
   - `src/components/PriorCreditWizard.jsx` lines 95–123 (the Step 2 loader
     useEffect — the filter goes inside the dedup loop).
   - `MyDegreePlan_Prototype/test_equivalencies.sql` lines 131–140 (confirms
     the AP Chemistry rows; understand which exam names exist).

---

## Implementation Order

Single bug, single edit. One commit.

---

## Plan

### `src/components/PriorCreditWizard.jsx` Step 2 loader (L108–122)

Add a non-STEM skip inside the dedup loop. Before:

```js
.then(({ data }) => {
  // Deduplicate on (test_name, test_type) so a name that happens to
  // exist in two merged types (hypothetical today, cheap to guard)
  // still shows distinct entries.
  const seen = new Set()
  const options = []
  for (const row of data ?? []) {
    const key = `${row.test_name}|${row.test_type}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ test_name: row.test_name, test_type: row.test_type })
  }
  setExamOptions(options)
  setLoadingExams(false)
})
```

After:

```js
.then(({ data }) => {
  // Deduplicate on (test_name, test_type) so a name that happens to
  // exist in two merged types (hypothetical today, cheap to guard)
  // still shows distinct entries.
  // BUG-35: every prototype concentration is STEM (all CSC), so suppress
  // exam rows whose names mark them as non-STEM equivalents (e.g. AP
  // "Chemistry (Non-STEM)" which awards CHEM1010/CHEM1020 — not useful
  // for STEM majors). Long-term fix is a stem_only column on
  // test_equivalencies + stem flag on concentrations; deferred.
  const seen = new Set()
  const options = []
  for (const row of data ?? []) {
    if (row.test_name?.includes('(Non-STEM)')) continue
    const key = `${row.test_name}|${row.test_type}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({ test_name: row.test_name, test_type: row.test_type })
  }
  setExamOptions(options)
  setLoadingExams(false)
})
```

The `includes('(Non-STEM)')` check generalizes to any future seed rows that
follow the same naming convention, without coupling to the specific
"Chemistry" subject string.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/PriorCreditWizard.jsx` | 35 | One added skip line + comment in Step 2 loader |
| `docs/claude/bug.md` | — | Remove BUG-35 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move into Merged Branches table on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **11 files, 245 tests
passed**. After fix: same count (no test additions; the wizard has no
React-component coverage, and adding it for one filter line is scope creep).

Manual verification (below) is the bar.

---

## Commit Plan

One implementation commit, one close-out commit:

```
fix: hide AP Chemistry (Non-STEM) row from wizard for STEM-only prototype (BUG-35)

docs: close out fix/ap-chem-stem-filter (BUG-35)
```

---

## Known Constraints

- The filter applies unconditionally because every concentration in the
  prototype is STEM. If a future branch adds non-STEM concentrations, the
  filter must become concentration-aware.
- The `(Non-STEM)` substring match is brittle by design — it documents a
  naming convention rather than a structural flag. Long-term fix in BUG-35's
  audit entry is the right path once a non-STEM concentration appears.
- No CSS or other rendering changes. The `examOptions` array shape is
  unchanged.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`.

1. **AP Chemistry filter — primary bug.**
   - Open the prior-credit wizard on a CSC plan. Choose AP Credit on Step 1.
   - On Step 2, scroll to the C-section of the exam list.
   - **Before fix:** both `Chemistry (STEM)` and `Chemistry (Non-STEM)` appear.
   - **After fix:** only `Chemistry (STEM)` appears.

2. **Regression — IB Chemistry SL/HL still both visible.**
   - On Step 1 choose IB Credit.
   - On Step 2 confirm both `Chemistry SL` and `Chemistry HL` appear. They
     are not affected by this fix (no `(Non-STEM)` suffix).

3. **Regression — non-Chemistry exams unaffected.**
   - Browse the AP Credit exam list end-to-end. Confirm every other exam
     still appears.

4. **End-to-end credit award path.**
   - Pick AP `Chemistry (STEM)` → Step 3 score selection (scores 4 and 5)
     → Step 4 credit award (CHEM1110 at 4, CHEM1110+CHEM1120 at 5) →
     Apply. The non-STEM exam is no longer accessible via any path.

---

## Post-branch Checklist

- [ ] `npm run test` reports 11 files, 245 tests passed.
- [ ] Manual verification scenarios 1–4 pass.
- [ ] `docs/claude/bug.md` — BUG-35 entry removed; severity counts updated
      (Medium 8 → 7, Total 15 → 14). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches
      table with today's date.
- [ ] `docs/claude/BRANCH_ap-chem-stem-filter.md` deleted in the close-out
      commit.
- [ ] `docs/claude/PROMPT_ap-chem-stem-filter.md` deleted in the close-out
      commit (per the 2026-04-29 docs convention).
- [ ] Merge to `main`. Push to origin. Do not force-push.
