# Integration test: College of Engineering (ME x4, NE), 2026-2027

Branch `test/mne-degree-maps` in `MyDegreePlan_Prototype` and `MyDegreePlan_Frontend`. Question tested: can the app take a major
that is not Computer Science, from a department's own degree map, with no hand-built data? Five PDFs from
tntech.edu/engineering: Mechanical Engineering (base, Aerospace, Mechatronics & Robotics, Vehicle Engineering) and Nuclear
Engineering. Each is 128 hours.

## Verdict

**Mostly yes, and the gaps were specific.** The program picker, grouping, catalog build, slot sync, prerequisite checking and plan
grid took five new programs with no change. Five things did not generalize and were fixed on this branch; two catalog facts make the
planner discard the department's own path and are **proposed, not applied** (they change CSC data; see below).

## What worked unchanged

- Onboarding and Settings list programs from the database, grouped under their major (B.S. Mechanical Engineering, with its three
  concentrations; B.S. Nuclear Engineering). No frontend edit.
- Slot ids, `planSlotSync`, catalog build, local backend: 594 slots, 0 removed.
- Every course the maps name exists in the full Coursedog catalog; the prerequisite-order check ran against real prerequisites.
- Flight Foundations categories, pools as data, map-first placement.

## What did not generalize (fixed on the branch)

| Gap | Effect before the fix | Fix |
|---|---|---|
| Extractor reads Word only | The department sent PDFs | `pdfRead.mjs` (dependency-free PDF text + table rules) and `ttuMapPdfAdapter.mjs` (rows are the spaces between border rules, so wrapped labels and centred hours land in one row). All 40 semesters across the five maps match their printed totals. |
| Math curriculum chosen by *student type*, not by program | `MATH1920` archived as "not applicable" for every engineering student: semester 2 showed 14 hours, Calculus II missing from the plan | `mathCurriculumFor(slots, studentType)`: a plan whose map names MATH1920 follows the returning curriculum. The Prototype's `mathCurriculumOf` reads the same evidence. |
| Placement chain promotion added the top track's own courses | Nuclear Engineering got a MATH 2010 slot its map does not have (+3 hours) | Promotion adds only courses below the top track; `trackHours` counts only top-track courses the plan carries. |
| Open pools only worked for the name `FREE_ELECTIVE` | Nuclear Engineering's six "Area of Emphasis" slots offered no courses | `resolvePool` and `SlotModal` treat any `open` pool as the open search. |
| Findings the department must answer were hard errors | A map that departs from a rule (the HIST pair, 4-hour PHYS) could not be promoted | `course-hours`, `prereq-order`, `coreq-order`, `gened-*` are questions; a decision may carry a `waiver` that promotion writes into the spec with the answer as its reason. |
| Grammar | "ENGL 2130, 2235, or 2330" read as one course; the same either/or on two rows read as a duplicate; "A and B or C" read as plain alternatives | comma lists; same-set rows are one pool used twice; `alternatives-and` question |

Smaller: program matching no longer lets a short code ("me") match inside a longer word; `BSME`/`BSNE` read as B.S.; "2026-27" reads
as 2026-2027; "Elective 1/2" are ordinals, not footnotes.

## Proposed catalog fix (not applied: it touches CSC)

Held in `git stash` in `MyDegreePlan_Prototype` (message "PROPOSED catalog fix") and reproduced here. Apply with `git stash pop`,
then regenerate (`node catalog/build_courses.mjs`, the specs, `npm run build:catalog`).

1. **PHYS 2110 needs MATH 1920 finished first** (curated override), but every engineering map puts both in semester 2. The map-first
   path therefore fails its own prerequisite check and the builder falls back to its algorithm.
