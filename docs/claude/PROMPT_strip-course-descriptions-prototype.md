# Kickoff Prompt: `data/strip-course-descriptions-prototype`

> Paste this into a fresh Claude Code session to begin work on the
> `data/strip-course-descriptions-prototype` branch. Assumes
> `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
> have been loaded.

---

You are starting work on the `data/strip-course-descriptions-prototype` branch.

Before writing any code:

1. Read `MyDegreePlan_Frontend/docs/claude/BRANCH_strip-course-descriptions-prototype.md`
   in full. It is the working context for this branch. Pay close attention to the
   **Critical Constraint** section — `classifyPrereq.js` reads description text and
   the stripping rules must preserve ACT/SAT/consent sentences.
2. Confirm you are in the correct sub-repo:
   `cd MyDegreePlan_Prototype && git checkout -b data/strip-course-descriptions-prototype`
   (or `git checkout data/strip-course-descriptions-prototype` if it already exists).
3. Read `MyDegreePlan_Frontend/src/lib/classifyPrereq.js` lines 22–28 and confirm
   the ACT/SAT/consent pattern list matches what is documented in the branch doc's
   Critical Constraint section. If the patterns have changed, update the guard logic
   in your script accordingly before proceeding.
4. Read the current `MyDegreePlan_Prototype/prototype.json` — do not assume its
   structure or description formatting.

Then implement the branch doc's Plan in order (Steps 1–4). The script must:
- Preview every changed description before writing
- Require a `y` confirmation before modifying the file
- Preserve all ACT/SAT/ACCUPLACER/consent-containing preambles

One commit in `MyDegreePlan_Prototype/` for the data change, one docs commit in
`MyDegreePlan_Frontend/` for close-out, using the messages in the branch doc's
**Commit Plan**.

When all steps are complete and verified:

- Update `MyDegreePlan_Frontend/docs/claude/bug.md` — remove the BUG-32 entry;
  update severity counts (Medium 4→3, Total 8→7). Do not renumber remaining entries.
- Update `MyDegreePlan_Frontend/docs/claude/BRANCH_QUEUE.md` — move the branch
  to the **Merged Branches** table with today's date.
- Delete `MyDegreePlan_Frontend/docs/claude/BRANCH_strip-course-descriptions-prototype.md`.
- Merge to `main` in `MyDegreePlan_Prototype/`. Do not force-push.

**Do not re-seed Supabase** — output the re-seed instruction to the terminal for the
user to run manually (`node seed.js` from `MyDegreePlan_Prototype/` with valid `.env`).

Scope discipline: do not touch `coursesFile.json`, frontend files, or `seed.js`.
Do not fix bugs not listed in the branch doc.

Report back with: commits made, count of descriptions changed vs. preserved (ACT guard),
count nulled, and any descriptions that required manual judgment.
