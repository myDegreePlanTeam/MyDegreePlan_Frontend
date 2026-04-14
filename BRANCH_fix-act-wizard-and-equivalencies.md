# Branch Context: fix/act-wizard-and-equivalencies

> **Read this file immediately after CLAUDE.md** at the start of any session on this branch.
> Delete this file only right before merging into main.

---

## What This Branch Does

This branch extends the Prior Coursework feature with:

1. **ACT score support** — ACT Score is now a selectable credit type in `PriorCreditWizard` and is validated by `validatePriorCredit`
2. **Unified Prior Coursework panel** — The old separate "Placement & Test Scores" panel was removed; all prior credit types live in one panel
3. **Drag-to-transfer** — A student can drag a filled course from any semester card onto the Prior Coursework panel; the slot is archived and a `transfer_credit` prior credit record is created
4. **Drag-back** — A student can drag a prior credit row from the panel back onto a semester card; the prior credit is deleted and the course is either unarchived (if it was a requirement slot) or re-added as a free-add

---

## Files Changed

### Frontend (`MyDegreePlan_Frontend/`)

| File | Status | Summary |
|---|---|---|
| `src/components/DegreePlan.jsx` | Modified | Unified panel; drag-to-transfer fix; drag-back handler; `PriorCreditDraggableRow` component |
| `src/components/PriorCreditWizard.jsx` | Modified | Added `act_credit` step; cumulative score option logic for ACT |
| `src/components/Semester.jsx` | Modified | Added `act_credit: 'ACT'` to `CREDIT_TYPE_LABELS` |
| `src/lib/validatePriorCredit.js` | Modified | `act_credit` added to `SCORED_EXAM_TYPES` |
| `src/lib/transferCredits.js` | Modified | Rule 1 fix (non-pool planSlots guard removed); `SATISFIABLE_POOLS` expanded |
| `src/tests/validatePriorCredit.test.js` | Modified | 4 new `act_credit` test cases |
| `src/tests/transferCredits.test.js` | Modified | 2 test descriptions updated to match corrected behavior |

### Prototype (`MyDegreePlan_Prototype/`)

| File | Status | Summary |
|---|---|---|
| `migration_tier10.sql` | New | Drops and re-adds CHECK constraints on `test_equivalencies.test_type` and `prior_credits.credit_type` to allow `'act_credit'` |

### Shared seed (`db/seeds/`)

| File | Status | Summary |
|---|---|---|
| `test_equivalencies.sql` | Rewritten | Fixed all column names (`awarded_course_code`, `satisfies_pool`), all `test_type` enum values, and added ACT rows. `ON CONFLICT DO NOTHING` on every INSERT. |

---

## Key Implementation Details

### `validatePriorCredit.js` — act_credit

`act_credit` is treated as a **scored exam type** (same as `ap_credit`, `test_out`, `ib_credit`).
It validates against `test_equivalencies` rows. The wizard prevents the student from entering
a wrong credits value — `credits_awarded` is always read from the matching `test_equivalencies`
row and is never user-editable.

### `PriorCreditWizard.jsx` — ACT cumulative score logic

ACT rows in `test_equivalencies` use `min_score` as a threshold. Step 3 builds cumulative
score options using `lte` logic: for a given score, all rows where `min_score <= score`
apply. The seed data encodes ACT English as two incremental rows:

```
('act_credit', 'ACT English', 27, 'ENGL1010', 3, NULL)   -- score 27+: ENGL1010 only
('act_credit', 'ACT English', 31, 'ENGL1020', 3, NULL)   -- score 31+: ENGL1010 + ENGL1020
```

This means a student with score 31 gets both ENGL1010 and ENGL1020 (6 cr total).

### `transferCredits.js` — Rule 1 fix

**Old behavior (bug):** Rule 1 skipped non-pool slots when `planSlots[slot.id]` was set.
For non-pool slots, `planSlots[slot.id]` is just the fixed `class_code` re-stored as a
side-effect of a semester drag or a prior archiving upsert — it does not mean the student
filled the slot differently. Skipping caused prior credits to fail to archive non-pool slots
that the student had previously moved between semesters.

**Fix:** Removed the `if (planSlots[slot.id]) continue` guard from Rule 1.
The Rule 2 guard (pool slots already selected) is intentional and was NOT changed.

### `transferCredits.js` — SATISFIABLE_POOLS expansion

Added `MATH_STATS`, `CSC_LOWER_ELECTIVE`, `CSC_UPPER_ELECTIVE`, `CSC_ELECTIVE`,
`CSC_HPC_ELECTIVE`, `FREE_ELECTIVE` to `SATISFIABLE_POOLS`. Only the original four
(`GEN_ED`, `ENG_LIT`, `SCIENCE`, `COMM_REQ`) were there before. Any pool slot can now
be archived by a prior credit with `satisfies_pool` set to the slot's `class_code`.

