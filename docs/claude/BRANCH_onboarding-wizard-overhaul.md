# Branch: `fix/onboarding-wizard-overhaul`

> **Read this file immediately after `docs/claude/CLAUDE.md`** at the start of any
> session on this branch. Delete this file right before merging into `main`.

---

## What This Branch Does

Consolidates every remaining onboarding- and prior-credit-related bug into one
pass over `Onboarding.jsx`, `PriorCreditWizard.jsx`, `validatePriorCredit.js`,
and the Prior Coursework panel in `DegreePlan.jsx`. Also executes the product
decision to remove the freshman/non-freshman wizard branching and make the
unified `PriorCreditWizard` flow the only entry path.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-4 (High)** — `PriorCreditWizard` transfer-credit pool resolution is
   concentration-agnostic; `CSC2220` always resolves to `CSC_LOWER_ELECTIVE`
   even on Cybersecurity/DSAI (no such slot).
2. **BUG-8 (Medium)** — `validatePriorCredit` does not enforce `min_score` for
   scored exams; a direct-API caller can claim score=2 → 4 cr.
3. **BUG-26 (High)** — Transfer-credit catalog search returns no results.
   **Interim fix**: disable + grey out as "Coming soon". Real fix deferred.
4. **BUG-27 (High)** — `Onboarding.jsx` step 3 has no Back button (the wizard
   modal has one — this is about the outer Onboarding flow).
5. **BUG-28 (High)** — After removing the freshman branch, no UI path exists
   for entering ACT scores. ACT becomes a universal step in `PriorCreditWizard`
   accessible during and after onboarding.
6. **BUG-29 (Medium)** — `PriorCreditDraggableRow` renders
   `{chip}{code}{note}{cr}` as adjacent spans; without CSS separators the
   output reads as `"ENGL2235AP Exam: English Literature and Composition,
   score 33 cr"`. Fix is structural (explicit separators) + CSS, not CSS only.
7. **BUG-30 (Medium)** — Prior Coursework panel and
   `Onboarding` non-freshman pending list render entries in insertion order
   with no grouping by credit type. Target order: AP → IB → ACT → CLEP →
   Transfer → Cambridge → Other.
8. **Product decision** — Delete the freshman/non-freshman branching. Every
   student uses the unified `PriorCreditWizard` for all prior-credit entry.

---

## Out of Scope

Do **not** touch any of the following on this branch, even if noticed in passing:

- `checkPrereqs`, `checkCoreqs`, `computePlanCredits`, `resolveTransferCredits`,
  `resolveTransferDetails` — signatures are frozen per `CLAUDE.md` core principles.
- `validatePriorCredit` signature — extension must be backwards-compatible
  (defaulted parameter, same argument order).
- BUG-31 (MATH1910 prereq display) — queued next as `fix/prereq-display`,
  depends on this branch's ACT entry path landing first.
- BUG-7 (concentration switch leaks `student_semester_notes`) — grid
  concern, wrong branch.
- BUG-13 (later-semester completion bleeds into earlier prereq resolution) —
  grid concern, wrong branch.
- BUG-32 (course descriptions have redundant prereq text) — data-edit branch.
- The real fix for BUG-26 (actual transferable-course DB) — listed in
  `BRANCH_QUEUE.md` under Deferred Data Tasks.
