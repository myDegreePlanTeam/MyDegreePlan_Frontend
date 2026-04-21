# Meta-Prompt: Write the Next Branch's Context Doc and Kickoff Prompt

> **Purpose.** This is a reusable meta-prompt. Paste it into a fresh Claude Code session
> to produce two artifacts for the next queued branch: a `BRANCH_<name>.md` context doc
> and a `PROMPT_<name>.md` kickoff prompt. Both go in `docs/claude/` and are committed
> to `main`. After the branch merges, `BRANCH_<name>.md` is deleted (per the convention
> in `SESSION_PREAMBLE.md`); `PROMPT_<name>.md` may be retained as a record of the
> kickoff used.

---

## What this session must produce

1. `MyDegreePlan_Frontend/docs/claude/BRANCH_<name>.md` — the branch's working context
2. `MyDegreePlan_Frontend/docs/claude/PROMPT_<name>.md` — a paste-ready kickoff prompt
3. One commit on `main` containing both files
4. A short report back with the branch name and a one-line summary of the scope chosen

`<name>` is the branch name **without** the `fix/`, `feat/`, `data/`, `schema/`, `docs/`
prefix. Example: branch `fix/onboarding-cleanup` → files `BRANCH_onboarding-cleanup.md`
and `PROMPT_onboarding-cleanup.md`.

---

## Step 1 — Load current project state

Read these files in this order. Do not skip any. Do not assume contents from memory.

1. `MyDegreePlan_Frontend/docs/claude/CLAUDE.md` — project structure, schema, core principles
2. `MyDegreePlan_Frontend/docs/claude/SESSION_PREAMBLE.md` — working agreements, tone
3. `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — the queue of branches to work
4. `MyDegreePlan_Frontend/docs/claude/bug.md` — current audit, indexed by BUG-N
5. `MyDegreePlan_Frontend/docs/claude/README.md` — branch and commit naming conventions
6. `MyDegreePlan_Frontend/docs/claude/ROADMAP.md` — what is explicitly deferred

---

## Step 2 — Identify the next branch

From `BRANCH_QUEUE.md`, pick the next branch under **Queued Branches** in queue order.
Honor any `(depends on …)` notes — do not pick a branch whose dependency has not merged.
If multiple branches are available in parallel, pick the topmost in the queue.

If the chosen branch already has a `BRANCH_<name>.md` in `docs/claude/`, stop and report:
the doc already exists. Do not overwrite.

Capture from the queue entry:
- Branch name and prefix (`fix/`, `feat/`, `data/`, `schema/`)
- Bullet list of **Targets** (BUG-N references and any product decisions)
- **Notes** block (constraints, ordering hints, open questions)
- Any **Scope** caveats

---

## Step 3 — Read the two most recent merged branch docs for format reference

`BRANCH_<name>.md` files are deleted post-merge. To recover the format used in recent
branches, read the two most recently merged docs from git history:

```
git log --all --oneline --diff-filter=D -- "docs/claude/BRANCH_*.md" | head
```

For each of the two most recent, retrieve the file as it existed immediately before
deletion:

```
git show <delete-commit>~1:docs/claude/BRANCH_<old-name>.md
```

If only one (or zero) historical merged docs exist, also read the current
`BRANCH_<active>.md` if present. The goal is two complete examples to match the
established format.

---

## Step 4 — Re-read the source files referenced by the queued bugs

For every BUG-N in scope, open and read the files named in that bug's
**File(s)** field in `bug.md`. Read enough surrounding code to write a credible plan,
not just the cited line. Do not paraphrase the bug — quote line numbers and exact
function names from the live code.

Confirm the bug still reproduces against the current code. If a fix has already landed
and `bug.md` is stale, flag it in the branch doc rather than silently dropping the bug.

---

## Step 5 — Write `BRANCH_<name>.md`

Match the structure of the two reference docs from Step 3. The required sections
(in order):

1. **Title** — `# Branch: \`<prefix>/<name>\`` or `# Branch Context: <prefix>/<name>`
2. **Header note** — "Read after CLAUDE.md. Delete this file before merging."
3. **What This Branch Does** — 1–3 sentences summarizing intent. Then a numbered
   list of every BUG-N in scope with severity and a one-line summary.
4. **Non-Goals / Out of Scope** — explicit list. Name files and behaviors *not*
   to touch. If a function signature must not change, state it (e.g. `checkPrereqs`,
   `computePlanCredits`, `validatePriorCredit`).
