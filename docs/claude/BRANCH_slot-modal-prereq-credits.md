# Branch: `fix/slot-modal-prereq-credits`

> Active-branch context. Delete before merge.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: three related bugs in `src/components/SlotModal.jsx`. Prop-thread additions in `src/components/DegreePlan.jsx`.

## Bugs in scope (from `docs/claude/bug.md`, 2026-04-17 audit)

- **BUG-1** — `annotate()` calls `checkPrereqs` with 3 args, dropping `priorCredits`, `courseMap`, `coreqMap`
- **BUG-2** — `satisfiedCodes` includes codes from every semester; must be restricted to prior semesters
- **BUG-5** — `creditsBefore` ignores `priorCredits` and `planSemesterOverrides`

All three are rooted in the same structural omission: `SlotModal` does not receive the state `DegreePlan` already holds. Do **not** change `checkPrereqs` or `computePlanCredits` signatures — they are explicitly marked stable in `docs/claude/CLAUDE.md`.

## Out of scope

- BUG-3, BUG-4, BUG-6 through BUG-19 from `bug.md` — separate branches.
- Refactoring `annotate` out of `SlotModal`. Keep the minimal diff.
- New abstractions for shared logic between `DegreePlan.prereqWarnings` and `SlotModal.annotate`. Duplication is acceptable here; the audit's "Suspected fix" is additive.

## Preconditions

1. Confirm you are on `fix/slot-modal-prereq-credits` from `MyDegreePlan_Frontend/`. If not: `git checkout fix/slot-modal-prereq-credits`.
2. Run `npm run test` — all eight suites must pass before any edit.
3. Read in full before editing:
   - `src/components/SlotModal.jsx`
   - `src/components/DegreePlan.jsx` lines 1–100, 380–500 (prereq/coreq memos reference the same vars), 1150–1165 (SlotModal render)
   - `src/lib/prereqChecker.js`
   - `src/lib/transferCredits.js`

## Existing state in `DegreePlan.jsx` (already present — just thread through)

| Variable | Defined at | Notes |
|---|---|---|
| `courses` | state, `setCourses(courseMap)` around L271 | already passed as `courseMap={courses}` prop |
| `priorCredits` | state L45 | |
| `coreqMap` | state L47 | |
| `planSemesterOverrides` | state L41 | `{ [reqSlotId]: number }` |

The existing grid prereq memo (L403) already calls `checkPrereqs(item.code, prereqMap, completedCodes, priorCredits, courses, coreqMap)` — this is the contract `SlotModal` must match.

## Plan

### Step 1 — Thread new props into `SlotModal`

**`src/components/DegreePlan.jsx` L1154–1164** — add three props to the existing `<SlotModal>` render:

```jsx
<SlotModal
  slot={activeSlot}
  courseMap={courses}
  studentId={profile.id}
  planSlots={planSlots}
  slots={slots}
  prereqMap={prereqMap}
  coreqMap={coreqMap}                          // new
  priorCredits={priorCredits}                  // new
  planSemesterOverrides={planSemesterOverrides} // new
  onSave={handleSave}
  onRemove={handleRemove}
  onClose={() => setActiveSlot(null)}
/>
```

**`src/components/SlotModal.jsx` L6–15** — add the three destructured props:

```jsx
export default function SlotModal({
  slot,
  courseMap,
  planSlots,
  slots,
  prereqMap,
  coreqMap,                // new
  priorCredits,            // new
  planSemesterOverrides,   // new
  onSave,
  onRemove,
  onClose,
}) {
```

No behavior change yet. This step exists to isolate the scaffolding diff from the logic diffs.

### Step 2 — BUG-1: pass full argument list to `checkPrereqs`

**`src/components/SlotModal.jsx` L138** — replace:

```js
const result = checkPrereqs(course.code, prereqMap, satisfiedCodes)
```

with:

```js
const result = checkPrereqs(
  course.code,
  prereqMap,
  satisfiedCodes,
  priorCredits,
  courseMap,
  coreqMap,
)
```

Match the exact argument order of the existing call in `DegreePlan.jsx` L403.

### Step 3 — BUG-2: restrict `satisfiedCodes` to prior semesters

**`src/components/SlotModal.jsx` L85–89** — replace the memo with:

```js
const satisfiedCodes = useMemo(() => {
  const targetSem = planSemesterOverrides?.[slot.id] ?? slot.semester_number
  const codes = new Set()
  for (const s of slots) {
    const sSem = planSemesterOverrides?.[s.id] ?? s.semester_number
    if (sSem >= targetSem) continue
    if (s.is_pool) {
      const code = planSlots[s.id]
      if (code) codes.add(code)
    } else {
      codes.add(s.class_code)
    }
  }
  return codes
}, [slots, planSlots, planSemesterOverrides, slot.id, slot.semester_number])
```

Rationale:
- `checkPrereqs` contractually takes "completed codes (prior semesters only)." Strictly `<`, not `<=`: coreqs are the same-semester case and are handled inside `checkPrereqs` via `isCoreqForCourse`.
- `planSemesterOverrides` is the authoritative semester after drag — must override the template's `semester_number` on both sides of the comparison.
- Prior credits are *not* added here — `checkPrereqs` enhances the set internally from the `priorCredits` argument (see `prereqChecker.js` L120–131). Adding them here too would work but would duplicate logic. Let the checker own it.

### Step 4 — BUG-5: include prior credits and honor `planSemesterOverrides` in `creditsBefore`

