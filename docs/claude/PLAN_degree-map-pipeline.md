# Plan: degree-map pipeline, 2026-27 maps, full Coursedog catalog

> Status: planning, decisions locked 2026-10-01. No code written yet.
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
- **P3 `feat/degree-docx-extractor`:** extractor + validators.
- **P4 `feat/degree-maps-2026-27`:** four specs, pools as data, map-first placement, conformance test.
- **P5:** release, runbook, update both CLAUDE.md copies (canonical: this repo's `docs/claude/CLAUDE.md`).

## Open questions for the department

- AI "Natural Science": which exact course combinations? (the list reads "BIOL 1113 OR BIOL 1113, BIOL 1123 OR BIOL 2310")
- AI "Elective3 (2000-level or higher)" and "Upper Division Elective": which department(s)?
- HPC: confirm "Science Sequence3" is a typo for note 2.
- Does AI satisfy Financial/Digital Literacy through CSC 2220 (the AI map has no note)?
- Core: confirm CSC 4620 replaces CSC 4615 for all 2026-27 entrants.

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
