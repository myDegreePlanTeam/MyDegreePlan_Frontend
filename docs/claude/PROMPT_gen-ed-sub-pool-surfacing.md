# Kickoff Prompt: fix/gen-ed-sub-pool-surfacing

> Paste this into a fresh Claude Code session to begin work on the
> `fix/gen-ed-sub-pool-surfacing` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `fix/gen-ed-sub-pool-surfacing` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_gen-ed-sub-pool-surfacing.md`
   in full. It is the working context for this branch — including the four
   resolved Open Questions.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b fix/gen-ed-sub-pool-surfacing`
   (or `git checkout fix/gen-ed-sub-pool-surfacing` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   listed in the branch doc passes (**12 files, 257 tests**). If it does
   not, stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing.

Then implement BUG-43 in the order listed in the branch doc's
**Implementation Order** section. Three commits, in that order, using the
messages in the **Commit Plan**. All tests must pass at every commit
boundary (post-fix target: 13 files, 262 tests).

When the bug is implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-43
  entry and update the severity-count totals (Medium 7 → 6, Total 14 → 13).
  Do not renumber existing entries.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the
  branch to the **Merged Branches** table with today's date.
- Update `MyDegreePlan_Frontend/docs/claude/PACKAGES.md` — mark Package K
  ✅ COMPLETE; flip the sequence strikethrough to `~~J~~ → ~~I~~ → ~~K~~
  → L → M`; append a repo-state bug-count update. Preserve the rest of
  PACKAGES.md.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_gen-ed-sub-pool-surfacing.md`
  and `MyDegreePlan_Frontend/docs/claude/PROMPT_gen-ed-sub-pool-surfacing.md`
  in the close-out commit.
- Merge to `main` `--ff-only`. Do not force-push. Do not push to origin
  without explicit go-ahead.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in
the branch doc, even if you notice them. In particular: schema-level
GEN_ED splitting (ROADMAP "GEN_ED sub-requirement enforcement") is the
long-term fix and is **out of scope** for this branch — only modal/wizard
surfacing changes here.

Hard rules:
- `getGenEdStatus` return shape stays read-only.
- `POOL_COURSES.GEN_ED` membership unchanged.
- Soft greying only — students may still select courses from a satisfied
  sub-pool.

Report back with: commits made, test pass count (target 262), and any
deferred items.