**`src/components/SlotModal.jsx` L105–116** — replace the memo with:

```js
const creditsBefore = useMemo(() => {
  const targetSem = planSemesterOverrides?.[slot.id] ?? slot.semester_number
  const seen = new Set()
  let total = 0

  // Pass 1: prior credits (authoritative; win over plan slots for same code)
  for (const pc of (priorCredits ?? [])) {
    if ((pc.credits_awarded ?? 0) <= 0) continue
    if (!pc.satisfies_course_code) continue
    if (seen.has(pc.satisfies_course_code)) continue
    seen.add(pc.satisfies_course_code)
    total += pc.credits_awarded
  }

  // Pass 2: plan slots in semesters strictly before the target
  for (const s of slots) {
    const sSem = planSemesterOverrides?.[s.id] ?? s.semester_number
    if (sSem >= targetSem) continue
    let code, credits
    if (s.is_pool) {
      code = planSlots[s.id]
      if (!code) continue
      credits = courseMap[code]?.credits ?? s.flex_credits ?? 3
    } else {
      code = s.class_code
      credits = courseMap[code]?.credits ?? 0
    }
    if (seen.has(code)) continue
    seen.add(code)
    total += credits
  }

  return total
}, [slots, planSlots, courseMap, priorCredits, planSemesterOverrides, slot.id, slot.semester_number])
```

Rationale:
- Mirrors `computePlanCredits` dedup shape (prior credits first, plan slots skipped if code already seen) so the two numbers cannot disagree on the same data.
- Strict `<` on semester, consistent with the standing-hours interpretation ("before this semester").
- Zero-credit prior credits (placement-only) are correctly excluded.

## Test coverage

No existing SlotModal tests to extend. Two acceptable paths:

**Preferred — add pure-function coverage for the new invariants via the existing suites.** The modal's memos are not exported, but the underlying invariants they rely on are already exercised:
- `computePlanCredits` dedup is covered in `src/tests/computePlanCredits.test.js`. No change needed — `creditsBefore` follows the same rule, so if that suite passes the dedup shape is validated.
- `checkPrereqs` priorCredits/courseMap/coreqMap paths are covered in `src/tests/prereqCheckerPlacement.test.js` and `src/lib/__tests__/prereqChecker.test.js`. No change needed.

**Optional — add a focused regression test.** If you feel the three SlotModal memos warrant explicit coverage, extract them to pure helpers (e.g. `src/lib/slotModalHelpers.js` exporting `computeSatisfiedCodes`, `computeCreditsBefore`) and unit-test there. This is scope creep against the "minimal diff" rule — only do it if the user confirms.

Default: **skip the optional path.** Manual verification below is the bar.

## Manual verification (golden paths)

Boot the dev server (`npm run dev` from `MyDegreePlan_Frontend/`) and verify in a browser. Seed data must include at least one student with prior credits.

1. **BUG-1 fix — prior credits unlock downstream courses**
   - Student has AP credit for `MATH1910`.
   - Open the `SCIENCE` or any elective slot in a semester where a course whose only prereq is `MATH1910` is listed (e.g. `MATH1920`).
   - Before fix: `MATH1920` shows "Prereqs needed".
   - After fix: `MATH1920` shows "Available".

2. **BUG-1 fix — placement/consent suppression**
   - Any course whose own description mentions "ACT" / "SAT" / "Consent of instructor" should appear Available in the modal regardless of prereqs (matches grid behavior).

3. **BUG-2 fix — no backward-time prereq satisfaction**
   - Put a course in Semester 5 whose only prereq is a course placed in Semester 7.
   - Open the Semester 5 course's modal.
   - Before fix: the course appears Available.
   - After fix: the course shows "Prereqs needed: <code>".

4. **BUG-5 fix — prior credits count toward standing**
   - Student has enough prior credits (AP/transfer) to sum ≥ 60 hrs before any plan slot.
   - Open a Semester 1 slot that offers a junior-standing course.
   - Before fix: junior-standing course is locked with "Requires junior standing".
   - After fix: junior-standing course is Available.

5. **BUG-5 fix — drag respects standing**
   - Drag a senior-standing course from Semester 8 to Semester 5.
   - Before fix: the modal for a different slot may still calculate standing against the template layout.
   - After fix: `creditsBefore` reflects the `planSemesterOverrides` layout.

## Commit structure

One commit per bug, in order. Each must leave tests green.

```
fix: thread priorCredits, courseMap, coreqMap into SlotModal.checkPrereqs (BUG-1)

fix: restrict SlotModal.satisfiedCodes to prior semesters (BUG-2)

fix: include priorCredits and planSemesterOverrides in SlotModal.creditsBefore (BUG-5)
```

Step 1 (prop scaffolding) goes into the BUG-1 commit — it is strictly required for that fix and not useful on its own. Each commit should reference the audit entry by number in the body.

## Post-branch checklist

- [ ] `npm run test` green
- [ ] Manual verification items 1–5 pass
- [ ] `docs/claude/bug.md` updated: remove BUG-1, BUG-2, BUG-5 (follow the precedent set by the 2026-04-17 BUG-1 removal at the top of `bug.md` — renumber remaining bugs? Confirm with user; the audit does renumber.)
- [ ] This branch-context doc deleted (`git rm docs/claude/BRANCH_slot-modal-prereq-credits.md`)
- [ ] Merge to `main`, delete the local branch
