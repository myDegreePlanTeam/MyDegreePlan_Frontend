# Kickoff Prompt: `schema/semester-terms`

> Paste this into a fresh Claude Code session to begin work on the
> `schema/semester-terms` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `schema/semester-terms` branch.

**Before writing any code:**

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_semester-terms.md` in full. It is the
   working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b schema/semester-terms`
   (or `git checkout schema/semester-terms` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   **14 files, 279 tests passed**. If it does not match, stop and report.
4. **Apply the Tier 14 migration before running the app.** Write
   `MyDegreePlan_Prototype/migration_tier14.sql` in commit 1, then apply it in
   Supabase Dashboard SQL Editor before proceeding to commits 2–4. The schema
   change (`term_season`, `term_year` columns on `student_semester_notes`) must
   exist in the live database before any component code runs.
5. Read every source file named in the branch doc's **Files Expected to Change**
   table before editing.

Then implement in the order listed in the branch doc's **Implementation Order**
section (TERM-1 → TERM-3 → TERM-2). One commit per item, in that order, using
the messages in the **Commit Plan**. All tests must pass at every commit boundary.

When all items are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move
  `schema/semester-terms` to the **Merged Branches** table with today's date; add
  a note to the `feat/dynamic-semester-count` entry: "Superseded by
  `feat/plan-controls` (add/remove semester) + `schema/semester-terms`
  (persistence + term labeling)."
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_semester-terms.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the
branch doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
