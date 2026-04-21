# Kickoff Prompt: `fix/onboarding-wizard-overhaul`

> Paste this into a fresh Claude Code session to begin work on the
> `fix/onboarding-wizard-overhaul` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/onboarding-wizard-overhaul` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_onboarding-wizard-overhaul.md`
   in full. It is the working context for this branch — bug list, implementation
   order, commit plan, constraints, manual verification, and post-branch
   checklist all live there.
2. From `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/onboarding-wizard-overhaul`.
3. Run `npm run test`. Confirm the baseline of **8 files, 178 tests passed**.
   If it does not match, stop and report.
4. Read every source file named in the branch doc's
   **Files Expected to Change** table before editing. Do not assume contents.
   The doc names specific line ranges that matter for each bug — open those
   ranges in full.
5. Note the BUG-28 dependency on a `test_equivalencies.sql` seed edit.
   Apply the updated seed to Supabase manually (via the Dashboard SQL
   Editor, `ON CONFLICT DO NOTHING` makes it idempotent) before running
   end-to-end verification of the ACT placement flow. Tests do not require
   the DB change.

Then implement the bugs in the order listed in the branch doc's
**Implementation Order** section. One commit per step, in that order, using
the messages in the **Commit Plan**. All tests must pass at every commit
boundary.

When all eight commits are in:

- Update `docs/claude/bug.md` — remove BUG-4, BUG-8, BUG-26, BUG-27, BUG-28,
  BUG-29, BUG-30. Do not renumber the remaining bugs. Add a dated update
  note at the top of `bug.md` matching the pattern of the 2026-04-17 BUG-1
  removal.
- Update `docs/claude/BRANCH_QUEUE.md` — move this branch to the **Merged
  Branches** table with today's date; delete the superseded
  `fix/onboarding-cleanup` queue entry.
- Delete `docs/claude/BRANCH_onboarding-wizard-overhaul.md`. You may keep
  or delete `docs/claude/PROMPT_onboarding-wizard-overhaul.md` — owner's
  preference.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs that are not
listed in this branch's doc, even if you notice them. BUG-31 (MATH1910
prereq display) is deliberately deferred to `fix/prereq-display` because
it depends on this branch's ACT entry path existing. Flag any new bugs in
`bug.md` for a future branch; do not attempt them here.

Report back with:
- Commits made (SHAs and messages)
- Test pass count after the final commit
- Any deferred items or deviations from the commit plan
- Whether the Supabase `test_equivalencies.sql` re-seed was applied
