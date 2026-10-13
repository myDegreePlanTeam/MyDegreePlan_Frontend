# PLAN — Double majors and minors

Status (2026-10-13): **planned, nothing built.** Written to be executed in separate sessions; each phase below is one or two PRs and needs a go-ahead.
Source: the owner's request of 2026-10-13. Related: [`ROADMAP.md`](../ROADMAP.md) ("Certificates and minors", "What-if planning"),
[`PLAN_all-majors.md`](./PLAN_all-majors.md) (which left minors out), [`PLAN_deeper-features.md`](./PLAN_deeper-features.md) (Phase 5 left them out).

## Goal

A student can add a **second major** and/or **one or more minors** to their plan. The plan view shows one merged schedule, a course that serves
two programs appears once and counts toward each, hours are counted once, and every program has its own progress. Works on web, the Windows app
and Docker (one bundle; the backup file carries it).

Also in this plan (the owner's addition, 2026-10-13): a **what-if** for a second major and for a minor. The student can try one **without adding it**, and sees
what it would cost: the hours it adds and **how far it would push graduation past their current plan, and past four years**. For minors the what-if also answers
"**which minor am I closest to completing?**", ranked from the plan the student already has. The same delay warning is shown again before an add is confirmed.

Not in this plan: a **second bachelor's degree** (a different rule, 30+ hours beyond the first), certificates, graduate programs, and the
"try three majors" comparison of *replacement* primaries (it reuses the same engine later).

## What is true today (checked in the code, 2026-10-13)

**The data model allows one program per student.**
- `student_profiles.concentration_id` is the program; `catalog_year` and `gened_program` are one value each. `DegreePlan.jsx` loads
  `fetchRequirementSlots(db, profile.concentration_id, catalogYearForProfile(profile))` once and reloads only when `concentration_id` changes.
- Switching programs **deletes the plan** (`handleConcentrationSwitch` calls `clearPlanData`).
- `student_semester_notes` is unique on (student, **program**, semester), so notes are filed per program.
- `lib/undoStore.js` scopes the undo stack to one program and catalog year; `lib/data/backup.js` and `remoteBackup.js` validate every row against one program.

**The hard part is not as hard as it looks.**
- `student_plan_slots` is unique on (student, `requirement_slot_id`). Slot ids are unique across programs and years, so **two programs' slots can
  already sit in one student's rows with no schema change**.
- `buildDegreePlan`, `scheduleTerms`, `computePlanCredits` ("a course counts once"), `getPoolRemainder` and `buildDegreeAudit` all take a **list of slots**.
  Giving them a merged list is the design, not a rewrite. What breaks is everything that assumes the list came from one program (below).

**What a merged list breaks** (to be confirmed by the Phase 0 spike):
1. The same fixed course in both programs (MATH 1910, CSC 1300 ...) becomes two grid cards.
2. Both plans carry general education (`GEN_ED`, `FF_*` pools, `SCIENCE`, `COMM_REQ`): duplicated, and the two may differ (legacy vs Flight Foundations).
3. Each plan has its own **Free Elective** hours bucket and 120-hour total.
4. The math placement chain and `planRequiresCalculusII` floors run per plan.
5. `degreeAudit.homeOf` picks one home per slot using "the plan's own subject" (most fixed courses' subject): with two programs there are two.
6. Prior credit archives "at most one slot per credit": a credit that satisfies the same course in both programs would archive only one.
7. The header, the Degree Map PDF and the audit PDF name one program.

**What the catalog says** (Tennessee Tech undergraduate catalog, fetched 2026-10-13):
- Second major: "A student may qualify for an additional major or majors by the completion of all prescribed requirements in the specified
  additional curriculum or curricula." ([Majors](https://undergrad.catalog.tntech.edu/ugrequirements/majors)). **Silent on overlap, minimum unique hours,
  residency, and the degree (B.S. vs B.A.).**
- Minors: at least 15 hours of specified work, in addition to degree requirements; Arts and Sciences minors include 6 upper-division hours; "Successfully
  completed courses may simultaneously fulfill a student's degree requirements and the requirements for a minor"; a student may complete more than one, but
  no more than two appear on the transcript; Art and Music minors allow at most 4 hours of individual instruction, ensembles or activities
  ([Minors](https://undergrad.catalog.tntech.edu/ugrequirements/minors)). Silent on overlap with a second minor, grades and residency.
- The catalog that applies to a major is the one in effect when the student **enters that curriculum**. For an added program that is the term they add it, not
  their first term: the added program has its own catalog year.
- The Second Undergraduate Degree page was not reachable (404 at the guessed address); that is a different feature and is not needed here.

**What data we have for minors.** The 2026-27 snapshot lists **82 minors and no maps**
(`MyDegreePlan_Prototype/degree-specs/sources/coursedog/2026-2027/snapshot.json`, `withoutMaps`). I fetched all 82 definitions from the same API the scraper uses
(`/api/v1/cm/ttu_banner_direct/programs/<id>`, the field `requisites.requisitesSimple[].rules`). The requirements are **rules, not a schedule**:

| Rule type | Rules | Reads as |
|---|---|---|
| `freeformText` | 33 | a paragraph: "15 hours required in: MUS 1030 ... MUS Electives (2 credits)", "15 semester hours of CSC courses including CSC 1310 and at least six upper division CSC hours" |
| `minimumCredits` | 13 | N hours (the course lists are in sibling rules) |
| `completedAllOf` | 11 | a fixed list of courses (resolved through `courseSets`) |
| `completedAtLeastXOf` | 3 | N of a list |
| `completedAnyOf` | 3 | one of a list |

Only about 34 of the 82 state an hour count in text; 15 is the usual total, 18 appears. Some minors (Mathematics Minor) came back with an empty rule list:
**their requirements are not in the API and need the catalog page or the department**. Minors never carry a recommended semester, so a minor's courses have no
`map_semester`: the student (or the scheduler) places them.

## Decisions, with recommendations

**D1. Data model: keep the primary program where it is; add one table for the rest.**
`student_profiles.concentration_id` stays the **primary program** (everything that reads it keeps working; old backups and the Docker baseline stay valid). New table
`student_programs` (`id`, `student_id`, `concentration_id`, `role` `'major'|'minor'`, `catalog_year`, `gened_program`, `entry_season`, `entry_year`, `position`, `created_at`),
unique on (`student_id`, `concentration_id`). Slot rows need nothing: each added program's `requirement_slot_id`s go into `student_plan_slots` as today.
Alternatives rejected: widening `student_profiles` to arrays (breaks the Docker table and the engine's defaults), or a plan table that replaces the profile's program (a
migration of every stored plan). Schema goes in `000_baseline.sql` (`CREATE TABLE IF NOT EXISTS`) and `STUDENT_TABLES` in `localClient.js`; **no migration file**. The backup
`BACKUP_FORMAT` goes 1 → 2 and the reader accepts both (a v1 file simply has no added programs). A student's added program with no plan for its year is refused, as a primary is today.

**D2. Overlap: a course serves every requirement it satisfies; its hours count once.**
This is stated for minors (and is the existing `computePlanCredits` rule). For a second major the catalog is silent; recommend the same, recorded as an **assumption**
(owner/registrar to confirm, see Questions) with a visible note in the UI. The merge engine takes the policy as data (`overlapPolicy`) so a program pair that is
restricted later is a one-line change, not a rewrite.

**D3. Shared courses collapse into one card, but both slot rows exist.**
A pure module `lib/programMerge.js` takes each program's slots and returns `{ slots, programsOf, shadowOf }`: the merged list the grid sees, where a fixed course
named by two programs is **one slot** (the primary program's) tagged with every program it serves, and the other program's slot is a hidden **shadow** satisfied by it.
Both rows stay in `student_plan_slots`, so removing the second program deletes only its rows and leaves the card in place for the primary. Pools are never collapsed
(a pool is a choice, and a chosen course already counts once). Recommendation over the alternative (two visible cards): the grid is the product, and a duplicate card is wrong.

**D4. General education comes from the primary program only.**
A student has one general-education program. The added major's `GEN_ED`/`FF_*`/shared-category slots are shadows of the primary's categories, not extra requirements.
Program-specific requirements that merely *look* like gen-ed (a B.A. language requirement) are not gen-ed slots and stay. The gen-ed exemption (engineering History) follows
the primary; the added program's own exemption is honoured only if the primary has no exemption for it (assumption; Phase 0 lists the cases).

**D5. Hours: one total, and the added program fills the Free Elective bucket first.**
Required hours = the union of unique courses, never below the primary's total (120 for most). A second major's extra required courses are placed against the primary's
Free Elective hours before they extend the plan, which is how the catalog's unrestricted electives work. The hours shown are `max(primary total, unique required hours)`; the
header shows how many hours the added program adds. Assumption, with the exact rule written down and unit-tested in Phase 2. **The 120-hour minimum and any residency or
"unique hours for a second major" rule are unpublished; do not invent one** (Questions, 2 and 3).

**D6. Minors are a different kind of requirement, so they get their own slot form.**
A minor is "N hours from this list, X of them upper division", not a fixed course list with a semester map. Model it as slots with **no `map_semester`**: fixed courses
(`CSC 1310`), choice pools ("one of ..."), and two new rules: **"M hours from a list"** (an hours-bucket pool, like Free Elective but over a set) and **"at least X hours at 3000+"**
(rule pools already exist: "any 4000-level CEE course"). Minors never schedule by themselves: their unplaced courses go through the same scheduler as everything else after the
major's, or are left unplaced for the student to drop in. Recommendation over a bare hour counter: it keeps the audit, prerequisites and the finish estimate honest.

**D7. Import minors in three honest tiers, not all-or-nothing.**
1. **Structured** (rules of `completedAllOf` / `completedAtLeastXOf` / `completedAnyOf` / `minimumCredits`): generated into specs automatically.
2. **Free text, priority list**: hand-written specs from the catalog text, each with an `assumptions` entry, for the minors that students in the open departments actually take.
3. **The rest**: listed in the picker as "requirements not modelled here" with the catalog's own text and a 15-hour counter; no slots. A student can still see and track hours, and nothing pretends to be audited.
The owner supplies the priority list (Questions, 7). Empty-rule minors (Mathematics Minor) are tier 2 from the catalog page.

**D8. The catalog year of an added program is the year it is added.**
`planForYear` already resolves a plan not newer than a year; the added program uses the entry term of the declaration (default: the current term, editable), stored on
`student_programs`. `covers_earlier` plans work as today. The primary's `catalog_year` is never touched (a stored invariant: slot ids belong to exactly one set per program).

**D9. Where the student does it, and what it does not do.**
Not in onboarding (it asks one thing at a time and most students add a program later). The entry points are **Settings → "Add a second major or a minor"** and a link in the plan
header, using `ProgramPicker` filtered by role (the major picker offers majors with plans; the minor picker offers minors). "Change degree program" keeps replacing the **primary**
only and must no longer wipe an added program's rows. Removing an added program removes its rows and leaves shared cards. Terminology stays "degree program"; "minor" and "second major" name the roles.

**D11. A what-if is the same engine with nothing saved, and delay is measured against two baselines.**
The what-if runs `mergePrograms` and `projectDegree` (the Requirements tab's scheduler, `lib/termScheduler.js`) in memory, so what it shows is what an add would produce, not a
second model that can drift. Delay is the difference in the projected finish term between the base plan and the plan with the addition, in **terms** (Fall/Spring; summers are not
scheduled by default) and in dates through `describeFinish`. "Four years" means **eight Fall/Spring terms from the student's start term** (recommended; owner to confirm, Questions 9).
The warning is shown for a what-if and again in the add dialog; it never blocks. Because the scheduler's finish is an estimate (`optimal: false` means a faster arrangement might
exist), the sentence says "about" unless the schedule met its lower bound. Free Elective hours and shared courses often make the delay **zero**; the warning says so rather than staying silent.
"Closest minor" ranks by hours still needed after crediting the plan, prior credit and Free Electives, with ties broken by delay; only modelled minors (D7 tiers 1 and 2) are ranked.

**D10. One undo stack, scoped to the set of programs.**
`undoStore.scopeOf` becomes the primary plus a sorted list of added program ids and their years; any change to that set drops the stack, as a change of program does today.
New undo record types for add/remove program are not offered (removing is confirmed in a dialog instead).

## Phases

Every phase: branch off `main` with `start_branch.sh`, `npm run verify` green, one PR, docs updated in the same PR (`REFERENCE.md`, this plan's status line, the platform-parity
registry if a branch on platform is added). `DegreePlan.jsx` is touched by Phases 2, 3 and 6: **those three merge back to back, each rebased onto the last**, never in parallel.

### Phase 0 — Spike and decisions (no user-visible change; 1 PR, mostly tests and a findings section)
- Write `lib/programMerge.js` as a **pure module with tests only** (nothing imports it yet): `mergePrograms(primarySlots, addedSets[], { overlapPolicy })`.
- With `tests/support/realStudent.js` (real catalog), merge CSC Core with Mathematics B.S., and with a second program from another college; run the merged list through
  `buildDegreePlan`, `scheduleTerms`, `buildDegreeAudit` and `computePlanCredits`. **List every failure from "What a merged list breaks" with a real example** and write them into a
  "Findings" section here. Decide D3/D4/D5 against the findings; change this plan where the code disagrees (the code wins).
- Done when: the findings are in this doc, the merge module has tests for collapse, gen-ed dedupe, Free Elective absorption, and prior-credit archival across shadows.

### Phase 1 — Data model and storage (Frontend + Deploy baseline; no UI)
- `student_programs` in `000_baseline.sql` and `STUDENT_TABLES` (+ `localClient.test.js`); the `concentrations` to-one embed for the new table.
- Backup format 2 (reads 1 and 2), `remoteBackup.js`, and the "drop rows that point at a program or slot the catalog no longer has" rule for added programs. Tests in `backup.test.js` / `remoteBackup.test.js`.
- A loader `lib/studentPrograms.js` returning `[primary, ...added]` with each program's resolved plan year; tolerant of the table's absence (an install whose setup step has not re-run), like `fetchFreeAddSlots`.
- Done when: a profile with no added programs behaves byte-for-byte as today (the whole suite unchanged) and a backup round-trips with added programs.

### Phase 2 — Double major in the plan (the core; `DegreePlan.jsx`)
- Load every program's slots, merge them (D3–D5), run the existing pipeline on the merged list, and tag each card with the programs it serves. Shadow rows are written on add and hidden on the grid.
- Add flow in Settings (majors only): choose the program, entry term, confirm the overlap note; build placements with `buildDegreePlan` for the *added* slots only, leaving saved positions alone.
- Remove flow; "Change degree program" no longer clears an added program; undo scope (D10); semester notes move from per-program to per-student for display (keep the column).
- Math placement chain and engineering floors run once for the merged plan.
- Done when, for CSC Core + a second major: no duplicate cards, hours are the union, every requirement of both plans is satisfied exactly when its courses are in the plan, a prior credit covering a shared course archives both slots, drag/move/undo/reset behave, and a reload restores it all.

### Phase 3 — Plan UI and platforms (`DegreePlan.jsx` again, after Phase 2 merges)
- Program tags on cards and a filter ("All / CSC / Math"); header shows "CSC Core + Mathematics (second major)" and the extra hours; phone layout; empty and error states.
- The Settings and plan-header entry points; remove-program confirmation.
- A parity journey step (`parity/lib/scenario.mjs`) that adds a second major and checks it on all three platforms; register any platform wording in `lib/platform.js`.
- Done when: the three platforms render the same plan for the same add, and `terminology.test.js` passes.

### Phase 4 — Audit and PDFs (behind `FEATURES.requirements`)
- `buildDegreeAudit` takes the merged list plus `programsOf`: **one block per program** (major, second major, each minor), with general education once, electives once, and `refs` ("counted from CSC") for shared courses. `homeOf` gets the subject per program.
- Degree Map header names every program; the Degree Audit PDF prints a block per program. The audit remains "Coming soon" until the owner opens it.
- Done when: the screen and the PDF still agree row for row (the existing parity tests) with two programs.

### Phase 5 — Minor data (Prototype repo; **independent of Phases 1–4, can run in parallel with them**)
- Extend `catalog_scrape/scrape_programs.mjs` to keep each minor's `requisites` (today `withoutMaps` keeps only id, name, type, college).
- A spec generator for `kind: 'minor'`: tier 1 automatic (D7), tier 2 hand-written specs with `assumptions`, tier 3 manifest entries marked "not modelled". New slot kinds for "M hours from a list" and "X upper-division hours" (rule pools), validated by `degree-specs/build.mjs`.
- `npm run build:catalog` carries minors as `concentrations` rows with `kind: 'minor'` and a plan per catalog year; `programBrowser` offers them only to the minor picker; the manifest's `excluded` flag for minors is removed. Run `regen.sh`, commit Prototype first.
- Done when: every minor in the snapshot is in exactly one tier with a reason, tier 1 and 2 build with no validator errors, and a question sheet for the departments of tier 2 minors is generated.

### Phase 6 — Minors in the app (`DegreePlan.jsx`, after Phase 3; needs Phase 5)
- The minor picker and add flow (role `'minor'`); unplaced minor courses and the hours-bucket and upper-division rules in the merge engine and the audit; the transcript-limit notice at a third minor; the Art/Music individual-instruction cap if a tier 1/2 spec states it.
- Done when: a student adds a Mathematics-adjacent minor to CSC, the shared courses collapse, the 15 hours (6 upper division) show as a requirement with progress, and removing the minor restores the plan exactly.

### Phase 7 — What-if, "closest minor", and the delay warning (needs Phases 2 and 5; builds on 6)
A what-if is a **read-only computed plan** (D11): nothing is written until the student chooses to add.
- `lib/whatIf.js` (pure): `evaluateAddition({ base, addition })` runs `mergePrograms` on the student's real state plus the candidate, then `projectDegree` on both, and returns
  `{ addedHours, newRequiredCourses, sharedCourses, base: { finish, terms }, withAddition: { finish, terms }, delayTerms, pastFourYears, optimal }`.
- **Closest-to-complete minor:** `rankMinors({ base, minors })` runs `evaluateAddition` for every modelled minor (tiers 1 and 2) and sorts by **hours still needed**
  (the minor's required hours minus what the plan, prior credit and Free Elective hours already cover), then by delay, then by name. It shows the top few, each with
  "N of M hours done by your plan, X more, adds Y semesters", and says which minors were **not ranked** (tier 3: not modelled, so no number is claimed).
- **Delay warning, both features:** a plain sentence, never a blocker: "Adding this second major pushes your finish from May 2030 to December 2030 (1 more semester, 2 past
  four years)." Three states: *no delay* (absorbed by Free Elective hours and shared courses), *past your current plan*, *past four years*; the last also shows when the base plan
  is **already** past four years. It reuses `describeFinish` wording and the `optimal` flag (an estimate says "about"/"at least", as the finish line does).
- Surfaces: a "What if I added..." panel in Settings and the plan header (second major picker and minor picker, results before any write); the same delay line in the **add
  confirmation dialog**; the PDF and audit are unchanged.
- Done when: for a real CSC student, the ranking puts a minor the plan already mostly covers above one it does not and the order is stable under a test; a what-if writes nothing
  (checked by asserting no `db` call); the delay figures equal what you get by actually adding the program in a scratch profile; and a student already past four years sees that said.

### Phase 8 — Release
- Frontend + Prototype + Deploy docs; `preflight.sh`; the Docker and Desktop releases (see "Release process" in `CLAUDE.md`); the note says what a student can now do.

## Sessions

A reasonable split so each session has one context to hold: **S1** Phase 0 then 1 then 2 (Frontend, stacked, one go-ahead each); **S2** Phase 5 (Prototype, in parallel with S1: no
shared files, but `npm run build:catalog` rewrites Frontend `src/data/`, so S2 merges its Prototype PR first and S1 rebases); **S3** Phases 3 and 4; **S4** Phases 6, 7 and 8 (the what-if is Phase 7, after minors exist, since "closest minor" needs the minor data and the merge engine).

## Questions for the owner (every answer not received is recorded as `assumed`)

1. May a course count toward **both** majors? (catalog silent; we assume yes)
2. Is there a **minimum number of hours unique to the second major** or a residency rule? (not published; we assume none)
3. Must a second major be in the same **college or degree** (B.S. with B.S.)? (silent; we assume any combination)
4. Which department confirms a second major, and does the **advisor sign-off** appear in the app? (we assume no sign-off flow)
5. A second major whose primary has **no Free Elective hours** (a fully prescribed plan): should the plan simply run past 120? (we assume yes, and say so)
6. Is the general-education program always the **primary's**? (we assume yes)
7. **Which minors first?** A priority list (for CSC students: Mathematics, Business, Cyber Crime Law and Society, ECE, ...) decides tier 2.
8. Is the "at most two minors on the transcript" limit a **block or a notice**? (we assume a notice)
9. What does "past four years" mean: **eight Fall/Spring terms from the start term** (assumed), or four calendar years, counting summers? For a student who started with transfer or AP credit, should it be measured from the start term or from a nominal "four years from now"?
10. Should "closest minor" rank by **hours still needed** (assumed), or by **added semesters**? (They differ when Free Elective hours absorb the cost.)

## Risks

- **Double counting inflates progress.** The audit's one-home rule exists to prevent this; the merge engine must never count a shared course twice in the hours (Phase 0's test) or let a shadow slot read as a separate requirement.
- **Stored data.** An added program must never move the primary's slot ids or catalog year, and Reset / Erase / Import must handle added rows (Phase 1 tests).
- **Free text minors.** A hand-written spec from a paragraph can be wrong; each carries an `assumptions` entry, shows "from the catalog text", and goes on a department question sheet.
- **`DegreePlan.jsx` conflicts** (about 1,960 lines, three phases): back-to-back merges, as the working agreements say.
- **Scope creep** into a second degree, certificates, or the what-if view: out of scope; the merge engine is built so the what-if view can reuse it.
