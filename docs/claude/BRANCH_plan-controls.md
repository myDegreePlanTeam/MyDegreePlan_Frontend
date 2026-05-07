# Branch: `feat/plan-controls`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: Three student-facing plan controls — Reset Plan button, three enforcement rules on
> Mark Semester Complete, and Add Semester with dynamic display numbering.

---

## What This Branch Does

Implements three plan-control features from the priority report
(`docs/claude/feature-priority-report.md`). Items in implementation order:

1. **ITEM-3 — Reset Plan button (P1, S–M):** A "Reset plan" button in the header that clears
   all student plan data for the current concentration (slots, free-adds, notes) and reloads
   template defaults via a confirmation modal. Does not clear `prior_credits`.
2. **ITEM-5 — Mark Semester Complete — 3 rules (P1, M):** Three enforcement rules added to the
   existing mark-complete button: (A) all pool slots must have a course selected, (B) marking
   a semester complete batch-updates all slot statuses to `'completed'` in Supabase (undo
   reverts to `'planned'`), (C) earlier semesters must all be complete first.
3. **ITEM-4 — Add Semester + dynamic display numbering (P1, M):** A "+ Add semester" button
   appends new empty semesters to the grid. Semester display labels derive from sorted render
   position (`idx + 1`) rather than raw `semester_number`, so gaps display without holes.

---

## Non-Goals / Out of Scope

- `prior_credits` are never deleted by any action in this branch (BUG-47 principle).
- `archive_reason = 'manual'` is not used. Individual per-course completion toggling is not
  implemented (see `CLAUDE.md` Core Principle 3).
- On Rule B undo: revert statuses to `'planned'`, not to the original pre-complete value.
  Tracking prior status is deferred to `feat/undo-stack`.
- `extraSemesterCount` is not persisted to Supabase. Persistence (and coupling to
  `schema/semester-terms`) is deferred to `feat/dynamic-semester-count`.
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` — signatures unchanged.
- No schema migrations. No new Supabase tables.
- Full undo stack — deferred to `feat/undo-stack`.
- Auto-fill / plan balancer — deferred to `feat/plan-balancer`.

---

## Preconditions

1. Create the branch: `cd MyDegreePlan_Frontend && git checkout -b feat/plan-controls`
2. Run `npm run test`. Baseline: **14 files, 279 tests passed**. Stop if it does not match.
3. Read before editing:
   - `src/components/DegreePlan.jsx` — focus on: lines 138–290 (load `useEffect`),
     308–334 (`semesterMap` / `semesterNumbers`), 744–793 (completion/collapse),
     1019–1041 (`handleConcentrationSwitch`), 1112–1140 (header actions), 1191–1225
     (grid render loop)
   - `src/components/Semester.jsx` — focus on: lines 62–102 (collapsed row), 105–236
     (expanded card: header, footer, mark-complete button)

---

## Implementation Order

ITEM-3 → ITEM-5 → ITEM-4.

- ITEM-3 establishes `clearPlanData()` and the `resetKey` reload pattern; both are reused by
  the concentration-switch path and provide the model for reset semantics.
- ITEM-5 is independent of ITEM-4 but stabilises `handleSemesterComplete` before ITEM-4 adds
  new semester state on top.
- ITEM-4 last because it adds `extraSemesterCount` and replaces `semesterNumbers` with
  `allSemesterNumbers` in the render loop — changes that touch the same iteration ITEM-5 also
  reads (to compute `priorSemestersAllComplete`).

---

## Plan

### ITEM-3 — Reset Plan button

**Step 1 — Extract `clearPlanData()` in `DegreePlan.jsx`**

The three table deletes in `handleConcentrationSwitch` (lines 1028–1035) become a shared helper:

```js
async function clearPlanData() {
  const { error } = await supabase
    .from('student_plan_slots').delete().eq('student_id', profile.id)
  if (error) return error
  await supabase.from('student_free_add_slots').delete().eq('student_id', profile.id)
  await supabase.from('student_semester_notes').delete().eq('student_id', profile.id)
  return null
}
```

Replace the inline block in `handleConcentrationSwitch` with:
```js
const err = await clearPlanData()
if (err) { setSwitching(false); return }
```

**Step 2 — Add `resetKey` state and reload trigger**

The load `useEffect` (line 290) depends on `[profile.concentration_id]`. Since a reset stays
on the same concentration, it cannot reload via that dep. Add:

```js
const [resetKey, setResetKey] = useState(0)
```

Change the `useEffect` dep array to `[profile.concentration_id, resetKey]`. After
`clearPlanData()` in the reset handler, call `setResetKey(k => k + 1)` to trigger a full
re-run of `loadPlan()`.

**Step 3 — Reset handler + modal state**

```js
const [showResetModal, setShowResetModal] = useState(false)
const [resetting, setResetting]           = useState(false)

