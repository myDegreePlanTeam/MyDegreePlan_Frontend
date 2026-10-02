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