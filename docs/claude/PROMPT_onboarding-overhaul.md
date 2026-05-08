# Kickoff Prompt: `feat/onboarding-overhaul`

> Paste this into a fresh Claude Code session to begin work on the
> `feat/onboarding-overhaul` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `feat/onboarding-overhaul` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_onboarding-overhaul.md` in full.
   It is the working context for this branch.

2. **Apply the three database migrations first** (the branch doc's Preconditions section
   lists them). These must be applied in the Supabase Dashboard SQL Editor before any
   frontend code runs:
   - `MyDegreePlan_Prototype/migration_tier15.sql` — new `student_type` + ACT score
     columns on `student_profiles`
   - `MyDegreePlan_Prototype/migration_math1000.sql` — insert MATH1000 into `courses`
   - `MyDegreePlan_Prototype/test_equivalencies.sql` — replace the single ACT Math row
     with the corrected 5-tier ladder
   
   Confirm with the user that migrations have been applied before touching frontend code.

3. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b feat/onboarding-overhaul` (or
   `git checkout feat/onboarding-overhaul` if it already exists).

4. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline is
   **16 files, 309 tests passed**. If it does not match, stop and report.

5. Read every source file named in the branch doc's **Files Expected to Change** table
   before editing. Pay particular attention to:
   - `Onboarding.jsx` (full file — 363 lines)
   - `PriorCreditWizard.jsx` lines 25–55 and 375–420
   - `DegreePlan.jsx` lines 155–300 (especially line 289: `setSlots(slotData)`)

6. Verify the prereq regression check: confirm `checkPrereqs` correctly handles a
   `prior_credits` row with `satisfies_course_code='MATH1910'` where MATH1910 is a
   prereq for a downstream course. This is a read-and-confirm step; no code change
   is expected. Note the outcome in the branch doc or report it back.

Then implement the features in the order listed in the branch doc's **Implementation
Order** section:

1. `actScoreResolver.js` + `actScoreResolver.test.js`
2. `Onboarding.jsx` — 4-step flow with student type, ACT scores step, updated `handleComplete`
3. `PriorCreditWizard.jsx` — ACT removal, new disabled entries, `studentType` prop + filter
4. `DegreePlan.jsx` — `isNewStudent` slot filter before `setSlots`

One commit per item, in that order, using the messages in the **Commit Plan**. All tests
must pass at every commit boundary.

When all items are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — no BUG-N entries are being closed
  by this branch; no edits needed unless a bug was incidentally fixed.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — add
  `feat/onboarding-overhaul` to the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_onboarding-overhaul.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the branch
doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, final test pass count, and any deferred items.
