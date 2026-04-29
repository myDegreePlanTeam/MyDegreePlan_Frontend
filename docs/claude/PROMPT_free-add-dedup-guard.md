# Kickoff Prompt: fix/free-add-dedup-guard

> Paste this into a fresh Claude Code session to begin work on the
> `fix/free-add-dedup-guard` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/free-add-dedup-guard` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_free-add-dedup-guard.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/free-add-dedup-guard`
   (or `git checkout fix/free-add-dedup-guard` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   of **9 files, 226 tests passed** listed in the branch doc. If it does
   not, stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing.

Then implement BUG-34 per the branch doc's **Plan** section. One
implementation commit covering the helper, prop wiring, modal disable
state, insert-path guard, and new test file. Use the message in the
**Commit Plan**. All tests must pass at the commit boundary.

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-34
  entry and update the severity counts in the table (Medium 9 → 8,
  Total 13 → 12). Do not renumber remaining bugs.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch into the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_free-add-dedup-guard.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed
in the branch doc, even if you notice them. Flag them for a future
branch instead. In particular, do not modify the signatures of
`computePlanCredits`, `resolveTransferCredits`, or
`resolveTransferDetails` — they are out of scope and frozen per
`CLAUDE.md`.

Report back with: commit SHAs, before/after test pass counts, and any
deferred items.
