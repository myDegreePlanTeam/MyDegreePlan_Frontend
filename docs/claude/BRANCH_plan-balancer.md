# Branch: `feat/plan-balancer`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: A "Rebalance Plan" button that runs a constrained backfill algorithm — pulling
> courses from later semesters into under-credit earlier ones after prior credits are applied.
> Pure logic lives in a new `src/lib/planBalancer.js`; side effects in `DegreePlan.jsx`.
>
> **Depends on `feat/undo-stack`** — the rebalance pushes a single `{ type: 'rebalance' }`
> undo record that reverses all semester overrides at once. Do not start this branch before
> `feat/undo-stack` is merged.

---

## What This Branch Does

Implements the "Auto-Fill Holes After Prior Credits Applied" feature from the priority
report (`docs/claude/feature-priority-report.md` item 7). Adds:

1. A new pure function `balancePlan(params)` in `src/lib/planBalancer.js` — no Supabase,
   no React, fully unit-testable.
2. A `handleRebalance()` handler in `DegreePlan.jsx` that calls `balancePlan`, batch-applies
   the resulting `semester_number` overrides to state and Supabase, and pushes a single
   `{ type: 'rebalance' }` undo record.
3. A "Rebalance Plan" button in `degreeplan-header-actions` (alongside Reset and Undo).
4. A new `{ type: 'rebalance', prevOverrides }` case in `handleUndo` (appended to the
   dispatch written in `feat/undo-stack`).

---

## Non-Goals / Out of Scope

- Automatic rebalance on page load — the button is explicit and opt-in.
- Moving free-add slots — V1 operates on requirement slots only.
- Summer semesters — no term data exists yet (`schema/semester-terms` is deferred).
- Science pair splitting: balancer will not separate a science lecture from its lab.
  If a pair cannot move together, neither moves.
- GEN_ED / pool slot resolution: a pool slot with no `selected_course_code` has no prereqs
  to evaluate. The balancer skips unfilled pool slots.
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` — signatures unchanged.
- No schema changes.

---

## Preconditions

1. Confirm `feat/undo-stack` is merged to `main`.
2. From `main`: `git checkout -b feat/plan-balancer`
3. Run `npm run test`. Baseline: **14 files, 279 tests passed** (verify — count may be
   higher if `feat/undo-stack` added tests). Stop if the count is below the post-undo-stack
   baseline.
4. Read before editing:
   - `src/lib/poolResolver.js` — `SCIENCE_SEQUENCES`, `getScienceWarnings` (science pair detection)
   - `src/lib/prereqChecker.js` — `checkPrereqs`, `checkCoreqs` signatures
   - `src/components/DegreePlan.jsx` — `semesterMap`, `allSemesterNumbers`, `planSemesterOverrides`,
     `handleUndo` dispatch (the new `rebalance` case goes here), header actions section,
     `handleResetPlan` and `handleConcentrationSwitch` (stack clearing)

---

## Implementation Order

1. Write `src/lib/planBalancer.js` and `src/tests/planBalancer.test.js` together (TDD).
2. Wire into `DegreePlan.jsx` (handler + button + undo case).

---

## Plan

### Step 1 — `src/lib/planBalancer.js`

Export one function:

```js
/**
 * balancePlan({ slots, planSlots, planSemesterOverrides, planArchived,
 *               priorCredits, courses, prereqMap, coreqMap })
 *
 * Returns { [slotId]: newSemesterNumber } — only slots whose semester changes.
 * Pure function: no side effects, no Supabase calls.
 */
export function balancePlan({ slots, planSlots, planSemesterOverrides, planArchived,
                               priorCredits, courses, prereqMap, coreqMap }) { ... }
