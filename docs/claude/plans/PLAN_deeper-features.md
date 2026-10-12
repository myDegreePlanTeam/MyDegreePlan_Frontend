# PLAN — Deeper features

Status (2026-10-12): **Phase 1 in progress** (branch `feat/gened-completeness-panel`). The other phases are not started and need a go-ahead
each. The source of each item is [`ROADMAP.md`](../ROADMAP.md) ("Feature work"); when a phase ships, delete its roadmap entry and mark it here.

The breadth work (opening more departments, back-filling catalog years) is a separate project: see `PLAN_all-majors.md`.

## Constraints that shape the order

- `src/components/DegreePlan.jsx` is about 1,960 lines and most phases touch it. Branches that edit it merge **back to back**, each
  rebased onto the last, never in parallel (see "Working agreements" in `CLAUDE.md`).
- A new student table is three edits: `local-deploy/setup/sql/000_baseline.sql` (idempotent), the `STUDENT_TABLES` defaults in
  `src/lib/data/localClient.js` with a test in `src/tests/localClient.test.js`, and the Export / Import code (`lib/data/backup.js`,
  `lib/data/remoteBackup.js`) so a backup carries it. No `migration_tier*.sql`.
- One bundle on three platforms. A feature may not branch on the platform unless `parity/platform-branches.json` says so, and a new
  user-facing word goes through `lib/platform.js`.
- A new undo record type must be added to `isUndoApplicable`, or it is never applied.
- Code that reads a new column or table tolerates its absence (an install whose setup step has not re-run).

## Phase 1: General-education progress panel (no schema change)

The evaluators exist (`evaluateFlightFoundationsForPlan`, `getFlightFoundationsStatus`, `getGenEdStatus`) and are used only inside the
slot picker. Phase 1 renders them as a student-facing summary.

- `src/lib/genEdPanel.js`: a pure `buildGenEdPanel(...)` that picks the evaluator by the profile's `gened_program` and returns one
  shape for both programs (rows with hours earned, the required range, and a state), or `null` when the plan has no gen-ed slots.
- `src/components/shell/GenEdProgress.jsx`: the panel, shown in the Issues view below the issue list.
- Tests in `src/tests/genEdPanel.test.js`.
- **Not in Phase 1** (each needs a catalog check or a department answer, so ask first): the American History exemption for engineering
  majors, other majors' category restrictions, the C-or-better rule for ENGL 1010 before ENGL 1020.

Finding on the way: `usePlanCompleteness` returns only counts and a boolean; it does not shape per-category rows as the roadmap said.
The panel does not use it, and the hook stays uncalled.

## Phase 2: Plan snapshots and restore

- Table `student_plan_snapshots` (`profile_id`, `created_at`, `label`, JSON `payload` of plan slots, free-add slots and prior credits).
  Baseline, `STUDENT_TABLES` default, backup and remote backup, `ON DELETE CASCADE` from the profile.
- Save and Restore in the plan toolbar or Settings; an automatic snapshot before Reset Plan and before a program change.
- Restore drops rows whose slot the catalog no longer has, as the backup importer does, and says so.
- **Decide first:** a cap on snapshots per profile (proposed 10), and whether restore is itself undoable.
- Snapshots live in the same store as the plan, so clearing site data loses them; the UI says so.

## Phase 3: Preferences sidebar

- Table `student_rules` with typed entries (max hours per term, target graduation term, summer opt-in), one row per rule, ordered.
- Step 1 captures and persists the rules; those with an enforcement point already (term load, summer) raise advisory issues through
  `planIssues.js`. Step 2 (Phase 4) consumes them.
- **Decide first:** the first set of rule types.

## Phase 4: Recommendation engine and auto-fill

- A pure module in `src/lib/` (no React): takes the program's plan, prior credits, the rules and the requirement map, and returns a
  proposed term layout. The `checkPrereqs` / `checkCoreqs` contracts do not change.
- Respects `semesterRestrictions.js`, the 21-hour overload ceiling, standing, and the Free Elective hours bucket.
- Surface: "Suggest a plan" shows the diff; Apply writes through the existing move path and pushes an undo record.
- First version is greedy (shortest valid plan), tested against the real CSC plans. Hardest phase: after Phases 1 to 3 are merged.

## Phase 5: What-if and "try three majors"

- The model allows one program per profile, so a what-if is a read-only computed plan: run `degreeBuilder` for another program with the
  student's prior credits and compare hours remaining, terms to finish, and which completed courses carry over.
- Minors and double majors are out of scope (they need a data-model change).

## Phase 6: Smaller items (parallel-safe, any time)

- Course search by description (`LocalDb.hydrateDescriptions`, then match).
- A visible "needs approval" badge (no workflow).
- Dual Credit and Dual Enrollment: decide whether they are separate `credit_type` values before building (BUG-22).
- App icon: needs a design asset.

## Order

1 → 2 → 3 → 4 → 5, with 6 interleaved. Check in before the per-major gen-ed rules (Phase 1), the snapshot cap (Phase 2) and the first rule
types (Phase 3).
