# Branch: `fix/prereq-warnings-semester-order`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: two `useMemo` bodies in `src/components/DegreePlan.jsx`. No tests, no
> schema, no new files.

---

## What This Branch Does

Closes the directionality bug in `prereqWarnings` and `coreqWarnings`. Both memos
currently feed codes from any `completed_by_student` semester into the satisfied
set fed to `checkPrereqs` / `checkCoreqs`, regardless of whether that semester
is positionally before or after the course being evaluated.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-13 (Medium)** — A semester marked complete propagates its codes
   bidirectionally. A target course in Sem 3 with a prereq placed in Sem 6 will
   appear prereq-satisfied if the student marks Sem 6 complete.

The fix: drop the redundant `planSemesterCompleted` clause from both memos. The
first clause `p.sem < item.sem` already counts every code in a strictly earlier
semester as satisfied, whether or not its semester is marked complete (per the
established semantic that prior-semester codes are completed for the purposes
of later-semester prereq evaluation). The completion clause's only effect was
to *also* count later-semester completed codes — the bug.

The audit's "Suspected fix" — *"only pull satisfied codes from completed
earlier semesters (positional `semester_number < target.semester_number`)"* —
collapses to "delete the clause" once you observe that the first clause already
handles every earlier semester. No new logic, no new state.

---

## Out of Scope

Do not touch on this branch, even if noticed:

- `checkPrereqs` / `checkCoreqs` signatures — frozen per `CLAUDE.md` core
  principles. The memos call these and that contract is unchanged.
- The `planSemesterCompleted` state itself, the toggle handler
  (`handleSemesterComplete`, `DegreePlan.jsx:729`), the on-grid collapse
  behavior, or `student_semester_notes.completed_by_student` semantics. Only
  the prereq/coreq memo bodies change.
- BUG-33 (`creditsBefore` not counting manually-completed semester credits in
  `SlotModal`). Different memo, different contract — coordinated with
  `fix/mark-complete-behavior` per `BRANCH_QUEUE.md`.
- Refactoring the memo into an extractable pure helper. The fix is two
  deletions; extraction would be scope creep.
- The standing-warnings memo (`DegreePlan.jsx:482`). It does not consult
  `planSemesterCompleted`, so it is unaffected.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/prereq-warnings-semester-order`.
2. Run `npm run test`. Baseline: **10 files, 237 tests passed**. If it does
   not match, stop and report.
3. Read in full before editing:
   - `src/components/DegreePlan.jsx` lines 405–479 (both memos).
   - `src/lib/prereqChecker.js` (the underlying `checkPrereqs` / `checkCoreqs`
     contract — confirm the memos pass `completedCodes` and `availableCodes`
     correctly).
   - `CLAUDE.md` core principles 3 and 6 — completion is semester-level only;
     prereqs use prior-only codes, coreqs use prior+same-semester.

---

## Implementation Order

Single bug, single edit shape applied to two memos. One commit.

---

## Plan

### `src/components/DegreePlan.jsx` `prereqWarnings` memo (L408–435)

Replace the `placed.filter` predicate. Before:

```js
const completedCodes = new Set(
  placed
    .filter(p =>
      p.sem < item.sem ||
      (planSemesterCompleted[p.sem] && p.sem !== item.sem)
    )
    .map(p => p.code)
)
```

After:

```js
const completedCodes = new Set(
  placed
    .filter(p => p.sem < item.sem)
    .map(p => p.code)
)
```

Remove `planSemesterCompleted` from the dependency array (line 435) — no
longer referenced in the body.

### `src/components/DegreePlan.jsx` `coreqWarnings` memo (L440–479)

Same edit, same shape. Before:

```js
const completedCodes = new Set([
  ...placed
    .filter(p =>
      p.sem < item.sem ||
      (planSemesterCompleted[p.sem] && p.sem !== item.sem)
    )
    .map(p => p.code),
  ...priorCodes,
])
```

After:

```js
const completedCodes = new Set([
  ...placed
    .filter(p => p.sem < item.sem)
    .map(p => p.code),
  ...priorCodes,
])
```

Remove `planSemesterCompleted` from the dependency array (line 479).

The `availableCodes` computation that follows (`coreqWarnings` only) is
unaffected — it adds same-semester codes on top of `completedCodes`, and the
fix narrows `completedCodes` correctly without changing the same-semester
union.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/DegreePlan.jsx` | 13 | Two memo bodies, two dependency arrays |
| `docs/claude/bug.md` | — | Remove BUG-13 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move to Merged Branches table on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **10 files, 237 tests
passed**. After fix: same count (no test additions or deletions).

