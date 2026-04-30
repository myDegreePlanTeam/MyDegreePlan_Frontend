# Branch: `fix/pool-archive-filled-slots`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: one-line removal in the shared matcher in `transferCredits.js`,
> matching test updates, and a comment refresh in `DegreePlan.jsx`. No schema
> change, no migration, no helper extraction.

---

## What This Branch Does

Closes BUG-42: a pool slot already filled with a student-selected course is
not archived when a prior credit's `satisfies_pool` covers the same pool.
Per the resolver contract Rule 2, **pool-credit beats student selection** —
the slot should disappear from the grid and the student's selected course
should remain on the underlying `student_plan_slots` row so an unarchive
restores it.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-42 (Medium)** — Filled pool slots not archived when a prior credit
   covers the same pool.

The fix removes the `if (planSlotsMap[slot.id]) continue` guard inside the
Rule 2 loop in `matchPriorCreditsToSlots` (`transferCredits.js:102`). Rule 2
becomes purely class-code-driven: any pool slot whose `class_code` is named
in a credit-bearing prior credit's `satisfies_pool` archives, regardless of
fill state. `syncArchivedSlots` already reads `planSlots[slot.id]` for the
upserted `selected_course_code` (line 105), so the student's selection is
preserved on the DB row through the archive transition.

Two existing tests assert the prior (now-broken) contract and must flip:
`resolveTransferCredits — does NOT override a pool slot the student already
selected` (lines 215–222) and the parity test `resolveTransferDetails —
skips pool slots the student has already selected` (lines 481–487). These
become the regression tests for the new contract.

---

## Out of Scope

Do not touch on this branch:

- The Rule 1 / Rule 2 ordering or the shared `matchPriorCreditsToSlots`
  signature. Only the inner guard line changes.
- The `SATISFIABLE_POOLS` set.
- `computePlanCredits` or `getTakenCodes` — both already dedup correctly so
  totals do not double-count when a filled pool slot also has a prior credit
  on the same code.
- Pool-slot drag-back restoration (i.e. when the student removes the prior
  credit, restore the pool selection from the DB row). Documented in
  `ROADMAP.md` under "Pool-slot drag-back restoration" — separate work.
  Within a single session, local `planSlots[slot.id]` survives the wizard
  path untouched, so unarchive restores correctly until reload; the cross-
  reload restoration is the deferred half.
- The drag-to-Prior-Coursework branch in `handleDragEnd` (DegreePlan.jsx
  lines 873–894). The explicit upsert + `setPlanSlots` delete remains as
  defensive belt-and-suspenders. Update only the now-stale comment at lines
  873–878 to reflect that Rule 2 archives filled pool slots.
