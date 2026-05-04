# Branch: `fix/drag-to-prior-coursework-flicker`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: Eliminate the snap-back visual flicker when dragging a requirement slot
> to the Prior Coursework panel by applying an optimistic archive state update.

---

## What This Branch Does

Fixes one low-severity visual polish bug. When a user drags a course from
a semester card onto the Prior Coursework panel, the slot briefly snaps back
to its original semester before disappearing. After this fix the slot
disappears as soon as the drag is released.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-36 (Low)** — Visual flicker when dragging a course to Prior Coursework.
   Drag releases → slot snaps back to semester → slot disappears after async
   completes.

---

## Non-Goals / Out of Scope

- The `free_add → transfer_credits` drag path (lines 896–916) has a related
  timing gap but is NOT in scope for this branch. Flag it in a follow-up if
  desired.
- `Semester.jsx` — check class names only if necessary; do not edit.
- No schema changes.
- No new pool resolver, prereq, or transfer-credit logic.
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` signatures are unchanged.
- `handleAddPriorCredit` signature and behavior are unchanged.

---

## Root Cause (confirmed from code reading)

When drag ends, dnd-kit dismisses the `DragOverlay` and re-renders the source
element at its original DOM position. React sees `planArchived[slot.id]` as
`undefined` / falsy (the state hasn't been updated yet), so the slot re-renders
normally in its semester — the visible "snap back."

The current code path in `handleDragEnd` for `requirement_slot → transfer_credits`
(lines 847–894):

1. Validates the slot and resolves `courseCode`.
2. **`await handleAddPriorCredit({...})`** (line 866) — inserts to Supabase,
   then calls `syncArchivedSlots` which upserts the DB archive row and finally
   calls `setPlanArchived`. All three steps involve network round-trips.
3. A belt-and-suspenders explicit upsert (line 879) archives the slot in the DB.
4. Only inside `if (!archErr)` (line 889) does `setPlanArchived` set the
   slot's local state to archived.

Every render between drag-end and step 4 shows the slot unarchived. The
`free_add → transfer_credits` path has the same issue but is not in scope.

> **Note on CSS hypothesis:** There is no exit animation or transition on
> `.slot-row` that could cause a snap-back visual. The dnd-kit drag release +
> stale `planArchived` is the cause. No devtools profiling needed.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/drag-to-prior-coursework-flicker`.
2. Run `npm run test` from `MyDegreePlan_Frontend/`. Baseline: **13 files,
   266 tests passed**. Stop and report if it does not match.
3. Read in full before editing:
   - `src/components/DegreePlan.jsx` — `handleDragEnd` (lines 837–990) and
     `handleAddPriorCredit` (lines 703–720) in full.
4. Confirm lines 847–894 still match the code excerpts in the Plan section
   below before editing.

---

## Implementation Order

Single bug; one logical change. No dependency ordering needed.

---

## Plan

### BUG-36 — Optimistic archive in `src/components/DegreePlan.jsx`

**Target:** the `requirement_slot → transfer_credits` path inside `handleDragEnd`.

**Current code (lines 862–894):**

```js
const course         = courses[courseCode]
const creditsAwarded = course?.credits ?? 3
const semLabel       = planSemesterOverrides[slotId] ?? slot.semester_number

await handleAddPriorCredit({ ... })

const { error: archErr } = await supabase.from('student_plan_slots').upsert({ ... })
if (!archErr) {
  setPlanArchived(prev => ({ ...prev, [slot.id]: true }))
  if (slot.is_pool) {
    setPlanSlots(prev => { const n = { ...prev }; delete n[slot.id]; return n })
  }
}
```

**After fix:**

```js
const course         = courses[courseCode]
const creditsAwarded = course?.credits ?? 3
const semLabel       = planSemesterOverrides[slotId] ?? slot.semester_number

// Optimistic archive: hide slot immediately so the dnd-kit snap-back frame
// shows the slot already gone rather than the original position.
const prevArchived   = planArchived
const prevPlanSlots  = planSlots
setPlanArchived(prev => ({ ...prev, [slot.id]: true }))
if (slot.is_pool) {
  setPlanSlots(prev => { const n = { ...prev }; delete n[slot.id]; return n })
}

await handleAddPriorCredit({ ... })

const { error: archErr } = await supabase.from('student_plan_slots').upsert({ ... })
if (archErr) {
  // Both the prior-credit insert and the belt-and-suspenders upsert failed.
  // Roll back the optimistic hide so the slot reappears rather than silently
  // staying hidden with no DB record.
  setPlanArchived(prevArchived)
  if (slot.is_pool) setPlanSlots(prevPlanSlots)
}
// On success: no further setPlanArchived call needed — already done optimistically.
```