- Semester term (Fall/Spring/Summer) work — Phase 2 schema branch.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/onboarding-wizard-overhaul`.
2. `npm run test` must report **8 files, 178 tests passed** before any edit.
   If it does not, stop and report.
3. Read in full before editing:
   - `src/components/Onboarding.jsx`
   - `src/components/PriorCreditWizard.jsx`
   - `src/components/DegreePlan.jsx` — lines 21–30 (`CREDIT_TYPE_LABELS`),
     1104–1110 (`TransferCreditsPanel` render), 1229–1236 (wizard render),
     1304–1390 (`PriorCreditDraggableRow`, `TransferCreditsPanel`)
   - `src/lib/validatePriorCredit.js`
   - `src/lib/poolResolver.js` — `POOL_COURSES` (L11–176) and `POOL_LABELS`
4. Check whether `test_equivalencies` already seeds ACT Math 27+ → MATH1910 as
   `act_placement`. Per `BRANCH_fix-act-wizard-and-equivalencies.md`, it does
   **not**. BUG-28 therefore requires one or both of:
   - A new `test_equivalencies` seed row (`migration_tierN.sql` + update
     `MyDegreePlan_Prototype/test_equivalencies.sql`), OR
   - Wizard-side synthesis of an `act_placement` option from a hard-coded
     table (matches the current `Onboarding.jsx` `PRIOR_CREDIT_OPTIONS` style).
   Pick the seed-row path. Lower blast radius and keeps data in one place.

---

## Implementation Order

Ordered so every commit boundary leaves `npm run test` green and manual flows
usable. Big structural changes last.

1. **BUG-26 — grey out transfer-credit option.** Small UI-only change in
   `CREDIT_TYPES` (`PriorCreditWizard.jsx:23–30`) and the freshman checkbox row
   (`Onboarding.jsx:455–466`). Render disabled with a `"Coming soon"` pill.
2. **BUG-29 — format wizard-row output.** Structural change in
   `PriorCreditDraggableRow` (`DegreePlan.jsx:1306–1340`) plus matching CSS in
   `Dashboard.css`. Add a visible separator (` · `) span between fields and
   explicit gap. Apply the same layout to the `Onboarding.jsx` `pendingRecords`
   list (L546–567).
3. **BUG-30 — sort + group prior coursework.** New helper
   `groupAndSortPriorCredits(priorCredits)` in a new file
   `src/lib/priorCreditOrdering.js`. Returns `[{ type, label, entries }]`.
   Apply in `TransferCreditsPanel` (`DegreePlan.jsx:1377–1381`) and in the
   `Onboarding.jsx` non-freshman pending list. New test file
   `src/tests/priorCreditOrdering.test.js`.
4. **Freshman branch removal.** Delete the `isFirstTimeFreshman` state and the
   freshman-branch step-3 UI in `Onboarding.jsx` (L85, L215–218, L384–417,
   L439–531). Keep the non-freshman path — promote it to the only path. The
   `PRIOR_CREDIT_OPTIONS` constant (L22–73) and the freshman-only transfer
   sub-form are deleted.
5. **BUG-4 — concentration-aware pool resolution.** Thread the active
   concentration's `requirement_slots` into the wizard. `DegreePlan.jsx`
   already has `slots` and passes it through (L1234). `Onboarding.jsx` passes
   `slots={[]}` (L606) — change the wizard's launcher to fetch
   `requirement_slots` for the selected concentration before opening. In
   `PriorCreditWizard.jsx` L114–120, replace the flat iteration with:
   ```js
   const planPoolCodes = new Set(
     (slots ?? [])
       .filter(s => s.is_pool)
       .map(s => s.class_code)
   )
   let satisfiesPool = null
   for (const [poolCode, codes] of Object.entries(POOL_COURSES)) {
     if (!planPoolCodes.has(poolCode)) continue
     if (codes?.includes(selectedExam.code)) { satisfiesPool = poolCode; break }
   }
   ```
   Add a `transferCredits.test.js` case: given a Cybersecurity slot set, a
   transfer credit for `CSC2220` must resolve `satisfies_pool = 'CSC_ELECTIVE'`
   (not `CSC_LOWER_ELECTIVE`).
6. **BUG-8 — `min_score` enforcement.** Extend `validatePriorCredit` with an
   optional sixth parameter `userScore` (default `null`). When non-null and
   `creditType` is in `SCORED_EXAM_TYPES`, filter matching rows with
   `row.min_score <= userScore`; reject if no qualifying row exists. Update
   the call site in `Onboarding.jsx:263–269` (no score available there —
   still passes `null`, no regression) and add a new call site in
   `PriorCreditWizard.handleApply` (L225–248) that passes `selectedScore`.
   New `validatePriorCredit.test.js` cases:
   - AP Calculus AB, score=2, MATH1910 → rejected
   - AP Calculus AB, score=3, MATH1910 → valid
   - AP Calculus AB, score=null, MATH1910 (legacy caller) → valid
7. **BUG-27 — Onboarding back button.** Add a Back control on step 3 of
   `Onboarding.jsx` returning to step 2 with all step-2 state preserved.
   The step-2 Back already exists (L421–427). No state-preservation work
   needed there.
8. **BUG-28 — universal ACT step.** The wizard's Step 1 (`CREDIT_TYPES`
   L23–30) already has `act_credit`. Add `act_placement` as a distinct
   credit type option (label: `"ACT Placement (no credit awarded)"`,
   `hasScore: true`). In the Step 2 exam-list effect (L59–74), ensure
   `act_placement` queries `test_equivalencies` the same way `act_credit`
   does — the effect already filters by `creditType`, so this works
   automatically once the seed rows exist. Add the seed:
   - New migration `MyDegreePlan_Prototype/migration_tier13.sql` — no schema
     change (CHECK constraint already allows `act_placement` per migration
     tier 10); this tier file exists solely to add rows, not alter schema.
     Actually — inserts belong in `test_equivalencies.sql`, not a migration.
     Add rows to `MyDegreePlan_Prototype/test_equivalencies.sql` with
     `test_type = 'act_placement'`, `test_name = 'ACT Math'`, `min_score = 27`,
     `awarded_course_code = 'MATH1910'`, `credits_awarded = 0`,
     `satisfies_pool = NULL`. Re-seed Supabase after applying.
   - The `DegreePlan.jsx` `onAddClick` path for the Prior Coursework panel
     already opens `PriorCreditWizard` (L1229–1236); the new `act_placement`
     option is therefore automatically accessible post-onboarding.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/Onboarding.jsx` | 26, 27, branching | Delete freshman branch + `PRIOR_CREDIT_OPTIONS` + transfer sub-form; add step-3 Back; grey-out label on transfer option (actually removed along with sub-form); wire unified wizard only |
