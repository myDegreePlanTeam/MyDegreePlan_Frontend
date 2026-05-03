# Branch: `fix/prereq-display`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: a four-line change in `checkPrereqs` to conditionally suppress placement
> warnings only when the student has a recorded `act_placement` prior credit for the
> course, plus regression tests. No signature change, no schema change, no migration.

---

## What This Branch Does

Closes BUG-31: for placement-gated courses like MATH1910 (whose description
matches the ACT/SAT patterns in `classifyPrereq`), `checkPrereqs` currently
returns `{ satisfied: true }` unconditionally — regardless of whether the
student has recorded an ACT placement score. A student with no prior math
courses and no ACT score sees MATH1910 with no prereq warning, creating false
confidence that the course is available. The fix conditions the placement
short-circuit on the presence of an `act_placement` prior credit entry for that
specific course; without one, the normal prereq groups are evaluated and the
standard missing-course warning appears.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-31 (Medium)** — MATH1910 prereq display omits ACT Math 27+ OR gate.

`consent`-classified courses keep the unconditional `{ satisfied: true }` return
because instructor approval genuinely cannot be verified by the planner. Only
`placement` changes behaviour.

---

## Root Cause (verified against live code)

`src/lib/prereqChecker.js` lines 115–118:

```js
const classification = classifyPrereq(courseCode, null, courseMap)
if (classification === 'placement' || classification === 'consent') {
  return { satisfied: true }
}
```

`classifyPrereq('MATH1910', null, courseMap)` → `'placement'` because the
description contains **"ACT mathematics score of 27"** which matches the pattern
`/act math(ematics)?\s+score/i`. The OR branch with `'consent'` then returns
`{ satisfied: true }` before any prerequisite groups are checked.

`act_placement` prior credit rows (e.g. ACT Math ≥ 27 entered via the wizard)
already carry `satisfies_course_code = 'MATH1910'` and `credits_awarded = 0`.
The fix reads those rows — already present in the `priorCredits` parameter — to
distinguish "student recorded the score" from "student did not."

---

## Non-Goals / Out of Scope

Do not touch on this branch:

- `src/lib/classifyPrereq.js` — detection logic is correct; only the
  consumer in `checkPrereqs` changes.
- `checkPrereqs` / `checkCoreqs` signatures — must not change per `CLAUDE.md`.
- `src/components/SlotModal.jsx` — the `annotate` function calls
  `checkPrereqs` with all parameters already; no change needed there.
- `src/components/Semester.jsx` / `DegreePlan.jsx` — prereq warning
  wiring is unchanged.
- The prereq display text itself ("Needs: …") — `formatMissingForDisplay`
  handles presentation; MATH1910's course-based prereqs will read as
  "Needs: MATH1730 or (MATH1710 and MATH1720)" once the suppression
  is lifted for students without a recorded score, which is correct.
- `consent`-classified courses — behaviour is unchanged; consent cannot
  be verified.