The memos are not directly covered today. The underlying `checkPrereqs` and
`checkCoreqs` are exhaustively covered (see `src/tests/prereqCheckerCoreq.test.js`,
`src/tests/prereqCheckerPlacement.test.js`, `src/lib/__tests__/prereqChecker.test.js`).
The fix here narrows what's fed into those functions — the functions
themselves are unchanged.

Manual verification (below) is the bar. Adding a unit test would require
extracting the memo body into a pure helper — scope creep against the
"minimal diff" rule.

---

## Commit Plan

One implementation commit, one close-out commit:

```
fix: scope completed-semester prereq satisfaction to earlier semesters (BUG-13)

docs: close out fix/prereq-warnings-semester-order (BUG-13)
```

---

## Known Constraints

- `checkPrereqs`/`checkCoreqs` signatures unchanged.
- `student_semester_notes.completed_by_student` schema unchanged.
- The completion toggle's UI effect (collapse the semester card) is
  unchanged. Only the satisfied-set computation in the warning memos
  narrows.
- The first-clause invariant (`p.sem < item.sem` always counts a placed
  code as satisfied for the target's prereqs) is preserved; the established
  semantic that prior-semester codes count regardless of completion remains.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Need a test student on a
plan with at least 7 semesters and a course whose only prereq is in a later
semester.

The cleanest reproduction uses the `csc_core` template:

1. **Setup.** Sign in to a fresh test student on the Core concentration. Look
   for any course in an early semester whose prereq lives in a later semester.
   The `csc_core.json` template generally orders courses such that prereqs
   precede dependents, so you may need to drag a prereq forward to set up the
   bug. Example:
   - Drag `MATH1910` (Sem 1 by default in Core) to Sem 7.
   - Confirm Sem 2's `MATH1920` (depends on MATH1910) shows a "Prereqs needed:
     MATH1910" warning. (If the dependency goes elsewhere, pick any analog
     in the live template.)

2. **Bug reproduction (BEFORE fix).** Mark Sem 7 complete (toggle the
   semester-complete control on Sem 7). Observe Sem 2's MATH1920 warning
   *disappears* — the planner now believes MATH1910 is satisfied because
   Sem 7 is complete. This is the bug.

3. **AFTER fix.** With the fix applied, marking Sem 7 complete leaves Sem 2's
   MATH1920 warning intact. The completion of a *later* semester does not
   feed back into an *earlier* semester's prereq resolution.

4. **Regression check — earlier-semester completion still works.** Drag
   MATH1910 back to Sem 1. Mark Sem 1 complete. Sem 2's MATH1920 should be
   prereq-satisfied (no warning). Confirms that earlier-semester completion
   still propagates correctly via the unchanged first clause.

5. **Coreq variant.** Pick any course/coreq pair across separated semesters
   (e.g. a science lecture/lab pair if the template separates them). Verify
   the same direction-agnostic bug existed for `coreqWarnings` and is fixed
   the same way. (Likely no available reproduction in stock templates;
   skip if not.)

If the live `csc_core` template does not naturally produce a prereq edge
across late-semester boundaries, use any drag-and-drop scenario that puts a
prereq in a later semester than its dependent.

---

## Post-branch Checklist

- [ ] `npm run test` reports 10 files, 237 tests passed.
- [ ] Manual verification scenarios 1–4 pass; scenario 5 if reproducible.
- [ ] `docs/claude/bug.md` — BUG-13 entry removed; severity counts updated
      (Medium 8 → 7, Total 12 → 11). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches table
      with today's date.
- [ ] `docs/claude/BRANCH_prereq-warnings-semester-order.md` deleted in the
      close-out commit.
- [ ] Merge to `main`. Do not force-push.
