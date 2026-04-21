# Branch Context: fix/onboarding-prior-credit

> **Read this file immediately after CLAUDE.md** at the start of any session on this branch.
> Delete this file only right before merging into main.

---

## What This Branch Does

This branch fixes six bugs in the onboarding and prior credit wizard flow, surfaced by live onboarding-session testing on 2026-04-20 and documented as BUG-20 through BUG-25 in `bug.md`. All six bugs affect the first-use experience: data corruption at wizard entry, plan not reflecting entered credits, and duplicate prior credit records on drag-to-transfer.

The bugs addressed:

1. **BUG-20 (Critical)** — Transfer credit wizard accepts freeform course codes with no catalog validation
2. **BUG-21 (High)** — Transfer credit wizard allows user-editable credits field
3. **BUG-22 (High)** — Prior credit wizard scoped to Semester 1 placement credits only; no path for transfer/continuing students
4. **BUG-23 (High)** — AP/placement credits tag slots but don't archive them from the grid
5. **BUG-24 (High)** — Drag-to-transfer on a prior-credit-covered course duplicates the record
6. **BUG-25 (Medium)** — Notes field in transfer credit wizard is unused and misleading

---

## Non-Goals

This branch does NOT:

- Redesign the wizard UI beyond what's necessary to fix these bugs
- Touch the semester grid layout, slot row visuals, or mark-complete behavior
- Add term (Fall/Spring/Summer) support — that's a separate Phase 2 schema branch
- Introduce the Plan/What-If tab split — that's Phase 3
- Change any signatures in `src/lib/` (`checkPrereqs`, `checkCoreqs`, `computePlanCredits`, `resolveTransferCredits`, `resolveTransferDetails`, `validatePriorCredit`)
- Address any other bugs in `bug.md` (BUG-1 through BUG-19), even if noticed in passing

If scope creep is tempting, stop and ask.

---

## Implementation Order

Bugs must be fixed in this order because fixes build on each other:

1. **BUG-20 first** — Add catalog validation to `validatePriorCredit` for `transfer_credit`. Replace the free-text course code input in `PriorCreditWizard` with a searchable dropdown bound to the catalog.
2. **BUG-21 next** — Once the wizard has a catalog-bound course picker, auto-populate `credits_awarded` from `courses.credits` as read-only.
3. **BUG-25 together with BUG-21** — Remove the notes field from the transfer credit step while editing that same step.
4. **BUG-23** — Fix the archiving call after `handleAddPriorCredit` during onboarding so AP/placement credits remove their covered slots from the grid.
5. **BUG-24** — Add a dedup guard in the drag-to-transfer handler in `DegreePlan.jsx` to prevent creating a second `prior_credits` record when one already exists for the same `satisfies_course_code`.
6. **BUG-22 last** — Expand the wizard with a first-time-freshman branching question and full prior coursework entry flow. This is the largest piece of work and should happen after the smaller fixes land and have passing tests.

---

## Commit Plan

Six commits, one per bug, in the order above:

1. `fix: validate transfer course codes against catalog (BUG-20)`
2. `fix: read transfer credits from catalog as read-only (BUG-21)`
3. `fix: remove unused notes field from transfer credit wizard (BUG-25)`
4. `fix: archive slots for AP/placement credits entered at onboarding (BUG-23)`
5. `fix: prevent duplicate prior_credits on drag-to-transfer (BUG-24)`
6. `feat: expand prior credit wizard for non-freshman students (BUG-22)`

All existing 169 tests must pass at each commit boundary. New tests added per bug.

---

## Files Expected to Change

### Frontend (`MyDegreePlan_Frontend/`)

| File | Bugs | Summary |
|---|---|---|
| `src/components/PriorCreditWizard.jsx` | 20, 21, 22, 25 | Catalog-bound course picker; read-only credits; remove notes; freshman branching flow |
| `src/components/Onboarding.jsx` | 22 | Add "Are you a first-time freshman?" branching question |
| `src/components/DegreePlan.jsx` | 23, 24 | Ensure archiving runs after wizard entries; dedup guard on drag-to-transfer |
| `src/lib/validatePriorCredit.js` | 20 | Reject `transfer_credit` with course code not in catalog |
| `src/tests/validatePriorCredit.test.js` | 20 | New test cases for catalog validation |
| `src/tests/transferCredits.test.js` | 23, 24 | New test cases for archiving and dedup |

No migrations expected. No changes to `src/lib/transferCredits.js` signatures.

---

## Test Protocol

Before every commit:

```
cd MyDegreePlan_Frontend
npm run test
```

All 169 existing tests must pass. New tests added per bug must also pass. If any existing test fails due to a fix, stop and report — do not modify tests to accommodate new behavior without explicit approval.

---

## Known Constraints

- `validatePriorCredit` signature must not change. Any new validation logic goes inside the existing function body.
- `credits_awarded` on `prior_credits` is always authoritative from the catalog or `test_equivalencies` — never from user input. This is a core project principle per `CLAUDE.md`.
- The wizard's freshman branching flow (BUG-22) may need new component state or step logic, but must not require schema changes. `prior_credits.credit_type` already supports `'transfer_credit'`, `'test_out'`, `'ap_credit'`, `'ib_credit'`, `'act_credit'`, `'act_placement'`, and `'cambridge'`.
- `student_profiles` does not currently have a "first-time freshman" flag. For BUG-22, decide whether to (a) add a column via a new migration, or (b) infer from absence of transfer credits post-onboarding. Option (b) is preferred to avoid schema changes on this branch. Confirm with the project owner before implementing.

---

## Open Question for the Project Owner

**BUG-22 implementation scope:** The fix expands the wizard to serve transfer and continuing students, not just freshmen. Two implementation depths are possible:

1. **Minimum:** A single "Add a completed TTU course" flow after the AP/ACT steps, catalog-bound, one entry at a time. Gets transfer students unblocked.
2. **Full:** A semester-by-semester prior coursework entry mode that mirrors what an advisor would see on a transcript.

Default to option 1 unless the project owner specifies option 2. Option 2 is a significant wizard rebuild and may warrant its own branch.
