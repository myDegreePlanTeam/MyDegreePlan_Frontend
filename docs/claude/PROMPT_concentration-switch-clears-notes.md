# Kickoff Prompt: fix/concentration-switch-clears-notes

> Paste this into a fresh Claude Code session to begin work on the
> `fix/concentration-switch-clears-notes` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md` have
> been loaded.

---

You are starting work on the `fix/concentration-switch-clears-notes` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_concentration-switch-clears-notes.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/concentration-switch-clears-notes`
   (or `git checkout fix/concentration-switch-clears-notes` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline of
   **9 files, 210 tests passed** listed in the branch doc. If it does not,
   stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing — `src/components/DegreePlan.jsx` is the
   only one.

Then implement BUG-7 per the branch doc's **Plan** section. One commit, using
the message in the **Commit Plan**. All tests must pass at the commit boundary.

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-7 entry
  and update the severity counts in the table (High 2 → 1, Total 18 → 17).
  Do not renumber remaining bugs.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch into the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_concentration-switch-clears-notes.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the
branch doc, even if you notice them. Flag them for a future branch instead.

Report back with: commit SHA, test pass count, and any deferred items.
