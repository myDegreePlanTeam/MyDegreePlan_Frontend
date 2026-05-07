# Kickoff Prompt: `fix/credits-and-concentration`

> Paste this into a fresh Claude Code session to begin work on the
> `fix/credits-and-concentration` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `fix/credits-and-concentration` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_credits-and-concentration.md` in full.
   It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/credits-and-concentration` (or
   `git checkout fix/credits-and-concentration` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline of **13 files,
   279 tests passed** listed in the branch doc passes. If it does not, stop and report.
4. Read every source file named in the branch doc's **Files Expected to Change** table
   before editing:
   - `src/components/Semester.jsx` (lines 60–70 and 155–165)
   - `src/components/DegreePlan.jsx` (lines 1020–1045 and 1515–1530)

Then implement the bugs in the order listed in the branch doc's **Implementation Order**
section. One commit per bug, in that order, using the messages in the **Commit Plan**. All
tests must pass at every commit boundary.

When all bugs are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-46 and BUG-47 entries
  (do not renumber existing entries).
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the branch to the
  **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_credits-and-concentration.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the branch
doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
