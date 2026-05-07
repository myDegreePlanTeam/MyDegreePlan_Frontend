# Kickoff Prompt: feat/plan-controls

> Paste this into a fresh Claude Code session to begin work on the
> `feat/plan-controls` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `feat/plan-controls` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_plan-controls.md` in full. It is the
   working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b feat/plan-controls` (or
   `git checkout feat/plan-controls` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   of **14 files, 279 tests passed** listed in the branch doc. If it does not match,
   stop and report.
4. Read every source file named in the branch doc's **Files Expected to Change**
   table before editing:
   - `src/components/DegreePlan.jsx`
   - `src/components/Semester.jsx`

Then implement the items in the order listed in the branch doc's **Implementation
Order** section: ITEM-3 → ITEM-5 → ITEM-4. One commit per item, in that order,
using the messages from the **Commit Plan**. All tests must pass at every commit boundary.

When all items are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move `feat/plan-controls`
  to the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_plan-controls.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the
branch doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
