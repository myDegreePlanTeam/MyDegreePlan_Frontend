# Kickoff Prompt: fix/science-pool-warnings

> Paste this into a fresh Claude Code session to begin work on the
> `fix/science-pool-warnings` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md` have
> been loaded.

---

You are starting work on the `fix/science-pool-warnings` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_science-pool-warnings.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/science-pool-warnings`
   (or `git checkout fix/science-pool-warnings` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline of
   **9 files, 210 tests passed** listed in the branch doc. If it does not,
   stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing — `src/lib/poolResolver.js` and
   `src/lib/__tests__/poolResolver.test.js`.

Then implement the four bugs in the order listed in the branch doc's
**Implementation Order** section: BUG-17 → BUG-10 → BUG-18 → BUG-11. One
commit per bug, using the messages in the **Commit Plan**. All tests must
pass at every commit boundary.

When all four bugs are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-10,
  BUG-11, BUG-17, and BUG-18 entries and update the severity counts in the
  table (Medium 11 → 9, Low 5 → 3, Total 17 → 13). Do not renumber
  remaining bugs.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch into the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_science-pool-warnings.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. Flag them for a future branch
instead. In particular, do not edit `POOL_COURSES`, `POOL_LABELS`,
`resolvePool`, `resolveSatisfiesPool`, `getGenEdStatus`, or
`resolveFreeElective` — they are out of scope.

Report back with: commits made, before/after test pass counts, and any
deferred items.
