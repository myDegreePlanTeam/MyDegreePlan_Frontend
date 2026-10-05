# Plan: degree-map pipeline, 2026-27 maps, full Coursedog catalog

> Status (2026-10-05): decisions locked; P0 to P5 are done and released as v0.2.0 (2026-10-02). The per-phase results log (size measurements, the map
> audit, the extractor design, test counts, about 340 lines) was removed on 2026-10-05; git history has it. The open department questions below stay.
> Inputs: `RE__Request_for_Updated_CSC_AI_Degree_Plans.zip` (CS, Cyber, HPC, AI 2026-2027 Degree Map .docx).

## Goal

A repeatable way to turn a department's degree map into a program in the app, that works for the four
2026-27 CSC-department maps now and for new majors, departments and catalog years later (the long-term
vision is all 178 TTU bachelor's programs; see ROADMAP "Beyond CSC"). Plus: replace the 166-course
`prototype.json` with the full Coursedog catalog.

## Decisions (locked)

| Question | Decision |
|---|---|
| Map vs builder | **Map-first hybrid.** Store the department's semester per slot (`map_semester`). A standard student starts from the department path; `degreeBuilder` repairs it for prior credit, ACT placement, standing, offering terms. A conformance test diffs builder output (reference student) against the map. |
| Program model | **Extend `concentrations`** with `kind` (major / concentration), `degree`, `major_name`, `department`, `supersedes`. No rename, no data migration. UI says "program". AI = new row `ai`, `supersedes = dsai`; DSAI stays frozen for pre-Fall 2026 students. |
| Catalog payload | **Measure, then chunk.** Eager core (courses referenced by templates, pools, equivalencies) + lazy full catalog and descriptions. Spike measures gzip first. |
| Catalog year | **Add `catalog_year`** on `requirement_slots` and `student_profiles`, stored at onboarding from entry term (never derived). `gened_program` stays as a rules attribute of a template version. |

## Findings that shaped the plan

- The maps are Flight Foundations (HIST 2010/2020 fixed, Social/Humanities, science sequence), 120 hrs each, with
  printed per-semester totals usable as checksums.
- Word-extraction traps: footnote digits glued onto text ("CSC 25704" = CSC 2570 + note 4); HPC "Science Sequence3"
  is a note typo; AI "Natural Science" option list is ambiguous; AI "Elective3" and "Upper Division Elective" do not
  name a department.
- Differences from current templates: CSC 4620 (3 hr) replaces CSC 4615 (2 hr) in Core; MATH 3070 or 3470 is a required
  either/or in all four; new "CSC Elective (2000+)" pool; Cyber and HPC require many more fixed courses; fall-only /
  spring-only / spring-even-year offerings appear (relates to `semesterRestrictions.js`, see `REFERENCE.md`).
- AI needs `AI3000`, `AI3100`, `AI3200`, `AI4200`: absent from `prototype.json`, present in `catalog_raw.json`.
- `catalog_raw.json`: 7,444 records, 1,255 Inactive, 33 duplicate codes, 267 subjects. Prerequisites: 4,928 none,
  ~278 structured, 2,125 narrative text only. ~540 KB without descriptions, ~2.1 MB with, vs 153 KB for today's
  `catalog.json`.

## Architecture

**A. Catalog layer** (independent; ships first)
`scrape -> normalize -> parse prerequisites -> overrides -> emit`.
- Normalize: dedupe by Active + latest `effectiveStartDate`, credit ranges, undergrad/grad tag.
- Prerequisite parser: deterministic; grades each course `exact | partial | unparsed`. Unparsed shows raw text and
  never warns (same stance as placement/consent gates). Minimum-grade phrases ("C or better") are noted, not modeled.
- Parity oracle: parsing the 166 hand-curated courses must reproduce their curated prerequisites; those curated rows
  become the first manual override entries.
- Payload: eager core + lazy chunks. Main code risk: `localClient` must hydrate `courses` asynchronously.

**B. Program spec layer** (Prototype repo, `degree-specs/<dept>/<program>/<catalogYear>`)
Source of truth. Holds: source file (name, hash, sender, date), slot list with explicit stable `key`s, inline pools
(e.g. MATH 3070 or MATH 3470), department `map`, offering terms, conditional slots (transfer students skip CSC 1020),
resolved footnotes. `key` plus a `replaces` hint fixes `planSlotSync`'s class_code + nth-occurrence fragility, so a
correction like 4615 -> 4620 does not silently delete a student's pick.

**C. Data model**
`concentrations` gains the new columns; `requirement_slots` gains `catalog_year`, `slot_key`, `map_semester`;
`student_profiles` gains `catalog_year`. Edit `local-deploy/setup/sql/000_baseline.sql` (idempotent) and the
`STUDENT_TABLES` defaults in `localClient.js`, with a test in `localClient.test.js`. No migration file.
`requirementSlots.js` filters by (concentration, catalog_year) with a nearest-earlier-year fallback.

**D. Pools as data**
Rules plus explicit include/exclude in the spec, resolved against the live catalog at build time into a reviewable
membership list. `poolResolver.js` keeps the code lists as fallback until a parity test proves generated == current.

**E. Validators** (`degrees:check`, hard gate)
Hours == total; every code exists, Active, credits match catalog; per-semester sums == printed Word totals;
department path respects prerequisites and offering terms; Flight Foundations minimums; builder run across ACT scores
(`mapConformance.test.js` and `allMapsConformance.test.js` do this today); no duplicate course; `degrees:diff` year-over-year changelog.

## Runbook: adding a map, major or year

The live runbook is `MyDegreePlan_Prototype/degree-specs/README.md` ("From Coursedog's degree maps", "Adding a new catalog year for an existing
program", "Adding a program"); `REFERENCE.md` ("Degree plan pipeline") summarizes it. The commands that exist: `npm run degrees:survey` (the
Coursedog inventory), `degrees:extract` / `degrees:extract:check` (a draft spec and a review report from a department map), `degrees:promote`
(draft to spec), `node degree-specs/build.mjs [--check]` (validate and generate `degree_plans.json`), then `bash local-deploy/tools/regen.sh`
and a signed release. The plan named some of these `degrees:check`, `degrees:new-year` and `degrees:diff` (see Architecture E); those scripts
were never written, and a new catalog year is a copy of the previous spec by hand.

## Phases / branches

- **P0 spike (no merge):** gzip size measurement; map-vs-template diff; confirm Coursedog has the AI program record.
- **P1 `feat/full-catalog`:** normalizer, prerequisite parser, overrides, chunking, parity tests. Shippable alone.
- **P2 `feat/degree-spec-pipeline`:** spec format, generator, schema columns, `catalog_year` filtering, program-aware onboarding.
- **P3 `feat/degree-docx-extractor`:** extractor + validators (done 2026-10-01).
- **P4 `feat/degree-maps-2026-27`:** four specs, pools as data, map-first placement, conformance test (done 2026-10-01).
- **P5:** release, runbook, update both CLAUDE.md copies (canonical: this repo's `docs/claude/CLAUDE.md`).

## Open questions for the department

- AI "Natural Science": which exact course combinations? (the list reads "BIOL 1113 OR BIOL 1113, BIOL 1123 OR BIOL 2310")
- AI "Elective3 (2000-level or higher)" and "Upper Division Elective": which department(s)?
- HPC: confirm "Science Sequence3" is a typo for note 2.
- Does AI satisfy Financial/Digital Literacy through CSC 2220 (the AI map has no note)?
- Core: confirm CSC 4620 replaces CSC 4615 for all 2026-27 entrants.
- All four maps: PHYS 2110 and PHYS 2120 are 5 hours each in the catalog, but the maps count every science course at 4. Is
  the calculus-based physics sequence allowed (a student who takes it reaches 122 hours), and if so does the department
  want 2 fewer elective hours for those students? (found by the 2026-10-01 recount of the four maps)
- Elective rows: the maps list a plain "Elective" in several semesters (CS 5 hrs, Cyber 2, HPC 2, AI 11). Is each a free
  elective, and may the hours be split across any courses (the planner models them as one hours bucket per plan)?
