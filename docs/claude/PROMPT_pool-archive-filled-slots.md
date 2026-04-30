# Kickoff Prompt: fix/pool-archive-filled-slots

> Paste this into a fresh Claude Code session to begin work on the
> `fix/pool-archive-filled-slots` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/pool-archive-filled-slots` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_pool-archive-filled-slots.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/pool-archive-filled-slots`
   (or `git checkout fix/pool-archive-filled-slots` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   listed in the branch doc passes (**11 files, 245 tests**). If it does
   not, stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing — including the two existing test
   assertions at `src/tests/transferCredits.test.js` lines 215–222 and
   480–487 that this branch flips.

Then implement BUG-42 in the order listed in the branch doc's
**Implementation Order** section. Three commits, in that order, using the
messages in the **Commit Plan**. All tests must pass at every commit
boundary (post-fix target: 246 tests).

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-42
  entry and update the severity-count totals (Medium 9 → 8, Total 16 → 15).
  Do not renumber existing entries.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch to the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_pool-archive-filled-slots.md`
  and `MyDegreePlan_Frontend/docs/claude/PROMPT_pool-archive-filled-slots.md`
  in the close-out commit.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. In particular: BUG-43 (GEN_ED
sub-pool surfacing) and the ROADMAP "Pool-slot drag-back restoration" item
both touch nearby code — flag any issues for a future branch instead of
folding them in here.

Report back with: commits made, test pass count, and any deferred items.
