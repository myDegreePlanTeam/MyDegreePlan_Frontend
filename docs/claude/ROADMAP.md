# MyDegreePlan — Roadmap

> Aspirational and deferred work for the prototype. Items here are **not** in scope
> for current sessions unless explicitly pulled in. If a task below becomes active,
> move it out of this file and into a branch context doc.
>
> Keep this file honest: when something ships, delete the entry. When a goal is
> abandoned, delete the entry. No tombstones, no "completed" sections.

---

## Scope expansion

### Beyond CSC — other TTU departments
Current prototype covers TTU Computer Science only (4 concentrations). The long-term
vision is a planner covering all **178 TTU bachelor's programs**. Order of attack
not yet decided; likely driven by which departments request it or have clean catalog data.

**What this requires before it's a real project, not a goal:**
- A concentration template ingestion pipeline (currently hand-authored `csc_*.json` per concentration).
- Catalog-wide validation: pool definitions in `poolResolver.js` currently encode CSC-specific pools (`CSC_LOWER_ELECTIVE`, `CSC_HPC_ELECTIVE`, etc.). Expanding beyond CSC means either per-department pool tables or moving pool membership into the DB.
- GEN_ED sub-requirement enforcement (see below) — CSC currently tolerates loose GEN_ED handling; other colleges may not.

### Banner / university SIS integration
Import transcripts directly so students don't hand-enter prior coursework. The schema is
already primed: `student_plan_slots.archive_reason = 'banner_import'` is reserved for this
path. **Do not implement archive logic for this value** until the integration is real.

### Admin catalog UI
Right now course catalog edits go through `MyDegreePlan_Prototype/coursesFile.json` →
`seed.js` → Supabase. A future admin UI would let department staff edit `courses`,
`prerequisite_entries`, `corequisite_entries`, and `requirement_slots` directly against the DB
with RLS-scoped write access.

---

## Feature work

### Individual per-course manual completion toggling
Currently completion is semester-level only (`student_semester_notes.completed_by_student`).
A per-course toggle would need a new column on `student_plan_slots` (likely
`completed_by_student boolean default false`) and careful UX: it must not conflict with
the existing prior-credit archiving flow or the "grid shows only what's left" principle.

### Plan history / versioning
Let students snapshot a plan before major edits and restore it. Likely a
`student_plan_snapshots` table keyed by `profile_id + created_at` with a JSONB blob of
`student_plan_slots` + `student_free_add_slots` + `prior_credits` state.

### GEN_ED sub-requirement enforcement
Today GEN_ED is a single pool. TTU core actually splits it into History (6hr),
Humanities (6hr), Social/Behavioral (6hr), Creative Arts (3hr), etc. A correct planner
enforces each sub-requirement separately. This likely means sub-pool codes
(`GEN_ED_HISTORY`, `GEN_ED_HUMANITIES`, ...) in `POOL_COURSES` and corresponding
`requirement_slots` rows, plus wizard UX for routing AP/IB credits to the right sub-pool.

### Science sequence auto-pair enforcement
`getScienceWarnings` in `poolResolver.js` warns when a student picks two non-paired
science courses. A stricter future version would prevent the invalid pairing entirely
at selection time, with an override path for department-approved exceptions.

### Cambridge exam credit wizard step
DB schema already allows `test_type='cambridge'` in `test_equivalencies` and
`credit_type='cambridge'` in `prior_credits`. Just needs a step in `PriorCreditWizard`
analogous to the AP/IB/ACT steps, plus seed rows in `test_equivalencies.sql`.

### Full-text course search
Currently all course pickers filter by exact substring match on `class_code`. A
full-text search across `name` and `description` would help students who know the topic
but not the code.

### Pool-slot drag-back restoration
When a student drags a prior credit row back onto a semester, pool slots come back empty
— the original pool selection is not restored. Fixing this means persisting the pool
selection in the prior credit row (already partly done via `satisfies_pool`) and
re-applying it on unarchive.

### Email notifications
No notification system exists. Candidate triggers: advisor leaves a note, plan
completeness crosses a threshold, catalog change invalidates a planned course.

---

## Infrastructure

### TypeScript migration
Everything is plain JS today. A migration would start with `src/lib/` (pure logic,
highest test coverage, clearest contracts) and work outward to components. Not blocking
anything, but the `checkPrereqs` / `checkCoreqs` / `resolveTransferCredits` signatures
would benefit from being enforced at compile time given how strict the invariants are.

---

## End of roadmap
