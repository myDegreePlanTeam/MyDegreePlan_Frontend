# Branch: `fix/concentration-switch-clears-notes`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: one bug, one async handler, one new Supabase delete call.

---

## What This Branch Does

Closes the state-leak in `DegreePlan.handleConcentrationSwitch`. The handler currently
wipes `student_plan_slots`, `student_free_add_slots`, and `prior_credits` for the
student but never touches `student_semester_notes`. Old per-semester notes and
`completed_by_student` flags persist across concentration switches.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-7 (High)** — `handleConcentrationSwitch` does not clear
   `student_semester_notes` rows for the student.

### Audit-impact reconciliation

The 2026-04-17 audit framed the impact as: *"a student who marked Semester 3 complete
on Core, then switched to HPC, will see HPC's Semester 3 auto-collapsed."* That
framing pre-dates the per-concentration scoping of `student_semester_notes`. The
table is keyed by `(student_id, concentration_id, semester_number)` (Tier 9; on-conflict
clause at `DegreePlan.jsx:746`), and the loader read at `DegreePlan.jsx:241–242`
filters by `concentration_id`. So old-concentration notes do **not** leak into
the new concentration's UI.

The latent problem from the audit is still real:

- **Switch-back resurrection.** Core notes (incl. `completed_by_student`) survive a
  switch to HPC and reappear if the student switches back to Core, even though all
  their plan slots, free-adds, and prior credits were wiped on the first switch.
  That state mismatch is the visible bug today.
- **Orphan accumulation.** Rows for past concentrations linger indefinitely. Cheap
  to fix; ugly to leave.

The fix is the audit's first suggested option: delete `student_semester_notes` in
the same transaction shape as the other three deletes. Schema-side keyspacing
(option B) is already done — no schema change needed.

---

## Out of Scope

Do not touch on this branch, even if noticed:

- The `student_semester_notes` schema. No migration needed.
- Completion semantics — semester-level completion stays the only completion model
  per `CLAUDE.md` core principle 3.
- Local React state hygiene beyond what's already in the handler. The handler
  relies on the loader (deps `[profile.concentration_id]`, `DegreePlan.jsx:289`)
  to refresh `planSemesterCompleted`, `semesterNotes`, `semesterExpanded`,
  `planSlots`, etc. Don't add state-reset calls beyond the existing
  `setPriorCredits([])`.
- BUG-13 (later-completed semesters bleeding into earlier prereq resolution) —
  related but a separate concern, separate branch.
