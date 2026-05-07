# Kickoff Prompt: `feat/undo-stack`

> Paste this into a fresh Claude Code session to begin work on the
> `feat/undo-stack` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `feat/undo-stack` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_undo-stack.md` in full. It is the
   working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b feat/undo-stack` (or
   `git checkout feat/undo-stack` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   **14 files, 279 tests passed** matches. If it does not, stop and report.
4. Read `src/components/DegreePlan.jsx` in full before editing. The branch doc
   references specific line numbers — verify them against the live file before using them.
   Line numbers may have shifted if any commits landed after the branch doc was written.

Then implement the changes in the order listed in the branch doc's **Plan** section
(Steps 1 → 5). All in a single commit at the end.

When implementation is complete and verified:

- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move `feat/undo-stack`
  to the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_undo-stack.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): prior credit undo is explicitly out of scope
for this branch. If you notice related issues, flag them for a follow-on rather than fixing
them here.

Report back with: commit SHA, test pass count, and any deferred items.
