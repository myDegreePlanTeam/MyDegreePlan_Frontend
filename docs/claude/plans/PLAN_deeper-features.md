# PLAN — Deeper features

Held back (2026-10-12): the Requirements tab and everything built under Phase 1b show as **"Coming soon"** (`FEATURES.requirements` in `src/lib/features.js`) until the owner opens them.

Status (2026-10-12): **Phase 1 merged** (Frontend #74); **Phase 1b: A1 built, reworked and merged** (six PRs, Frontend), A2 and A3 merged, A4 built (branch `feat/audit-pdf`), A5 deferred. The other phases are not started and need a go-ahead
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
- `src/components/shell/GenEdProgress.jsx`: the panel, on its own Requirements tab (`shell/RequirementsView.jsx`; the sidebar and the loading skeleton list it between Plan and Issues).
- Tests in `src/tests/genEdPanel.test.js`.
- **Not in Phase 1** (each needs a catalog check or a department answer, so ask first): the American History exemption for engineering
  majors, other majors' category restrictions, the C-or-better rule for ENGL 1010 before ENGL 1020.

Finding on the way: `usePlanCompleteness` returns only counts and a boolean; it does not shape per-category rows as the roadmap said.
The panel does not use it, and the hook stays uncalled.

## Phase 1b: The Requirements tab as a degree audit

Decided 2026-10-12. The tab replaces what students use Degree Works for (Tennessee Tech's audit, What-If, Class History, GPA calculators).
Sources: Tech's [Degree Works page](https://ouweb.tntech.edu/records/degreeworks.php), Ellucian's Web Interface User Guide 5.0.1, other
schools' legends and FAQs. The real Tech audit is behind Eagle Online login and was **not seen**: block names, order and wording should be
matched to a screenshot or PDF of one before Step A1 ships.

**What Degree Works gives at Tech:** an audit in blocks (degree, major, concentration, gen-ed) with a check box each; in-progress courses
count as met; best-fit placement (a course may show under several requirements but counts toward one); Class History; What-If for another
major; **Look Ahead listed as "coming soon", so Tech students do not have it**; three GPA calculators (graduation, term, advice); advisor
notes; exceptions entered by Academic Services; nightly refresh; catalog years 2011 and later only.

**Where it fails students:** a mostly red audit and a misleading percent-complete figure; no explanation of why a course did or did not
count; transfer credit, repeats and major changes lag behind the nightly batch.

**What this app can do that it cannot:** a requirement is *Done* (a past term or prior credit), *In progress* (the current term), *Planned*
(a future term) or *Not placed*, all derived from the calendar (`lib/termPhase.js`); a *Not placed* row opens that slot's picker, as an
Issues entry jumps to its course; the audit follows every drag at once, so the live plan is the look-ahead; a fixed slot (one that cannot be
removed) reads **Required**, a pool reads **Choose 1 of N** with its progress.

**Blocks are derived from slot types** (gen-ed, required courses, choose-from pools, Free Elective hours). The specs have no group field and
this plan does not add one; a department-named grouping ("Major core", "Technical electives") is a later, data-side option.

- **A1. Audit skeleton (built, then reworked after review).** A pure `src/lib/degreeAudit.js` (`buildDegreeAudit`) feeding `RequirementsView`. Review found
  four problems, fixed in order on stacked branches:
  1. *Truthful states.* The gen-ed panel called a category "Met" when only a future term covered it. It now has Complete (earned) / In progress / Covered by plan / Not covered.
  2. *Sorting.* "Required", a separate Flight Foundations panel and "Choose from a list" split general education across three places. Every slot now has one home:
     the major, general education (by category), or electives; a major course that also counts for a category (CSC2570) is listed once and referenced.
  3. *Options.* A choice row lists what can fill it (`lib/slotOptions.js`, shared with the picker), read-only.
  4. *Redundancy.* Decided with the owner: the **Plan is the only place anything changes**; Requirements explains and links. Its summary counts requirements
     (the Plan header already shows hours). **The Issues tab keeps its open-choice entries** (see below). No drag and drop on a phone.
  Tests: `degreeAudit`, `genEdPanel`, `slotOptions`, `semesterRender`.

  *Why Issues keeps "Incomplete selection" for an open choice* (commit `46b7f68`, 2026-09-29): an unfilled pool slot **provisionally satisfies later courses'
  prerequisites** (CSC3040 needs COMM2025 or PC2500, so an empty Communications slot placed earlier stands in for it). Without that, every course behind an empty
  slot would warn "prerequisite unmet". The entry is how the plan admits its validity leans on a choice nobody has made: it is a **warning** (not info) when another course
  relies on the slot, and it names those courses; in a past term it says the choice should be recorded. It is a statement about the plan's correctness, not a to-do list, so it
  belongs beside the other validations even though Requirements also shows the open choice. A fresh Cybersecurity plan has 12 of them, all info or warning, no blockers.
- **A2. Evidence (built).** `lib/auditEvidence.js`. Every gen-ed category lists the courses behind its hours, including ones that are not its own rows (an added
  course, prior credit, an elective pick); a prior credit that covers a pool slot names its course and note; Free electives lists the courses spending its hours. A
  "Not counted toward a requirement" section lists hours above a category's limit, introductory language over its cap, hours in an exempt category, a course counted
  once already, a course that fills no listed requirement, and a placement that awarded no hours; it says plainly that a course counts once (a slot model, unlike Degree
  Works' best-fit display). Legacy plans have lighter evidence (their evaluator keeps no course lists).
- **A3. Projection (built).** `lib/termScheduler.js` (pure; the code Phase 4 reuses) and `lib/degreeProjection.js`: the earliest finish the rules allow (the same prerequisite,
  corequisite, season and standing checks the Plan runs, at up to 18 hours a term, Fall and Spring), the student's own plan end beside it, the chain that sets the pace and why a step
  waited, a plan-and-fastest date per block, and courses no rule can place. A "Finish line" card on the Requirements tab. It is an estimate (no seats, no schedule of classes, no summers),
  and `optimal: false` says a different arrangement might save a term. Engineering plans are held to their department map, so for them the map, not prerequisites, sets the pace.
- **A4. Print (built).** The degree audit is **its own PDF, separate from the Degree Map** (`lib/auditExportModel.js`, `AuditPdfDocument.jsx`): the counts, the finish line, each block with its groups and
  rows (course, state word, where the credit comes from, hours), and what did not count. The Advisement tab now offers two documents, each with its own export button and preview. It is built from the same
  audit and projection as the screen, and the wording is shared (`lib/auditLabels.js`, `describeFinish`), so print and screen cannot drift. Held back with the tab while `FEATURES.requirements` is false.
- **A5. GPA tools: deferred.** Degree Works' calculators need grades, and this app derives progress from the calendar and stores none. They
  wait for the roadmap's "Real grades" item; do not design grade entry here.

Parity: add a Requirements visit to `parity/lib/scenario.mjs` with A1 (the journey does not open the tab today).

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

1 → 1b (A1, A2, A3, then A4) → 2 → 3 → 4 → 5, with 6 interleaved. Check in before the per-major gen-ed rules (Phase 1), the snapshot cap (Phase 2) and the first rule
types (Phase 3).