- BUG-33 (`creditsBefore` doesn't count manually-completed semester credits) —
  coordinates with the future `fix/mark-complete-behavior` branch per
  `BRANCH_QUEUE.md`.
- Any other bug from `bug.md`. One branch, one concern.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/concentration-switch-clears-notes`.
2. Run `npm run test`. Baseline: **9 files, 210 tests passed**. If it does not match,
   stop and report.
3. Read in full before editing:
   - `src/components/DegreePlan.jsx` lines 32–80 (state declarations),
     237–289 (loader, especially the notes read at 238–249 and the deps array at 289),
     726–754 (`handleSemesterComplete` upsert; confirms the on-conflict key shape),
     978–1002 (`handleConcentrationSwitch`).
4. Confirm the existing reads/writes against `student_semester_notes` use
   `student_id` (not `plan_id`). The other three deletes filter on `student_id`
   for `student_plan_slots` and `student_free_add_slots`, and on `plan_id` for
   `prior_credits` (the column happens to equal `profile.id` — schema heritage,
   do not change).

---

## Implementation Order

Single bug, single edit. One commit.

1. **BUG-7** — add the `student_semester_notes` delete inside
   `handleConcentrationSwitch`.

---

## Plan

### `src/components/DegreePlan.jsx` `handleConcentrationSwitch` (L979–1002)

Insert a fourth Supabase delete between the existing `student_free_add_slots`
delete and the `prior_credits` delete. Mirror the fire-and-forget pattern of the
two non-blocking deletes already present (no error-bail-out — those deletes
already silently swallow errors, and adding a bail-out here would diverge from
the surrounding handler's style; flag for refactor in a future branch if desired).

Before:

```js
await supabase.from('student_free_add_slots').delete().eq('student_id', profile.id)
await supabase.from('prior_credits').delete().eq('plan_id', profile.id)
```

After:

```js
await supabase.from('student_free_add_slots').delete().eq('student_id', profile.id)
await supabase.from('student_semester_notes').delete().eq('student_id', profile.id)
await supabase.from('prior_credits').delete().eq('plan_id', profile.id)
```

Filter by `student_id` only (no `concentration_id` filter). Rationale:

- The three sibling deletes also filter by student id only — switch is treated as
  a "fresh start" for the student's data. Adding a `concentration_id` filter
  would diverge from that pattern and leave orphan rows for any prior
  concentration the student had used.
- Notes are cheap and student-authored; on a switch the student is starting over.
  Re-creating notes is no harder than re-creating plan selections.
- Matches the audit's "Suspected fix: delete in the same transaction."

Do not add error handling or rollback that the surrounding deletes don't already
do — keeping the diff minimal and stylistically consistent with the rest of the
handler.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/DegreePlan.jsx` | BUG-7 | One added delete call inside `handleConcentrationSwitch` |
| `docs/claude/bug.md` | — | Remove BUG-7 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move branch into Merged Branches table on close-out |

No test file changes. No new tests. See **Test Protocol** for rationale.

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline must remain **9 files, 210
tests passed** after the change. The fix is a single Supabase mutation in an
async handler with no pure-logic surface to assert against, and the existing
test suite has no Supabase mocking infrastructure. Adding such infrastructure
for a one-line fix is scope creep.

Manual verification (below) is the bar.

---

## Commit Plan

One commit:

```
fix: clear student_semester_notes on concentration switch (BUG-7)
```

Body should reference BUG-7 by name and the file/handler edited. No co-author
or trailer tags unless project convention requires (none in `git log` history).

---

## Known Constraints

- `student_semester_notes` schema unchanged. The composite key
  `(student_id, concentration_id, semester_number)` is preserved; this branch only
  deletes rows.
- `handleConcentrationSwitch` flow ordering preserved: profile update → plan slots
  delete → free-adds delete → notes delete (new) → prior credits delete →
  local state reset → `onProfileChange` callback (which triggers the loader to
  re-run via the `[profile.concentration_id]` dep).
- No change to RLS policies; the existing delete policy on `student_semester_notes`
  (`rls_migration.sql:111`) already permits a student to delete their own rows.

---

## Manual Verification

Boot the dev server (`npm run dev` from `MyDegreePlan_Frontend/`) and verify in a
browser. Need an authenticated test student with at least one concentration
selected and at least one semester note + completion flag saved.

1. **Switch-back resurrection (primary bug)**
   - Sign in as a test student on the **Core** concentration.
   - Mark Semester 3 complete (semester card collapses).
   - Add a free-text note to Semester 5 ("foo").
   - Open the concentration switcher → switch to **HPC**. Confirm HPC loads
     with no completed semesters and no notes.
   - Switch back to **Core**.
   - **Before fix:** Semester 3 is still marked complete; Semester 5 still has
     "foo" — despite the plan slots, free-adds, and prior credits being empty.
   - **After fix:** Core loads completely fresh. Semester 3 not collapsed.
     Semester 5 note empty.

2. **Same-concentration data isolation (regression check)**
   - On Core with Semester 3 marked complete, refresh the page.
   - Semester 3 must still be marked complete after refresh (we did not switch).
   - Confirms the fix only fires inside the switch handler.

3. **DB-side check (optional, faster than UI)**
   - In Supabase SQL editor:
     `SELECT count(*) FROM student_semester_notes WHERE student_id = '<test-student-id>';`
   - Run before switch (count > 0), run after switch (count = 0).

---

## Post-branch Checklist

- [ ] `npm run test` reports 9 files, 210 tests passed.
- [ ] Manual verification scenarios 1 and 2 pass.
- [ ] `docs/claude/bug.md` — BUG-7 entry removed; severity counts updated
      (High 2 → 1, Total 18 → 17). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches table
      with today's date.
- [ ] `docs/claude/BRANCH_concentration-switch-clears-notes.md` deleted in the
      close-out commit.
- [ ] Merge to `main`. Do not force-push.