- `BUG-32` (strip course descriptions) — separate data branch.
- Package L, M, N — separate fix branches.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/prereq-display`.
2. Run `npm run test` from `MyDegreePlan_Frontend/`. Baseline: **12 files,
   262 tests passed**. Stop and report if it does not match.
3. Read in full before editing:
   - `src/lib/prereqChecker.js` lines 94–165 (the full `checkPrereqs` body).
   - `src/lib/classifyPrereq.js` lines 22–56 (ACT/consent patterns +
     `classifyPrereq` function).
   - `src/tests/prereqCheckerPlacement.test.js` (all lines) — four existing
     placement fixtures use `credit_type: 'dual_enrollment'` which is
     schema-invalid per BUG-16; leave them as-is (BUG-16 is deferred).

---

## Implementation Order

Single bug, two commits:

1. **Logic fix + tests** — patch `checkPrereqs`, add test cases.
2. **Close-out** — `bug.md`, `BRANCH_QUEUE.md`, `PACKAGES.md`, delete
   planning docs.

---

## Plan

### Commit 1 — `src/lib/prereqChecker.js` + `src/tests/prereqCheckerPlacement.test.js`

**File:** `src/lib/prereqChecker.js` lines 115–118.

Replace the placement/consent early-return with:

```js
// ── Placement / consent classification ───────────────────────
// consent: planner cannot verify instructor approval → always suppress.
// placement: suppress ONLY if the student has recorded a matching
//   act_placement prior credit (satisfies_course_code === courseCode,
//   credits_awarded === 0).  Without one, fall through to normal prereq
//   group checking so the standard "Needs: MATH1730 or …" warning appears.
const classification = classifyPrereq(courseCode, null, courseMap)
if (classification === 'consent') {
  return { satisfied: true }
}
if (classification === 'placement') {
  const hasPlacement = (priorCredits ?? []).some(
    pc => pc.credit_type === 'act_placement'
       && pc.satisfies_course_code === courseCode
  )
  if (hasPlacement) return { satisfied: true }
  // No recorded placement — fall through to evaluate course prereqs
}
```

Everything below (the enhanced satisfiedCodes block and the group loop) is
unchanged. The fallthrough path is exercised for placement-classified courses
where the student has no `act_placement` entry.

**File:** `src/tests/prereqCheckerPlacement.test.js` — add four new test cases
at the end of the existing suite (do not renumber or reorder existing tests):

| # | Scenario | Expected |
|---|---|---|
| 1 | placement-classified course + matching `act_placement` prior credit | `{ satisfied: true }` |
| 2 | placement-classified course + no prior credits | `{ satisfied: false, missing: [...] }` |
| 3 | placement-classified course + act_placement for a DIFFERENT course | `{ satisfied: false, missing: [...] }` |
| 4 | placement-classified course + act_placement entry but satisfying prereq course also in satisfiedCodes | `{ satisfied: true }` via normal prereq path |

For each test, set up a minimal `prereqMap` and `courseMap` (only the target
course's description needs the ACT pattern text). The existing `FAKE_COURSE_MAP`
fixture already has an `act_placement` course entry — reuse it where possible.

---

## Files Expected to Change

| File | Bug | Summary |
|---|---|---|
| `src/lib/prereqChecker.js` | BUG-31 | Split placement/consent returns; add act_placement guard |
| `src/tests/prereqCheckerPlacement.test.js` | BUG-31 | 4 new test cases |

Docs-only close-out commit:

| File | Change |
|---|---|
| `docs/claude/bug.md` | Remove BUG-31 entry |
| `docs/claude/BRANCH_QUEUE.md` | Move `fix/prereq-display` to Merged Branches table |
| `docs/claude/PACKAGES.md` | Update open-bug counts |
| `docs/claude/BRANCH_prereq-display.md` | Delete this file |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline before editing: **12 files, 262 tests**. After commit 1: 12 files,
266 tests (4 new). All must pass at every commit boundary.

---

## Commit Plan

```
fix(prereq): suppress placement warning only when act_placement prior credit exists (BUG-31)
```

Body: "classifyPrereq returns 'placement' for courses like MATH1910 that mention
an ACT score threshold in their description. Previously checkPrereqs returned
{ satisfied: true } unconditionally for any placement-classified course. Now it
short-circuits only when the student has a recorded act_placement prior credit
with satisfies_course_code matching the course. Without one, normal prereq group
evaluation runs and emits the standard missing-course warning."

```
docs: close out fix/prereq-display (BUG-31)
```

---

## Known Constraints

- `checkPrereqs` signature must not change — per `CLAUDE.md` core rule.
- `consent` classification keeps its unconditional return; only `placement`
  is made conditional.
- BUG-16 (stale `dual_enrollment` fixtures in the placement test file) is
  deferred. Do not "fix" those fixtures as a side effect of this branch — they
  do not affect `credit_type` checking in `checkPrereqs`.

---

## Manual Verification

**Setup:** Log in as a fresh student, select a concentration, skip the wizard
(no prior credits).

**Scenario A — no score, no prior math course:**
Open the degree plan. Find MATH1910 in Semester 1. **Before fix:** no prereq
warning (false confidence). **After fix:** ⚠ prereq warning citing MATH1730
or (MATH1710 and MATH1720).

**Scenario B — ACT Math ≥ 27 entered in wizard:**
Run the wizard, enter ACT score ≥ 27. Open the plan. MATH1910 slot should show
**no prereq warning** (placement entry satisfies the gate). Reload to confirm
it persists.

**Scenario C — MATH1730 in satisfiedCodes (earlier semester):**
Place MATH1730 in Semester 1, MATH1910 in Semester 2. MATH1910 should show
**no prereq warning** (falls through to normal group check; MATH1730 satisfies
the OR group).

**Scenario D — consent-classified course:**
Verify a course with "Consent of instructor" in its description still shows no
prereq warning regardless of prior credits.

---

## Post-branch Checklist

- [ ] 266 tests pass (`npm run test`)
- [ ] Scenarios A–D verified in `npm run dev`
- [ ] `bug.md` BUG-31 entry removed
- [ ] `BRANCH_QUEUE.md` updated (move to Merged Branches, today's date)
- [ ] `PACKAGES.md` bug counts updated
- [ ] This file (`BRANCH_prereq-display.md`) deleted
- [ ] Branch merged to main (`--ff-only`)
- [ ] Push to origin