async function handleResetPlan() {
  setResetting(true)
  const err = await clearPlanData()
  if (err) { setResetting(false); return }
  setLastSelection(null)
  setExtraSemesterCount(0)   // added in ITEM-4; insert this call here at that time
  setResetting(false)
  setShowResetModal(false)
  setResetKey(k => k + 1)
}
```

**Step 4 — Reset button in `degreeplan-header-actions` (line 1112)**

Add after the Undo button, before the Change concentration button:

```jsx
<button
  className="degreeplan-reset"
  onClick={() => setShowResetModal(true)}
>
  Reset plan
</button>
```

**Step 5 — Confirmation modal JSX**

Mirror the existing switch-modal structure. Key copy:

- Title: "Reset this plan?"
- Body: "This will clear all your course selections, free-add courses, and semester notes
  for this concentration. Prior credits and placement scores are kept."
- Confirm: "Reset plan" (use a destructive button style, e.g. `degreeplan-modal-danger`)
- Cancel: "Cancel"

---

### ITEM-5 — Mark Semester Complete enforcement rules

**Rule A — Unfilled pool slots disable the button (`Semester.jsx`)**

Compute from `slots` and `planSlots` props:

```js
const hasUnfilledPool = slots.some(s => s.is_pool && !planSlots[s.id])
```

Add `hasUnfilledPool` to the disabled condition and title on the Mark Complete button
(lines 222–231):

```jsx
disabled={hasWarnings || hasUnfilledPool}
title={
  hasUnfilledPool
    ? 'Select a course for all pool slots before marking complete'
    : hasWarnings
      ? 'Resolve warnings before marking this semester complete'
      : 'Mark this semester as complete'
}
```

Add a gate message parallel to the existing `semester-warning-gate` (line 140):

```jsx
{hasUnfilledPool && !isCompleted && (
  <div className="semester-warning-gate">
    Select a course for all pool slots before marking this semester complete.
  </div>
)}
```

**Rule B — Batch slot status update on complete / undo (`DegreePlan.jsx`)**

Extend `handleSemesterComplete(semNum, value)` (line 744):

- `value = true` (mark complete): UPDATE `student_plan_slots.status = 'completed'` for all
  slots where `requirement_slot_id in semesterMap[semNum].map(s => s.id)`. UPDATE
  `student_free_add_slots.status = 'completed'` for all rows where `student_id = profile.id`
  and `semester_number = semNum`.
- `value = false` (undo): same rows, revert to `status = 'planned'`.

Also update `planStatuses` (and `planFreeAddStatuses` if tracked) in local state so slot rows
reflect the change immediately, consistent with how `handleSemesterComplete` already optimistically
updates `planSemesterCompleted` before the Supabase upsert resolves.

Roll back local state if the UPDATE errors, using the same `prevCompleted`/`prevExpanded`
pattern already present at line 745–766.

**Rule C — Sequential ordering (`DegreePlan.jsx` + `Semester.jsx`)**

In the grid render loop (line 1191), derive `priorComplete` per iteration and pass it down:

```jsx
{allSemesterNumbers.map((semNum, idx) => {
  const priorComplete = allSemesterNumbers
    .slice(0, idx)
    .every(n => planSemesterCompleted[n])
  return (
    <Semester
      key={semNum}
      ...
      priorSemestersAllComplete={priorComplete}
    />
  )
})}
```

In `Semester.jsx`, add `priorSemestersAllComplete = true` to the prop list. Include in the
disabled condition (Rule A + Rule C + existing `hasWarnings`):

```jsx
disabled={hasWarnings || hasUnfilledPool || !priorSemestersAllComplete}
title={
  !priorSemestersAllComplete
    ? 'Complete earlier semesters first'
    : hasUnfilledPool
      ? 'Select a course for all pool slots before marking complete'
      : hasWarnings
        ? 'Resolve warnings before marking this semester complete'
        : 'Mark this semester as complete'
}
```

---

### ITEM-4 — Add Semester + dynamic display numbering

**Step 1 — Dynamic display label**

In the `Semester` component, `{semesterNumber}` appears at line 92 (collapsed row) and line 120
(expanded header). Add a `displayNumber` prop (default: `semesterNumber`) and replace both
occurrences.

In `DegreePlan.jsx`, pass `displayNumber={idx + 1}` from the render loop.

**Step 2 — `extraSemesterCount` state and `allSemesterNumbers`**

```js
const [extraSemesterCount, setExtraSemesterCount] = useState(0)
```

Reset to 0 in `handleResetPlan()` and in `handleConcentrationSwitch()`.

```js
const maxTemplateSem = semesterNumbers.length > 0 ? Math.max(...semesterNumbers) : 0

const allSemesterNumbers = useMemo(() => {
  const extra = Array.from(
    { length: extraSemesterCount },
    (_, i) => maxTemplateSem + i + 1
  )
  return [...new Set([...semesterNumbers, ...extra])].sort((a, b) => a - b)
}, [semesterNumbers, extraSemesterCount, maxTemplateSem])
```

Replace `semesterNumbers` with `allSemesterNumbers` everywhere in the render — the `map` at
line 1191 and the `completedSemesterCount` at line 1076.

**Step 3 — "+ Add semester" button**

Add below the `degreeplan-grid` div, before the `DragOverlay`:

```jsx
<div className="degreeplan-add-semester-wrap">
  <button
    className="degreeplan-add-semester-btn"
    onClick={() => setExtraSemesterCount(c => c + 1)}
  >
    + Add semester
  </button>