2. **PHYS 2110 / 2120 are stored as 5 hours**; the PHYS 2120 description says TTU offers it at 4 (5 is the ETSU joint program), the
   maps count 4, and `flightFoundations.js` already defaults them to 4. Stored as 5, every plan totals 130, and Mechatronics semester 2
   is 19 hours (over the builder's 18 cap, which also rejects the path).
3. **PHYS 2120's curated rule reads PHYS 2110 *and* (PHYS 2109 *or* 2111)**, which a student on the PHYS 2110 sequence cannot meet. It
   shows as "needs PHYS2109 or PHYS2111" on the planner. Probably intended as PHYS 2110 or 2111.

```
PHYS2110  prerequisites [MATH1920]  corequisites [MATH1920]  credits 4   (same pattern as PHYS2109 and ME4810/ME3050)
PHYS2120  prerequisites [[PHYS2110, PHYS2111]]               credits 4
fixtures/curated_requisites.json: PHYS2110 corequisites and PHYS2120 prerequisites updated to match
```

**Measured in the app, ME Aerospace, Fall 2026 start, ACT 30, no prior credit:**

| | Without the fix (as committed) | With the fix |
|---|---|---|
| Plan | "Degree Plan", Fall 2026 to Fall 2030, 9 semesters | "Four-Year Plan", Fall 2026 to Spring 2030, 8 semesters, 128 hours |
| Shape | ME 1010 in semester 2; Senior Design I and II both Spring 2028; Calculus II not until Fall 2028 | exactly the department map, semester totals 17/17/17/17/15/15/15/15 |
| Warnings | PHYS 2120 prerequisite, plus 12 unfilled pools | the 12 unfilled pools only |

`src/tests/engineeringMaps.test.js` has a block that **switches itself on** when the catalog carries the fix (25 tests then pass;
today 10 are skipped).

**Cascade to decide on:** CSC's SCIENCE pool offers the same PHYS courses, so a CSC student who picks them sees 4 hours instead of 5.
13 Prototype tests encode today's PHYS 5-versus-4 CSC findings (the CSC reviews list them as questions) and would need updating, and
the CSC drafts and AI spec assumptions regenerate. Nothing else in CSC changes.

## Questions for the department (recorded as assumptions in `sources/mne/2026-2027/manifest.json`)

- **Historical Foundations.** Flight Foundations requires HIST 2010 + 2020 (6 hours). None of the five maps lists them. Read as the
  college's own arrangement; the plans carry no history. If wrong, the plans are 134 hours.
- **Literature row.** ENGL 2130/2235/2330 (a legacy `ENG_LIT` pool) beside one Humanities elective. Read as two Humanities choices.
- **Elective lists.** The maps and the department page publish none: `ME_ELECTIVE` ("AOE Elective", Aerospace "Mechanical Engineering
  Elective") is any 4000-level ME course of 3+ hours except senior design and research; Nuclear Engineering's six "Area of Emphasis"
  courses are an open choice. Needs the real lists.
- **Literacy row** "(FIN 2000, CSC2220, or CSC 2570)": read as the Flight Foundations literacy list, the parenthesis as examples.
- **Mechatronics "Controls - ECE 3260 and ECE 3210 or ME 4810" (3 hours):** ECE 3260 is 1 hour. Read as ECE 3210 or ME 4810.
- **ME 4140 Robotics** needs ECE 3260 in the catalog, but the map offers ECE 3260 only in the semester after it.
- Earlier catalog years: only 2026-2027 maps exist, so no engineering program is offered to a student who entered before Fall 2026.

## Noticed in the app, not changed

- Onboarding step 4 ("Your Math Sequence") always appends the CSC statistics fork (MATH 3070/3470) and, for Nuclear Engineering,
  lists MATH 2010 (not on its map); it omits MATH 2110/2120.
- Wording such as "Choose your concentration" is generic, but Mechanical Engineering's base program is a *major*, not a concentration.
- `semesterRestrictions.js` lists term rules only for CSC and AI courses. The engineering PDFs print no offering terms, so nothing is checked for them; a course that is genuinely fall-only in engineering would not be enforced until its term is recorded.

## Not tested

The Docker/Postgres path (`seed.js` with the new programs and pools), PDF export, Settings "change program", transfer-credit
wizard against engineering plans, and the in-app UI for programs other than ME Aerospace and Nuclear Engineering (the builder is
covered for all five by tests).