The call to `handleAddPriorCredit` and the explicit upsert are unchanged —
only the placement of the `setPlanArchived` / `setPlanSlots` calls shifts.
The `if (!archErr)` block becomes `if (archErr)` for rollback.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/DegreePlan.jsx` | BUG-36 | Move `setPlanArchived` + pool `setPlanSlots` to before `await handleAddPriorCredit`; add rollback on `archErr` |

No test files change — UI timing behavior; nothing extractable to unit test.

Close-out docs commit:

| File | Change |
|---|---|
| `docs/claude/bug.md` | Remove BUG-36 entry; update counts (Low 4→3, Total 9→8) |
| `docs/claude/BRANCH_QUEUE.md` | `fix/drag-to-prior-coursework-flicker` → Merged Branches |
| `docs/claude/PACKAGES.md` | Package M ✅ COMPLETE; update open-bug counts |
| `docs/claude/BRANCH_drag-to-prior-coursework-flicker.md` | Delete this file |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline: **13 files, 266 tests passed**. No new tests added — UI timing is
not extractable to a unit test. Count must remain 266 after all edits.

---

## Commit Plan

```
fix(drag): optimistic archive on drag-to-prior-coursework, eliminating snap-back flicker (BUG-36)
```
Body: "planArchived and planSlots are now updated optimistically before
handleAddPriorCredit's await chain so dnd-kit renders the slot gone at
drag-release rather than snapping it back for the duration of the Supabase
round-trip. Added prevArchived/prevPlanSlots rollback on archErr."

```
docs: close out fix/drag-to-prior-coursework-flicker
```

---

## Known Constraints

- `handleAddPriorCredit` does not return a success/failure signal; the
  rollback path uses `archErr` from the explicit belt-and-suspenders upsert
  (line 879). If only the prior-credit insert fails (and the explicit upsert
  succeeds), the slot stays archived visually and in the DB — consistent
  behavior without surfacing a confusing intermediate state to the user.
- `handleSave`, `handleStatusChange`, and the semester-move drag path all use
  the same `prevX = stateX; setState(optimistic); .then(err => setState(prevX))`
  pattern — match it.
- Do not add a `DragOverlay` or animation change to `Semester.jsx` — the
  visual fix comes from state timing, not CSS.
- `planArchived` and `planSlots` closures in the rollback must capture the
  values at the instant the drag handler fires (before the optimistic update),
  not inside the async callback.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Use a student plan with at
least one filled required course slot (non-pool, e.g. MATH1320) and one
filled pool slot (e.g. SCIENCE with a course selected).

1. **Required slot drag (main scenario).**
   Drag MATH1320's slot to the Prior Coursework panel. Before fix: the slot
   snaps back to Semester 1 for ~200–400 ms then disappears. After fix: the
   slot disappears at the moment the drag is released, with no snap-back frame.

2. **Pool slot drag.**
   Fill a SCIENCE pool slot (e.g. select CHEM1110), then drag it to Prior
   Coursework. Same snap-back elimination expected. Verify the pool slot also
   clears its selected course (planSlots entry removed) in the same instant.

3. **Rollback is not easily testable manually** — requires forcing a Supabase
   error. Confirm the code reads correctly and the rollback path is correct
   from inspection.

4. **Normal semester-to-semester drag regression.**
   Drag a slot between semesters. Verify the semester override still applies
   correctly and no unintended archive state is set.

5. **Prior Coursework panel appearance.**
   After drag, the new entry appears in the Prior Coursework panel as a
   transfer credit. Credits total updates correctly.

---

## Post-branch Checklist

- [ ] `npm run test` — 13 files, 266 tests passed.
- [ ] Manual verification scenarios 1–5 pass.
- [ ] `docs/claude/bug.md` — BUG-36 removed; severity counts updated
      (Low 4→3, Total 9→8). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved to Merged Branches table
      with today's date.
- [ ] `docs/claude/PACKAGES.md` — Package M ✅ COMPLETE; open-bug counts
      updated; recommended-next sequence updated.
- [ ] `docs/claude/BRANCH_drag-to-prior-coursework-flicker.md` deleted in
      the close-out commit.
- [ ] Merge to `main` (`--ff-only`). Do not force-push.
