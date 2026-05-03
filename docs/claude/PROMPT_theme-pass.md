# Kickoff Prompt: `feat/theme-pass`

> Paste this into a fresh Claude Code session to begin work on the
> `feat/theme-pass` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `feat/theme-pass` branch.

This is a coordinated theme overhaul covering three concerns that land together:
- **BUG-38** — WCAG 2.1 AA contrast failures
- **feat/branding** — TTU purple replaces navy blue as the primary dark surface
- **feat/dark-mode** — toggleable light/dark theme with localStorage persistence

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_theme-pass.md` in full. It is the
   working context for this branch.
2. **All palette values are pre-confirmed** in the branch doc's **Confirmed Palette Values**
   table. No open questions remain — proceed directly to implementation once you've read
   the full branch doc.
3. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b feat/theme-pass` (or
   `git checkout feat/theme-pass` if it already exists).
4. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline listed in
   the branch doc (**13 files, 266 tests**). If it does not match, stop and report.
5. Read every source file named in the branch doc's **Files Expected to Change** table
   and the focus areas listed under **Preconditions** before editing.

Then implement in the order listed in the branch doc's **Implementation Order** section.
One commit per step as shown in the **Commit Plan**. All tests must pass at every
commit boundary.

When all concerns are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove BUG-38 entry; update
  severity counts (Medium 5→4, Total 10→9).
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move `feat/theme-pass`
  to Merged Branches with today's date; remove `feat/branding` and `feat/dark-mode`
  from Phase 2 entries; add a `feat/branding-icon` entry to Deferred.
- Update `MyDegreePlan_Frontend/docs/claude/PACKAGES.md` — mark Package N ✅ COMPLETE;
  update open-bug counts.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_theme-pass.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the branch
doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
