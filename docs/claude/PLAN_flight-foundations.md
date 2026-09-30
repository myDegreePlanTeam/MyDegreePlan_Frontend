# PLAN — Align MyDegreePlan with Tennessee Tech "Flight Foundations"

Status: **foundational rules implemented (2026-09-30)** on branch `feat/flight-foundations-core` —
see §0. Everything else below is still outline only.
Sources: [Requirements](https://undergrad.catalog.tntech.edu/ugrequirements/requirements) ·
[Gen-ed course list](https://undergrad.catalog.tntech.edu/ugrequirements/gened) ·
Coursedog public catalog API (2026-2027 Undergraduate Catalog, id `WWGfWvyv8THZmZ6usuDv`).
Raw pulls live in `MyDegreePlan_Prototype/catalog_scrape/` (see §2).

---

## 0a. Implemented: templates and app wiring (2026-09-30, second pass)

Decisions applied: Core / Cybersecurity / HPC get Flight Foundations templates for students entering
Fall 2026+; **DSAI and all returning students stay on legacy**; science keeps the department sequences.
- **Schema** — `MyDegreePlan_Prototype/migration_tier21.sql`: `requirement_slots.gened_program` and
  `student_profiles.gened_program` (`legacy` default, CHECK legacy|flight_foundations). **Apply it
  before deploying the frontend** (the app now reads the column). Every existing student stays legacy.
- **Templates** — `csc_core_ff.json`, `csc_cybersecurity_ff.json`, `csc_hpc_ff.json`: six `GEN_ED` →
  HIST2010 + HIST2020 (fixed), `FF_SOCIAL` x2, `FF_HUMANITIES` x1; Core free elective 5→8,
  Cybersecurity 2→5, HPC sixth slot → `FF_LITERACY`. Legacy templates untouched.
- **Seed** — `seed.js` syncs each (concentration, program) set separately; `prototype.json` gains the
  40 Flight Foundations courses it lacked (credits from the catalog; unambiguous prereqs only).
- **App** — new pools in `poolResolver` (`FF_SOCIAL/FF_HUMANITIES/FF_LITERACY`, labels, estimates,
  `REQUIREMENT_POOLS`), `mapSatisfiesPoolForPlan` (exam credits → FF pools), `requirementSlots.js`
  (program-filtered slot loader with legacy fallback), program set at onboarding from entry term,
  category progress line in `SlotModal`, FF pools in transfer-credit matching, degree-builder leveling
  and `usePlanCompleteness`.
- **Tests** — 619 passing (was 511): `flightFoundations*.test.js`, builder smoke tests on the FF template.
- **Not done / open:** no dashboard panel shows the 41-hr summary yet (only the slot modal line);
  `prototype.json` PHYS2110/2120 are 5 credits (ETSU) — TTU is 4, and the evaluator caps Science at 8
  so it is harmless; MUS2080 is 2 credits in the catalog vs 3 on the FF page; `local-deploy` (root repo,
  branch `feat/flight-foundations-seed`) bundles the new files; the stale copy under
  `MyDegreePlan_Prototype/local-deploy` was not touched; nothing is committed or applied to a live DB.

## 0. Implemented so far (foundation only)

Per instruction, only the baseline every major inherits — **no CSC template, UI, or database changes**
(those wait for the CSC concentration plans).
- `src/lib/flightFoundations.js` — pure module: the 8 requirement areas (41 hrs, 37 fixed + 4 flex),
  97 eligible courses, `getGenEdProgram(season, year)` (Fall 2026+ → `flight_foundations`, else
  `legacy`), `evaluateFlightFoundations(entries)` and `evaluateFlightFoundationsForPlan(...)`
  (same argument order/dedup as `computePlanCredits`).
- `src/tests/flightFoundations.test.js` — 39 tests; full suite 550/550 green.
- Not wired into any component yet: `poolResolver`/`getGenEdStatus` still serve the legacy program
  so current plans keep working. Wiring = §4D–E once templates move.
- Rules encoded: per-category caps ("no more, no less"); flex hours only inside Humanities / Science /
  Literacy and capped at 4 total; surplus can't cover another category's minimum; 3-hr cap on
  introductory foreign language toward Humanities; cross-listed ENGL/PC 2600 counts once.
- Not encoded (needs a decision or belongs with the majors): American-History exemption for some
  engineering majors, per-major restrictions (e.g. CSC science sequence), minimum grades, and the
  learning-outcome text.

## 1. What Flight Foundations requires

Effective for **entering freshmen Fall 2026+**. Students entering through Summer 2026 stay on the
legacy program. **41 hours total**: 37 fixed by category + 4 flexible inside the ranged categories.

| Category | Hours | Legacy equivalent |
|---|---|---|
| Communication | 9 (English Comp 6 = ENGL 1010 + 1020; Oral 3 = COMM 2025 / PC 2500 / NURS 2600) | Communication 9 |
| Quantitative Reasoning & Analysis | 3 | Mathematics 3 |
| Historical Foundations | 6 (HIST 2010 + HIST 2020 — a fixed pair) | History 6 |
| Social & Behavioral Sciences | 6 | Social/Behavioral 6 |
| Humanities & Cultural Expression | **6–9** | Humanities/Fine Arts 9 |
| Scientific Reasoning | **4–8** | Natural Sciences 8 |
| Financial Literacy **or** Digital Literacy | **3–4** (**new category**) | none (0) |

The ranges must sum so the three flexible categories total exactly 17 (mins 6+4+3 = 13, plus 4 flex).
"No more, no less" — the catalog says the 4 flex hours are allocated within the ranges only.

Other rules on the requirements page that touch the planner:
- ENGL 1020 needs C or better in ENGL 1010; 2000-level English needs C or better in 1020.
- All students complete 6 hrs American History **except** Chemical, Civil, Computer, Electrical,
  General and Mechanical Engineering majors. (CSC is **not** on the exempt list.)
- 120 hrs total, 36 upper-division; 30-hr cap on business courses for non-business majors;
  12-hr cap on activity/ensemble courses; residency 25% + 24 upper-division hrs.
- QR courses must meet 3 of 5 QR learning outcomes (informational; no planner impact).

**Third source** (tntech.edu/strategic/flight-foundations.php and its approved-courses page) agrees
on hours and categories. It adds: only **3 hrs of introductory foreign language** count toward
Humanities (encoded for FREN 1010, GERM 1010, SPAN 1010, SPAN 1015 — the page does not list which
courses are "introductory"; confirm), and **POLS 1100** as a Social & Behavioral course (missing from
the catalog gen-ed page and from Coursedog's set; active 3-hr course, so included). "(Cyber)" entries
on that page are section variants of POLS 1030 / SOC 1010, not new courses. Course lists otherwise
match the catalog page exactly (all 8 areas diffed).

## 2. What I pulled (and how to refresh it)

`MyDegreePlan_Prototype/catalog_scrape/` (untracked; `catalog_raw.json` is gitignored, 41 MB):
- `scrape_catalog.mjs` — `node scrape_catalog.mjs` re-pulls **all 7,444 course records**
  (6,189 active / 1,255 inactive, 267 subject codes, 7,407 unique codes) from the public Coursedog
  catalog API. No auth: the endpoint is gated only on the catalog site's `Origin` header. Read-only.
- `progs.mjs`, `prog_one.mjs` — list the 597 programs; fetch a program's full record.
- `ff_extract.py` — parses the gen-ed page into `reference/flight_foundations_pools.json`
  (8 pools, 96 distinct course codes, cross-checked against the scrape).
- `reference/` — the four CSC program records, Coursedog's internal FF course sets, page text.

API facts that matter for the ETL (§4A):
- **Credits are ranges**: `{min, max, operator: OR|TO|''}`. Lab/lecture combos report `min 0, max 4`
  (e.g. BIOL 1113, CHEM 1110, CSC 1300/1310/2310, GEOL 1040). Use `max` when `min` is 0 or operator
  is OR/TO — the existing app data has these as 4.
- **Prerequisites are free text**, not structured rules, for most courses
  (`requisitesSimple[].notes` HTML). The existing `prerequisite_entries` rows are hand-built; an
  automated catalog import needs a parser or manual review.
- **Gen-ed membership is not a course attribute** (`catalogAttributes` is empty on all 7,444
  records). It exists only on the gen-ed page and in "course sets". So category membership must be
  stored by us (table, §4B), seeded from the page.
- 33 codes appear twice (effective-dated versions) — dedupe by latest `effectiveStartDate`.

### Data-quality problems in the source (need a human decision — §6)
1. **The catalog contradicts itself.** Coursedog's own FF course sets lag the published page:
   Digital/Financial Literacy set has 5 courses vs 11 on the page (missing CSC 2220, CSC 2570,
   DLED 2000, DS 2810, MUS 2080, PRST 3130); Humanities set lacks ART 3170/3190, ENGL 2400/2550;
   Oral Communication set lacks NURS 2600; Scientific set lacks CHEM 1410; Social set still includes
   AGBE 2010 and ANTH 1100 which the page dropped. **I treated the published gen-ed page as
   authoritative.** Note the CSC B.S. page itself says "CSC 2220 or CSC 2570 needed to complete
   Financial or Digital Literacy", so the page list is right and the course set is stale.
2. **The 2026-27 CSC program records still point at the legacy gen-ed sets** (old Humanities,
   Natural Science, Social/Behavioral, Math sets) and the published CSC degree map is legacy-shaped
   (Humanities/Social set slots, HIST 2010/2020, 8-hr science sequence, 5-hr general electives). Only the Digital-Literacy rule has been updated. The department must confirm
   the FF-era CSC plan — see §6 Q1.
3. Page typos/omissions: GERM 1010, PC 2500, NURS 2600 have no credit hours; NURS 2400 title is
   truncated; ASTR 1010 and 1020 share a title; `ENGL/PC 2600` is a cross-list of two codes.
4. Credit disagreements page vs catalog: PHYS 2110/2120 (page 4, catalog 5), MUS 2080 (page 3,
   catalog 2), DLED 2000 (page lists 3/2/1 separately; catalog is a 1–3 variable course).
5. The DSAI concentration program record has narrative text only (no structured rules).

## 3. Gap analysis — current app vs Flight Foundations

The app hardcodes the **legacy** program everywhere: a single `GEN_ED` pool (34 courses) split by
three fixed 6-hr sub-buckets (History / Humanities / Social), a separate `SCIENCE` pool
(8 hrs, paired sequences), `ENG_LIT`, `COMM_REQ`, `MATH_STATS`, and templates that total 120.

| Area | Today | Flight Foundations |
|---|---|---|
| Buckets | History 6 / Humanities 6 / Social 6 (fixed) | 7 categories; 3 of them ranged with shared 4-hr flex |
| Humanities | 6 via GEN_ED + 3 via ENG_LIT | 6–9; ENG_LIT courses (ENGL 2130/2235/2330) are ordinary Humanities members |
| History | Choose-from pool, 2 courses happen to be the only members | Fixed pair HIST 2010 + 2020 (for non-exempt majors) |
| Science | 8 hrs from 11 sequenced courses | 4–8 hrs from 26 courses (no sequence requirement — that is a *major* rule) |
| Digital/Fin. Literacy | does not exist | 3–4 hrs, 11 courses (CSC 2220/2570 qualify) |
| Quant. Reasoning | implicit via math chain | 3 hrs from 11 courses (MATH 1910 qualifies; 4 hrs covers a 3-hr need) |
| Course double-counting | not modeled (slots sum to 120) | A course counts toward a major requirement **and** a gen-ed category (CSC 2220/2570, MATH 1910, science sequence, ENGL 2130…) |
| Program versioning | single program | legacy (entry ≤ Summer 2026) vs FF (entry ≥ Fall 2026) |
| Removed from legacy pool | AGBE 2010, ANTH 1100 (now inactive), FLST 3520 | not in FF |
| Newly eligible | — | ART 3170/3190, ENGL 2130/2235/2330/2400/2550, FREN/GERM/SPAN 1010, SPAN 1015, NURS 2400, + 27 more science/QR/digital |

**How a CSC plan works out under FF (41-hr arithmetic):**
Comm 9 (ENGL 1010/1020 + COMM 2025/PC 2500) · QR 3 (MATH 1910) · Hist 6 (HIST 2010/2020) ·
Social 6 · Science 8 (CSC-required sequence) · Digital 3 (CSC 2220 or 2570) · Humanities 6.
= **41 exactly.** Because CSC's science sequence consumes all 4 flex hours, Humanities is forced to
its **6-hr minimum** and Digital Literacy to its **3-hr** minimum. So, versus the legacy template,
a CSC plan has **one fewer Humanities GEN_ED slot** (9 → 6 hrs), and the Digital requirement is
satisfied by a course the major already requires (CSC gateway electives), freeing **3 hours** to
re-allocate (most likely to the 5-hr general elective → 8). That is a department decision (§6 Q1).

Per concentration (from the 2026-27 catalog program records):
- **Core**: 2 of {CSC 2220, 2570, 2770}; at least one of 2220/2570 needed for Digital.
- **Cybersecurity**: CSC 2570 and 2770 required → Digital satisfied.
- **HPC**: CSC 2770 required, **2220/2570 not** → student needs a separate Digital/Financial
  Literacy course (new 3-hr slot), which changes HPC's hour balance.
- **DSAI**: catalog record has no structured rules, but `csc_dsai.json` already requires CSC 2220
  → Digital satisfied.

All four current templates have exactly 6 `GEN_ED` + 2 `SCIENCE` slots and total 120 hours.

## 4. Everything that has to change

### A. Data pipeline (new)
1. Promote `catalog_scrape/` into a real importer: catalog → normalized JSON (dedupe effective dates,
   credit normalization rule, strip HTML from descriptions, drop inactive courses).
2. Parse free-text prerequisites into `prerequisite_entries` / `corequisite_entries` shape
   (AND groups / OR groups), with a review report for unparsable rows — ~6,300 courses have text.
   Flag any course whose prerequisite says "ACT score / consent / placement" so
   `classifyPrereq` keeps working.
3. Seed the **39 FF courses missing from the app's `courses` table** (prototype.json holds only 126):
   ART 3170/3190, ASTR 1010/1020, BIOL 1010/1020/1090/2010/2020, CHEM 1010/1020/1090/1410/1710,
   DLED 2000, DS 2810, ENGL 2400/2550/2600, FIN 2000, FREN 1010, GEOG 2100, GEOL 1090, GERM 1010,
   HEC 3011, JOUR 1500, MATH 1010/1420/1530/1630/1830, MUS 2080, NURS 2400/2600, PC 2600,
   PHYS 1090, PRST 3130, SPAN 1010/1015.
4. Decide the long-term course-table scope: the full 6,189 active courses (matches the stated
   goal of full-catalog integration) — `AddCourseModal`/free-elective search will need paging or
   server-side search at that size (the ROADMAP "full-text course search" item becomes required).
5. Also import programs (597) and course sets later for other majors; the program record schema
   (`requisites.requisitesSimple[].rules`, `degreeMaps`) is already machine-readable.

### B. Database (migration `migration_tier21.sql`; tier 20 is the latest)
1. New tables (catalog-level, public-read RLS like other catalog tables):
   - `gened_programs` (`code` = `legacy` | `flight_foundations`, effective entry term, total hours).
   - `gened_categories` (program, code, label, `min_hours`, `max_hours`, `flex_group`,
     `display_order`) — 7 rows for FF; legacy rows for the old program.
   - `gened_category_courses` (category, `course_code`, `credits_counted`) — seeded from the page,
     replacing the hardcoded lists in `poolResolver.js`.
   - `major_gened_rules` (concentration, category, `min/max override`, `restrict_to` course list,
     `history_exempt` boolean) — models "CSC science must be a listed sequence" and the engineering
     American-History exemption without touching the category definitions.
2. `student_profiles`: already has `start_season` / `start_year` (`deriveCatalogYear` in
   `planExportModel.js` turns them into a catalog year). Derive the gen-ed program from that
   (Fall 2026 or later → Flight Foundations) rather than adding a new column; optionally add a
   `gened_program` override column for transfer/readmit edge cases.
3. `requirement_slots`: new pool codes (see C) — update any CHECK constraint/enum on `class_code`
   if present; re-run `slotSync.js` so existing students get new slots without losing selections.
4. `prior_credits.satisfies_pool` + `test_equivalencies.satisfies_pool`: re-map values (35 GEN_ED,
   24 SCIENCE, 5 ENG_LIT references in `test_equivalencies.sql`). AP/IB/CLEP → course mappings stay;
   the pool routing changes to FF categories. Re-check that each mapped course is still FF-eligible
   (e.g. AP Human Geography → GEOG 1012 is, AP Psychology → PSY 1030 is).
5. Backfill: existing student rows remain `legacy` (they entered ≤ Fall 2026 ambiguity — see Q3).
   Migration must be idempotent (`IF NOT EXISTS`) like prior tiers.

### C. Degree templates (`csc_*.json`, `degrees.json`, `seed.js`, `slotSync.js`)
1. Replace the single `GEN_ED` pool with category pools. Recommended codes:
   `GE_HIST` (fixed — just use `HIST2010`, `HIST2020` as real classCodes), `GE_SOCIAL`,
   `GE_HUMANITIES`, `GE_SCIENCE`, `GE_DIGITAL`, `GE_QR`, plus keep `COMM_REQ` (oral) and
   `ENGL1010/1020`. `ENG_LIT` folds into `GE_HUMANITIES` (restricted to ENGL 2130/2235/2330 where
   the major requires literature).
2. Keep `SCIENCE` semantics as a **major restriction layer** on top of `GE_SCIENCE` (CSC requires a
   paired sequence; FF itself does not).
3. Re-balance each template to 120 and re-verify the "templates must total 120 / GEN_ED = 6 slots"
   invariant (memory: it has regressed twice). **That invariant changes** — replace it with a test
   that asserts FF category totals (see H).
4. Add `seed.js` `POOL_CODES` entries and seed `gened_*` tables; seed.js uses delete-then-insert for
   prereq/coreq tables — don't reintroduce the `onConflict:'id'` pitfall.
5. Keep legacy templates selectable for pre-Fall-2026 students (version the JSON, e.g.
   `csc_core.legacy.json`), or drop legacy support entirely (Q3).

### D. `src/lib/poolResolver.js` (618 lines — the biggest change)
- `POOL_COURSES.GEN_ED`, `GEN_ED_CATEGORIES`, `SCIENCE`, `ENG_LIT`, `COMM_REQ` hardcoded lists →
  read from the new category tables (load once next to the course catalog; keep a synchronous
  `resolvePool(poolCode, courseMap)` signature so callers don't change).
- `POOL_LABELS`, `POOL_CREDIT_ESTIMATES`, `REQUIREMENT_POOLS`: add the new pool codes and labels
  ("Social & Behavioral Sciences", "Humanities & Cultural Expression", "Scientific Reasoning",
  "Financial / Digital Literacy", "Quantitative Reasoning").
- `getGenEdStatus`: rewrite from "three buckets × 6 hrs" to a **category solver**:
  per-category earned hrs, min/max, then the 17-hr flex allocation (a plan is *feasible* iff some
  assignment satisfies every category's min and keeps flex ≤ 4). Must accept overlap credits
  (a course counted in both a major slot and a category). Return shape changes from 3 items to 7 —
  `usePlanCompleteness`, `CompletionBadge`, `Dashboard`, `planExportModel` consume it.
- `getGenEdSubCategory`: returns FF category for any course (a course can belong to several
  categories — e.g. HIST 2210 is Humanities; MATH 1910 is QR; PHIL… — so return a list, or a
  primary + alternates).
- `resolveSatisfiesPool`, `formatMissingForDisplay`: loop over new pools; tie-break order matters
  (CSC 2220 sits in `CSC_LOWER_ELECTIVE`, `CSC_ELECTIVE` **and** the Digital category — BUG-4
  class of problem returns; scope by pools present on the plan).
- Science helpers (`SCIENCE_SEQUENCES`, `resolveScience`, `getScienceWarnings`,
  `SCIENCE_SEQUENCE_NAMES`): keep as the CSC major rule; change the 8-hr assumption to "at least the
  FF minimum (4)" only where a major does not require a sequence. Add the newly eligible
  sequences only if the CSC department approves them (Q2).
- Remove `AGBE2010`, `ANTH1100`, `FLST3520` from all FF lists (they are not FF-eligible).

### E. UI components
- `SlotModal.jsx`: the GEN_ED sub-category sectioning (History / Humanities / Social) → show the
  slot's own category; show the category's progress (e.g. "Humanities 3 of 6–9 hrs") and whether
  choosing a course is overlap with a major requirement. Specialized science branch stays.
- `Semester.jsx`, `DegreePlan.jsx`: slot row labels/icons; `getScienceWarnings` call stays.
- `CompletionBadge.jsx`, `Dashboard.jsx`/`Dashboard.css`: seven-category gen-ed panel + "41 hrs"
  total; flex-hour explanation; "Flight Foundations" naming (this is a product-language change:
  students/advisors will search for it).
- `PriorCreditWizard.jsx`: step 4 label via `getGenEdSubCategory` (BUG-43); new routing of AP/IB/
  CLEP awards to FF categories; Digital Literacy has no AP/IB equivalents — expect transfer-only.
- `Onboarding.jsx`: capture entry term/catalog year; choose gen-ed program from it; explain why.
- `AddCourseModal.jsx`: badge courses that are gen-ed-eligible (and in which category).
- `PlanPdfDocument.jsx`, `planExportModel.js`: category names and hour totals on the PDF; the
  catalog-year line already derives from the profile start term — no change beyond confirming the
  Fall-2026 boundary. `planExportModel` also imports `POOL_COURSES`/`SCIENCE_SEQUENCES` directly.

### F. Business logic beyond pools
- `transferCredits.js`: `GEN_ED_SUB_REQUIRED = 6` saturation check (BUG-45) → per-category
  max/min from the category table; Rule 2 (archive a pool slot only when `satisfies_pool` equals
  the slot's `class_code`) stays but the allowed pool codes widen. `computePlanCredits` de-dup rule
  is unchanged. **New**: a course satisfying both a major slot and a category must count hours once
  for the 120 total but toward both requirement trackers.
- `validatePriorCredit.js`: extend for any new `credit_type`; per-course cap for variable-credit
  courses (DLED 2000 is 1–3).
- `degreeBuilder.js` (24 gen-ed references): `GEN_ED_RESERVE`, `LEVEL_MOVABLE = {'GEN_ED','ENG_LIT'}`,
  the `ENG_LIT → ENGL1020` prerequisite proxy map, SCIENCE adjacency rules (Step 9), COMM_REQ
  early-placement for CSC 3040 — update to the new pool codes. Digital Literacy (CSC 2220/2570)
  becomes an early-placement candidate because it is a concentration gateway.
- `prereqChecker`/`classifyPrereq`: signatures must not change (CLAUDE.md). ENGL prerequisite rule
  (C or better in 1010 before 1020) is a **minimum-grade** rule — the app has no grade model; flag
  as a warning text only unless grades are added.
- `planIssues.js`, `usePlanCompleteness.js`: new "category under minimum" / "flex over-allocated"
  issues; retain the `hasGenEdSlots` guard logic for plans with no gen-ed slots.
- American-history exemption: a per-concentration flag, not relevant to CSC today but required
  the moment another major is added.

### G. Tests (Vitest)
Rewrite/extend: `getGenEdStatus.test.js` (31), `getGenEdSubCategory.test.js` (13),
`planCompleteness.test.js` (43), `transferCredits.test.js` (64), `poolResolver.test.js`,
`degreeBuilder.test.js`, `computePlanCredits.test.js`, `planExportModel.test.js`,
`slotSync.test.js`. New: category-solver feasibility (flex allocation), overlap counting,
legacy-vs-FF program selection by entry term, a **data test** that every course code in every
category exists and is active in the seeded catalog, and a template invariant test
(each template totals 120 and its gen-ed categories total exactly 41 given the major's restrictions).

### H. Docs / housekeeping
- **CLAUDE.md (root and `docs/claude/`) says "Texas Tech University (TTU)" — wrong.** The data,
  colors (purple #4F2984 / gold #FFDD00), and catalog are Tennessee Technological University.
  Fix both copies; update the "GEN_ED" sections, table list, migration "next tier" (currently says
  after 9; actual next is 21), the "Known Deferred Work" list (GEN_ED enforcement is no longer
  deferred), and the ROADMAP item that describes Texas-style "Creative Arts (3hr)" sub-requirements.
- `SCHEMA_PLAN_dynamic-degree-construction.md` Q8 (GEN_ED sub-requirement enforcement in the
  builder) is now answered: enforce by category.
- `MyDegreePlan_Site` / `local-deploy`: any copy that describes the legacy program or the wrong
  university should change (the site memory says no Tennessee Tech branding there — confirm
  that still holds; naming "Flight Foundations" is factual, not branding).

## 5. Suggested order (one branch per concern, per CLAUDE.md)

1. `docs/fix-university-name` — CLAUDE.md corrections (tiny).
2. `chore/catalog-importer` — promote scraper; produce normalized JSON + report; no app changes.
3. `migration/tier21-flight-foundations` — tables + profile columns + seed category data.
4. `feat/ff-pool-resolver` — `poolResolver` over data, category solver, full unit tests.
5. `feat/ff-templates` — CSC templates + `slotSync`/builder updates; 120-hr + 41-hr invariant tests.
6. `feat/ff-ui` — SlotModal/Dashboard/CompletionBadge/Wizard/PDF.
7. `feat/ff-prior-credits` — `test_equivalencies` re-routing, transfer logic, wizard.
8. `feat/catalog-full-seed` — full 6k-course seed + search/paging (enables other majors).

Steps 3–5 must land together before students see anything (templates and resolver must agree).

## 6. Decisions needed from you / the CSC department

1. **Confirm the FF-era CSC plan hours.** The published 2026-27 CSC B.S. page is still legacy-shaped.
   Proposed from the arithmetic above: Humanities 9→6 hrs (drop one GEN_ED slot), Digital Literacy
   via CSC 2220/2570 (overlap), science stays the 8-hr sequence, general electives 5→8. Is that what
   the department wants? HPC (no 2220/2570 requirement) needs an explicit Digital slot — and its
   hour balance differs.
2. **Science:** may CSC students use the newly eligible FF science courses (e.g. ASTR, BIOL 1010),
   or must they keep the listed CSC sequences? (I assumed: keep the sequences.)
3. **Legacy students:** support legacy and FF side by side (keyed on entry term), or move all
   current users to FF? Existing student rows need a defined backfill either way.
4. **Source of truth for the category lists:** I used the published gen-ed page, which conflicts
   with Coursedog's internal FF sets (§2). OK to treat the page as authoritative and re-scrape
   each catalog year?
5. **Variable/ambiguous credits:** PHYS 2110/2120 (4 vs 5), MUS 2080 (3 vs 2), DLED 2000 (1–3).
   Which number should the planner count?
6. **Scope of the course table:** import all 6,189 active courses now, or only what CSC + FF need
   first?
7. **Grade minimums** (ENGL 1010→1020 requires C): is a warning enough, or do you want a grade
   field in the model?
