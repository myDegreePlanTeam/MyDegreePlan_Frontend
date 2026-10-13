# PLAN — Double majors and minors

Status (2026-10-13): **Flag open** (`FEATURES.additionalPrograms` true; the parity journey adds a secondary major, makes it primary and removes the other). **Primary and secondary majors** (owner's request, after Phase 8): Settings "Your major(s)" lists the enrolled majors with the primary flagged and assignable (`lib/majors.js`: `swapPrimary`, `mergeInOrder`, `inheritedRows`; `handleMakePrimary` in `DegreePlan.jsx`), any number of secondary majors can be added and removed, and the wording is "primary major" / "secondary major" everywhere, PDFs included (`PRIMARY MAJOR` in the heading once a secondary major exists; audit blocks end "(primary major)", "(secondary major)", "(minor)"). **Phase 0 done** (`lib/programMerge.js` with tests, nothing imports it; findings below; D3 to D5 revised). **Phase 1 done** (`student_programs` in the Docker baseline and the local
engine, backup format 2, `lib/studentPrograms.js`). **Phase 2 done** (second major in the plan view, add and remove in Settings; supported majors only: Computer Science and Mechanical Engineering today; the Settings card is closed by `FEATURES.additionalPrograms` until Phases 3 and 4, so students do not see an unfinished feature). **Phase 5 done** (Prototype PR #19: all 82 minors in three tiers, 13 / 16 / 53; Deploy #35 allows `kind 'minor'`; the Frontend catalog carries them and the primary pickers ignore them). **Phases 3, 4 and 6 done** (tags, filter, per-program audit and PDF headings, minors). **Phase 7 done** (the what-if and the delay warning). Phase 8 (release) is left, with opening the flag.
Written to be executed in separate sessions; each phase below is one or two PRs and needs a go-ahead.
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
A student has one general-education program. The added major's `GEN_ED`/`FF_*`/shared-category pools are shadows of the primary's pools **of the same category** (`SCIENCE` and `FF_SCIENCE` are one category,
`COMM_REQ` is oral communication), paired off one to one. **Revised by Phase 0:** a pool the primary has no more of **stays on the grid, owned by the added program**, because dropping it loses a requirement
(Mathematics B.S. asks for `ENG_LIT` and `FF_LITERACY`, which the Computer Science Core plan does not). Only when the added program follows a **different** gen-ed program (legacy against Flight Foundations) are its
gen-ed pools dropped, since the student follows the primary's. Program-specific requirements that merely *look* like gen-ed (a B.A. language requirement, `FF_FLEX` in the Business plans) are not mapped to a
category and stay. The gen-ed exemption (engineering History) follows the primary; the added program's own exemption is honoured only if the primary has none for it (still to be written in Phase 2).

**D5. Hours: one total, and the added program fills the Free Elective bucket first.**
Required hours = the union of unique courses, never below the primary's total (120 for most) or an added major's own total (ME is 128). A second major's extra required courses are placed against the primary's
open Free Elective hours before they extend the plan, which is how the catalog's unrestricted electives work; the added program's **own** Free Elective buckets are not requirements (the primary's courses fill them).
**As built in Phase 0:** `totalHours = max(primary total + extra hours, each added major's total)`, where extra hours = the added programs' own visible hours minus the primary's open Free Elective hours (a bucket
with a pick is never shrunk below the pick; one used up leaves the grid; stored rows are never changed). The header shows how many hours the added program adds. Assumption, tested in `programMerge.test.js`. **The 120-hour minimum and any residency or
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
**Which minors get tier 2 first (owner, 2026-10-13):** minors related to the **currently open majors** first, then **all the sciences, engineering and mathematics**. "Open" is what
`programBrowser.js` opens today: every Computer Science program (`READY_DEPARTMENTS = ['CSC']`) and Mechanical Engineering (`READY_MAJORS`); read the list from there when the phase runs, because it grows.
The minors in the 2026-27 snapshot sort as follows (the borderline ones are a call to confirm with the owner when Phase 5 starts):
- **Wave A, related to the open majors:** Computer Science, Computer Science Education, Cyber Crime Law and Society, Business Information Technology and Analytics, Mathematics (CSC);
  Electrical and Computer Engineering, Engineering Technology, General Engineering Studies, Industrial and Systems Engineering, Materials Science and Engineering, Environmental Engineering, Physics (ME).
- **Wave B, the rest of the sciences, engineering and math:** Astronomy, Biology, Chemistry, Geology, Science, Geography, Environmental Studies, Wildlife and Fisheries Science, Exercise Science (borderline), plus any engineering or math minor not in A.
- **Everything else** (Fine Arts, Business other than BITA, Education, humanities and social sciences, Emerging and Integrative Studies): tier 1 if structured, otherwise tier 3.
Tier 1 (structured rules) is generated for **all** minors regardless of wave, since it costs nothing per minor; the waves only order the hand-written work. Empty-rule minors (Mathematics Minor) are tier 2 from the catalog page.

**D8. The catalog year of an added program is the year it is added.**
`planForYear` already resolves a plan not newer than a year; the added program uses the entry term of the declaration (default: the current term, editable), stored on
`student_programs`. `covers_earlier` plans work as today. The primary's `catalog_year` is never touched (a stored invariant: slot ids belong to exactly one set per program).

**D9. Where the student does it, and what it does not do.**
Not in onboarding (it asks one thing at a time and most students add a program later). The entry points are **Settings → "Add a second major or a minor"** and a link in the plan
header, using `ProgramPicker` filtered by role (the major picker offers majors with plans; the minor picker offers minors). "Change degree program" keeps replacing the **primary**
only and must no longer wipe an added program's rows. Removing an added program removes its rows and leaves shared cards. Terminology (revised 2026-10-13): "primary major", "secondary major" and "minor" name the roles; "degree program" is no longer used in a screen.

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

## Findings (Phase 0, 2026-10-13)

Method: `lib/programMerge.js` merged the 2026-27 Flight Foundations plan of **CSC Core** (44 slots, 120 hours) with **Mathematics B.S.** (42 slots, College of Arts and Sciences), **Business Analytics B.S.B.A.**
(`bai_bsba`, 41 slots, Business) and **Mechanical Engineering** (47 slots, 128 hours, History-exempt), each as a second major. Each pair went through `buildDegreePlan` (ACT Math 29, Fall start), `buildDegreeAudit`,
`projectDegree` (which runs `scheduleTerms`) and `computePlanCredits`, once as the plain concatenation of the two slot lists ("naive") and once merged. The checked cases are in `src/tests/programMerge.test.js`.

The seven breakages predicted in "What a merged list breaks", each with what the real data does:

1. **Duplicate cards: confirmed.** The concatenation holds 12 (Math), 5 (Business) and 10 (ME) fixed courses twice (`ENGL1010`, `ENGL1020`, `HIST2010`, `HIST2020`, `MATH1910`, the math chain ...). The naive plan runs
   15, 14 and 15 semesters; merged, 10, 12 and 13. `degreeBuilder`'s `codeToSlotId` is keyed by `class_code`, so with a duplicate the later slot silently replaces the earlier one in prerequisite propagation (read from the code).
   Merging fixes it: no fixed course is left twice (tested for all three pairs).
2. **Duplicate general education: confirmed, and it is not symmetrical.** The naive General education block holds 25, 26 and 24 rows; merged, 14, 18 and 17. The added program is not always a subset of the primary: Math B.S.
   and ME carry `ENG_LIT` and `FF_LITERACY` that CSC Core does not (31 of the 2026-27 plans carry `ENG_LIT`; the line in `docs/claude/CLAUDE.md` that it "exists only in legacy plans" holds for the CSC plans only), and the Business plans
   carry `FF_FLEX`. D4 is revised above: pair off by category, keep the surplus.
3. **Free Elective hours: confirmed, and this is the finding with a cost.** CSC Core has only **5** open Free Elective hours, so a second major absorbs 5 and the plan grows by the rest: the added programs' own hours are
   54, 86 and 103, so the merged totals are **169, 201 and 218 hours** against 120. A student will read that as 3 to 6 extra semesters, which is why the what-if and its delay warning (Phase 7) matter. Two things push
   the figures up and are not modelled yet, both for the owner: (a) a course fills **one** slot (`getTakenCodes` removes a picked course from every other pool), so a course that both programs' pools list counts for one
   pool only; (b) the added program's pools are never collapsed with the primary's. The totals are therefore an upper bound under the "a course counts toward every requirement it satisfies" assumption (D2); Phase 2 decides
   whether a pick may count for two pools.
4. **Math placement chain and Calculus II floors: partly confirmed.** `planHasMathChain` and the chain archive work on the merged list as is (Math pair: 6 slots archived, as for CSC alone; the naive list archives 12). But
   `planRequiresCalculusII(merged)` is true for Math and ME, so `placeDegreePlan` applies the **map floor to every slot, the primary's too**. And the two departments' maps both claim semesters 1 to 8: laid on one grid they
   load 15 to 31 hours a semester, `mapPathHolds` rejects them (more than 21), and the placement algorithm takes over. The effect: **11, 33 and 28 of the primary's own courses move later** than in the primary's plan
   alone. Phase 2 must therefore place only the *added* slots and leave the saved positions alone (it is already in its text); floors should come from each slot's own program, not from the merged list.
5. **`homeOf` and the plan's own subject: confirmed.** `ownSubject(merged)` is the primary's (`CSC`). The added major's own courses that also carry a gen-ed category land in the General education block:
   `MATH1910` for Math B.S., `DS2810` for Business Analytics. Phase 4 gives `homeOf` the subject of the program a slot belongs to (`programsOf`).
6. **Prior credit archives one slot per credit: confirmed.** An AP credit for `MATH1910` archives one of the two cards in the concatenation and leaves the other on the grid. Merged, it archives the visible card and
   `expandToShadows` gives the hidden row the same state, so both stored rows agree (tested with `ENGL1010` for all three pairs). A credit for a course that only the added program names archives its (visible) card as today.
7. **One program named in the header, PDF and audit: by inspection** (the audit takes one `majorLabel`, the Degree Map and audit PDFs one program); Phases 3 and 4.

Also found: with the naive list and a total of 120 the audit's planned hours (141, 147) exceed `totalHours`, so `remaining` reads 0 and the progress bar clamps; a merged list must carry the merged `totalHours` (it does:
`audit.summary.total` equals it, tested). `computePlanCredits` already counts a course once, so the merged and naive credit totals are equal (tested): hours cannot inflate, which is what the "Risks" entry feared.

Decisions after Phase 0: **D3 stands** (collapse fixed courses, never pools; the other row stays as a shadow). **D4 revised** (pair by category, keep the surplus, drop only across gen-ed programs). **D5 stands with
the total made `max(primary + extra, each added major's total)`.** `mergePrograms(primary, added, options)` takes `{ programId, slots, totalHours }` objects rather than bare slot arrays, so a slot's program and an
added major's total travel with it.

## Phases

Every phase: branch off `main` with `start_branch.sh`, `npm run verify` green, one PR, docs updated in the same PR (`REFERENCE.md`, this plan's status line, the platform-parity
registry if a branch on platform is added). `DegreePlan.jsx` is touched by Phases 2, 3 and 6: **those three merge back to back, each rebased onto the last**, never in parallel.

### Phase 0 — Spike and decisions (**done 2026-10-13**; see Findings; no user-visible change; 1 PR, mostly tests and a findings section)
- Write `lib/programMerge.js` as a **pure module with tests only** (nothing imports it yet): `mergePrograms(primarySlots, addedSets[], { overlapPolicy })`.
- With `tests/support/realStudent.js` (real catalog), merge CSC Core with Mathematics B.S., and with a second program from another college; run the merged list through
  `buildDegreePlan`, `scheduleTerms`, `buildDegreeAudit` and `computePlanCredits`. **List every failure from "What a merged list breaks" with a real example** and write them into a
  "Findings" section here. Decide D3/D4/D5 against the findings; change this plan where the code disagrees (the code wins).
- Done when: the findings are in this doc, the merge module has tests for collapse, gen-ed dedupe, Free Elective absorption, and prior-credit archival across shadows.

### Phase 1 — Data model and storage (**done 2026-10-13**; Frontend + Deploy baseline; no UI)
Built as written, with one change: the backup writes format 2 **only when the plan has an added program** (format 1 otherwise), so a file from a plan that has none still opens on an install that has not been updated.
The Docker SQL was written and reviewed against the neighbouring tables but **not executed** (no Postgres available in the session): the Deploy repo's first start after this change is its test.
- `student_programs` in `000_baseline.sql` and `STUDENT_TABLES` (+ `localClient.test.js`); the `concentrations` to-one embed for the new table.
- Backup format 2 (reads 1 and 2), `remoteBackup.js`, and the "drop rows that point at a program or slot the catalog no longer has" rule for added programs. Tests in `backup.test.js` / `remoteBackup.test.js`.
- A loader `lib/studentPrograms.js` returning `[primary, ...added]` with each program's resolved plan year; tolerant of the table's absence (an install whose setup step has not re-run), like `fetchFreeAddSlots`.
- Done when: a profile with no added programs behaves byte-for-byte as today (the whole suite unchanged) and a backup round-trips with added programs.

### Phase 2 — Double major in the plan (**done 2026-10-13**, with the changes noted; the core; `DegreePlan.jsx`)
Built: the loader reads every program (`studentPrograms`, `programSlots`), merges (`programMerge`), runs the existing pipeline on the merged list, places only the new slots around the saved ones (`placeAdded`), and the header
and audit carry the merged name and hours; Settings has "Second major" (add: program, declared term, overlap note; remove with a confirmation); "Change degree program" keeps added programs; the undo stack is scoped to the set.
**Changes from the text below, from what the code said:** (1) shadow rows are **derived, not stored**: nothing needs them (a hidden slot has no state of its own, and reloading places whatever becomes visible), and
not writing them removes a class of drift; (2) a pool that another program's course already satisfies is absorbed (`reason: 'satisfied'`; found in the browser: Mathematics B.S. asked "CSC 1300 or ENGR 1120" with CSC 1300 already on
the plan); (3) semester notes stay filed under the primary program (nothing to move); (4) the added program's slots are placed by `placeAdded`, not by `buildDegreePlan` alone, which would have moved the primary's courses.
**Checked in the browser** (dev server, local backend): CSC Core with Mathematics B.S. (169 hours, 10 semesters) and with Mechanical Engineering through the dialog (218 hours, 13 semesters): the 44 saved primary rows did not
move, the only issues are unfilled choices, removing the program restores the 44 rows exactly. There is no automated test of `DegreePlan.jsx`'s load itself (the repo has none for that component); the pieces it calls are tested.
**Open:** whether a pick may count toward two programs' pools (Findings, 3). (Math B.S. lists "CSC 1300 or ENGR 1120" twice because the department's map prints a 4-hour course as two 2-hour rows; fixed afterwards: a course covers pool rows up to its own hours, so CSC 1300 satisfies both.)
- Load every program's slots, merge them (D3–D5), run the existing pipeline on the merged list, and tag each card with the programs it serves. Shadow rows are written on add and hidden on the grid.
- Add flow in Settings (majors only): choose the program, entry term, confirm the overlap note; build placements with `buildDegreePlan` for the *added* slots only, leaving saved positions alone.
- Remove flow; "Change degree program" no longer clears an added program; undo scope (D10); semester notes move from per-program to per-student for display (keep the column).
- Math placement chain and engineering floors run once for the merged plan.
- Done when, for CSC Core + a second major: no duplicate cards, hours are the union, every requirement of both plans is satisfied exactly when its courses are in the plan, a prior credit covering a shared course archives both slots, drag/move/undo/reset behave, and a reload restores it all.