| `src/components/PriorCreditWizard.jsx` | 4, 8, 26, 28 | Concentration-aware pool match; pass `userScore` into validator; disabled transfer option; add `act_placement` to `CREDIT_TYPES` |
| `src/components/DegreePlan.jsx` | 29, 30 | Restructured `PriorCreditDraggableRow`; grouped `TransferCreditsPanel`; fetch concentration slots before opening wizard (already done) |
| `src/lib/validatePriorCredit.js` | 8 | Optional `userScore` parameter; additional rejection branch |
| `src/lib/priorCreditOrdering.js` (new) | 30 | `groupAndSortPriorCredits(priorCredits)` pure helper |
| `src/Dashboard.css` (or co-located CSS) | 29 | Separator + gap for prior-credit row |
| `src/tests/priorCreditOrdering.test.js` (new) | 30 | Grouping + ordering |
| `src/tests/validatePriorCredit.test.js` | 8 | 3 new score-gate cases |
| `src/tests/transferCredits.test.js` | 4 | 1 new concentration-aware pool case |
| `MyDegreePlan_Prototype/test_equivalencies.sql` | 28 | ACT Math 27+ → MATH1910 (`act_placement`) rows |

No `requirement_slots`, `prior_credits`, or other schema changes.

---

## Test Protocol

Before every commit:

```
cd MyDegreePlan_Frontend
npm run test
```

Baseline: **178 tests across 8 files**. Expected after this branch: 178 +
(BUG-4 test) + (BUG-8 tests, 3) + (ordering tests, ~5–8) = ~187–190. Do not
modify existing tests to accommodate new behavior — if an existing test starts
failing, stop and explain before changing it.

After the `test_equivalencies.sql` edit, apply it manually in Supabase Dashboard
SQL Editor (the script uses `ON CONFLICT DO NOTHING`, so re-runs are safe).
This is a prerequisite for end-to-end verification of BUG-28 but not for
`npm run test`.

---

## Commit Plan

Eight commits, one per implementation step, in this exact order:

```
fix: grey out transfer credit option as Coming Soon (BUG-26)

fix: format prior credit row fields with explicit separators (BUG-29)

fix: group prior coursework by credit type with ordered sections (BUG-30)

refactor: remove freshman/non-freshman onboarding branching

fix: resolve transfer credit pools against active concentration (BUG-4)

fix: enforce min_score in validatePriorCredit for scored exams (BUG-8)

feat: add back navigation to onboarding step 3 (BUG-27)

feat: ACT placement as universal wizard step (BUG-28)
```

Commit messages reference the BUG-N in the body and name the primary files changed.

---

## Known Constraints

