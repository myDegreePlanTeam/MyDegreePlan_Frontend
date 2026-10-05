# PLAN — Align MyDegreePlan with Tennessee Tech "Flight Foundations"

Status (2026-10-05): **implemented** (2026-09-30 and since). This file now records what Flight Foundations requires, the problems in the
source data, and the rules the code encodes. The 2026-09-30 outline for building it (a `migration_tier21.sql`, `csc_*_ff.json` templates,
`prototype.json`, a step-by-step branch order) was removed on 2026-10-05: catalog years, degree specs and the no-new-migrations rule replaced
it, and git history has it. Do not follow a migration step from an older copy.

Sources: [Requirements](https://undergrad.catalog.tntech.edu/ugrequirements/requirements) ·
[Gen-ed course list](https://undergrad.catalog.tntech.edu/ugrequirements/gened) ·
Coursedog public catalog API (2026-2027 Undergraduate Catalog, id `WWGfWvyv8THZmZ6usuDv`).
Raw pulls live in `MyDegreePlan_Prototype/catalog_scrape/` (see "What I pulled" below).

---

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

API facts that matter for the ETL:
- **Credits are ranges**: `{min, max, operator: OR|TO|''}`. Lab/lecture combos report `min 0, max 4`
  (e.g. BIOL 1113, CHEM 1110, CSC 1300/1310/2310, GEOL 1040). Use `max` when `min` is 0 or operator
  is OR/TO — the existing app data has these as 4.
- **Prerequisites are free text**, not structured rules, for most courses
  (`requisitesSimple[].notes` HTML). The existing `prerequisite_entries` rows are hand-built; an
  automated catalog import needs a parser or manual review.
- **Gen-ed membership is not a course attribute** (`catalogAttributes` is empty on all 7,444
  records). It exists only on the gen-ed page and in "course sets". So category membership must be
  stored by us, seeded from the page.
- 33 codes appear twice (effective-dated versions) — dedupe by latest `effectiveStartDate`.

### Data-quality problems in the source (see "Decisions" below)
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
   the FF-era CSC plan — see "Decisions" below, item 1.
3. Page typos/omissions: GERM 1010, PC 2500, NURS 2600 have no credit hours; NURS 2400 title is
   truncated; ASTR 1010 and 1020 share a title; `ENGL/PC 2600` is a cross-list of two codes.
4. Credit disagreements page vs catalog: PHYS 2110/2120 (page 4, catalog 5), MUS 2080 (page 3,
   catalog 2), DLED 2000 (page lists 3/2/1 separately; catalog is a 1–3 variable course).
5. The DSAI concentration program record has narrative text only (no structured rules).

## What `src/lib/flightFoundations.js` encodes

- A pure module: the 8 requirement areas (41 hrs, 37 fixed + 4 flex), 97 eligible courses, `getGenEdProgram(season, year)` (Fall 2026+ is
  `flight_foundations`, else `legacy`), `evaluateFlightFoundations(entries)` and `evaluateFlightFoundationsForPlan(...)` (same argument order
  and dedup as `computePlanCredits`). Tests: `src/tests/flightFoundations*.test.js`.
- Rules encoded: per-category caps ("no more, no less"); flex hours only inside Humanities / Science / Literacy and capped at 4 total; a surplus
  cannot cover another category's minimum; a 3-hr cap on introductory foreign language toward Humanities; cross-listed ENGL/PC 2600 counts once.
- Not encoded (needs a decision or belongs with the majors): the American History exemption for some engineering majors, per-major
  restrictions, minimum grades, and the learning-outcome text. See "Gen-ed category enforcement" in `ROADMAP.md`.

## Decisions: where the 2026-09-30 questions stand

1. **The Flight Foundations CSC plan hours:** answered. The 2026-27 plans are the department's own degree maps (`CLAUDE.md`, "Programs, catalog
   years and gen-ed programs").
2. **Science:** answered. CSC plans keep the department's science sequences; SCIENCE sequences are shared across plans.
3. **Legacy and Flight Foundations side by side:** answered. They are keyed on the catalog year a student entered under (`catalogYears.js`);
   legacy students stay on legacy, and a program whose first plan is Flight Foundations shows an approximate-fit notice to earlier entrants.
4. **Source of truth for the category lists:** the published gen-ed page was used over Coursedog's internal sets. No record that the
   department confirmed it.
5. **Credit disagreements** (PHYS 2110/2120 4 vs 5, MUS 2080 3 vs 2, DLED 2000 1 to 3): open. The PHYS question is also in
   `PLAN_degree-map-pipeline.md`'s questions for the department.
6. **Course table scope:** answered. The full catalog (about 6,200 courses) is imported.
7. **Grade minimums** (ENGL 1010 before 1020 needs a C): open; see the same roadmap entry.
