# Degree Planner Prompt Library — Outline

> **Status:** Skeleton only. The Claude.ai project workspace is behind the Claude Code codebase; populating concrete prompts now would bake in stale assumptions. Fill these in after the next sync, working one category at a time against the real current state.

## How this library is meant to work

**One prompt = one reusable job.** Each prompt should be copy-pasteable, scoped to a single recurring task, and written to assume the Session Preamble is already loaded. That means prompts here do NOT re-state project context — they only state the specific job.

**Token discipline built in.** Every prompt should:
- Name the exact files it expects as input (so you paste only those, not the whole project)
- State the desired output format and length up front
- Declare what's out of scope, so the model doesn't sprawl
- Be written in the imperative, not as a description of what you want

**Version each prompt.** When a prompt gets tuned (shorter, sharper, better scoped), bump a small version note at the top. Retire rather than edit-in-place if behavior changes meaningfully — old prompts may still be referenced in past work.

## Library structure

### 1. Data edits
Prompts for the routine work of keeping curriculum data accurate.
- Add a new course to `coursesFile.json`
- Add / update a degree program in `degrees.json`
- Update exam credit mappings in `examCredits.json`
- Audit a single program against the current TTU catalog
- Batch-validate JSON after manual edits

### 2. Feature work
Prompts for UI and logic changes on the planner itself.
- Add a feature to the semester grid (rules: non-breaking, minimal diff)
- Modify drag-and-drop behavior
- Prerequisite-check logic changes
- Transfer credit handling adjustments
- AP/IB/CLEP flow changes

### 3. Bug triage & debugging
Prompts for diagnosis before fixes.
- Reproduce and isolate a reported bug (inputs, expected, actual, minimal repro)
- Trace a prereq-resolution failure back to data vs. logic
- Investigate a rendering / drag-drop glitch
- Performance regression triage

### 4. Schema & architecture decisions
Prompts for load-bearing calls. Use Opus 4.7 with adaptive thinking for these.
- OR-logic prerequisite schema design and migration plan
- Data-model changes affecting multiple JSON files
- Breaking-change impact assessment across the 178 programs
- Tradeoff analysis: feature X vs. complexity cost

### 5. Documentation
Prompts for keeping `CLAUDE.md`, `CONTEXT_AND_PRIORITIES.md`, and inline docs honest.
- Update `CLAUDE.md` after a structural change
- Log a decision to `CONTEXT_AND_PRIORITIES.md`
- Write or refresh a README section
- Generate a changelog entry from a diff

### 6. Cross-environment helpers
Prompts that adapt the same task to the tool in use.
- "Plan mode" prompt (Antigravity / Claude Code): plan before executing
- "Review mode" prompt (Claude.ai): read-only review of a pasted file
- Handoff prompt: summarize current session state for the next session's preamble append

## Seeding order (recommended)

When the project is synced and you're ready to write real prompts:

1. **Start with Category 1 (Data edits)** — highest frequency, most mechanical, easiest to validate. Writing these first also surfaces schema edge cases worth documenting.
2. **Then Category 3 (Bug triage)** — triage prompts tend to reveal what's missing from the preamble.
3. **Then Category 5 (Documentation)** — locks in the wins from 1 and 3.
4. **Category 2 (Feature work) and 4 (Schema)** last — these benefit most from having the earlier categories stable, because feature and schema prompts often reference data and doc prompts as sub-steps.
5. **Category 6 (Cross-environment)** grows organically as friction shows up.

## Quality bar for each prompt

Before adding a prompt to the library, it should pass all of these:
- [ ] Produces a useful output on first try in at least 3 of 5 real cases
- [ ] Stays under ~200 words (if it's longer, it's probably two prompts)
- [ ] Names inputs and outputs explicitly
- [ ] Works in all three environments (Claude.ai, Claude Code, Antigravity) OR declares which one it's for
- [ ] Doesn't duplicate context already in `SESSION_PREAMBLE.md`

## End of outline
