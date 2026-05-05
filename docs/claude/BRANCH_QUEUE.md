# MyDegreePlan — Branch Queue

> Maintained in Claude.ai project workspace. Update after every merge or new branch decision.
> Last updated: 2026-05-04

---

## Active Branches (not yet merged)

_None._

---

## Queued Branches

### data/strip-course-descriptions-prototype
**Targets:**
- BUG-32 — Redundant prereq/coreq/placement text in course descriptions
**Scope:** `prototype.json` only. `coursesFile.json` is explicitly deferred.
**Notes:**
- Claude Code writes a stripping script, previews diff, then applies on approval.
- Re-seed Supabase after applying.
- `coursesFile.json` strip is a separate future task — do not scope-creep.
**Prompt:** `docs/claude/PROMPT_strip-course-descriptions-prototype.md`

---

## Phase 2 Branches (after all fix/* above are merged)

### schema/semester-terms
**Targets:**
- Add Fall/Spring/Summer term to every semester (rendered in the semester
  card header instead of "Semester N")
- Onboarding: ask start term, default to nearest upcoming semester
  (Fall if before Aug 1, Spring if before Jan 1)
- Summer semesters are opt-in (toggle lives in the rules/filters sidebar
  once `feat/rules-filter-sidebar` lands)
- Migration required — touches `requirement_slots`, `student_plan_slots`, grid rendering
**Notes:**
- Pairs with `feat/dynamic-semester-count` since the existing 8-semester hardcode
  must come down before terms (especially summers) make sense to add/remove.
**Prompt:** Not yet written

### feat/dynamic-semester-count
**Targets:**
- Remove the 8-semester template assumption; the grid renders whatever
  semesters the active plan defines, with "Add semester" / "Remove semester"
  affordances bound to the plan's remaining-credits state.
- Auto-extend or auto-shrink when an edit pushes the plan past the current
  semester count (e.g. adding a free-add to a non-existent Sem 9 creates it).
- Persist explicit student-added semesters separately from
  template-defined ones, so unselecting a concentration doesn't wipe them.
**Notes:**
- Today, semester count is implicit in the `requirement_slots` rows seeded
  per concentration. This branch adds a `student_extra_semesters` table or
  an `extra_count` column on `student_profiles`, plus loader logic to merge
  template + student-added semesters into the rendered grid.
- Couples tightly with `schema/semester-terms` (a Sem 9 needs a term name)
  and `fix/mark-complete-behavior` (completing a semester removes it from
  the active grid; the count adjusts).
**Prompt:** Not yet written

### feat/rules-filter-sidebar
**Targets:**
- Skeleton/prototype rules sidebar or modal where students set a priority
  list of plan constraints (max hours per semester, target graduation
  semester count, summer-semester opt-in, etc.).
- Persist rules per student in a new `student_rules` table.
- Read at plan-modification time so future auto-fill / recommendation work
  can honor them.
**Notes:**
- Prototype scope: data shape + UI for entering and reordering rules.
  Application of the rules to recommendation/auto-fill is deferred to
  `feat/recommendation-engine` (Phase 4) — but the rules data must exist
  for that to consume.
- The summer-semester opt-in toggle from `schema/semester-terms` lives here
  once both branches land.
**Prompt:** Not yet written

### fix/mark-complete-behavior
**Targets:**
- Three-way semester completion control at the **top** of each semester card
  (replacing the per-course planned/in-progress/completed badges, which are
  removed wholesale).
- Marking a semester complete cascades: every earlier semester is also
  marked complete and contributes its credit hours to the running total at
  the page header.
- Completed semesters disappear from the active grid and roll into the
  Prior Coursework panel as a new "Completed semesters" group, alongside
  AP / IB / ACT / Transfer categories already there.
- "Uncomplete" affordance for mis-clicks — ideally undoes the cascade in
  one click, not N.
- Credits display correctly in Requirements tab and `CompletionBadge`.
- **BUG-33** — Manual completion credits not counted toward standing
  thresholds in `SlotModal`. The new credit accounting must feed
  `creditsBefore` and `computePlanCredits` consistently.
**Notes:**
- The per-course badge removal is a non-trivial UX shift. Likely needs the
  product call documented (which planned/in-progress signals does the new
  3-way at-top control replace, if any?).
- The "completed semester rolls into Prior Coursework" model implies a new
  category on the Prior Coursework panel and likely a new entry shape on
  `prior_credits` or a parallel table.
- Touches the directionality fix from `fix/prereq-warnings-semester-order`
  (BUG-13). The earlier-only rule still applies to the new model — completed
  semesters now in Prior Coursework should pre-qualify prereqs the same way
  AP/transfer credits do.
**Prompt:** Not yet written

### fix/undo-stack
**Targets:**
- Multi-step undo (currently only undoes most recent action)
**Prompt:** Not yet written

