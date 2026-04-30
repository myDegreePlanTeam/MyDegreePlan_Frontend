# Kickoff Prompt: fix/prereq-pool-name-display

> Paste this into a fresh Claude Code session to begin work on the
> `fix/prereq-pool-name-display` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/prereq-pool-name-display` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_prereq-pool-name-display.md`
   in full. It is the working context for this branch — including the four
   resolved Open Questions that bound the implementation.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/prereq-pool-name-display`
   (or `git checkout fix/prereq-pool-name-display` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   listed in the branch doc passes (**11 files, 246 tests**). If it does
   not, stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing — including the existing call sites at
   `src/components/SlotModal.jsx:377` and `src/components/Semester.jsx`
   lines 316, 321, 377, 382, 451, 456.

Then implement BUG-37 in the order listed in the branch doc's
**Implementation Order** section. Three commits, in that order, using the
messages in the **Commit Plan**. All tests must pass at every commit
boundary (post-fix target: 12 files, 256 tests).

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-37
  entry and update the severity-count totals (Medium 8 → 7, Total 15 → 14).
  Do not renumber existing entries.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch to the **Merged Branches** table with today's date.
- Update `MyDegreePlan_Frontend/docs/claude/PACKAGES.md` — mark Package I
  ✅ COMPLETE; flip the sequence strikethrough to `~~J~~ → ~~I~~ → K → L
  → M`; append a repo-state bug-count update.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_prereq-pool-name-display.md`
  and `MyDegreePlan_Frontend/docs/claude/PROMPT_prereq-pool-name-display.md`
  in the close-out commit.
- Merge to `main` `--ff-only`. Do not force-push. Do not push to origin
  without explicit go-ahead.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. In particular: BUG-43 (GEN_ED
sub-pool surfacing) is Package K and overlaps with the same files —
flag, do not fold in.

Hard rule (per `CLAUDE.md`): **`checkPrereqs` and `checkCoreqs` signatures
and return shapes do not change.** All collapse logic lives in the new
display helper in `poolResolver.js`.

Report back with: commits made, test pass count (target 256), and any
deferred items.