### `DegreePlan.jsx` — Drag-to-transfer archiving

`syncArchivedSlots` (called inside `handleAddPriorCredit`) may miss the source slot when
`planSlots[slot.id]` is set in the stale closure (stale because React batches state updates).
The drag handler explicitly upserts `archived: true` after `handleAddPriorCredit` as a
guaranteed fallback. This upsert is idempotent if `syncArchivedSlots` already ran.

For pool slots, `satisfies_pool: slot.class_code` is set on the prior credit so the
archiving is reversible: when the prior credit is deleted, `syncArchivedSlots` unarchives
the pool slot via Rule 2.

### `DegreePlan.jsx` — Drag-back logic

When a prior credit row is dropped on a semester:

1. Pre-compute `freedSlots` — requirement slots that will be unarchived when this credit
   is deleted (`planArchived[s.id] && !wouldStillArchive[s.id]`).
2. Delete the prior credit (`handleRemovePriorCredit` → `syncArchivedSlots` → unarchives
   any freed slots in their original semesters).
3. If `freedSlots.length === 0` AND `satisfies_course_code` is in the `courses` map,
   add the course as a free-add to the target semester.

Freed requirement slots reappear in their **original** semester (per the degree template
or prior semester drag override), not in the drop target. The student can then drag them
to the desired semester using the existing drag-between-semesters feature.

### `PriorCreditDraggableRow` component

Each row in `TransferCreditsPanel` is wrapped in a `PriorCreditDraggableRow` that uses
`useDraggable({ id: pc.id, data: { type: 'prior_credit', priorCreditId, courseCode } })`.

The `✕` remove button uses `onPointerDown: e.stopPropagation()` to prevent the dnd-kit
PointerSensor from starting a drag when the student clicks to remove.

---

## Database Changes Needed (not yet applied)

Run `migration_tier10.sql` in the Supabase Dashboard SQL Editor before testing `act_credit`
entries end-to-end. The migration is safe to re-run.

Then run the full `db/seeds/test_equivalencies.sql` to populate the `test_equivalencies`
table with corrected data.

**16 rows intentionally omitted from the seed** (all had `awarded_course_code = NULL`,
which violates the NOT NULL constraint). These are listed in the header comment of
`test_equivalencies.sql`. They represent exam/score combinations that place a student
into a course without awarding credit for it (e.g., dual-enrollment SDC electives).
A future migration could add a nullable `placement_course_code` column to handle them.

---

## Known Limitations / Deferred Work on This Feature

- **Drag-back to original semester**: Freed requirement slots reappear in their original
  template semester, not the drop target. No automatic relocation.
- **Pool slot drag-back**: Unarchived pool slots come back empty (pool selection is not
  restored). Student must re-select a course for the pool slot.
- **`act_credit` in `test_equivalencies.test_type` CHECK**: The DB constraint currently
  only allows `'ap_credit'`, `'test_out'`, `'ib_credit'`, `'dual_enrollment'`, `'cambridge'`.
  `migration_tier10.sql` must be applied to allow `'act_credit'` inserts.
- **ACT Math**: No ACT Math rows in the seed (not on tntech.edu equivalency page).
  ACT Math ≥ 27 is handled as `act_placement` (gate only) via `Onboarding.jsx` and is
  already in the DB as `credit_type = 'act_placement'`.
- **Cambridge credit**: `test_type = 'cambridge'` rows are allowed by the DB schema but
  `PriorCreditWizard` does not yet have a Cambridge step.
- **Null `satisfies_course_code` for pool-only drags**: When a pool selection is dragged
  to Prior Coursework, the prior credit gets both `satisfies_course_code` (the selected
  course) AND `satisfies_pool` (the pool code). The Prior Coursework panel displays
  `satisfies_course_code`. If the credit was for a pool with no specific course (edge
  case), the panel shows `'—'`.

---

## Test Count

All 169 tests pass as of this branch state.

```
src/tests/validatePriorCredit.test.js    — 30 tests (4 new act_credit cases)
src/tests/transferCredits.test.js        — 24 tests (2 descriptions updated)
src/tests/computePlanCredits.test.js     — 33 tests
src/tests/planCompleteness.test.js       — (unchanged)
src/tests/prereqCheckerCoreq.test.js     — (unchanged)
src/tests/prereqCheckerPlacement.test.js — (unchanged)
src/lib/__tests__/poolResolver.test.js   — (unchanged)
src/lib/__tests__/prereqChecker.test.js  — (unchanged)
```