### feat/exemption-gating
**Targets:**
- Identify courses that require advisor/instructor approval (data flag on
  `courses` table OR description-text detection — design call needed).
- Render approval-required slots greyed in the grid and modals with a
  "Needs approval" badge plus a hint explaining the requirement.
- Block selection or warn at save time; do **not** implement the full
  approval workflow (advisor sign-off, audit trail) — that is deferred.
**Notes:**
- `classifyPrereq.js` already detects "consent" language but only suppresses
  warnings. This branch turns that signal into a visible gate.
- Likely overlaps with **BUG-37** (pool name in prereq display) — both
  touch the prereq display layer; sequencing matters.
**Prompt:** Not yet written

---

## Phase 3 Branches (after Phase 2 merged)

### feat/grid-redesign
**Targets:**
- Tab structure: Plan (read-only) | What-If (current grid) | Requirements | History (deferred)
- Mobile: tap-to-move, bottom drawer for Prior Coursework
- Desktop: 2-col grid, persistent right sidebar for Prior Coursework display
- Slot row anatomy: drag handle / code / name / credits / status badge
- Pool slots: dashed border, italic placeholder
- Hard block on invalid drag with override dialog + persistent flag
- TTU purple for progress, gold for prereq warnings only
- Remove freshman/non-freshman tab artifacts
**Reference:** Claude Design mockup (first_prototype.png)
**Prompt:** Not yet written — write after Phase 2 is merged

---

## Phase 4 Branches (post-prototype)

### feat/recommendation-engine
- Naive v1: generate shortest valid plan from prior credits + concentration template
- Iteratively improved post-launch

### feat/what-if-deep
- Save/restore plan snapshots
- Test different concentrations, double majors, minors
- Summer class planning

### feat/history-tab
- Plan change history
- Completed semester timeline

### feat/advisor-view
- Read/write access to student plans for TTU advisors
- Requires university backing + additional auth/RLS work

### feat/non-csc-departments
- Expand beyond CSC to other TTU departments
- Requires concentration template ingestion pipeline

---

## Deferred Data Tasks

### feat/branding-icon
- App icon / logo for MyDegreePlan
- No design asset exists yet — icon must be created or sourced before implementation
- Deferred from `feat/theme-pass` which handled palette and dark mode but not the icon

### data/strip-course-descriptions-coursesFile
- Same as BUG-32 fix but for `coursesFile.json` (30,000 lines)
- Separate session, separate branch, after `prototype.json` strip is validated

### data/transferable-course-database
- Required to un-grey-out transfer credit entry (BUG-26 full fix)
- Scope and source not yet determined

---

## Merged Branches (for reference)

| Branch | Merged | Targets |
|---|---|---|
| `fix/prereq-coreq-logic` | pre-audit | Various prereq/coreq logic fixes |
| `fix/act-wizard-and-equivalencies` | pre-2026-04-21 | ACT credit, unified prior coursework panel, drag-to-transfer, drag-back |
| `fix/onboarding-prior-credit` | 2026-04-21 | BUG-20, BUG-21, BUG-22, BUG-23, BUG-24, BUG-25 |
| `fix/slot-modal-prereq-credits` | 2026-04-21 | BUG-1, BUG-2, BUG-5 |
| `fix/onboarding-wizard-overhaul` | 2026-04-24 | BUG-4, BUG-8, BUG-26 (interim grey-out), BUG-27, BUG-28, BUG-29, BUG-30 + freshman/non-freshman branch removal |
| `fix/transfer-credits-divergence-and-freeadd` | 2026-04-27 | BUG-3, BUG-6 |
| `fix/concentration-switch-clears-notes` | 2026-04-29 | BUG-7 |
| `fix/science-pool-warnings` | 2026-04-29 | BUG-10, BUG-11, BUG-17, BUG-18 |
| `fix/free-add-dedup-guard` | 2026-04-29 | BUG-34 |
| `fix/prereq-warnings-semester-order` | 2026-04-29 | BUG-13 |
| `fix/postgrest-input-sanitization` | 2026-04-29 | BUG-12 |
| `fix/wizard-step3-cleanup` | 2026-04-29 | BUG-39 |
| `fix/ap-chem-stem-filter` | 2026-04-29 | BUG-35 |
| `fix/pool-archive-filled-slots` | 2026-04-30 | BUG-42 |
| `fix/prereq-pool-name-display` | 2026-04-30 | BUG-37 |
| `fix/gen-ed-sub-pool-surfacing` | 2026-04-30 | BUG-43 |
| `fix/prereq-display` | 2026-05-02 | BUG-31 |
| `fix/semester-card-css-polish` | 2026-05-02 | BUG-40, BUG-41 |
| `feat/theme-pass` | 2026-05-02 | BUG-38, feat/branding (palette), feat/dark-mode |
| `fix/drag-to-prior-coursework-flicker` | 2026-05-05 | BUG-36, BUG-44 |