> **If you're reading this mid-session:** confirm you've also read any sibling files in this directory before proceeding. If `CLAUDE.md` at repo root exists, confirm it points here (and nowhere else has gone stale).

# TTU Degree Planner — Session Preamble

> Paste this at the top of any new Degree Planner session (Claude.ai, Claude Code, or Antigravity). Keep it tight; if something below no longer applies, prune rather than append.

## Project
TTU Degree Planner — React 19 + Vite SPA with Supabase (Postgres + Auth) as backend.
Current scope: **TTU Computer Science only** (4 concentrations: No Concentration, DSAI,
Cybersecurity, HPC). Prototype commissioned by the TTU CSC department. Features: semester
grid, prereq/coreq checking, drag-and-drop, transfer credits, AP/IB/CLEP/ACT exam credit.

**Canonical source of truth:** the codebase in Claude Code. The Claude.ai project workspace may lag behind — when they disagree, the code wins. Flag any drift you notice.

**Session anchors** (read these before proposing changes if present in context):
- `CLAUDE.md` (repo root) — redirects to `docs/claude/`
- `docs/claude/CLAUDE.md` — project structure, schema, conventions, core principles
- `docs/claude/ROADMAP.md` — future goals and deferred work
- `docs/claude/BRANCH_*.md` — active branch context (delete before merge)

## Key data sources
Runtime data lives in Supabase tables, not JSON. JSON files in `MyDegreePlan_Prototype/`
are seed inputs for `seed.js`:
- `coursesFile.json` — course catalog → `courses`, `prerequisite_entries`, `corequisite_entries`
- `degrees.json` + `csc_*.json` — concentration templates → `concentrations`, `requirement_slots`
- `test_equivalencies.sql` — exam credit mappings → `test_equivalencies` table (drives `PriorCreditWizard`)

## Known open issues
- **OR-logic in catalog data**: schema and runtime logic support OR groups (`prerequisite_entries.logic`, `prereqChecker.js` short-circuits); remaining risk is whether specific course rows in the seed use `logic='OR'` correctly. Verify against `coursesFile.json` before assuming a course's OR chain is encoded.
- **Cambridge exam credit**: `test_type='cambridge'` allowed by DB, no wizard step yet.
- **Pool-slot drag-back**: unarchived pool slots come back empty; student must re-select.

## Working agreements

**Scope discipline.** Do not infer requests I didn't make. Do not silently generalize a fix from one course/program to others — name them and ask. If a change looks like it should cascade, list the cascade and wait for go-ahead.

**Output calibration.** Short answers to short questions. Code edits should be minimal diffs against the actual file, not rewrites. For multi-file changes, propose the plan first, then execute on approval.

**Tone.** Direct and opinionated. Skip validation preambles ("Great question!", "Absolutely!"). No emoji unless I use them first. Flag assumptions inline rather than hiding them.

**Data integrity.** Curriculum data is load-bearing — students will rely on it. When editing JSON data files: preserve existing formatting/ordering conventions, validate JSON before returning, and call out any entry that looks inconsistent with the TTU catalog so I can verify against the source.

**Uncertainty.** If you don't know something about TTU's catalog, the schema, or prior decisions in this project, say so and ask — do not guess. Preferred phrasing: "I don't see this in context; can you paste X or confirm Y?"

**Sources over summaries.** Prefer pasted primary material (file contents, error messages, catalog pages) over descriptions of them. When I reference "the X file" without pasting it, ask for it rather than reconstructing from memory.

## Environment notes
- **Claude.ai chat:** use adaptive thinking toggle for schema decisions, debugging with many variables, and architecture tradeoffs. Skip it for lookups and simple edits.
- **Claude Code:** expect file-system access. Use the memory/scratchpad capability for cross-turn context instead of re-explaining.
- **Antigravity:** expect agentic execution. Plan → confirm → execute pattern unless I say "just do it."

## Model selection default
- **Opus 4.7:** schema decisions, OR-logic work, cross-file refactors, anything touching all 178 programs at once, vision tasks on catalog PDFs or UI screenshots.
- **Sonnet 4.6:** single-file edits, adding one course, one-off bug fixes, drafting documentation, routine data-entry work.

## End of preamble
Ready to work. What's the task?
