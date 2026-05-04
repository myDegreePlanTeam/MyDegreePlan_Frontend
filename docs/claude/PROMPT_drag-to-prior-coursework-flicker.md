# Kickoff Prompt: `fix/drag-to-prior-coursework-flicker`

> Paste this into a fresh Claude Code session to begin work on the
> `fix/drag-to-prior-coursework-flicker` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/drag-to-prior-coursework-flicker` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_drag-to-prior-coursework-flicker.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/drag-to-prior-coursework-flicker`
   (or `git checkout fix/drag-to-prior-coursework-flicker` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   listed in the branch doc passes. If it does not, stop and report.
4. Read every source file named in the branch doc's **Files Expected to Change**
   table before editing.

Then implement the bug in the order listed in the branch doc's **Plan** section.
One commit for the fix, one for the close-out docs. All tests must pass at
every commit boundary.

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-36 entry
  (do not renumber existing entries).
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the branch
  to the **Merged Branches** table with today's date.
- Update `MyDegreePlan_Frontend/docs/claude/PACKAGES.md` — mark Package M
  ✅ COMPLETE and update open-bug counts.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_drag-to-prior-coursework-flicker.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the
branch doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