```

**Algorithm:**

*Setup:*
- Build `assignments: Map<slotId, semNum>` from `planSemesterOverrides[id] ?? slot.semester_number`
  for each non-archived requirement slot that has a known course code (non-pool or filled pool).
  Skip archived slots (`planArchived[id]`). Skip unfilled pool slots.
- Build `semCredits: Map<semNum, number>` from assignments and course credit lookups.
- Build `semCourses: Map<semNum, Set<courseCode>>` — codes present in each semester.
- Build `allCodes: Map<semNum, Set<courseCode>>` — codes in semesters ≤ N (for prereq checking).

*Pass runner (inner function):*
`function runPass(targetCredits)`:
  - `moved = new Set()` — slots moved in this pass (don't revisit)
  - For each semester in ascending order:
    - If `semCredits[semNum] >= targetCredits`, continue
    - Pull candidates from `semNum + 1` (the immediately next semester only in V1):
      a slot is a candidate if:
      1. Not in `moved`
      2. Its course's prereqs are satisfied by `allCodes[semNum - 1]` (codes in strictly
         earlier semesters). Use `checkPrereqs(courseCode, prereqMap, satisfiedSet, priorCredits, courses)`.
      3. Its course's coreqs are satisfied by `allCodes[semNum]` (same + prior).
         Use `checkCoreqs(courseCode, coreqMap, availableSet)`.
      4. If the slot is part of a science pair (check `SCIENCE_SEQUENCES` membership): its
         partner slot must also be a candidate (both move or neither moves).
    - Move the first eligible candidate (or eligible pair) into `semNum`:
      update `assignments`, `semCredits`, `semCourses`, `allCodes`.
      Add moved slot ids to `moved`.
    - Re-check `semCredits[semNum]` after each move — stop pulling for this semester once
      it reaches `targetCredits`.

*Runs:*
```js
runPass(12)
runPass(15)
```

*Output:* Return `{ [slotId]: newSem }` for every entry in `assignments` where
`newSem !== (planSemesterOverrides[id] ?? slot.semester_number)`.

**Science pair lookup:** Import `SCIENCE_SEQUENCES` from `poolResolver.js`. A slot's course
is in a pair if its code appears in any sequence entry. For the balancer, a "pair" is two
slots in the same semester whose course codes appear together in a `SCIENCE_SEQUENCES` entry.
If only one slot from a pair is a candidate, skip both.

**Prereq satisfied set construction:** For semester N, `satisfiedCodes` is the Set of all
course codes in semesters 1 .. N-1 (from `allCodes[N-1]`). Also include any prior credit
`satisfies_course_code` values (same as how `DegreePlan` builds `satisfiedCodes` for
prereq warnings).

---

### Step 2 — `src/tests/planBalancer.test.js`

Required test cases (at minimum):

1. Returns empty object when all semesters are ≥ 15 credits — no moves.
2. Moves one slot from semester 2 to semester 1 when semester 1 is under 12 credits and
   the slot has no prereqs.
3. Does not move a slot when its prereq is only satisfied in its current semester (would
   become unsatisfied at the earlier position).
4. Moves a science pair together or not at all — does not move just one member.
5. Pass 2 moves a slot when semester is between 12 and 15 credits (Pass 1 already ran).
6. Does not move the same slot twice (idempotency — running `balancePlan` twice on the
   result of the first run produces no further moves).
7. Skips unfilled pool slots (no `selected_course_code`).

---

### Step 3 — `DegreePlan.jsx` changes

**New undo record type** in `handleUndo` dispatch (after the `drag_free` case):

```js
} else if (record.type === 'rebalance') {
  // Restore all semester overrides to their pre-rebalance values
  setPlanSemesterOverrides(prev => ({ ...prev, ...record.prevOverrides }))
  for (const [slotId, prevSem] of Object.entries(record.prevOverrides)) {
    const slot = slots.find(s => s.id === Number(slotId))
    const courseCode = slot?.is_pool ? planSlots[slotId] ?? null : slot?.class_code ?? null
    await supabase.from('student_plan_slots').upsert({
      student_id: profile.id, requirement_slot_id: Number(slotId),
      selected_course_code: courseCode,
      status: planStatuses[slotId] ?? 'planned',
      semester_number: prevSem,
      credits_remaining: planCreditsRemaining[slotId] ?? 0,
    }, { onConflict: 'student_id, requirement_slot_id' })
  }
}
```

**`handleRebalance` handler:**

```js
async function handleRebalance() {
  const moves = balancePlan({
    slots, planSlots, planSemesterOverrides, planArchived,
    priorCredits, courses, prereqMap, coreqMap,
  })
  if (!Object.keys(moves).length) {
    showSaveError('Plan is already balanced — no moves needed.')
    return
  }

  // Save prevOverrides for undo (only slots that will change)
  const prevOverrides = Object.fromEntries(
    Object.keys(moves).map(id => [id, planSemesterOverrides[id] ?? slots.find(s => s.id === Number(id))?.semester_number])
  )

  // Optimistic state update
  setPlanSemesterOverrides(prev => ({ ...prev, ...moves }))
  pushUndo({ type: 'rebalance', prevOverrides })

  // Persist all overrides
  for (const [slotId, newSem] of Object.entries(moves)) {
    const slot = slots.find(s => s.id === Number(slotId))
    const courseCode = slot?.is_pool ? planSlots[slotId] ?? null : slot?.class_code ?? null
    await supabase.from('student_plan_slots').upsert({
      student_id: profile.id, requirement_slot_id: Number(slotId),
      selected_course_code: courseCode,
      status: planStatuses[slotId] ?? 'planned',
      semester_number: newSem,
      credits_remaining: planCreditsRemaining[slotId] ?? 0,
    }, { onConflict: 'student_id, requirement_slot_id' })
  }
}
```

**Rebalance button in `degreeplan-header-actions`:**

Add after the Reset button:
```jsx
<button className="degreeplan-rebalance" onClick={handleRebalance}
        disabled={loading || resetting}>
  Rebalance Plan
