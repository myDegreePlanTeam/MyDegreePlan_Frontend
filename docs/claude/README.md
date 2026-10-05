Files in docs/claude are md files that tell all future Claude Code conversations how to operate in all future conversations. Direct the AI to first read docs/claude files before any code changes or searching any other files.

For branch naming use following conventions:
- docs/* for documentation
- feat/* for features
- fix/* for bugs
- data/* for curriculum data edits
- schema/* for load-bearing schema work. 
- integration/* for a trial of a new major or department end to end (data, pipeline and app together). Start it as test/*; once it works, rename it to integration/*, push it, and merge it. Commits on it use the usual types below (feat:, data:, ...).

For Commit naming use following conventions:
- docs:
- feat:
- fix:
- data:
- schema:
- refactor:
Layout of docs/claude (paths in the docs are written from this folder):
- Top level, the files a session loads or reads first: `CLAUDE.md` (imported by the workspace root, so it never moves), `REFERENCE.md`,
  `ROADMAP.md` and this file.
- `tracking/`: bugs. `bug.md` (live bugs) and `bug_archive.md` (every closed bug).
- `plans/`: designs and rollouts: `PLAN_*.md` and `INTEGRATION_*.md` for a new-major trial. Status is at the top of each.

Where work is tracked: live bugs in `tracking/bug.md`, deferred work in `ROADMAP.md`, merged work in the GitHub pull-request list and `git log`
(there is no branch queue; the PR description is the plan for a branch).

A new document goes in the folder that matches what it is; do not add files to the top level without a reason.