- BUG-43 (GEN_ED sub-pool surfacing) — Package K, separate branch.
- BUG-37 (pool-name prereq display) — Package I, separate branch.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/pool-archive-filled-slots`.
2. Run `npm run test`. Baseline: **11 files, 245 tests passed**. If it does
   not match, stop and report.
3. Read in full before editing:
   - `src/lib/transferCredits.js` lines 52–115 (the shared
     `matchPriorCreditsToSlots` helper). The fix is line 102.
   - `src/tests/transferCredits.test.js` lines 215–222 and 480–487
     (existing assertions of the prior contract). Both need flipping.
   - `src/components/DegreePlan.jsx` lines 87–129 (`syncArchivedSlots` —
     confirm `selected_course_code` is preserved on archive).
   - `src/components/DegreePlan.jsx` lines 873–894 (drag handler comment +
     explicit upsert that this branch leaves in place).

---

## Implementation Order

Single bug, single fix, but split across two commits for review clarity:

1. **Resolver + tests** — change `transferCredits.js`, flip the two
   contract-change tests, add new regression tests for filled-pool archive.
2. **Comment refresh** — update the now-stale comment in
   `DegreePlan.jsx` lines 873–878. No behavior change.

---

## Plan

### Step 1 — `src/lib/transferCredits.js` (line 102)

Remove the fill-state guard inside the Rule 2 loop.

Before (lines 99–102):

```js
  for (const slot of slotList) {
    if (!slot.is_pool) continue
    if (!SATISFIABLE_POOLS.has(slot.class_code)) continue
    if (planSlotsMap[slot.id]) continue
```

After:

```js
  // Rule 2 — explicit satisfies_pool only. Fill state is intentionally
  // NOT a guard: pool credit beats student selection (BUG-42). The
  // student's planSlots[slot.id] is preserved on the upserted DB row by
  // syncArchivedSlots so an unarchive restores it within the session.
  for (const slot of slotList) {
    if (!slot.is_pool) continue
    if (!SATISFIABLE_POOLS.has(slot.class_code)) continue
```

Update the function header comment (lines 62–66) to drop the obsolete
"intentionally skips when planSlots[slot.id] is set" wording — replace with
the new contract.

### Step 2 — `src/tests/transferCredits.test.js`

Flip the two contract tests; add regression coverage for the new behavior.

**a)** Lines 215–222 — invert assertion and rename:

Before:
```js
it('does NOT override a pool slot the student already selected', () => {
  const result = resolveTransferCredits(
    [HIST_TRANSFER_GEN_ED],
    { 3: 'HIST2010' },
    [SLOT_GENED_1]
  )
  expect(result[3]).toBeUndefined()
})
```

After:
```js
it('archives a filled pool slot when satisfies_pool matches (BUG-42)', () => {
  // Pool credit beats student selection. The slot disappears from the
  // grid; the student's selection is preserved on the DB row by
  // syncArchivedSlots for restoration on unarchive.
  const result = resolveTransferCredits(
    [HIST_TRANSFER_GEN_ED],
    { 3: 'HIST2010' },
    [SLOT_GENED_1]
  )
  expect(result[3]).toBe(true)
})
```

**b)** Lines 480–487 — invert the parity assertion the same way; rename
to `'returns details for filled pool slots, matching resolveTransferCredits
(BUG-42 parity)'`. Both `filled[SLOT_GENED_1.id]` and
`details[SLOT_GENED_1.id]` should be defined; `details[...]` should equal
`{ creditType: 'transfer_credit', priorCreditId: HIST_TRANSFER_GEN_ED.id }`.

**c)** Add new positive coverage (in the existing `'pool archiving for
specific courses'` describe block, near line 280):

```js
it('archives both filled SCIENCE pool slots when AP Chem awards SCIENCE x2 (BUG-42)', () => {
  const apChem1 = {
    id: 'pc-chem-1',
    credit_type: 'ap_credit',
    satisfies_course_code: 'CHEM1110',
    satisfies_pool: 'SCIENCE',
    credits_awarded: 4,
  }
  const apChem2 = {
    id: 'pc-chem-2',
    credit_type: 'ap_credit',
    satisfies_course_code: 'CHEM1120',
    satisfies_pool: 'SCIENCE',
    credits_awarded: 4,
  }
  const result = resolveTransferCredits(
    [apChem1, apChem2],
    { [SLOT_SCIENCE.id]: 'CHEM1110', [SLOT_SCIENCE2.id]: 'CHEM1120' },
    [SLOT_SCIENCE, SLOT_SCIENCE2]
  )
  expect(result[SLOT_SCIENCE.id]).toBe(true)
  expect(result[SLOT_SCIENCE2.id]).toBe(true)
})
```

This is the exact reproduction scenario from `bug.md`'s BUG-42 entry.

### Step 3 — `src/components/DegreePlan.jsx` (lines 873–878)

Refresh the now-stale comment in the drag-to-Transfer-Credits pool branch.

Before:
```js
// Explicitly archive the source slot.  Rule 1 (non-pool) does NOT skip
// on planSlots[slot.id] — it would catch this drag — but Rule 2 (pool)
// intentionally skips when planSlots[slot.id] is set, so for pool drags
// syncArchivedSlots cannot archive without unsetting the selection
// first.  This upsert covers both branches and is idempotent if the
// resolver already produced the same archive state.
```

After:
```js
// Explicitly archive the source slot.  After BUG-42, both Rule 1 (non-pool)
// and Rule 2 (pool) match regardless of fill state, so syncArchivedSlots
// will already have archived this slot above.  This upsert remains as
// defensive belt-and-suspenders and is idempotent.
```

No code change in the drag branch — only the comment.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/lib/transferCredits.js` | 42 | Remove Rule 2 fill-state guard; refresh helper header comment |
| `src/tests/transferCredits.test.js` | 42 | Flip 2 contract tests; add 1 BUG-42 regression test |
| `src/components/DegreePlan.jsx` | 42 | Refresh stale drag-handler comment (no logic change) |
| `docs/claude/bug.md` | — | Remove BUG-42 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move into Merged Branches table on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **11 files, 245 tests
passed**. After fix: **11 files, 246 tests passed** (one new BUG-42 regression
test; the two flipped tests do not change the count).

---

## Commit Plan

```
fix: archive filled pool slots when prior credit covers the pool (BUG-42)

refactor: refresh stale drag-handler comment after BUG-42 contract change

docs: close out fix/pool-archive-filled-slots (BUG-42)
```

The `refactor:` commit is comment-only and could be folded into the first
commit if a reviewer prefers — the split here keeps the behavior change
(commit 1) reviewable independent of the doc cleanup (commit 2).

---

## Known Constraints

- `matchPriorCreditsToSlots` signature is unchanged. Both
  `resolveTransferCredits` and `resolveTransferDetails` consume it
  identically.
- One prior credit still archives at most one slot (the
  `usedPriorCreditIds` set is unchanged).
- Rule 1 still wins over Rule 2 by virtue of running first.
- `selected_course_code` preservation on archive depends on
  `syncArchivedSlots` reading `planSlots[slot.id]` at the moment of
  archive — this branch does not alter that path; it relies on it.
- Cross-session restoration of a filled-pool selection after a prior
  credit is removed requires DegreePlan's loadPlan to seed `planSlots`
  from `selected_course_code` even when the row is/was archived. This
  is the existing `ROADMAP.md` "Pool-slot drag-back restoration" item
  and is **not** part of this branch.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Use a CSC plan.

1. **AP Chem STEM archives both filled SCIENCE slots (primary repro).**
   - Fill both SCIENCE pool slots with `CHEM1110` and `CHEM1120`.
   - Open the prior-credit wizard. AP Credit → `Chemistry (STEM)` → Score 5.
     Confirm Step 4 shows two awards (CHEM1110, CHEM1120) both flagged
     `satisfies_pool = 'SCIENCE'`.
   - Apply.
   - **Before fix:** both SCIENCE slots remain visible with their
     selections; only by clearing them does the slot flip to "satisfied
     by AP" (and even then it does not archive).
   - **After fix:** both SCIENCE slots disappear from the grid. Both
     credits appear in the Prior Coursework panel.

2. **Removing the prior credit restores the pool slots within the same session.**
   - With the AP Chem credits applied (and SCIENCE slots archived), drag
     one of the prior-credit rows back onto the originating semester (or
     remove it via whatever UI affords removal).
   - **Expected:** the SCIENCE slot reappears in the grid with the
     student's original `CHEM1110` selection visible (because local
     `planSlots[slot.id]` was untouched by the wizard archive path).
   - Note: a hard reload of the app at this midpoint may show the slot
     empty — that is the deferred ROADMAP item and is **not** a
     regression of this branch.

3. **Empty-pool archive path still works (regression check).**
   - On a fresh plan with no SCIENCE selections, apply AP Chem (STEM)
     score 5.
   - **Expected:** the empty SCIENCE slots disappear, exactly as before
     this branch.

4. **GEN_ED single-pool archive path still works (regression check).**
   - On a fresh plan, apply AP Macroeconomics (or any GEN_ED-pool credit).
   - **Expected:** one GEN_ED slot disappears from the grid; remaining
     GEN_ED slots stay visible.

5. **Drag-to-Transfer-Credits pool drag still works (regression check).**
   - Fill a GEN_ED slot with `HIST2010`.
   - Drag the slot onto the Prior Coursework / Transfer Credits panel.
   - **Expected:** behavior unchanged from before — the drag creates a
     `transfer_credit` prior-credit row with `satisfies_pool = 'GEN_ED'`,
     the slot archives, and the local pool selection is cleared.

6. **Plan-credit totals do not double-count (regression check).**
   - At any point during scenario 1, watch the credits-earned indicator.
   - **Expected:** the SCIENCE pool's contribution is counted once. The
     `computePlanCredits` `seen` set guarantees this — but eyeball
     verify the running total does not jump by an extra +8.

---

## Post-branch Checklist

- [ ] `npm run test` reports 11 files, 246 tests passed.
- [ ] Manual verification scenarios 1–6 pass.
- [ ] `docs/claude/bug.md` — BUG-42 entry removed; severity counts
      updated (Medium 9 → 8, Total 16 → 15). Do not renumber remaining
      bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches
      table with today's date.
- [ ] `docs/claude/BRANCH_pool-archive-filled-slots.md` deleted in the
      close-out commit.
- [ ] `docs/claude/PROMPT_pool-archive-filled-slots.md` deleted in the
      close-out commit (per the 2026-04-29 docs convention).
- [ ] Merge to `main`. Push to origin. Do not force-push.
