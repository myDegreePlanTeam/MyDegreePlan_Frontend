# Kickoff Prompt: `fix/prereq-display`

> Paste this into a fresh Claude Code session to begin work on the
> `fix/prereq-display` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `fix/prereq-display` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_prereq-display.md` in full. It
   is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/prereq-display`
   (or `git checkout fix/prereq-display` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline is
   **12 files, 262 tests passed**. If it does not match, stop and report.
4. Read every source file named in the branch doc's **Files Expected to Change**
   table before editing.

Then implement the bug in the order listed in the branch doc's **Implementation
Order** section. One commit per step, using the messages in the **Commit Plan**.
All tests must pass at every commit boundary.

When all bugs are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-31 entry
  (do not renumber existing entries).
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move
  `fix/prereq-display` to the **Merged Branches** table with today's date.
- Update `MyDegreePlan_Frontend/docs/claude/PACKAGES.md` — adjust the open-bug
  counts in the header update block.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_prereq-display.md`.
- Merge to `main` (`--ff-only`). Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the
branch doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