</button>
```

**Import `balancePlan`** at the top of `DegreePlan.jsx`:
```js
import { balancePlan } from '../lib/planBalancer'
```

**Import `SCIENCE_SEQUENCES`** in `planBalancer.js`:
```js
import { SCIENCE_SEQUENCES } from './poolResolver'
```

---

## Files Expected to Change

| File | Summary |
|---|---|
| NEW `src/lib/planBalancer.js` | Pure `balancePlan` function |
| NEW `src/tests/planBalancer.test.js` | Unit tests for `balancePlan` |
| `src/components/DegreePlan.jsx` | `handleRebalance` handler; `rebalance` undo case; Rebalance button JSX; import |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

All existing tests must still pass. New test file `planBalancer.test.js` must pass with
≥ 7 cases (see Step 2). Report file count and test count in the completion summary.

---

## Commit Plan

Commit 1:
```
feat(lib): add planBalancer pure function and test suite
```
Body: "Implements balancePlan(params) — two-pass constrained backfill algorithm that
moves requirement slots from later semesters into under-credit earlier ones. Pass 1
targets < 12 credits; Pass 2 targets < 15. Respects prereqs, coreqs, and science
sequence pairs. Returns { [slotId]: newSem } for changed slots only."

Commit 2:
```
feat(plan): add Rebalance Plan button wired to balancePlan
```
Body: "handleRebalance() calls balancePlan with current state, batch-upserts semester
overrides, and pushes a single rebalance undo record. handleUndo gains a 'rebalance'
case that restores all prevOverrides in one step. Button lives in degreeplan-header-actions."

---

## Known Constraints

- `planBalancer.js` must import only from `poolResolver.js` and `prereqChecker.js` — no
  React, no Supabase, no component imports. Pure function.
- V1 only pulls from `semNum + 1` (adjacent semester). Pulling from further-future semesters
  is a potential improvement but adds ordering complexity — defer.
- A slot's course code for prereq evaluation: non-pool slots use `slot.class_code`; pool
  slots use `planSlots[slot.id]`. If a pool slot is unfilled, skip it entirely.
- The `rebalance` undo record stores `prevOverrides` keyed by slot id (as string). The undo
  handler converts back to Number for the Supabase `requirement_slot_id` field.
- `handleRebalance` issues one Supabase upsert per moved slot (not a batch). Acceptable for
  typical plan sizes (≤ 40 slots); optimize only if latency is observed.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`.

1. Enter several AP credits that archive slots from Semester 1, leaving it under 12 credits.
2. Click "Rebalance Plan". Confirm courses from Semester 2 moved into Semester 1.
3. Verify prereqs are respected — a course that requires Semester 1 material did not move
   to Semester 1.
4. Click Undo. Confirm all moved courses snap back to their original semesters in one step.
5. Click "Rebalance Plan" when all semesters are already balanced. Confirm the "already
   balanced" error message appears and no moves are made.

---

## Post-branch Checklist

- [ ] `npm run test` — all tests pass; new `planBalancer.test.js` has ≥ 7 cases.
- [ ] Manual verification passes for all 5 scenarios above.
- [ ] `docs/claude/BRANCH_QUEUE.md` — `feat/plan-balancer` moved to Merged Branches with today's date.
- [ ] `docs/claude/BRANCH_plan-balancer.md` deleted in close-out commit.
- [ ] Merge to `main`. Do not force-push.
