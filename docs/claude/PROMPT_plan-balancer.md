# Kickoff Prompt: `feat/plan-balancer`

> Paste this into a fresh Claude Code session to begin work on the
> `feat/plan-balancer` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.
>
> **Prerequisite:** `feat/undo-stack` must be merged to `main` before starting this branch.
> The `rebalance` undo record type added here extends the dispatch written in that branch.

---

You are starting work on the `feat/plan-balancer` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_plan-balancer.md` in full. It is the
   working context for this branch.
2. Confirm `feat/undo-stack` is merged to `main` (check `docs/claude/BRANCH_QUEUE.md`
   Merged Branches table). If it is not, stop and report — do not proceed.
3. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b feat/plan-balancer` (or
   `git checkout feat/plan-balancer` if it already exists).
4. Run `npm run test` from `MyDegreePlan_Frontend/`. Record the baseline test count.
   Stop if any tests fail.
5. Read these source files before editing:
   - `src/lib/poolResolver.js` — find `SCIENCE_SEQUENCES` (its shape determines science
     pair detection in the balancer)
   - `src/lib/prereqChecker.js` — confirm `checkPrereqs` and `checkCoreqs` signatures
   - `src/components/DegreePlan.jsx` — `handleUndo` dispatch, `semesterMap`, header
     actions section, and the `planSemesterOverrides` upsert pattern in `handleDragEnd`

Then implement in the order listed in the branch doc's **Plan** section:

1. Write `src/lib/planBalancer.js` and `src/tests/planBalancer.test.js` together.
   Run `npm run test` — all new tests must pass before moving to step 2.
2. Wire into `DegreePlan.jsx` (undo case, handler, button, import).

Use two commits in the order listed in the branch doc's **Commit Plan**.
All tests must pass at every commit boundary.

When all work is complete and verified:

- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move `feat/plan-balancer`
  to the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_plan-balancer.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): V1 only pulls from the adjacent
(`semNum + 1`) semester. Multi-hop backfill, free-add slot movement, and automatic
on-load rebalancing are all out of scope for this branch — flag them for a follow-on.

Report back with: commits made, test file count, test pass count, and any deferred items.