### Phase 3 — Plan UI and platforms (**mostly done 2026-10-13**: tags, filter, header; the parity step waits for the flag; the add and remove dialogs and the Settings card were built in Phase 2)
Built: a tag on each course for the programs it serves, an All / program filter that dims (never hides) the rest, and "(98 more than CSC Core alone)" in the plan header. Checked in the browser at desktop and phone width (CSC Core + Mechanical Engineering: 70 rows tagged, 8 shared, 29 dimmed under MNE). **Not done:** the parity journey step (`parity/lib/scenario.mjs`) cannot add a second major through the UI while `FEATURES.additionalPrograms` is closed, so it is written when the flag opens (Phase 8); no platform-specific wording was added, so nothing needed registering in `platform-branches.json`. The plan-header entry point was left out: the Settings card is the one entry point until the flag opens.
- Program tags on cards and a filter ("All / CSC / Math"); header shows "CSC Core + Mathematics (second major)" and the extra hours; phone layout; empty and error states.
- The Settings and plan-header entry points; remove-program confirmation.
- A parity journey step (`parity/lib/scenario.mjs`) that adds a second major and checks it on all three platforms; register any platform wording in `lib/platform.js`.
- Done when: the three platforms render the same plan for the same add, and `terminology.test.js` passes.

### Phase 4 — Audit and PDFs (**done 2026-10-13**; behind `FEATURES.requirements`)
Built as written: one block per program (`major`, `major:<id>`), general education and electives once, `Counted from <program>` references, a per-program `ownSubject`, and the Degree Map and audit PDF headings name every program (the Degree Map prints the merged hours). Checked in the browser with the flag opened locally (CSC Core 18 rows; Mechanical Engineering 23 rows plus 4 references; general education 17; electives 12) and reverted. The audit PDF itself was not rendered in the pane: its model is tested to carry the screen's blocks, groups, rows and references.
- `buildDegreeAudit` takes the merged list plus `programsOf`: **one block per program** (major, second major, each minor), with general education once, electives once, and `refs` ("counted from CSC") for shared courses. `homeOf` gets the subject per program.
- Degree Map header names every program; the Degree Audit PDF prints a block per program. The audit remains "Coming soon" until the owner opens it.
- Done when: the screen and the PDF still agree row for row (the existing parity tests) with two programs.

