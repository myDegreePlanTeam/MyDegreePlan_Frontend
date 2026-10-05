# MyDegreePlan — Roadmap

> Aspirational and deferred work for the prototype. Items here are **not** in scope
> for current sessions unless explicitly pulled in. If a task below becomes active,
> move it out of this file and into a branch context doc.
>
> Keep this file honest: when something ships, delete the entry. When a goal is
> abandoned, delete the entry. No tombstones, no "completed" sections.

---

## Scope expansion

### Opening the other majors to students
The app holds 176 programs, but only the Computer Science department's (`CSC`: the four concentrations and the Artificial Intelligence major) can be
chosen: every other program is grayed out and tagged "Coming soon" in the onboarding picker and Settings' change-program modal, because those
plans are generated from Coursedog maps and not yet reviewed (decisions still `assumed`, hours short on 34 plans). The gate is
`READY_DEPARTMENTS` in `src/lib/programBrowser.js`; it only hides the choice, so a saved plan or an imported backup on any program still loads.
To open a department: have it confirm the questions in the manifest's `decisions` (see "Department confirmations" below), check its maps against
`allMapsConformance.test.js`, then add its code to `READY_DEPARTMENTS` and update the test in `programBrowser.test.js` that pins the ready list.

### After every major: what is left of "all programs"
Every undergraduate program with a Coursedog degree map is in the app (v0.4.0, 2026-10-03: 176 programs, 179 plans) except the Accelerated B.S.N.
The rollout, its decisions and the wave results are in [`plans/PLAN_all-majors.md`](./plans/PLAN_all-majors.md). What a later project could take, each with
the first step that would make it real:

- **The Accelerated B.S.N. (`nurs_absn`, 63 hours).** A second-degree program: the plan is not a 120-hour bachelor's (no gen-ed, a prior degree).
  Needs a plan kind that declares fewer hours and skips the gen-ed checks; the manifest holds it as `blocked`.
- **Earlier catalog years.** Every first plan covers earlier entrants and is flagged "approximate". Coursedog serves older versions
  (`effectiveDatesRange`), so the 2025-26 and earlier plans could be back-filled per program, replacing the flag with the entrant's own year. Slot
  ids already stay stable across regenerations (`planSlotSync`).
- **A yearly refresh.** The 2027-28 catalog arrives around August: re-run the scraper (`catalog_scrape/scrape_programs.mjs`), diff the manifest
  (new, renamed or closed programs), add the new year's plans beside the old ones. The tools exist; the missing piece is a checklist and a diff report.
- **Hours a student sees.** 34 of the 175 2026-27 plans declare fewer than 120 hours (as low as 113) because a fixed course with a credit range
  counts its minimum and the math placement chain counts only its top track. Fixing it is app work: a chosen-hours default for fixed ranged courses (the map's own hours), carried in
  `student_plan_slots.selected_credits`.
- **Department confirmations.** Every answer in the manifest's `decisions` is `assumed`. A report grouped by college (one page of questions per
  department: waivers, hours, overrides) and a way to flip an answer to `confirmed` would turn the assumptions into signed-off data.
- **Elective restrictions.** Most elective families are open pools labelled with the map's wording ("upper-division HIST"); the restriction is not
  enforced. Wordings with a clean rule could become rule pools, as "any 4000-level CEE course" did.
- **A "try three majors" view.** About 970 undergraduates sit in holding categories (Interest Groups, Interest in Nursing, Basic Business and
  Engineering, non-degree) and have no plan to open; only 22% of Interest Groups freshmen were still in it a year later. A compare-and-switch view
  across two or three programs would serve them.
- **Graduate programs.** About 57 graduate programs (Nursing MSN, MBA, Counseling, Curriculum and Instruction, Engineering PhD, ...) have no plans.
  Not scoped: first check whether Coursedog carries degree maps for them.
- **Certificates and minors.** Excluded (`excluded` in the manifest). A minor would be a second program on one student, which the data model (one
  program per profile) does not allow yet.

The demand, funding and fill-ability data behind the wave order is `MDP_TTU_Demand_Funding_Fillability.xlsx` (not in the repo); the plan doc
records how it was used.

