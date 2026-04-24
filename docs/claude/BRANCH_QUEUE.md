# MyDegreePlan — Branch Queue

> Maintained in Claude.ai project workspace. Update after every merge or new branch decision.
> Last updated: 2026-04-24

---

## Active Branches (not yet merged)

_None._

---

## Queued Branches

### fix/prereq-display
**Targets:**
- BUG-31 — MATH1910 prereq display omits ACT Math 27+ OR gate
**Notes:**
- BUG-28 (universal ACT entry in wizard) has landed via `fix/onboarding-wizard-overhaul`, so this fix is now testable end-to-end.
- Medium confidence on implementation approach — read `classifyPrereq.js` carefully before planning.
**Prompt:** Not yet written

---

### data/strip-course-descriptions-prototype (can run parallel to fix/prereq-display)
**Targets:**
- BUG-32 — Redundant prereq/coreq/placement text in course descriptions
**Scope:** `prototype.json` only. `coursesFile.json` is explicitly deferred.
**Notes:**
- Claude Code writes a stripping script, previews diff, then applies on approval.
- Re-seed Supabase after applying.
- `coursesFile.json` strip is a separate future task — do not scope-creep.
**Prompt:** Not yet written

---

## Phase 2 Branches (after all fix/* above are merged)

### schema/semester-terms
**Targets:**
- Add Fall/Spring/Summer term to every semester
- Onboarding: ask start term, default to nearest upcoming semester
  (Fall if before Aug 1, Spring if before Jan 1)
- Summer semesters are opt-in
- Migration required — touches `requirement_slots`, `student_plan_slots`, grid rendering
**Prompt:** Not yet written

### fix/mark-complete-behavior
**Targets:**
- Mark complete awards credits, collapses card to summary row, hides from grid
- "Uncomplete" option for mis-clicks
- Credits display correctly in Requirements tab and CompletionBadge
- BUG-33 — Manual completion credits not counted toward standing thresholds in SlotModal
**Notes:**
- BUG-33 fix must coordinate with this branch — creditsBefore in SlotModal
  needs to read completed-semester credits the same way computePlanCredits does.
**Prompt:** Not yet written

### fix/undo-stack
**Targets:**
- Multi-step undo (currently only undoes most recent action)
**Prompt:** Not yet written

### feat/branding
**Targets:**
- MyDegreePlan icon/logo on app
- No design asset exists yet — icon must be created or sourced first
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