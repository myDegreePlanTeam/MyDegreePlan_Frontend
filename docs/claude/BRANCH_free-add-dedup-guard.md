# Branch: `fix/free-add-dedup-guard`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: one bug, one new pure helper, prop-thread, modal disable styling
> (CSS already exists), insert-path guard.

---

## What This Branch Does

Adds a duplicate guard to the free-add picker. `AddCourseModal` currently
queries the full `courses` table and inserts whatever the student picks into
`student_free_add_slots`, with no check against codes the student already
has via the template, pool selections, prior free-adds, or prior credits.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-34 (Medium)** — Free-add picker accepts course codes already
   covered by the plan. Visible duplication in the grid; credit totals stay
   correct (BUG-6's dedup contract holds), but the UI presents redundant
   "what's left" rows.

The fix mirrors the dedup keyspace already defined by `computePlanCredits`
(see `src/lib/transferCredits.js:190–242`), so the rules cannot drift
between the two functions.

---

## Out of Scope

Do not touch on this branch, even if noticed:

- `computePlanCredits`, `resolveTransferCredits`, `resolveTransferDetails`
  signatures — frozen per `CLAUDE.md` core principles. Adding a new sibling
  export (`getTakenCodes`) is fine; modifying these is not.
- `SlotModal`'s existing `takenCodes` memo (`SlotModal.jsx:108–117`). It
  has narrower scope (pool-slot selections only, with the active slot
  excluded) — different problem, leave alone.
- BUG-9 (`computePlanCredits` dedup collision on repeated pool selections).
  Audit marks "intentional per spec; no fix required." Could be folded in
  here as UI-side duplicate-rejection at SlotModal save time, but that's
  scope creep — file separately if desired.
- CSS additions. The styles `.modal-course-row.status-taken` and
  `.modal-status-badge.taken` are already defined in `Dashboard.css:616`
  and `Dashboard.css:636` for the `SlotModal`'s use; this branch reuses
  them as-is.
- Hide-rather-than-grey behavior. The audit explicitly suggests "hide *or*
  grey-out"; we choose grey-out for discoverability (mirrors `SlotModal`
  CourseRow behavior at `SlotModal.jsx:352–387`).

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/free-add-dedup-guard`.
2. Run `npm run test`. Baseline: **9 files, 226 tests passed**. If it does
   not match, stop and report.
3. Read in full before editing:
   - `src/lib/transferCredits.js:190–242` (`computePlanCredits` body — the
     dedup keyspace `getTakenCodes` must mirror).
   - `src/components/AddCourseModal.jsx` (full file, ~152 lines).
   - `src/components/DegreePlan.jsx` lines 32–80 (state declarations),
     640–664 (`handleAddCourse`), 1227–1233 (modal render).
   - `src/components/SlotModal.jsx` lines 352–387 (existing `CourseRow`
     pattern with `status-taken` className) — reuse as the visual model.
   - `src/components/Dashboard.css` lines 514–650 (existing modal-row and
     badge CSS — confirm the classes are already styled).

---

## Implementation Order

Single bug, but the logical change spans helper / prop / modal / handler /
tests. One commit covering all of it (per the precedent set by Package A
and the audit's "mechanical fix" framing — no value in splitting).

---

## Plan

### Step 1 — `getTakenCodes` pure helper

`src/lib/transferCredits.js`. Add a new export below `computePlanCredits`:

```js
/**
 * Returns the set of course codes already represented in the plan.
 * Mirrors the dedup keyspace of computePlanCredits exactly: a code in the
 * returned Set is one that contributes (or would contribute) credits via
 * prior_credits, plan_slots, or student_free_add_slots.
 *
 * Rules:
 *   - prior_credits row counts ONLY if credits_awarded > 0 AND
 *     satisfies_course_code is non-null (matches Pass 1 of
 *     computePlanCredits — placement-only entries do not block).
 *   - non-pool slot contributes its class_code.
 *   - filled pool slot contributes the planSlots[slot.id] selection.
 *   - free-add slot contributes its course_code.
 *
 * Used by AddCourseModal to grey out catalog rows already in the plan.
 */
