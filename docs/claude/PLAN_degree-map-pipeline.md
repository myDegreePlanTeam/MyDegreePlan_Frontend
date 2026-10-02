# Plan: degree-map pipeline, 2026-27 maps, full Coursedog catalog

> Status (2026-10-01): decisions locked; P0, P1 and P2 are built (unpushed, branch `feat/degree-spec-pipeline`); P0-P5 are done: released as v0.2.0 on 2026-10-02.
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
  spring-only / spring-even-year offerings appear (relates to `BRANCH_semester-terms.md`).
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
(ROADMAP "template import check"); no duplicate course; `degrees:diff` year-over-year changelog.

## Runbook: adding a map, major or year

1. Drop file in `degree-specs/_inbox`.
2. Adapter extracts a draft spec + warnings report (the Word adapter is one adapter; PDFs etc. get their own, the spec is the contract).
3. Department confirms ambiguities.
4. `degrees:check` passes.
5. Generate slots, `catalog.json`, Docker seed, PDF export.
6. Conformance diff vs the map.
7. Merge, then signed release with student-facing notes.
New year: `degrees:new-year` copies the previous spec as a draft.

## Phases / branches

- **P0 spike (no merge):** gzip size measurement; map-vs-template diff; confirm Coursedog has the AI program record.
- **P1 `feat/full-catalog`:** normalizer, prerequisite parser, overrides, chunking, parity tests. Shippable alone.
- **P2 `feat/degree-spec-pipeline`:** spec format, generator, schema columns, `catalog_year` filtering, program-aware onboarding.
- **P3 `feat/degree-docx-extractor`:** extractor + validators (done 2026-10-01, see P3 results).
- **P4 `feat/degree-maps-2026-27`:** four specs, pools as data, map-first placement, conformance test (done 2026-10-01, see P4 results).
- **P5:** release, runbook, update both CLAUDE.md copies (canonical: this repo's `docs/claude/CLAUDE.md`).

## Open questions for the department

- AI "Natural Science": which exact course combinations? (the list reads "BIOL 1113 OR BIOL 1113, BIOL 1123 OR BIOL 2310")
- AI "Elective3 (2000-level or higher)" and "Upper Division Elective": which department(s)?
- HPC: confirm "Science Sequence3" is a typo for note 2.
- Does AI satisfy Financial/Digital Literacy through CSC 2220 (the AI map has no note)?
- Core: confirm CSC 4620 replaces CSC 4615 for all 2026-27 entrants.
- All four maps: PHYS 2110 and PHYS 2120 are 5 hours each in the catalog, but the maps count every science course at 4. Is
  the calculus-based physics sequence allowed (a student who takes it reaches 122 hours), and if so does the department
  want 2 fewer elective hours for those students? (found by the 2026-10-01 recount below)
- Elective rows: the maps list a plain "Elective" in several semesters (CS 5 hrs, Cyber 2, HPC 2, AI 11). Is each a free
  elective, and may the hours be split across any courses (the planner models them as one hours bucket per plan)?

---

## P0 results (2026-10-01; analysis only, scripts live in the session scratchpad, nothing merged)

**1. Catalog payload: smaller than feared.** Active, deduped catalog = 6,182 courses.

| Variant | Raw | gzip |
|---|---|---|
| slim + prerequisite text, no descriptions | 466 KB | **79 KB** |
| + descriptions | 1.77 MB | 338 KB |
| today's `catalog.json` | 149 KB | 21 KB |

Plan adjustment: ship slim + prerequisite text eagerly; lazy-load descriptions. Grad-level (5000+) is ~2,100 courses and can
be a lazy chunk too. Dedupe rule: drop Inactive and names containing "DUP"/"DUPLICATE" (33 duplicate codes).

**2. Credits need a rule.** Coursedog encodes `creditHours` as `{min, max, operator}`. `min: 0, max: 4, operator: OR` means a
fixed 4 hours (CSC1300). **Rule: credits = `max` if present, else `min`**: matches all 166 curated values (0 mismatches).
~549 courses are true ranges (`min>0, max>min`, operator TO: topics, research) and 61 are zero-credit; `courses.credits` is a single
integer, so P1 must decide how a range is stored (store `max`, keep the range as metadata).

**3. Prerequisites live in three places** (corrects the earlier "4,928 have none" figure):
- `requisites` narrative/structured: 1,879 courses
- a leading "Prerequisite:" sentence in the description: 2,207 courses (1,784 with no `requisites` entry at all)
- "may be taken concurrently" / "(can be taken concurrently)" phrasing, i.e. corequisites, inside those same sentences
- 3,663 courses have a statement; 2,519 have none. About 46% of statements involve ACT/SAT, placement, consent or standing
  language (hand-off to `classifyPrereq`, never a hard warning); ~340 carry a minimum grade (noted, not modeled).
- The curated `prototype.json` descriptions were stripped of these sentences (`strip_descriptions.js`, BUG-32) while keeping ACT
  and consent sentences, so the normalizer must do the same.
- **Parity oracle is ~86%, not 100%:** 62 of 72 curated-prerequisite courses have every curated code in Coursedog's text. The 10 that
  differ are curated judgment (e.g. MATH3070 curated as MATH1910 where Coursedog says ACT 19 or MATH1130/1710; PHYS2020, MATH2610 have no
  Coursedog statement). They are the seed of the override layer, not parser bugs.

**4. Coursedog's own AI degree map is stale.** `AI-BS` exists (Major, Active; `CSC-DSAI` is Inactive, which supports the `supersedes` link),
but its degree map is `isActive: false` and its requirement list contains none of AI 3000/3100/3200/4200. The Word files stay
authoritative; Coursedog degree maps are a cross-check only. Its pools are opaque course-set ids (resolvable through
`catalog_coursesets_raw.json`, a possible source for pool membership). Program records also carry `type` (MAJOR / Concentration),
which backs the `kind` column.

**5. Map vs template diff (nothing is missing from the catalog; credits match for every map course):**
- Core / Cyber / HPC: the only fixed-course change is **CSC4620 replaces CSC4615** in all three. Pool changes: Core gains 2 CSC_ELECTIVE
  and its free-elective bucket drops 8 -> 5 hrs; Cyber gains 2 CSC_ELECTIVE (3 vs 1) and free hours 5 -> 2; HPC gains 1 CSC_ELECTIVE.
- AI vs legacy DSAI: adds AI3000/3100/3200/4200, CSC4760, HIST2010/2020, FF pools; drops CSC3410/3710/4100/4220/4240/4320; GEN_ED x6 and
  ENG_LIT become FF_SOCIAL x2, FF_HUMANITIES x2; free-elective hours 2 -> 11 (the "Elective" rows plus a 2000+ any-department slot).
- All four maps: printed semester totals equal the sums of their rows, and each totals 120.

**6. The department paths are prerequisite-consistent.** A heuristic check found no violations across all four maps; its only two flags
(CSC1300 with MATH1910, CSC4585 with CSC4610) are "may be taken concurrently" cases. The checker did catch a deliberately moved CSC4610.
Validators must therefore model concurrent-allowed phrasing.

**7. Pool lists in code are stale.** `poolResolver.js` says CSC_ELECTIVE is "any 1000-4000 CSC course" but lists 26 courses; Coursedog has
43 active CSC 3000/4000 and 56 CSC 2000+ courses. `CSC_UPPER_ELECTIVE` ("any 3000-4000 CSC except CSC4990") lists 7. HPC elective in the
map is CSC4040/4220/4575; the code list also has CSC4400/4710. This is the strongest argument for pools-as-rules.

**8. Offering terms (fall only, spring only, spring even years) exist only in the Word maps.** Coursedog has no term data
(`customFields` is just `rawCourseId`; 20 descriptions mention an offering pattern). The spec must carry them as department-supplied data.

**9. Extractor hazards confirmed:** glued footnote digits ("CSC 25704"), "COMM 2025/PC 2500" and "MATH 3070 or MATH 3470" parsing as a single
course code, typo'd or inconsistent footnote numbers (HPC "Science Sequence3").

### Plan changes from P0
- P1 decisions added: credit-range storage; description/prereq normalization that mirrors `strip_descriptions.js`; concurrent-allowed
  becomes a coreq row.
- P2 spec gains `offering` per slot; `kind` values can mirror Coursedog's `MAJOR` / `CONCENTRATION`.
- P3 validators add: concurrent-aware path check.
- Department question list gains: the Coursedog AI program record omits the AI courses and its map is inactive; will the registrar update it?

---

## P1 results (2026-10-01): full catalog, branch `feat/full-catalog` in all three repos, unpushed

**Delivered**
- Prototype: `catalog/` (requisite parser, normalizer, `overrides.json`, `build_courses.mjs`, README), generated `courses.json`
  (6,183 courses), `seed.js` reads it in 500-row batches. `prototype.json` and `strip_descriptions.js` retired. 55 tests.
- local-deploy: setup image copies `courses.json`; baseline schema gains `courses.credits_max` and `courses.requisite_text`.
- Frontend: `catalog.json` is the full catalog (117 KB gzip, was 21); descriptions of courses no template/pool/equivalency
  names (~5,060) are a lazy 253 KB chunk. `plannerCatalog.js` replaces three unscoped catalog reads. 747 tests.

**Parser quality** (all 6,182 active courses): 1,431 exact + 121 inferred emit rules; 318 partial/unparsed are held back with
their text; 4,313 have no statement. 149 of the 166 curated courses agree with Coursedog's text; the 16 that do not are
`overrides.json` (each with a reason).

**Safety evidence:** plans built from the old and new catalogs are identical for all 189 combinations of concentration,
gen-ed program, ACT Math score and student type; for the 166 curated courses requisites, standing and ACT/consent gates are
reproduced exactly (tests); prerequisite/corequisite rows match except group ordering and four semantic no-ops.

**Found and fixed on the way:** two unfiltered catalog reads (Onboarding, ACT-score replan) that the Docker API's 1000-row
cap would have silently truncated; a course added from search had no prerequisite check until a reload.

**Open for the department / product (not blocking P2)**
- `AI3100` requires `CSC4240` and `AI4200` requires `CSC4220` per Coursedog, and neither is in the department's AI map. Either
  the text is stale or the map omits them. Until resolved, an AI student following the map gets prerequisite warnings.
- Coursedog dropped the "ACT Math score of 22" sentence from `MATH1720`; `overrides.json` preserves the old gate so planner
  behaviour does not change. Adopt Coursedog's newer text or keep the override?
- 549 courses have a credit range (e.g. 1-4). They plan at the minimum (`DLED2000` was 3 in the curated set, now 1). Should
  the add-course flow ask the student for hours?
- Add-course search now returns graduate courses (5000+) and placeholder codes (`AIELEC`). Hide them by default?
- `requisite_text` is stored but not yet shown; `CourseDetailModal` should display "Not checked by the planner: ...".
- 78 prerequisite rows point at retired courses (e.g. `CSC2001`); harmless for OR groups, a permanent warning for an AND.
- `AI3000`/`AI3200` prerequisites parse exactly; the AI program record in Coursedog still lacks the AI courses (P0 finding).

---

## P1 follow-ups (2026-10-01, answered by the department and resolved before P2)

1. **AI 3100 / AI 4200 prerequisites:** the AI courses replace their CSC namesakes (AI 3000 = CSC 4240, AI 3200 = CSC 4220)
   and build on one another, so Coursedog's "CSC 4240 Intro to AI/ML" is AI 3000. Not an override: a general
   `catalog/equivalents.json`, applied by the build as OR groups in both directions. Open: a transfer or prior credit for
   CSC 4240 does not yet archive an AI 3000 slot (`transferCredits` matches exact codes); a DSAI student keeps DSAI, so it
   only matters if a student moves programs.
2. **Math placement:** the table matched the code's ACT tiers already. New: SAT Math equivalents, "no score = MATH 1000"
   (the builder used to assume MATH 1910 with no score), MATH 1845 as Engineering Technology only, and MATH 1730 = 1710 + 1720
   (requirement substitutes). One module, `mathPlacement.js`, with `effective: '2026-2027'`. Onboarding and Settings take an
   optional SAT Math; every test score is now optional. `student_profiles.sat_math` is the one new column.
   `MATH1720`'s ACT gate stays as the older Coursedog text (override) so planner warnings do not change.
3. **Credit ranges:** the student chooses hours inside the range (add course, pool pick, transfer credit), stored on
   `student_free_add_slots.credits` / `student_plan_slots.selected_credits`, applied by overlaying the course map.
4. **Search:** undergraduate / graduate / placeholder tabs with match counts, in add-course and the prior-credit wizard.

Found on the way: `flightFoundationsTemplates.test.js` read `prototype.json` and skips itself when it is missing, so
deleting that file silently dropped 38 tests. Repointed at `courses.json`; the full suite is 811 tests with none skipped.

Not done (deliberately): `requisite_text` is stored but not yet shown in the course detail panel; the free-elective picker
still offers only courses a plan already loads (use "+ Add course" for anything else); the PDF export does not print SAT.

---

## P2 results (2026-10-01): degree specs, catalog years, program-aware onboarding; branch `feat/degree-spec-pipeline` in all three repos, unpushed

**Delivered**
- Prototype: `degree-specs/` (programs.json, pools.json, one spec per program per catalog year, validator + generator,
  README runbook) generating `degree_plans.json`; the seven `csc_*.json` templates are retired (the generated plans
  reproduce all 311 slots in the original order). `slotSync` now matches by `slot_key`, then adopts keyless rows. `seed.js`
  reads `degree_plans.json`. 93 tests.
- local-deploy: programs gain kind / degree / major_name / department / supersedes / last_catalog_year / description; new
  `degree_plans` table; slots gain catalog_year / slot_key / map_semester; profiles gain catalog_year (backfilled).
- Frontend: `catalogYears.js` (entry term -> academic year, plan resolution, program availability, grouping),
  `requirementSlots.js` by catalog year, onboarding and the Settings modal list programs from data (grouped under their
  major; descriptions and the DSAI cutoff are data, not code). 827 tests.

**Verified on a real Postgres** (the `mdp_fftest` stack, seeded by the previous release): migrate + seed adopted all 311
slots (0 inserted, 0 removed), the id-and-code fingerprint was identical, all 90 student plan rows survived, existing
students were backfilled to the right catalog year, and a second seed run changed nothing. This was also the first run of
the 6,183-course catalog through PostgREST in batches. In the app: a profile saved before catalog years loads its plan
unchanged; a returning Fall 2025 student is offered DSAI and stored as `2025-2026`; Fall 2026 and Spring 2027 entrants are
not offered DSAI; switching program keeps the entry-year plan.

**Found:** the validator reproduced a real data error. The Fall 2026 (Flight Foundations) CSC plans total **116** hours on
their top math track, not 120: MATH1920 (4 hrs) was dropped without adding hours back. They carry a reasoned waiver until
the department's 2026-27 maps replace them in P4.

**Deviations from the plan**
- `programs` gained `last_catalog_year` and `description` (a closed program and per-program copy were hardcoded in the
  frontend), and a `degree_plans` index table: onboarding needs "which plan exists for which year" without scanning slots.
- A profile's `catalog_year` stores the **resolved plan year**, not the raw entry year: a newer plan added later must not
  silently move an existing student onto different slots.
- Not in P2: per-slot `offering` terms and the `replaces` hint for renamed slots (both needed by P4: CSC4620 replaces
  CSC4615 inside the same 2026-2027 year, so P4 must migrate students' non-pool slot picks when it does).
- Onboarding's student types and year lists (returning = entered through 2026, new = 2026 on) and the builder's
  MATH1920 curriculum switch are still tied to the 2026 curriculum change; they should become per-plan data when the next
  catalog year lands.

---

## Map audit (2026-10-01): recount of the four Word maps

Recounted from the source `.docx` files, not from our specs.

- **Every map totals exactly 120.** All 32 printed "Total Credit Hours" equal the sum of their rows (CS 15/16/17/16/15/15/12/14,
  Cyber 15/16/16/16/15/14/15/13, HPC 15/16/17/16/15/15/14/12, AI 15/16/16/16/15/16/14/12).
- **Every named course matches the catalog hours:** 0 mismatches, 0 missing (incl. AI 3000/3100/3200/4200 at 3 hrs each).
- **The 116-hour finding in P2 was our data, not the department's.** The three 2026-27 CSC plans we built are 4 hours short of
  the maps: +1 because the maps use CSC 4620 (3 hrs) where we had CSC 4615 (2 hrs), and +3 because the maps carry 3 more hours
  of CSC electives than we modelled (CS and Cyber: +6 CSC elective pool hours, -3 free-elective hours; HPC: +3 CSC elective).
  This corrects the P2 note that blamed the dropped MATH 1920 alone. P4 replaces these plans and removes the `track-hours` waivers.
- **New discrepancy: PHYS 2110/2120 are 5 hrs each** (BIOL 1113/1123/2310, CHEM 1110/1120, GEOL 1040/1045 and PHYS 2010/2020
  are 4). The maps' 120 holds only for the 4-hour sequences; calculus-based physics gives 122. Added to the department
  questions. The P3 validators check every science option sequence against the hours the map counts, so this class of problem is
  caught for any future map.

## P3 design (`feat/degree-docx-extractor`, Prototype repo, `degree-specs/extract/`)

**Principle:** a department's file is an *input format*, the spec is the contract. Three layers, so a new format (PDF, Excel, a
different department's Word layout) adds an adapter and nothing else changes.

1. **Adapter: `ttu-degree-map-docx`** reads the file into a format-neutral *map document*: header (catalog year, degree, major,
   concentration), semesters (year block, declared total, rows of label + hours + footnote refs), numbered notes. Zero
   dependencies (a small zip reader over `node:zlib` and an XML tokenizer). Footnote markers are real superscript runs in these
   files, so they are read exactly instead of guessed from glued digits ("CSC 2570" + superscript 4); a 5-digit course number
   with no superscript is still caught and warned. Notes are the numbered list (`numPr`); the option lines under a note (a
   different list) belong to the preceding note.
2. **Drafter** turns a map document into a *draft spec* plus structured *findings*. Row grammar: course, alternatives
   (`COMM 2025/PC 2500`, `MATH 3070 or MATH 3470`), offering terms (`fall only`, `spring only`, `spring even years`), pools.
   A data file `vocabulary.json` maps row labels and alternative sets to pool codes, so a new major extends data, not code.
   Anything it cannot resolve is marked `unresolved` and becomes a department question, never a guess. Slot keys reuse the
   previous year's keys where the slot is the same course.
3. **Validators** (`checks.mjs`, rule-by-rule like specLib): per-semester sums equal the printed totals and the plan equals its
   hours; every code exists and its catalog hours equal the row's; no duplicate course; footnote number exists and its note
   matches the row label (catches HPC "Science Sequence3"); science option sequences total the hours the map counts (catches
   PHYS 2110/2120); offering terms agree with the semester's season and year for a reference entrant; the department path
   respects prerequisites, with "may be taken concurrently" courses allowed alongside (corequisite rows), ACT-gated courses and
   pool-supplied prerequisites reported as unverifiable, not failed; the draft also runs through specLib's own gen-ed rules.
   Rows have severity `error` (blocks promotion), `question` (department must answer) or `info`.

**Outputs:** `degree-specs/drafts/<dept>/<program>/<year>.draft.json` and a Markdown review report beside it (checksum table,
resolved rows, diff against the program's previous plan with `replaces` suggestions, open questions). The source file's name and
SHA-256 are recorded in the draft so a spec always traces back to the document it came from. A draft is promoted into
`degree-specs/<dept>/<program>/<year>.json` in P4 only when it has no errors and no unresolved items.

**CLI:** `node degree-specs/extract/cli.mjs <file.docx> [--program code]` (also `npm run degrees:extract`). The department's
source files live in `degree-specs/sources/<dept>/<year>/`.

**Tests:** synthetic docx built in-test (every grammar case and every rule failing on purpose) plus the four real maps as
golden inputs.

---

## P3 results (2026-10-01): the degree-map extractor; branch `feat/degree-docx-extractor` in Prototype and Frontend, unpushed

**Delivered** (Prototype `degree-specs/extract/`, `npm run degrees:extract` / `degrees:extract:check`; 132 Prototype tests, 39 new)
- Adapter `ttu-degree-map-docx` (dependency-free: `zip.mjs`, `xml.mjs`, `docxRead.mjs`) into a format-neutral map document.
  Footnote markers are read as real superscript runs, so no glued-digit guessing is needed for these files; a digit pasted onto
  a number or label is still caught (`footnote-glued`). Notes are the numbered list; option lines under a note belong to it.
- Drafter + `vocabulary.json` (label -> pool, either/or set -> pool) producing a draft spec with stable keys, map semesters,
  offering terms, footnotes, and `unresolved` slots for anything it cannot place.
- Checks (rule table in `degree-specs/README.md`), previous-plan diff with `replaces` suggestions, deterministic Markdown review,
  per-folder `manifest.json` (per-file options, department `decisions`), CLI with `--all` and `--check`.
- Sources and drafts committed: `degree-specs/sources/csc/2026-2027/` (the four .docx + manifest) and
  `degree-specs/drafts/csc/{core,cybersecurity,hpc,ai}/2026-2027.{draft.json,review.md}`; a test keeps the drafts current.

**What it finds on the four real maps** (0 errors on all four; every draft is "not ready" because of open questions)
- All four: 120 hours, every printed semester total equals its rows, every course matches the catalog, department paths respect
  prerequisites and offering terms (HPC "spring even years" lands in spring 2030 for a fall 2026 entrant).
- All four: PHYS 2110/2120 are 5 hours against the maps' 4 (question).
- HPC: "Science Sequence3" is read as note 2 (question to confirm). AI: the Natural Science option list reads two ways (2
  lines), "Elective3 (2000-level or higher)" cannot be expressed by a free-elective pool, "Upper Division Elective" names no
  department, and program `ai` is not in `programs.json` (the review prints the entry to add).
- Against the plans being replaced: CSC 4615 -> CSC 4620 in Core/Cyber/HPC (suggested `replaces` hint), Core free-elective
  bucket 8 -> 5 hrs and +2 CSC_ELECTIVE, Cyber CSC_ELECTIVE 3 -> 9 hrs and free 5 -> 2, HPC +1 CSC_ELECTIVE; AI vs DSAI adds
  AI3000/3100/3200/4200, CSC4760 and the FF pools and drops six fixed CSC courses and GEN_ED x6.

**Deviations / decisions**
- Gen-ed program is inferred from the HIST pair or any FF pool (so a map missing HIST 2020 fails the FF rules instead of being read
  as legacy).
- Free-elective rows in the same semester without a note are merged into one hours bucket (the planner's model); a restricted
  one is kept separate and asked about.
- Nothing is promoted to a spec: the draft carries review-only fields (`label`, `hours`, `offering`, `notes`, `source`). Promotion,
  pools as data, `offering`/`replaces` in the generator and schema, and the conformance test are P4.
- Waiver reasons on the three 2026-27 specs corrected to the recounted cause.

**Not done / open**
- The department's answers to the questions are not recorded yet (`manifest.json` `decisions` is empty).
- Only the Word adapter exists; the `ADAPTERS` map is the extension point.

---

## P4 results (2026-10-01): the four 2026-27 maps live; branch `feat/degree-maps-2026-27` in Prototype and Frontend, unpushed

**Delivered**
- **Four specs** (`degree-specs/csc/{core,cybersecurity,hpc,ai}/2026-2027.json`) promoted from the extractor's drafts
  (`npm run degrees:promote`, idempotent). Each totals exactly 120; the interim `track-hours` waivers are gone. `ai` is a
  program (major, supersedes `dsai`; picker shows it under "B.S. Artificial Intelligence" for 2026+ entrants, DSAI stays for
  earlier ones). Promotion keeps pool keys (`CSC_ELECTIVE` stays `CSC_ELECTIVE`, then `#2`, `#3`), keeps the math placement
  courses the map does not show as unmapped slots, and records the source hash and the assumptions.
- **Spec format:** `offering` (term + year parity, validated against the mapped semester) and `replaces` (a renamed slot
  keeps its row). `slotSync` now syncs `class_code` and matches by `replaces`; the seed and `catalogLib` pass the hint (never
  stored). Seasons for AI 3000/3100/3200/4200 are in `semesterRestrictions.js`, and a test requires every spec offering to
  agree with it.
- **Pools as data** (`degree-specs/pools.json` -> `degree_plans.json` `poolDefs` -> `src/data/pools.json` ->
  `poolResolver.js`): explicit lists carried over unchanged (checked mechanically), `CSC_ELECTIVE` / `CSC_UPPER_ELECTIVE` as
  rules over the catalog (the department's wording), `gates` rank, `floor`, `source` for Flight Foundations. Replaces the
  hand-written `POOL_COURSES`, `POOL_LABELS`, `POOL_CREDIT_ESTIMATES`, `REQUIREMENT_POOLS`, `IMPLICIT_POOL_PREREQ` and
  `SATISFIABLE_POOLS`. Pool membership is versioned by code, since a pool is not scoped to a catalog year: the 2026-27 HPC
  list is `CSC_HPC_ELECTIVE_2026` (3 courses); `CSC_HPC_ELECTIVE` keeps the 2025-26 five.
- **Map-first placement** in `buildDegreePlan`: Fall start + no prior credit + top-track math = the department path
  (`map_semester`), used only if every active slot has one and it passes prerequisites, corequisites, offering terms,
  standing and load; everyone else (and any map that fails) gets the algorithm exactly as before (tests prove equality with a
  map-less plan). The algorithm would place 21-25 slots per program somewhere other than the department does.
- **Conformance test** (`mapConformance.test.js`): each program's reference student equals the map slot for slot, with the
  printed semester totals (Core 15/16/17/16/15/15/12/14, Cyber 15/16/16/16/15/14/15/13, HPC 15/16/17/16/15/15/14/12, AI
  15/16/16/16/15/16/14/12), plus the fall-back cases and six ways a map can be invalid.
- **Provisional corequisites:** an empty requirement-pool slot now meets a corequisite its pool offers
  (`checkCoreqsProvisional`), as it already did for prerequisites. Found in the browser: the department's own AI path opened
  with a "CSC3220 corequisite unmet" blocker (pre-existing: the curated data had the same corequisite).

**Verified**
- Frontend 46 files / 875 tests, Prototype 149 tests, lint at the baseline (13), build OK.
- In the app: a Fall 2026 AI student (ACT 29, no prior credit) gets Fall 2026 -> Spring 2030, 120 hours, exactly the AI map;
  no blocker, 13 advisory "choose a course" notes.
- On a real Postgres (the throwaway `mdp_fftest` stack, seeded by the previous release): migrate + seed = 308 slots kept, 3
  CSC4615 slots renamed to CSC4620 in place (same ids; the student's semester-8 row intact), 50 new (45 AI + 5 electives), 3
  MATH1920 slots dropped (the Fall 2026 curriculum has none; one archived student row went with them, 89 of 90 remain), second
  seed run 0 changes. The static catalog build gives the same counts.

**Assumptions recorded, pending the department** (`degree-specs/sources/csc/2026-2027/manifest.json`, listed in each spec's
`assumptions`; replace each with the department's answer and re-run `degrees:extract` / `degrees:promote`)
- PHYS 2110/2120 stay allowed as science options although they are 5 hours each (the maps count 4): a student who picks them
  carries more than 120 hours.
- HPC "Science Sequence3" is a typo for note 2.
- AI Natural Science list = the Computer Science map's sequences.
- AI "Elective (2000-level or higher)" is a plain free-elective bucket; the level limit is recorded but not enforced.
- AI "Upper Division Elective" is a CSC upper-division elective.

**Deviations / known gaps**
- Pool rules add a judgment the department's wording does not state: a course must have at least 3 hours (a 1-hour lab does not
  fill a 3-hour slot) and CSC4615 (retired) and CSC4990 (internship) are excluded; CSC1200 stays in `CSC_ELECTIVE` for the
  2025-26 plans whose wording was "1000-4000".
- Existing students keep the positions already saved (the builder only places unplaced slots); a Fall 2026 student placed by
  the algorithm before this release stays where they are unless they Reset Plan. Slots they had saved keep their ids.
- A student whose pick for the 2026-27 HPC elective was CSC4400 or CSC4710 keeps the pick, but the picker no longer offers
  them (the 2026-27 map names three courses).
- Prior credit for CSC4615 does not clear the CSC4620 slot (exact-code matching; the two are one class but their hours differ).
- Offering year parity (CSC4780 "spring even years") is validated in the spec but not enforced in the app.
- "Not required for transfer students with more than 12 hours" (CSC 1020) is read and kept as a note, not modeled.
- Onboarding's student types and year lists and the builder's MATH1920 curriculum switch are still tied to the 2026 change.
- Not released: nothing is pushed or merged; P5 is the release (a signed release notes the AI major, the department maps and
  the CSC 4615 -> 4620 change).

---

## P5 results (2026-10-02): released as v0.2.0

- **Merged and pushed** (fast-forward onto `main`, which was level with `origin/main` in all three repos): Deploy `5d174d1`,
  Prototype `8ba57aa`, Frontend `520564a`. Vercel's production deployment of `520564a` succeeded.
- **Pre-flight:** a fresh clone of the Frontend with no sibling repos (what the release CI sees): `npm ci` + tests pass (44 files
  run, 2 that need the Prototype repo self-skip); updater tests pass; the web image built from the branch; Deploy CI on `main` passed.
- **Release:** `gh workflow run release.yml -f version=0.2.0 -f required=false` (run 36961821466): test job passed, the
  `release` job waited for the environment's required reviewer and was approved by the owner. Not marked required.
- **Verified after publishing** (v0.2.0, published 2026-10-02): the signed `release.json` records exactly the three commits above;
  `verify-dist.mjs` (the updater's own verifier) reports it "verifies exactly as a student install will"; the compose hash matches
  the file; all four images (web, setup, db, updater) are pinned by digest and exist for linux/amd64 and linux/arm64; the setup image
  carries the new `degree_plans.json` (program `ai`, `CSC_HPC_ELECTIVE_2026`, the three `replaces` hints).
- **Housekeeping:** a stale duplicate Release run (36925287964, dispatched 44 s after v0.1.6 on the same commit) was holding the
  workflow's concurrency lane and the approval queue; it was cancelled.
- **Update on the owner's real v0.1.6 install (2026-10-02):** applied to 0.2.0 by the updater's **automatic mode**
  (`settings.json` `auto: true`), not by pressing the button, shortly after the release was approved. Observed: the
  `mdp-updater-apply` helper ran and exited, the stack came back (db, auth, migrate, rest, seed, web, updater), the updater
  reports `Updated to 0.2.0`, the web container is the release's `mdp-web` digest and serves the new build, a pre-update
  snapshot `pre-1790888452-to-1790913591.tar.gz` (9.9 MB) was taken first, and the database has 5 programs, 8 plans, 358
  slots (155 with a department semester), 6,183 courses; 5 profiles, 134 plan rows, 15 prior credits, 0 orphaned plan rows. The
  HPC student's saved CSC 4615 row now sits on the CSC 4620 slot, same row, semester 8, as the throwaway-stack test predicted.
- **Not verified:** the **Update now button** itself (progress screen, reload) on this install: automatic mode got there first,
  so there is no newer release to press it for. To test it, turn automatic updates off in Settings before the next release
  (v0.2.1). The isolated button test from 2026-09-29 (Deploy README) still stands.
- **Still open:** the department's answers (PHYS 2110/2120 hours, HPC "Science Sequence3", AI science list, AI "Elective 2000+",
  AI "Upper Division Elective") are recorded assumptions in `degree-specs/sources/csc/2026-2027/manifest.json`. When they
  arrive: update `decisions`, run `npm run degrees:extract` and `npm run degrees:promote`, rebuild the catalog, release.
