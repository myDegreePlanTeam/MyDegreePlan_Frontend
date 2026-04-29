# Kickoff Prompt: fix/ap-chem-stem-filter

> Paste this into a fresh Claude Code session to begin work on the
> `fix/ap-chem-stem-filter` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/ap-chem-stem-filter` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_ap-chem-stem-filter.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/ap-chem-stem-filter`
   (or `git checkout fix/ap-chem-stem-filter` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline of
   **11 files, 245 tests passed** listed in the branch doc. If it does not,
   stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing — `src/components/PriorCreditWizard.jsx`
   is the only one.

Then implement BUG-35 per the branch doc's **Plan** section. One
implementation commit. Use the message in the **Commit Plan**. All tests
must pass at the commit boundary.

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-35
  entry and update the severity counts in the table (Medium 8 → 7,
  Total 15 → 14). Do not renumber remaining bugs.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch into the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_ap-chem-stem-filter.md`.
- Delete `MyDegreePlan_Frontend/docs/claude/PROMPT_ap-chem-stem-filter.md`
  (per the 2026-04-29 docs convention to clean up kickoff prompts after merge).
- Merge to `main`. Push to origin. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. In particular, do not touch IB
Chemistry SL/HL rows, the CLEP test_out Chemistry row, or any schema —
all out of scope. The proper long-term fix (a `stem_only` column +
concentration STEM flag) is documented in BUG-35's audit entry as deferred.

Report back with: commit SHAs, test pass count, and any deferred items.
