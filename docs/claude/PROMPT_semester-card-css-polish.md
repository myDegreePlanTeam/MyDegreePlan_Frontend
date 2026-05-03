# Kickoff Prompt: `fix/semester-card-css-polish`

> Paste this into a fresh Claude Code session to begin work on the
> `fix/semester-card-css-polish` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/semester-card-css-polish` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_semester-card-css-polish.md`
   in full. It is the working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/semester-card-css-polish`
   (or `git checkout fix/semester-card-css-polish` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline is
   **13 files, 266 tests passed**. If it does not match, stop and report.
4. Read every source file named in the branch doc's **Files Expected to Change**
   table before editing:
   - `src/components/Dashboard.css` — the only file that changes
   - `src/components/Semester.jsx` — read to confirm class names; do not edit
   - `src/components/SlotModal.jsx` — read to confirm class names; do not edit

Then implement the bugs in the order listed in the branch doc's **Implementation
Order** section (BUG-40 first, then BUG-41). One commit per bug, using the
messages in the **Commit Plan**. All tests must pass at every commit boundary.

After each commit, visually verify the relevant scenarios from the branch doc's
**Manual Verification** section in `npm run dev`. This is a CSS branch — the
test suite cannot catch visual regressions, so manual verification is mandatory
before closing out.

When all bugs are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-40 and
  BUG-41 entries (do not renumber existing entries unless explicitly instructed).
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the branch
  to the **Merged Branches** table with today's date.
- Update `MyDegreePlan_Frontend/docs/claude/PACKAGES.md` — mark Package L
  ✅ COMPLETE and update the open bug counts.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_semester-card-css-polish.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the
branch doc, even if you notice them. Do not touch theme variables or color
palette values — BUG-38 (contrast audit) is held for the coordinated branding
pass. Flag any issues you notice for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