### Phase 5 — Minor data (**done 2026-10-13**; Prototype repo; independent of Phases 1–4)
Tier counts as built: 13 structured, 16 written from the catalog text (waves A and B, each with `assumptions` and department questions in `minors-questions.md`), 53 not modelled (a plan row, no slots). A structured rule that omits a condition the catalog text states is tier 3 with that reason. The French Minor is on the catalog page but Inactive in Coursedog (`notInSnapshot`). **Phase 6 note:** a tier 3 minor has no slots, so the picker must treat "no slots" as counter-only.

- Extend `catalog_scrape/scrape_programs.mjs` to keep each minor's `requisites` (today `withoutMaps` keeps only id, name, type, college).
- A spec generator for `kind: 'minor'`: tier 1 automatic (D7), tier 2 hand-written specs with `assumptions`, tier 3 manifest entries marked "not modelled". New slot kinds for "M hours from a list" and "X upper-division hours" (rule pools), validated by `degree-specs/build.mjs`.
- `npm run build:catalog` carries minors as `concentrations` rows with `kind: 'minor'` and a plan per catalog year; `programBrowser` offers them only to the minor picker; the manifest's `excluded` flag for minors is removed. Run `regen.sh`, commit Prototype first.
- Done when: every minor in the snapshot is in exactly one tier with a reason, tier 1 and 2 build with no validator errors, and a question sheet for the departments of tier 2 minors is generated.