5. **Preconditions** — what to confirm before editing (current branch, baseline test
   pass count, files to read first).
6. **Implementation Order** — bugs in dependency order. Justify the order if non-obvious.
7. **Plan / Step-by-step** — for each bug, name the file, the line range, the exact
   change shape (before/after sketch where useful). Quote real symbol names from the code.
8. **Files Expected to Change** — table: File | Bugs | Summary. Include test files.
9. **Test Protocol** — `cd MyDegreePlan_Frontend && npm run test`. State the current
   baseline pass count. New tests required per bug, if any.
10. **Commit Plan** — one commit per bug, in implementation order. Use the project's
    commit-type convention from `README.md` (`fix:`, `feat:`, `data:`, `schema:`,
    `docs:`, `refactor:`). Each commit message should reference the BUG-N in the body.
11. **Known Constraints** — stable signatures, schema invariants, project principles
    from `CLAUDE.md` that bound the implementation.
12. **Manual Verification** — golden-path scenarios a human can run in `npm run dev`.
    Before/after expected behavior.
13. **Post-branch Checklist** — tests green, manual verification passed, `bug.md`
    updated to remove fixed BUG-N entries, `BRANCH_QUEUE.md` updated, branch doc
    deleted, branch merged.

**Quality rules:**
- Do not invent code. If you have not read the file, do not name a line number.
- If a bug's fix is unclear after reading the code, write an **Open Question** subsection
  rather than guessing.
- Do not duplicate context already in `CLAUDE.md` or `SESSION_PREAMBLE.md` — link to it.
- Stay under ~250 lines. Tighter is better. Long branch docs signal the branch is
  too big.

---

## Step 6 — Write `PROMPT_<name>.md`

This is the paste-ready kickoff a human (or you, in the next session) drops into
Claude Code to start the branch. It is short. It assumes `SESSION_PREAMBLE.md` will
be loaded automatically by `CLAUDE.md` at session start.

Template:

```markdown
# Kickoff Prompt: <prefix>/<name>

> Paste this into a fresh Claude Code session to begin work on the
> `<prefix>/<name>` branch. Assumes `MyDegreePlan_Frontend/CLAUDE.md` and
> `docs/claude/SESSION_PREAMBLE.md` have been loaded.

---

You are starting work on the `<prefix>/<name>` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_<name>.md` in full. It is the
   working context for this branch.
2. Confirm you are on the correct branch:
   `cd MyDegreePlan_Frontend && git checkout -b <prefix>/<name>` (or
   `git checkout <prefix>/<name>` if it already exists).
3. Run `npm run test` from `MyDegreePlan_Frontend/`. Confirm the baseline
   listed in the branch doc passes. If it does not, stop and report.
4. Read every source file named in the branch doc's **Files Expected to
   Change** table before editing.

Then implement the bugs in the order listed in the branch doc's **Implementation
Order** section. One commit per bug, in that order, using the messages in the
**Commit Plan**. All tests must pass at every commit boundary.

When all bugs are implemented and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the fixed BUG-N
  entries (do not renumber existing entries unless explicitly instructed).
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the branch
  to the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_<name>.md`.
- Merge to `main`. Do not force-push.

Scope discipline (per `SESSION_PREAMBLE.md`): do not fix bugs not listed in the
branch doc, even if you notice them. Flag them for a future branch instead.

Report back with: commits made, test pass count, and any deferred items.
```

Replace `<name>` and `<prefix>` everywhere. If the branch has unusual constraints
(e.g. requires a Supabase migration to be applied manually first), add a fifth
preflight item naming that constraint.

---

## Step 7 — Commit and report

From the repo root or `MyDegreePlan_Frontend/`:

```
git add docs/claude/BRANCH_<name>.md docs/claude/PROMPT_<name>.md
git commit -m "docs: add branch context and kickoff for <prefix>/<name>"
```

Do not push unless explicitly asked. Do not amend. Do not include unrelated files.

Report back to the user:
- The branch name
- One sentence on the chosen scope
- The two file paths created
- The commit SHA

---

## What this meta-prompt does NOT do

- It does **not** check out the new branch. The kickoff prompt does that.
- It does **not** start implementing bugs. It only writes planning docs.
- It does **not** modify `bug.md` or `BRANCH_QUEUE.md`. Those updates happen
  during/after the branch's work, per the kickoff prompt and post-branch checklist.
- It does **not** invent new bugs or pull from sources outside `BRANCH_QUEUE.md`
  and `bug.md`. Scope is fully determined by the queue entry.