- `validatePriorCredit` signature extension must be strictly additive
  (`userScore = null` default), matching the convention used for
  `checkPrereqs(..., priorCredits = [], courseMap = {})`. Existing callers
  (`Onboarding.handleFinishWithCredits`, wizard's `handleApply`) must still
  work untouched.
- `credits_awarded` on `prior_credits` remains catalog/equivalency-authoritative
  (project principle). This branch does not add a user-editable credits field
  anywhere.
- No schema migration. `act_placement` is already in the
  `prior_credits.credit_type` CHECK constraint (tier 10) and in the
  `test_equivalencies.test_type` CHECK constraint.
- Removing `isFirstTimeFreshman` is a UI-only change — nothing is persisted
  to `student_profiles`, so no data migration is required.
- The `PriorCreditWizard` is mounted in two places (`Onboarding.jsx` L601–608
  and `DegreePlan.jsx` L1229–1236). Both must receive the concentration's
  slot set. `Onboarding.jsx` currently passes `slots={[]}` — after this
  branch, it must fetch `requirement_slots` for the selected concentration
  before opening the wizard (or the wizard itself performs the fetch given
  a concentration id).

---

## Manual Verification

Start the dev server (`npm run dev`) with a clean Supabase test user. Re-seed
`test_equivalencies.sql` first if BUG-28 rows are needed.

1. **BUG-26** — Open wizard from Onboarding step 3. The "Transfer Credit"
   option is greyed out with "Coming soon" text and is not clickable.
2. **BUG-27** — On Onboarding step 3, click Back. You return to step 2 with
   the selected concentration, start season, and start year preserved.
3. **BUG-28** — In the wizard, select "ACT Placement". Step 2 lists
   `"ACT Math"`. Step 3 shows score `27+` as placement-only. Step 4 shows
   `MATH1910 — placement only, no credit hours awarded`. Apply; the prior
   credit appears in the Prior Coursework panel with `"ACT"` chip and "Gate
   only". Repeat from the post-onboarding "+ Add Prior Credit" button — the
   same flow works.
4. **BUG-29** — Inspect the Prior Coursework panel after adding any credit.
   Each row shows `[chip]  CODE · note · cr` with visible gaps/separators.
   No two text fields run together.
5. **BUG-30** — Add two APs, one Transfer, one ACT (via BUG-28). Panel
   displays four sections in order (AP, ACT, Transfer). The wizard confirm
   step during onboarding also groups `pendingRecords` by type.
6. **BUG-4** — Switch test user to a Cybersecurity plan. Enter a transfer
   credit for `CSC2220`. The inserted `prior_credits` row has
   `satisfies_pool = 'CSC_ELECTIVE'` (inspect in Supabase). The pool slot
   in the plan is archived after reload.
7. **BUG-8** — (Manual direct-API test; optional) Using the Supabase console,
   attempt to insert a `prior_credits` row for `ap_credit` MATH1910 with
   credits_awarded=4. Without going through the wizard, the INSERT itself
   is not gated — but entering score=2 through the wizard UI rejects the
   award with the new error message.
8. **Freshman-branch removal** — A new user onboarding no longer sees the
   "Is this your first term…" radio in step 2. Step 3 presents only the
   unified wizard launcher.

---

## Post-branch Checklist

- [ ] `npm run test` green with new test counts recorded in the final commit body.
- [ ] Manual verification 1–8 pass.
- [ ] `MyDegreePlan_Prototype/test_equivalencies.sql` updated with ACT Math
      placement rows; applied manually to Supabase.
- [ ] `docs/claude/bug.md` updated — remove BUG-4, BUG-8, BUG-26, BUG-27,
      BUG-28, BUG-29, BUG-30 entries. Do not renumber remaining bugs.
      Add a dated update note at the top matching the pattern used for the
      BUG-1 removal on 2026-04-17.
- [ ] `docs/claude/BRANCH_QUEUE.md` updated — move
      `fix/onboarding-wizard-overhaul` into the **Merged Branches** table
      with today's date; delete the old `fix/onboarding-cleanup` queue entry
      (superseded by this branch).
- [ ] `docs/claude/BRANCH_onboarding-wizard-overhaul.md` deleted.
- [ ] `docs/claude/PROMPT_onboarding-wizard-overhaul.md` retained as record
      of the kickoff used (optional — safe to delete if the team prefers).
- [ ] Merge to `main`. Do not force-push.

---

## Open Questions for the Project Owner

None at plan time. Two implementation judgment calls will be made during
the branch (both low-risk) unless the owner pre-empts:

1. **BUG-29 separator style** — default to a middle dot `" · "` span
   between fields with `gap: 0.5rem` on the row. If the owner prefers a
   pipe `" | "` or plain whitespace with CSS `gap` only, adjust in the
   BUG-29 commit.
2. **BUG-28 seed placement** — ACT Math rows go into
   `test_equivalencies.sql` (not a new migration file) because migration
   tier 10 already allowed the `test_type`. No DDL is required.
