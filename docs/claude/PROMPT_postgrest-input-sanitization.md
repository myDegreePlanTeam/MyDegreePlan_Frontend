# Kickoff Prompt: fix/postgrest-input-sanitization

> Paste this into a fresh Claude Code session to begin work on the
> `fix/postgrest-input-sanitization` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/postgrest-input-sanitization` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_postgrest-input-sanitization.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/postgrest-input-sanitization`
   (or `git checkout fix/postgrest-input-sanitization` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline of
   **10 files, 237 tests passed** listed in the branch doc. If it does not,
   stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing.

Then implement BUG-12 per the branch doc's **Plan** section. One
implementation commit covering the helper module, both call-site updates,
and the new test file. Use the message in the **Commit Plan**. All tests
must pass at the commit boundary.

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-12
  entry and update the severity counts in the table (Medium 7 → 6,
  Total 11 → 10). Do not renumber remaining bugs.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch into the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_postgrest-input-sanitization.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. Flag them for a future branch
instead. Other Supabase queries in the codebase are out of scope; only the
two raw `.or()` interpolation call sites are affected.

Report back with: commit SHAs, before/after test pass counts, and any
deferred items.