### Phase 6 — Minors in the app (**done 2026-10-13**, with the changes noted; `DegreePlan.jsx`)
Built: the "Minors" row in Settings and an "Add a minor" dialog (every minor open to the declared term, tier 3 labelled with the catalog's wording once chosen), "M hours from a list" buckets that behave like Free Electives
(`BUCKET_POOLS`), other programs' courses counting toward a bucket's hours (D2), the transcript-limit notice at the third minor, removal that also removes the bucket's follow-up picks, and the flag renamed `FEATURES.additionalPrograms`
(it covers minors too).
**Changes and findings:** (1) **a tier 3 minor adds no hours and no slots** (the plan's "15-hour counter" is not built): it is listed with a note and nothing is checked against it, so the hours of a minor the planner cannot see are not
promised; (2) found in the browser: the math placement archived the Mathematics Minor's **MATH 1920** as "not applicable" on the new curriculum, so a requirement vanished; fixed in `degreeBuilder` (`addedSlotIds`); (3) not built: the
Art/Music individual-instruction cap (no tier 1 or 2 spec states it); (4) saving ACT scores re-placed the primary program only (`lib/actScores.js` read the primary's slots), leaving an added program where it was: **fixed afterwards**, the rebuild now reads every program, merges them and re-places the plan as one (`actScoresPrograms.test.js`).
Checked in the browser (flag opened locally, reverted): CSC Core + Mathematics Minor (125 hours, MATH 1910 and 2010 shared, the 6 upper-division hours as a bucket filled in two picks, nothing left), removal restoring exactly 44 rows and 0
added courses; an unmodelled minor (Aquatics) adds nothing and shows a note.

### Phase 7 — What-if, "closest minor", and the delay warning (**done 2026-10-13**; needed Phases 2 and 5, builds on 6)
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

**Built:** `lib/whatIf.js` (`evaluateAddition`, `describeDelay`, `rankMinors`), `lib/whatIfLoader.js`, the "What if I added..." card in Settings (a second major or a minor, then the effect; "Which minor am I closest to completing?" shows the top five), and the same sentence in the add dialog before the student confirms. Closed with the rest by `FEATURES.additionalPrograms`.
**Checked:** a what-if writes nothing (the row counts are identical before and after, in the browser; the library is pure and tested against frozen-equal JSON); its figures equal what really adding the program gave (Computer Science Core + Mechanical Engineering: 98 more hours, Fall 2032, 13 terms, in the what-if and in the plan view); the ranking puts the Computer Science Minor first ("your plan already covers it") and Mathematics (10 hours) above Physics (15), is stable, and takes about a second for all the modelled minors on the local backend. The Docker backend makes one request set per candidate: not timed there.
**Assumptions as built (Questions 9 and 10):** "past four years" is eight Fall/Spring terms from the student's first term (a Summer start counts from the Fall after it); "closest" ranks by hours still needed, not by added semesters. Both are one line each to change.

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
7. ~~Which minors first?~~ **Answered 2026-10-13:** minors related to the open majors, then all sciences, engineering and math (waves A and B in D7). Still to confirm: the borderline minors named there.
8. Is the "at most two minors on the transcript" limit a **block or a notice**? (we assume a notice)
9. What does "past four years" mean: **eight Fall/Spring terms from the start term** (assumed), or four calendar years, counting summers? For a student who started with transfer or AP credit, should it be measured from the start term or from a nominal "four years from now"?
10. Should "closest minor" rank by **hours still needed** (assumed), or by **added semesters**? (They differ when Free Elective hours absorb the cost.)

## Risks

- **Double counting inflates progress.** The audit's one-home rule exists to prevent this; the merge engine must never count a shared course twice in the hours (Phase 0's test) or let a shadow slot read as a separate requirement.
- **Stored data.** An added program must never move the primary's slot ids or catalog year, and Reset / Erase / Import must handle added rows (Phase 1 tests).
- **Free text minors.** A hand-written spec from a paragraph can be wrong; each carries an `assumptions` entry, shows "from the catalog text", and goes on a department question sheet.
- **`DegreePlan.jsx` conflicts** (about 1,960 lines, three phases): back-to-back merges, as the working agreements say.
- **Scope creep** into a second degree, certificates, or the what-if view: out of scope; the merge engine is built so the what-if view can reuse it.