### Banner / university SIS integration
Import transcripts directly so students don't hand-enter prior coursework. The schema is
already primed: `student_plan_slots.archive_reason = 'banner_import'` is reserved for this
path. **Do not implement archive logic for this value** until the integration is real.

### Admin catalog UI
Right now course catalog edits go through the Prototype's course overrides and the `degree-specs/` files → `bash local-deploy/tools/regen.sh`
(regenerates `catalog.json` for the local backend) or `seed.js` (Docker stack). A future admin UI would let department staff edit `courses`,
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

### Gen-ed category enforcement
Flight Foundations (Tennessee Tech's gen-ed program, entering Fall 2026+) is implemented in
`flightFoundations.js`: eight requirement areas, the 4 shared flex hours, the introductory-language
cap, and per-plan evaluation, used by the FF pools and the slot modal. Still open:
- A dashboard panel for the 41-hour summary. The evaluator and `getFlightFoundationsStatus` exist, and `usePlanCompleteness` already shapes
  their rows for a panel, but nothing outside its tests calls that hook and no component renders a completeness panel.
- Per-major rules on top of the baseline: the American History exemption (Chemical, Civil,
  Computer, Electrical, General and Mechanical Engineering), other majors' category restrictions,
  and the minimum-grade rules (C or better in ENGL 1010 before ENGL 1020).
- The legacy program still tracks only History / Humanities / Social through `getGenEdStatus`.

### Science sequence auto-pair enforcement
`getScienceWarnings` in `poolResolver.js` warns when a student picks two non-paired
science courses. A stricter future version would prevent the invalid pairing entirely
at selection time, with an override path for department-approved exceptions.

### Course search by description
Course pickers already match a typed term against the course code or name (`ilike` in `courseSearch.js` and `AddCourseModal`). Searching the
description as well (full-text) would help students who know the topic but not the title; descriptions load on demand
(`catalog.descriptions.json`), so the local backend would need them fetched before it can match.

### Pool-slot drag-back restoration
When a student drags a prior credit row back onto a semester, pool slots come back empty
— the original pool selection is not restored. Fixing this means persisting the pool
selection in the prior credit row (already partly done via `satisfies_pool`) and
re-applying it on unarchive.

### Email notifications
No notification system exists. Candidate triggers: advisor leaves a note, plan
completeness crosses a threshold, catalog change invalidates a planned course.

### Auto-fill rules and filters sidebar
Today the planner has no notion of student preferences ("no more than 18 hours
per semester," "graduate within 8 semesters," "no Friday classes"). A
prototype-grade rules sidebar would let students set and reorder a priority
list of constraints that the recommendation engine (when it lands) and the
auto-fill flow honor. Skeleton scope for the prototype: a sidebar/modal that
captures a list of rule-typed entries, persists them per student, and
reads/writes to a new `student_rules` table. Application of the rules to
plan-modification actions can be staged after the data shape is in place.
Couples to a summer-semester opt-in toggle, which belongs in this sidebar: season-aware
terms and the Add Semester wizard shipped, the opt-in did not (see `feat/rules-filter-sidebar` in `tracking/BRANCH_QUEUE.md`).

### Class exemption / advisor-approval gating
Some courses require advisor or instructor consent before a student can enroll.
Today the planner displays them as ordinary slots; the prereq classifier
detects "consent" language in descriptions but only suppresses warnings. A
prototype-grade gate would: (1) flag approval-required courses (data column on
`courses` or detection regex), (2) render those slots greyed with a
"Needs approval" badge, (3) show a hint explaining the requirement. The full
approval workflow (advisor sign-off, audit trail, exemption tokens) is
deferred — this is the visible-cue version only.

---

## Infrastructure

### TypeScript migration
Everything is plain JS today. A migration would start with `src/lib/` (pure logic,
highest test coverage, clearest contracts) and work outward to components. Not blocking
anything, but the `checkPrereqs` / `checkCoreqs` / `resolveTransferCredits` signatures
would benefit from being enforced at compile time given how strict the invariants are.

---

## End of roadmap