</div>
```

Extra semesters have `semesterMap[semNum] = []` and `freeAddBySemester[semNum] = []` — they
render as empty cards with only the "+ Add course" footer button available.

---

## Files Expected to Change

| File | Items | Summary |
|---|---|---|
| `src/components/DegreePlan.jsx` | 3, 4, 5 | `clearPlanData()`; `resetKey` state; `showResetModal` / `resetting` state; reset modal JSX; Rule B status batch-UPDATE in `handleSemesterComplete`; `priorSemestersAllComplete` prop; `extraSemesterCount` state; `allSemesterNumbers` memo; `displayNumber` prop |
| `src/components/Semester.jsx` | 4, 5 | `displayNumber` prop replacing `semesterNumber` in labels; Rule A `hasUnfilledPool` check; Rule C `priorSemestersAllComplete` prop + disabled condition |

No new files. No schema changes.

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline: **14 files, 279 tests passed**.

No new unit tests required for ITEM-3 or ITEM-4 (UI-only state changes with no extracted
pure logic). ITEM-5 Rule B contains Supabase calls that are not unit-testable without mocking;
verify Rule B manually. Test count must be ≥ 279 at every commit boundary.

---

## Commit Plan

Commit 1:
```
feat(plan): add Reset Plan button with clearPlanData helper (ITEM-3)
```
Body: "Extracts the plan-data delete block from handleConcentrationSwitch into shared
clearPlanData(). Adds showResetModal state, a resetKey counter that forces loadPlan() to
re-run without changing concentration_id, a Reset plan button in degreeplan-header-actions,
and a confirmation modal. prior_credits are never cleared."

Commit 2:
```
feat(semester): enforce pool-selection, slot-status, and order rules on mark complete (ITEM-5)
```
Body: "Rule A: Mark Complete disabled when any pool slot has no selected course.
Rule B: Completing a semester batch-sets all slot and free-add statuses to 'completed';
undo reverts to 'planned'. Rule C: Earlier semesters must be complete first
(priorSemestersAllComplete prop)."

Commit 3:
```
feat(semester): add semester button and dynamic display numbering (ITEM-4)
```
Body: "extraSemesterCount state appends new empty semesters beyond the template max.
Display labels ('Semester N') derive from sorted render index (idx + 1), not the raw
semester_number DB value, so gaps in the template show without holes. Resets to 0 on
concentration switch or plan reset."

---

## Known Constraints

- `clearPlanData()` deletes by `student_id` across all three tables. It does not filter by
  `concentration_id` — this matches `handleConcentrationSwitch` behavior and is intentional.
- Rule B reverts to `'planned'` on undo regardless of the slot's original status. True
  per-slot status rollback requires the undo stack (`feat/undo-stack`).
- `displayNumber` is a display-only label. The `semesterNumber` prop remains the DB key for
  `semesterMap`, `semesterNotes`, `planSemesterCompleted`, etc. — do not swap them.
- `hasUnfilledPool` checks `slots` (template slots) only. Free-add slots are never pool slots.
- `priorSemestersAllComplete` for semester 1 (first in the sorted list) is always `true` —
  `slice(0, 0)` is an empty array and `.every()` returns `true` vacuously.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`.

**ITEM-3:**
1. Select courses in several slots. Add a free-add. Add a semester note.
2. Click "Reset plan" → cancel. Confirm nothing changed.
3. Click "Reset plan" → confirm. Confirm the grid resets to blank template defaults.
4. Confirm Prior Coursework panel still shows all prior credits.

**ITEM-5:**
1. Leave a pool slot empty in semester 1. Confirm Mark Complete is disabled (Rule A message).
2. Fill the pool slot. Try to mark semester 2 complete before semester 1 (Rule C message).
3. Mark semester 1 complete. Check all slot rows show "Done" status (Rule B).
4. Undo semester 1 completion. Check slot rows revert to "Planned" (Rule B undo).

**ITEM-4:**
1. Drag all courses out of semester 3. Confirm it disappears and semester 4 is labeled "Semester 3".
2. Click "+ Add semester". Confirm a new empty card appears labeled correctly at the end.
3. Add a free-add course to the new semester. Confirm it persists.
4. Switch concentration. Confirm extra semesters are gone after the switch.

---

## Post-branch Checklist

- [ ] `npm run test` — ≥ 14 files, ≥ 279 tests passed.
- [ ] Manual verification for all three items passes.
- [ ] `docs/claude/BRANCH_QUEUE.md` — `feat/plan-controls` moved to Merged Branches with today's date.
- [ ] `docs/claude/BRANCH_plan-controls.md` deleted in close-out commit.
- [ ] Merge to `main`. Do not force-push.
