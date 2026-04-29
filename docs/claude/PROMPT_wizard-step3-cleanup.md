# Kickoff Prompt: fix/wizard-step3-cleanup

> Paste this into a fresh Claude Code session to begin work on the
> `fix/wizard-step3-cleanup` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/wizard-step3-cleanup` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_wizard-step3-cleanup.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/wizard-step3-cleanup`
   (or `git checkout fix/wizard-step3-cleanup` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline of
   **11 files, 245 tests passed** listed in the branch doc. If it does not,
   stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing — `src/components/PriorCreditWizard.jsx`
   is the only one.

Then implement BUG-39 per the branch doc's **Plan** section. One
implementation commit. Use the message in the **Commit Plan**. All tests
must pass at the commit boundary.

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-39
  entry and update the severity counts in the table (Low 7 → 6,
  Total 16 → 15). Do not renumber remaining bugs.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch into the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_wizard-step3-cleanup.md`.
- Delete `MyDegreePlan_Frontend/docs/claude/PROMPT_wizard-step3-cleanup.md`
  (per the 2026-04-29 docs convention to clean up kickoff prompts after merge).
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. Flag them for a future branch
instead. In particular, do not modify the `scoreOptions` computation, the
Step 4 confirmation render, or the Step 2/Step 1 surfaces — they are out
of scope.

Report back with: commit SHAs, test pass count, and any deferred items.
