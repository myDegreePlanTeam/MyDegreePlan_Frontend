# Kickoff Prompt: fix/prereq-warnings-semester-order

> Paste this into a fresh Claude Code session to begin work on the
> `fix/prereq-warnings-semester-order` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/prereq-warnings-semester-order` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_prereq-warnings-semester-order.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/prereq-warnings-semester-order`
   (or `git checkout fix/prereq-warnings-semester-order` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline of
   **10 files, 237 tests passed** listed in the branch doc. If it does not,
   stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing — `src/components/DegreePlan.jsx` is the
   only one.

Then implement BUG-13 per the branch doc's **Plan** section. One
implementation commit. Use the message in the **Commit Plan**. All tests
must pass at the commit boundary.

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-13
  entry and update the severity counts in the table (Medium 8 → 7,
  Total 12 → 11). Do not renumber remaining bugs.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch into the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_prereq-warnings-semester-order.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. Flag them for a future branch
instead. In particular, do not modify `checkPrereqs` / `checkCoreqs`
signatures, the `planSemesterCompleted` state, the toggle handler, or the
collapse UI behavior — they are out of scope.

Report back with: commit SHAs, test pass count, and any deferred items.