export function getTakenCodes(planSlots, slots, priorCredits, freeAddSlots = []) {
  const taken = new Set()

  for (const pc of (priorCredits ?? [])) {
    if ((pc.credits_awarded ?? 0) <= 0) continue
    if (!pc.satisfies_course_code) continue
    taken.add(pc.satisfies_course_code)
  }

  for (const slot of (slots ?? [])) {
    let code
    if (slot.is_pool) {
      code = planSlots?.[slot.id]
      if (!code) continue
    } else {
      code = slot.class_code
    }
    taken.add(code)
  }

  for (const fa of (freeAddSlots ?? [])) {
    if (!fa?.course_code) continue
    taken.add(fa.course_code)
  }

  return taken
}
```

### Step 2 — Pass `takenCodes` from `DegreePlan` to `AddCourseModal`

`src/components/DegreePlan.jsx`. Compute via `useMemo` near the existing
`prereqWarnings` memo, importing `getTakenCodes`. Pass into the modal:

```jsx
<AddCourseModal
  semesterNumber={addCourseTarget}
  takenCodes={takenCodes}
  onAdd={course => handleAddCourse(addCourseTarget, course)}
  onClose={() => setAddCourseTarget(null)}
/>
```

The memo:

```js
const takenCodes = useMemo(
  () => getTakenCodes(planSlots, slots, priorCredits, freeAddSlots),
  [planSlots, slots, priorCredits, freeAddSlots],
)
```

### Step 3 — Disable taken rows in `AddCourseModal`

`src/components/AddCourseModal.jsx`. Accept `takenCodes` prop (default
empty Set). Update the row render to mirror `SlotModal`'s `CourseRow`
pattern: add `status-taken` className when `takenCodes.has(course.code)`,
add disabled attribute, render the existing `Already in plan` badge in
the `modal-course-top` div. Update `handleSelect` to no-op for taken
codes (defensive — disabled buttons shouldn't fire `onClick`, but
keyboard activation paths exist).

```jsx
export default function AddCourseModal({
  semesterNumber,
  takenCodes = new Set(),
  onAdd,
  onClose,
}) {
  // ... existing state/effect ...

  function handleSelect(course) {
    if (takenCodes.has(course.code)) return
    setSelected(prev => prev?.code === course.code ? null : course)
  }

  // ... in the results map:
  {results.map(course => {
    const isTaken = takenCodes.has(course.code)
    return (
      <button
        key={course.code}
        className={`modal-course-row ${isTaken ? 'status-taken' : ''} ${selected?.code === course.code ? 'selected' : ''}`}
        onClick={() => handleSelect(course)}
        disabled={isTaken}
      >
        <div className="modal-course-info">
          <div className="modal-course-top">
            <span className="modal-course-code">{course.code}</span>
            <span className="add-course-subject">{course.subject_code}</span>
            {isTaken && (
              <span className="modal-status-badge taken">Already in plan</span>
            )}
          </div>
          <span className="modal-course-name">{course.name}</span>
        </div>
        <span className="modal-course-credits">{course.credits} cr</span>
      </button>
    )
  })}
```

The "Add to Semester N" button is already disabled when `selected` is
falsy. With `handleSelect` no-op for taken codes, a taken code can never
become `selected`, so no extra guard on the footer button needed.

### Step 4 — Insert-path guard in `handleAddCourse`

`src/components/DegreePlan.jsx:640–664`. Add a defensive check before the
Supabase insert. Stale state (e.g. another tab raced an insert) could let
a taken code through; reject early with the same `showSaveError` pattern
the rest of the handler uses:

```js
async function handleAddCourse(semesterNumber, course) {
  setAddCourseTarget(null)

  if (takenCodes.has(course.code)) {
    showSaveError(`${course.code} is already in your plan.`)
    return
  }

  const { data, error } = await supabase
    .from('student_free_add_slots')
    .insert({ ... })
    // ... rest unchanged
}
```

### Step 5 — Tests

New file `src/tests/getTakenCodes.test.js` covering each of the four
sources independently and combined:

- Empty inputs → empty Set.
- Non-pool requirement slot → its `class_code` is taken.
- Filled pool slot → its `planSlots[id]` is taken.
- Unfilled pool slot → not taken (no code).
- Free-add slot → its `course_code` is taken.
- Credit-bearing prior credit (`credits_awarded > 0`,
  `satisfies_course_code` set) → that code is taken.
- Placement-only prior credit (`credits_awarded === 0`) → NOT taken
  (regression for the Pass-1 dedup contract).
- Prior credit with null `satisfies_course_code` → NOT taken.
- Combined inputs from all four sources dedup correctly (Set semantics).

No tests for the modal/handler wiring — those are React + Supabase async
paths; the existing suite has no React-Testing-Library or Supabase-mock
infrastructure. Manual verification (below) covers them.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/lib/transferCredits.js` | 34 | New `getTakenCodes` export |
| `src/components/DegreePlan.jsx` | 34 | Import helper; `takenCodes` memo; pass prop; insert guard |
| `src/components/AddCourseModal.jsx` | 34 | Accept prop; `handleSelect` guard; row disabled state |
| `src/tests/getTakenCodes.test.js` | 34 | New file, ~9 cases |
| `docs/claude/bug.md` | — | Remove BUG-34 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move to Merged Branches table on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **9 files, 226 tests
passed**. After fix: 10 files (one new) with new test count (~ 235, exact
to be recorded in the close-out commit).

The pure helper is fully covered. Modal/handler wiring is verified
manually below.

---

## Commit Plan

One implementation commit (helper + wiring + tests), one close-out commit:

```
fix: guard free-add picker against codes already in the plan (BUG-34)

docs: close out fix/free-add-dedup-guard (BUG-34)
```

The implementation-commit body should reference BUG-34 and name each file
edited (helper, modal, handler, test).

---

## Known Constraints

- `getTakenCodes` must mirror `computePlanCredits`'s Pass-1/2/3 keyspace
  exactly so the two functions cannot disagree on whether a code is
  "in the plan." If `computePlanCredits` changes its dedup rules, this
  helper must update in lockstep.
- `AddCourseModal` is also rendered with `takenCodes` undefined when
  consumers haven't been updated. Default the prop to `new Set()` so the
  pre-existing call site contract isn't broken.
- The `.modal-status-badge.taken` and `.modal-course-row.status-taken`
  styles are SlotModal-coupled today — adding AddCourseModal as a second
  consumer is intentional reuse, not a refactor.

---

## Manual Verification

Boot the dev server (`npm run dev` from `MyDegreePlan_Frontend/`) and
verify in a browser. Need an authenticated test student with at least
one concentration and some plan state.

1. **Template-class block.** Open Add Course on any semester. Search for
   `CSC1300` (or any non-pool requirement code on the active concentration).
   - **Before fix:** the row is selectable; selecting it adds a duplicate
     CSC1300 row to the grid.
   - **After fix:** the row shows greyed with an "Already in plan" badge
     and cannot be selected.

2. **Pool-selection block.** Pick `MATH3070` for the MATH_STATS pool slot.
   Open Add Course on any semester and search `MATH3070`.
   - Expected: `MATH3070` row greyed; cannot be added again.

3. **Free-add self-block.** Free-add `CSC4990` to Semester 8. Open Add
   Course again and search `CSC4990`.
   - Expected: greyed.

4. **Prior-credit block.** Add an AP credit that grants MATH1910 (e.g.
   AP Calculus AB → MATH1910 + 4cr). Open Add Course and search
   `MATH1910`.
   - Expected: greyed.

5. **Placement-only does not block.** Add an ACT Math 27+ placement
   (`act_placement`, `credits_awarded = 0`). Open Add Course and search
   `MATH1910`.
   - Expected: NOT greyed — placement is a gate, not credit.
   - This is the contract we mirror from `computePlanCredits` Pass 1.

6. **Insert-path guard (defensive).** Disable JS to skip the modal greyout,
   then insert directly via Supabase REST against
   `student_free_add_slots` for a code already in the plan. (Skip if
   tedious — the modal greyout is the primary defense.) Expected: the
   handler-level guard logs `"<code> is already in your plan."` via the
   save-error toast and does not insert. (Stretch verification only.)

---

## Post-branch Checklist

- [ ] `npm run test` green; record the new test count in the close-out commit.
- [ ] Manual verification scenarios 1–5 pass.
- [ ] `docs/claude/bug.md` — BUG-34 entry removed; severity counts updated
      (Medium 9 → 8, Total 13 → 12). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches
      table with today's date.
- [ ] `docs/claude/BRANCH_free-add-dedup-guard.md` deleted in the
      close-out commit.
- [ ] Merge to `main`. Do not force-push.
