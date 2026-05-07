# Branch: `fix/credits-and-concentration`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: Two isolated, trivial fixes — heavy-load threshold off by one, and prior credits
> deleted on concentration switch.

---

## What This Branch Does

Fixes two small, independent bugs. Together under ten lines of code change.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-46 (Low)** — Heavy-load credit warning fires at `> 19`; correct threshold is `> 18`
   (≥ 19 should trigger it). Display string also says "19" and must match.
2. **BUG-47 (High)** — `handleConcentrationSwitch` deletes `prior_credits` rows from Supabase
   and clears them from local state on every concentration switch. Prior credits are
   student-level data, not plan-level — they should survive a concentration change.

---

## Non-Goals / Out of Scope

- All other concentration-switch deletes (`student_plan_slots`, `student_free_add_slots`,
  `student_semester_notes`) are correct and must not be touched.
- Reset Plan button (priority report item 3) — deferred to `feat/plan-controls`.
- `handleUndo` / undo stack — deferred to `feat/undo-stack`.
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` — signatures unchanged.
- No schema changes.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/credits-and-concentration`
2. Run `npm run test` from `MyDegreePlan_Frontend/`. Baseline: **13 files, 279 tests passed**.
   Stop and report if it does not match.
3. Read before editing:
   - `src/components/Semester.jsx` lines 60–70 and 155–165
   - `src/components/DegreePlan.jsx` lines 1020–1045 and 1515–1530

---

## Implementation Order

BUG-46 first (Semester.jsx only, no risk), then BUG-47 (DegreePlan.jsx). No dependency between them.

---

## Plan

### BUG-46 — Fix heavy-load threshold in `src/components/Semester.jsx`

**Line 66** — change the ternary guard:

```js
// Before
const creditWarning = totalCr < 12 ? 'low' : totalCr > 19 ? 'high' : null

// After
const creditWarning = totalCr < 12 ? 'low' : totalCr > 18 ? 'high' : null
```

**Line 163** — update the display string:

```js
// Before
: 'Heavy load — more than 19 credits'

// After
: 'Heavy load — more than 18 credits'
```

Both changes are in the same file; commit together.

---

### BUG-47 — Remove prior-credit delete in `src/components/DegreePlan.jsx`

**Line 1036** — delete this line entirely:

```js
// Remove:
await supabase.from('prior_credits').delete().eq('plan_id', profile.id)
```

The sibling deletes on lines 1034–1035 (`student_free_add_slots`, `student_semester_notes`)
are correct and must stay.

**Line 1041** — also remove this line:

```js
// Remove:
setPriorCredits([])
```

Both the DB delete and the local state clear must go together. Removing only the DB
delete would leave prior credits intact in Supabase but cleared from UI state until
the next full reload.

**Lines 1522–1523** — update the switch warning copy:

```js
// Before
Switching to <strong>{selected.name}</strong> will clear all your
current course selections. This cannot be undone.

// After
Switching to <strong>{selected.name}</strong> will clear your
current course selections. Prior credits and placement scores are kept.
```

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/Semester.jsx` | BUG-46 | Lines 66, 163 — threshold `> 19` → `> 18`; label updated |
| `src/components/DegreePlan.jsx` | BUG-47 | Lines 1036, 1041 removed; lines 1522–1523 warning copy updated |

Close-out docs commit:

| File | Change |
|---|---|
| `docs/claude/bug.md` | Remove BUG-46 and BUG-47; update severity counts |
| `docs/claude/BRANCH_QUEUE.md` | `fix/credits-and-concentration` → Merged Branches |
| `docs/claude/BRANCH_credits-and-concentration.md` | Delete this file |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline: **13 files, 279 tests passed**. No new tests required — both fixes are trivial
value/string changes with no extracted logic. Count must remain 279 after all edits.

---

## Commit Plan

Commit 1:
```
fix(semester): correct heavy-load threshold from > 19 to > 18 credits (BUG-46)
```
Body: "Semester.jsx:66 guard was `totalCr > 19`; correct behavior fires at > 18 (i.e. ≥ 19).
Display string on line 163 updated to match."

Commit 2:
```
fix(concentration): retain prior credits on concentration switch (BUG-47)
```
Body: "Prior credits are student-level data, not plan-level. Removed the
prior_credits.delete() Supabase call (line 1036) and the setPriorCredits([]) state clear
(line 1041) from handleConcentrationSwitch. Warning copy updated to clarify prior credits
are retained."

---

## Known Constraints

- `setPriorCredits([])` at line 1041 and the Supabase delete at line 1036 must both be
  removed. Removing only the DB delete leaves prior credits intact in Supabase but clears
  them from in-memory state for the duration of the session.
- The concentration switch warning lives at lines 1520–1525 inside a JSX block. Update
  only the text strings; do not touch the surrounding condition (`isDifferent &&`) or button
  behavior.
- `resolveTransferCredits` already re-evaluates which slots to archive based on the new
  concentration's requirement slots on load — no additional changes needed for prior credits
  to wire back up after a switch.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Use a student plan with at least one
AP/transfer credit entered in Prior Coursework.

**BUG-46:**
1. Build a semester to exactly 19 credits total. Confirm the heavy-load warning appears.
2. Drop to exactly 18 credits. Confirm no heavy-load warning.

**BUG-47:**
1. Enter one AP credit (e.g. AP Calculus AB → MATH1910). Confirm it appears in Prior Coursework.
2. Open the concentration switch modal. Read the warning — confirm it mentions prior credits
   are kept.
3. Switch to a different concentration. After switch completes, confirm Prior Coursework
   still shows the AP credit.
4. Switch back to the original concentration. Confirm Prior Coursework still shows the
   AP credit.

---

## Post-branch Checklist

- [ ] `npm run test` — 13 files, 279 tests passed.
- [ ] Manual verification for BUG-46 (credit threshold) and BUG-47 (prior credits survive) pass.
- [ ] `docs/claude/bug.md` — BUG-46 and BUG-47 entries removed; severity counts updated.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved to Merged Branches table with today's date.
- [ ] `docs/claude/BRANCH_credits-and-concentration.md` deleted in close-out commit.
- [ ] Merge to `main`. Do not force-push.
