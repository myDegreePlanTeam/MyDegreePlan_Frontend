# CLAUDE.md — MyDegreePlan Project Context

> This file is loaded automatically at session start (the workspace-root `MDP/CLAUDE.md` only imports it), so do not `cat` it
> again. Look things up with Grep or a Read line range. `migration_tier*.sql` and `rls_migration.sql` are history: skip them.

---

## Project Overview

**MyDegreePlan** is a web-based degree planner for Tennessee Technological University
(Tennessee Tech, abbreviated TTU) Computer Science students. It is a prototype commissioned by the
TTU CSC department. The target users are incoming and current TTU CSC students who need to map
out their remaining coursework across semesters. (Not Texas Tech: the catalog, course data and
brand colors are all Tennessee Tech's.)

**Tech stack**
- Frontend: React 19 + Vite 8 (uses rolldown as bundler — not classic Rollup)
- Routing: react-router-dom 7
- Data: **local-first by default**: the static course catalog (`src/data/catalog.json`) plus the student's plan in the browser's IndexedDB; nothing leaves the device. The self-hosted Docker stack (`local-deploy/`) instead uses Postgres + an API through `@supabase/supabase-js` (see "Data backends" below). No Node/Express server either way.
- Drag-and-drop: @dnd-kit/core + @dnd-kit/sortable
- Testing: Vitest 4
- Deployment: Vercel (static frontend only). The hosted Supabase project is no longer used by the frontend.
- No TypeScript — everything is plain JavaScript (.js / .jsx)

---

## Repository map

Four folders under `MDP/`: `local-deploy/` (Docker stack and signed releases; its own repo), `MyDegreePlan_Frontend/`
(React/Vite app; `src/{components,lib,lib/data,pages,tests,data}`, docs in `docs/claude/`), `MyDegreePlan_Prototype/` (catalog and
degree-spec pipeline, `seed.js`; its own repo) and `MyDegreePlan_Site/` (landing site). The annotated tree is in
[`REFERENCE.md`](./REFERENCE.md). `ls` and Glob find the rest.

**No more Supabase migrations.** `migration_tier{N}.sql` and `rls_migration.sql` in
`MyDegreePlan_Prototype/` are historical (tiers 6–21 were applied by hand in the Supabase Dashboard);
the hosted Supabase project is retired and **no new migration files are written** (the next tier
number is not "22"). A schema change goes in two places:

1. `local-deploy/setup/sql/000_baseline.sql`, idempotent (`ADD COLUMN IF NOT EXISTS`, which also
   reaches installs whose table already exists). The Docker setup container re-runs it on every start.
2. For a student table, the `STUDENT_TABLES` defaults in `src/lib/data/localClient.js`, so the
   local (IndexedDB) backend returns the column too. Add a test in `src/tests/localClient.test.js`.

Code that reads a new column should tolerate its absence (an install whose setup step has not re-run);
see `fetchFreeAddSlots` in `DegreePlan.jsx` for the pattern (retry the read without the column).

---

## Database

The schema is defined by `local-deploy/setup/sql/000_baseline.sql` (the Docker stack's Postgres) and
mirrored by the local backend's query engine (`src/lib/data/localClient.js`). The hosted Supabase
project is retired. The schema uses integer PKs for student tables and UUID PKs for `prior_credits`.
All catalog tables have public read RLS; student tables are scoped to `auth.uid()`.

### Tables

| Table | Purpose |
|---|---|
| `courses` | Course catalog: code, name, credits, description, subject_code, standing_req. `credits_max` (top of a variable-credit range, else NULL) and `requisite_text` (a prerequisite statement the planner could not turn into rules) |
| `prerequisite_entries` | Prerequisite rules: course_code, required_code, group_index, logic (AND/OR) |
| `corequisite_entries` | Corequisite rules: same shape as prerequisite_entries |
| `concentrations` | Degree **programs**: a major or a concentration of one (core, cybersecurity, dsai, hpc, ai, me ...). `kind`, `degree`, `major_name`, `department`, `supersedes`, `last_catalog_year`, `description`, and where it sits in the picker: `college` (a code), `major_code` (groups a major with its concentrations), `is_base` (the major itself, no concentration), `aliases` (search words) |
| `degree_plans` | One row per program per catalog year: `gened_program`, `total_hours`, `covers_earlier`. The index the app resolves a student's plan from |
| `requirement_slots` | A degree plan's slots: `catalog_year`, stable `slot_key`, `map_semester` (the department's recommended semester), `gened_program` |
| `student_profiles` | One row per student; anchors all student state; references `auth.users.id`. ACT scores plus `sat_math` (optional; either test, both or neither), `gened_program`, and `catalog_year` (the plan year their slots belong to, stored at onboarding) |
| `student_plan_slots` | Student's plan state per template slot: selected course, locked, archived, drag overrides. `selected_credits` is the hours chosen for a pick whose course carries a credit range |
| `student_semester_notes` | Per-student, per-semester notes (`completed_by_student` is no longer used) |
| `student_free_add_slots` | Courses the student added outside the degree template. `fills_slot_id` (nullable → `requirement_slots.id`, `ON DELETE CASCADE`) marks a follow-up pick that fills a Free Elective slot's open hours; NULL for ordinary "+ Add course" rows. `credits` is the hours chosen for an added course whose catalog entry carries a range |
| `prior_credits` | Transfer credits, AP/IB/CLEP credit, dual enrollment, placement scores |
| `test_equivalencies` | Exam-to-TTU-course mappings; drives the PriorCreditWizard. `option_key` marks an exam whose credit is one of several courses (AP Biology and Physics C: "PHYS 2010 or 2110"): rows of one exam sharing a key are one choice, and `lib/examOptions.js` picks the one the student's plan requires or the wizard asks |

### Programs, catalog years and gen-ed programs

A **program** is a row of `concentrations` (the table kept its name so stored plans stay valid; the app says
"program"): a `major` or a `concentration` of one. It carries `kind`, `degree`, `major_name` (what the picker groups
it under), `department`, `supersedes`, `last_catalog_year` (the last catalog year that may choose it; NULL = open) and
`description`. `degree_plans` has one row per program per **catalog year** (an academic year, `2026-2027` = Fall 2026
through Summer 2027): its `gened_program`, `total_hours`, and `covers_earlier` (a program's first plan also serves every
older year). Each plan's slots are `requirement_slots` rows with the same `catalog_year`, a stable `slot_key`, and
`map_semester` (the department's recommended semester, when published).

- A student is bound to the catalog of the year they **entered** (`academicYearOf(season, year)`) and follows the
  **latest plan not newer than it** in their program (`planForYear`). The year of the plan they actually follow is
  stored on `student_profiles.catalog_year` at onboarding and **never recomputed**: a student's `student_plan_slots`
  reference the slot ids of exactly one set, and adding a newer plan later must not move them.
- `student_profiles.gened_program` is still stored (the resolved plan's gen-ed program, `'legacy'` or
  `'flight_foundations'`). Profiles saved before catalog years read as `2025-2026` (legacy) or `2026-2027` (Flight
  Foundations) via `catalogYearForProfile`; the Docker baseline backfills the same way.
- **Which programs a student may choose is data**: open to their entry year (`last_catalog_year`) and with a plan for it
  (`availablePrograms`). Data Science & AI closed after `2025-2026`; a new major needs a `programs.json` entry and a
  spec, no frontend change.
- **The picker is college → major → concentration, and onboarding asks for the program first.** `lib/programBrowser.js`
  (`groupByCollege`, `searchPrograms`, `programPath`, `termUnavailableNote`) and `components/ProgramPicker.jsx` do it; Settings'
  change-program modal groups the same way. `src/data/colleges.json` is generated from the Prototype's `degree-specs/colleges.json`
  by `npm run build:catalog` (programs carry only the college code). A database that lacks the new columns still works: programs
  group by `major_name` under "Other programs". The start-term step asks one thing, the student's first semester at Tennessee Tech
  (year, then semester), and offers only the terms the chosen program has a plan for (`termChoices` in `catalogYears.js`; a program
  whose first plan is 2026-2027 starts at Fall 2026, and `termNotes` in `programBrowser.js` says so). There is no question about
  being a freshman, transfer or returning student: `curriculumTypeForTerm` derives `student_type` from the term (before Fall 2026 is
  `'returning'`, which the math chain reads; later is `'incoming_freshman'`, which only means the new curriculum, because the column's CHECK
  allows no other value). A closed program (DSAI) is behind "Show closed programs", which turns into "Hide closed programs" (hiding
  also drops a closed selection), and the step offers its replacement. Prior credit types, transfer credit included, are shown to everyone. The math sequence step is shown only
  when the plan includes Calculus I (`planHasMathChain`), and the degree builder applies the math placement chain only to such a plan
  (Business's MATH 1710 / 1530 are ordinary requirements). A program's first plan covers earlier entrants (`covers_earlier`); when that
  plan is Flight Foundations the fit is **approximate** (`isApproximateFit`): onboarding says so before they continue and the plan view
  carries a notice. A department map may print a semester up to 21 hours (`MAP_LOAD_MAX`, the overload ceiling) and still be used. The
  rollout of every Tennessee Tech major is `plans/PLAN_all-majors.md`; every program with a map is checked by `allMapsConformance.test.js`.
- Flight Foundations plans replace the six `GEN_ED` slots with fixed `HIST2010` + `HIST2020` and the pools `FF_SOCIAL`
  ×2 and `FF_HUMANITIES` ×2 (HPC also `FF_LITERACY`). English Literature is **not** a separate Flight Foundations
  requirement, so `ENG_LIT` exists only in legacy plans. SCIENCE sequences, COMM_REQ, MATH_STATS and the CSC pools are
  shared.
- The `2026-2027` plans are the department's own degree maps (Computer Science Core, Cybersecurity, High Performance
  Computing, and the new Artificial Intelligence major, which supersedes the Data Science & AI concentration). Each totals
  exactly 120 hours. A few questions to the department are still open and the plans carry them as recorded assumptions
  (`assumptions` in each spec; see "Degree plan pipeline" in `REFERENCE.md`).

### Constrained column values

**`student_plan_slots.archive_reason`**
```
'prior_credit'   — slot removed because a prior_credit covers it
'banner_import'  — reserved for future Banner transcript import (do not implement behavior yet)
```
`archive_reason = 'manual'` is intentionally omitted. Individual per-slot manual completion
is not implemented.

**`prior_credits.credit_type`**
```
'act_placement'   — ACT/SAT score gate; credits_awarded must be 0
'ap_credit'       — AP exam credit
'transfer_credit' — external transfer course
'test_out'        — CLEP or departmental exam
'ib_credit'       — International Baccalaureate
'act_credit'      — ACT exam credit (e.g. English score 27+ → ENGL1010)
'cambridge'       — Cambridge International exam credit
```

**`test_equivalencies.test_type`**
```
'ap_credit'
'test_out'
'ib_credit'
'cambridge'
'act_credit'
```

---

## Data backends

Components import `db` from `lib/dataClient.js` and call the supabase-js query chain (`db.from('t').select().eq()`, `db.auth.getSession()`); they do not know which backend answers. `lib/data/backend.js` picks one per page load:

| Backend | Chosen when | Data lives in |
|---|---|---|
| `local` (default) | no `window.__MDP_CONFIG__` | catalog: bundled `src/data/catalog.json`; student rows: IndexedDB in the browser |
| `remote` | the Docker web container served `/config.js` (sets `window.__MDP_CONFIG__`), or `VITE_DATA_BACKEND=remote` in dev | the Docker stack's Postgres, via PostgREST/GoTrue on the page's own origin |

Vercel needs **no settings**: with no `__MDP_CONFIG__` the app is local-first. `supabase-js` is only fetched on the remote backend (dynamic import in `dataClient.js`).

**Local backend facts**
- `lib/data/localClient.js` is not a general PostgREST emulator. It implements what the app calls (filters, `or`/`ilike`, order/limit, `single`, the `concentrations` to-one embed, insert/update/upsert/delete) plus the Postgres behaviour the app leans on: identity ids (never reused), schema defaults, unique constraints for `onConflict`, `ON DELETE CASCADE` from `student_profiles`, and the `PGRST116` / `23505` error codes. If a component starts using a query feature it lacks, it returns an error rather than a wrong answer; extend the engine and add a test in `src/tests/localClient.test.js`.
- Catalog tables are read-only. `src/data/catalog.json` is **generated and committed**: run `npm run build:catalog` (reads `../MyDegreePlan_Prototype`: `courses.json`, `degree_plans.json`, `test_equivalencies.sql`; writes `catalog.json`, `catalog.descriptions.json` and `pools.json`) after any seed-data change, commit the result, and redeploy. It holds the **full** Tennessee Tech catalog (~6,200 courses). A course's description is inline only when a template, pool or exam equivalency names it; the other ~5,000 live in `src/data/catalog.descriptions.json`, which the engine fetches the first time a query asks for a description a row lacks (`LocalDb.hydrateDescriptions`). `courses.json` itself is generated in the Prototype repo (`node catalog/build_courses.mjs`; see "Course catalog pipeline" in `REFERENCE.md`). Slot ids stay stable across regenerations via the prototype's `planSlotSync`, so stored plans keep pointing at the right slot. Courses that exist only through a migration (currently MATH1000) are listed in `scripts/catalogLib.mjs`.
- One implicit user per device: no sign-in, `db.auth` is a stub. Login/Signup are only reachable on the remote backend.
- Plans do not sync between devices and can be lost if the browser clears site data. Settings has Export / Import / Erase (`DeviceDataCard`, `lib/data/backup.js`); the first onboarding step offers Import for a new device. Backups are format-versioned and drop rows that point at slots the current catalog no longer has.
- `db.local` (export/import/erase, `persistent`) exists only on the local client.
- The plan view's undo stack (20 records, plain data) is kept in localStorage per profile (`lib/undoStore.js`, key `mdp.undo.<profileId>`) so Undo
  survives a reload. It is dropped when a record is over 30 days old, when the profile's program or catalog year differs from the one it was saved
  under, when a record's slot or added course no longer exists (checked on load and again when undoing), and on Erase and Import (the local backend
  reuses profile ids after an erase). A new undo record type must be added to `isUndoApplicable`, or it is never applied. Storage may be blocked: it is
  guarded everywhere.
- A new column on a student table needs its default in `STUDENT_TABLES` (`localClient.js`) as well as in `000_baseline.sql`.
- Docker's stack and `seed.js` still serve the remote backend; its schema is `setup/sql/000_baseline.sql` (see "No more Supabase migrations" above).

---

## Docker stack and releases

`MDP/local-deploy/` is a **separate git repo** (`myDegreePlanTeam/MyDegreePlan_Deploy`); its README is the full reference. (A stale copy once sat under `MyDegreePlan_Prototype/local-deploy/`; it was deleted 2026-10-01. If an old checkout still has one, ignore it.)

**Release process** (students get it through the in-app Update button):
1. Merge the Frontend / Prototype / Deploy changes to `main` and push. The workflow builds `main` of Frontend and Prototype unless `frontend_ref` / `prototype_ref` say otherwise.
2. Run `bash release-tools/preflight.sh <version>` from `local-deploy/`. It checks that the sources are on origin/main, the
   version is free (versions are immutable), no stale Release run is holding the `release` lane, and the Frontend tests pass
   in a fresh clone with no Prototype sibling, as the workflow's test job runs them; details in the Deploy README under
   "Shipping a release". It publishes nothing.
3. Deploy repo → Actions → **Release** → Run workflow (`gh workflow run release.yml -f version=… -f notes=… -f required=false`). `notes` is student-facing: it is what they read in the update prompt. Use `required` only for urgent fixes: it blocks older installs.
4. To see where the run stands, `bash local-deploy/tools/release_status.sh [--wait]` (in the background with `--wait`: it takes 4 to 5 minutes; exit 0 once
   Publish and Verify succeeded, which is before the run's cleanup steps end). CI runs the tests, builds four multi-arch images to GHCR pinned by digest, signs the release (`MDP_SIGNING_KEY` in the `release` environment), publishes it, then re-downloads and verifies it. Approve it if the environment asks for a reviewer.
5. Installs offer the update on their next start or within about 6 hours; a failed update rolls back automatically.
---

## Environment Variables

### Frontend (`MyDegreePlan_Frontend/.env.local`)

| Variable | Purpose |
|---|---|
| `VITE_DATA_BACKEND` | Optional. `remote` makes `npm run dev` use an API instead of the local-first backend (needs the two variables below). Never needed on Vercel. |
| `VITE_SUPABASE_URL` | Only for `VITE_DATA_BACKEND=remote`: Supabase-compatible API URL |
| `VITE_SUPABASE_ANON_KEY` | Only for `VITE_DATA_BACKEND=remote`: anon (publishable) key |

### Prototype seed script (`MyDegreePlan_Prototype/.env`)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (same project as frontend) |
| `SUPABASE_SERVICE_KEY` | Service role key — bypasses RLS; used only for seeding, never in frontend |

---

## Branch and Commit Convention

See [`README.md`](./README.md) for branch prefixes and commit types. Additional rules:
- One branch per logical concern; never commit broken code
- Run `npm run test` (from `MyDegreePlan_Frontend/`) before every commit
- `main` is always deployable

---

## Test Protocol

- **Test runner:** Vitest 4
- **Run with:** `npm run test` (from `MyDegreePlan_Frontend/`). `npm run verify` runs lint, tests and the build and prints one line each
  when green (failures come with their names and the first lines of the error); `-- --skip-build` leaves out the build.
- **Watch mode:** `npm run test:watch`

**Test file locations:**
- `src/tests/[featureName].test.js` — primary suite
- `src/lib/__tests__/[featureName].test.js` — collocated lib tests

`ls src/tests src/lib/__tests__` is the current list (no counts here: they went stale every phase). `npm test` in the Prototype repo (a terse reporter: two lines when green; `node --test --test-reporter=spec` lists every test)
covers the catalog parser and build, the degree-spec validator and slot sync, and the degree-map extractor. `poolRemainder.test.js` covers the Free Elective bucket and its effect on semester
totals and standing; `planExportModel.test.js` covers the PDF side.

`docsReferences.test.js` fails when a link, or a pointer that says to see a named section, in the instruction docs names something that is not there.
The workspace tools in `local-deploy/tools/` have their own suites: run them all with `bash local-deploy/tools/run_tests.sh` (parallel, one
line per suite, about 90 s) instead of chaining the individual `test_*.sh` scripts, which run past a tool timeout.
All existing tests must pass before any commit. New tests go in `src/tests/[featureName].test.js`. Before a commit also run
`npm run lint:changed` (eslint on the files you changed; prints one line when clean). `npm run hooks:install` (once per clone)
turns that into a pre-commit hook on the staged files; it does not run the tests.
`npm run typecheck` (TypeScript's checker, a pilot; the app stays plain JS) reports errors only in the modules listed in
`tsconfig.typecheck.json`, each of which starts with `// @ts-check`; fix what it reports with JSDoc, never a runtime change. It is
not part of `verify`; `src/tests/typecheck.test.js` keeps the listed modules clean.

---

## Reference (read on demand)

[`REFERENCE.md`](./REFERENCE.md) holds the annotated repository tree, the course-catalog and degree-plan pipelines, and one section
per `src/lib` module (prereqChecker, transferCredits, validatePriorCredit, plannerCatalog, mathPlacement, creditHours,
courseKinds/courseSearch/dbErrors, poolResolver, poolRemainder, flightFoundations, catalogYears/requirementSlots,
classifyPrereq, requirementMap, removedPrereqs, degreeBuilder, usePlanCompleteness). Grep for the module's `###` heading and read
that section before changing the module. Rules that must hold even if you do not open it:

- `checkPrereqs`'s signature never changes (optional params only). Prereqs use prior-semester codes, coreqs use same + prior; OR groups short-circuit.
- `resolveTransferCredits`: a prior credit's `satisfies_course_code` archives only the non-pool slot with that code; a pool slot is archived only by `satisfies_pool`; unmatched credits archive nothing; one credit archives at most one slot (keyed on `pc.id ?? pc`).
- `computePlanCredits`: a course counts once (prior credits, then plan slots, then free-add). `validatePriorCredit` runs before every prior-credit INSERT.
- Never read `courses`, `prerequisite_entries` or `corequisite_entries` whole (the Docker API caps a response at 1000 rows): use `plannerCatalog`.
- Prereq/coreq maps are built only by `buildRequirementMap`. The `courseMap` given to `buildDegreePlan` must include `standing_req`.
- Pools are data (`src/data/pools.json`, generated); key order matters. A Free Elective slot is an hours bucket: use `getPoolRemainder` and pass every free-add row.
- A course with a credit range gets the student's hours through `applyChosenHours`; never read its raw `credits`.
- `mathPlacement.js` is the one copy of the math placement table; `MyDegreePlan_Prototype/math_sequences.json` mirrors it, so change both.
- `classifyPrereq`'s `prereqCode` parameter is unused on purpose; do not remove it.
- A slot key is a slot's identity: never rename or reuse one. `catalog.json` and `pools.json` are generated (`npm run build:catalog`, then commit);
  degree plans are generated from `degree-specs/` (`node degree-specs/build.mjs`); `regen.sh` runs the whole chain (see "What to Do at the Start of Every Session", step 11).

---

## Working-method gotchas

- **Edit input and backslashes.** The Bash tool delivers two typed backslashes as ONE (checked 2026-10-02 with `printf` and
  `od -c`; the Write and Edit tools keep both). So in a Python or node script typed into a Bash command, two backslashes before
  `n` write a real newline, before `d` lose the backslash, and before `b` make a backspace: it broke two test runs, put
  backspace characters into source files, and made a counting regex count single backslashes. Put a script that needs a
  literal backslash in a file with the Write tool and run it, or build the character with `chr(92)` / `String.fromCharCode(92)`;
  `guard_bash.mjs` blocks a command with two backslashes before an escape character in a Python or node script. A single
  `\b` or `\d` typed inside an edit script can also reach the file as a backspace character or as a bare `d`. Write `[0-9]`
  instead of `\d`, `chr(92)` for a backslash, and prefer
  `local-deploy/tools/multi_replace.py`, which refuses control characters. `src/tests/sourceHygiene.test.js` (Frontend) and
  `sourceHygiene.test.mjs` (Prototype) fail on any control character below 0x20 in source; the second one caught a
  real `/^\s*none<BS>/` in `catalog/prereqParser.mjs`. A dropped backslash is not a control character, so check the
  written line (`sed -n Np file | cat -A`) after editing a regex. To change text that contains a backslash or an escaped
  newline, use the Edit tool, not `sed`, `node -e` or a nested heredoc (they re-escape it, and a heredoc inside a heredoc
  hangs the shell until the timeout). A long edit or a setup script (backticks, apostrophes, several heredocs in one call)
  goes through the Write or Edit tool, never a Bash heredoc: a `multi_replace` heredoc full of quotes failed to parse on
  2026-10-03 and again on 2026-10-05. An empty heredoc fed to `python3 -` is the worst case here: Python 3.13 starts its
  interactive prompt and loops (20 MB of output). A PreToolUse hook (`local-deploy/tools/guard_bash.mjs`, wired in
  `MDP/.claude/settings.json`) now refuses that, an unclosed heredoc and a bare `python`/`node` before they run; put
  `# guard_bash: allow` in a command to run one deliberately.
- **Before archiving, moving or deleting work, look in every place it can live:** `git stash list` (`mdp_status.sh` prints the
  count; `git stash show STASH` the files), local branches, untracked files and the remote. Concluding "never added" or "exists
  nowhere else" from one file went wrong on 2026-10-02: an archive README said the Capacitor packages were never added to
  `package.json`, and a stash held exactly that install.
- **Before proposing tooling or automation, read `local-deploy/tools/README.md`** (and `ls` the folder). Tools get built in
  other sessions and the CLAUDE.md and memory loaded at session start can predate them: on 2026-10-02 the first answer proposed a
  session-start status script and a CLAUDE.md drift check that already existed.
- **Driving onboarding in the browser pane** (no screenshots: they time out while the pane is hidden). The pane keeps a
  saved plan per origin, so Onboarding only shows on an origin with none. For any check that creates a plan, start the
  `MyDegreePlan-verify` dev server (port 5175, in `MDP/.claude/launch.json`): nothing is saved there, and 5173 and 5174 hold
  plans that are not Claude's to erase (do not add and remove a temporary launch.json entry each time). React ignores a plain `el.value = x`; use the native setter
  and dispatch an event. Pick the **year before the season**: changing the year clears the season. **Pass the `tabId` that
  `preview_start` returns to every browser call** (and `tabs_select` it): without it a call runs in whichever tab is fronted, which
  can be another site (two calls ran on claude.ai on 2026-10-08). Verified 2026-10-08; paste this once per page load, then call it:

  ```js
  const sleep = ms => new Promise(r => setTimeout(r, ms))
  const setVal = (el, v) => {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  }
  const btn = t => [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes(t))
  const until = async (f, tries = 40) => { for (let i = 0; i < tries && !f(); i++) await sleep(300); return f() }

  // Onboarding to a built plan. search finds the program, program is the result to click (a major with concentrations shows
  // .concentration-card buttons; the search box is the first input on step 1). Step 2 is year, then semester (limited to what
  // the program has a plan for). Step 3 has 6 input.onboarding-input in the order ACT Math, English, Science, Reading,
  // Composite, SAT Math; step 4 (the math sequence) appears only if the plan has Calculus I, so Continue is clicked if it is there.
  async function mdpOnboard({ search = 'Cybersecurity', program = 'CSC Cybersecurity', year = '2026', season = 'Fall', actMath = '29' } = {}) {
    await until(() => document.querySelector('input[type=search]'))
    setVal(document.querySelector('input[type=search]'), search); await sleep(300)
    btn(program).click(); await sleep(200); btn('Continue').click(); await sleep(300)
    setVal(document.querySelectorAll('select.onboarding-select')[0], String(year)); await sleep(150)
    setVal(document.querySelectorAll('select.onboarding-select')[1], season); await sleep(200)
    btn('Continue').click(); await sleep(400)
    setVal(document.querySelectorAll('input.onboarding-input')[0], String(actMath)); await sleep(100)
    btn('Continue').click(); await sleep(400)
    btn('Continue')?.click(); await sleep(400)
    ;(btn('Build my degree plan') ?? btn('later')).click()
    return until(() => document.querySelector('.ds-sem'))   // the plan grid has rendered
  }

  // Start over: delete the origin's IndexedDB and localStorage, and reload (the open page blocks the delete, which finishes on
  // the reload; the functions above are gone after it, so paste them again). Verified 2026-10-08: Onboarding shows again.
  async function mdpErase() {
    for (const d of await indexedDB.databases()) await new Promise(r => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r() })
    localStorage.clear()
    location.reload()
  }
  ```

  The short sleeps let React re-render between steps. To start over use `mdpErase()` (or Settings, Erase data). **Close the other
  tabs of that origin first**: a delete blocked by another open tab stays queued and every later open of that origin hangs on the loading
  skeleton until that tab is closed (it cost a session on 2026-10-02). Screenshots worked with the pane open.
- **Paths and the shell's working directory.** The Bash tool's working directory drifts after any `cd`, so a relative path or
  `git -C <relative folder>` from an earlier call fails ("cannot change to ..."). Start every Bash call with
  `cd /c/Users/brady/github/MDP/<folder> &&`, or use absolute paths. This line alone did not hold (six failures on 2026-10-02,
  10-03 and 10-05), so `guard_bash.mjs` now blocks a relative path that is missing in the shell's directory but exists under
  `MDP/` or one repo folder, and its message names the folder.
- **No `git stash` in a verification chain.** A stray `git stash` in a test command moved staged work out of the tree, and
  the Frontend checkout can hold another session's stash. Verify without stashing: a clean checkout or a `git worktree`.
- **Line endings.** With `core.autocrlf` the working copies are CRLF while the index is LF, and a grep for a carriage return
  can report 0 on a CRLF file. Check with `git ls-files --eol <file>` (`i/lf w/crlf`), and edit through `multi_replace.py`, which keeps CRLF.
- **Cross-repo PR references.** Open the PR that another PR will cite first (`open_pr.sh` prints its URL), then quote that
  number. A number guessed in advance was wrong once and had to be corrected after the PR was created.

## Working agreements

- **Scope.** Do only what was asked. Do not silently generalize a fix from one course or program to others: name them and ask. If a change should
  cascade, list the cascade and wait for a go-ahead.
- **Doubt.** If you do not know something about Tennessee Tech's catalog, the schema or an earlier decision, say so and ask; do not guess. Prefer
  pasted primary material (the file, the error, the catalog page) to a description of it. Asking is not the only step: before
  saying what a doc, a plan or an earlier decision says, grep it (a plan's "answered" question was stated from memory on
  2026-10-05 and was wrong), and quote a number from a script or a file, not from memory.
- **Branches that touch one file.** When a plan has several branches and two of them edit the same file (a wizard, `DegreePlan.jsx`), say so
  in the plan and merge them back to back, each rebased onto the last, instead of opening them in parallel: six parallel branches
  on 2026-10-08 hit three rebase conflicts, about two turns each. `git rebase --onto origin/main <old base>` moves a stacked branch
  after its base was squash-merged.
- **Data is load-bearing.** Students will rely on the curriculum data. Edit the source (specs, overrides, the inputs to `courses.json`),
  regenerate, and call out any entry that disagrees with the catalog; never hand-edit a generated file.
- **Docs follow the code.** When a doc and the code disagree, the code wins: say so, and fix the doc in the same PR.

## Core Principles (read before every session)

1. **The degree plan grid shows only what a student still needs to complete.** Archived slots
   (covered by prior credits) are removed from the grid entirely.

2. **Archiving is only triggered by prior credits** (`archive_reason = 'prior_credit'`) or
   reserved for future Banner import (`archive_reason = 'banner_import'`).

3. **Progress is derived from the calendar, never marked.** A course in a past term counts as passed, one in the current term
   is in progress, one in a later term is planned (`lib/termPhase.js`; Summer sits between Spring and Fall). There is no per-course or
   per-semester completion toggle: a student who did not pass a course removes it or moves it to a later term (a retake), and past
   semesters start collapsed. `student_plan_slots.status`, `student_free_add_slots.status` and `student_semester_notes.completed_by_student`
   are no longer read or written by the plan view; the columns stay so stored data and backups still load. Prerequisites and standing
   never read completion: they read a course's position in the plan.

4. **`credits_awarded` on `prior_credits` is always read from `test_equivalencies`** and is
   never user-editable when a `test_type` and `course_code` are selected in the wizard.

5. **OR logic in both `prerequisite_entries` and `corequisite_entries` must short-circuit**
   when any one member is satisfied.

6. **`checkPrereqs` uses `completedCodes` (prior semesters only) for prerequisites** and
   **`checkCoreqs` uses `availableCodes` (same semester + prior) for corequisites.**

---

## Deferred Work

See [`ROADMAP.md`](./ROADMAP.md). Do not implement roadmap items without explicit instruction.

---

## What to Do at the Start of Every Session

1. This file is already loaded: do not re-read it
2. Read the relevant source files before writing any code — do not assume file contents
3. Do not write a migration file (no more Supabase migrations). A schema change edits `local-deploy/setup/sql/000_baseline.sql` and the `localClient.js` defaults; see "No more Supabase migrations"
4. Run `npm run test` from `MyDegreePlan_Frontend/` and confirm all tests pass before making changes
5. Create a branch before starting work — never work directly on main: `bash local-deploy/tools/start_branch.sh <repo-folder> type/short-name`
   from `MDP/` (fetch, fast-forward `main`, branch from it; it refuses on uncommitted tracked changes or a name already taken)
6. Do not assume file names or function signatures — use Glob/Grep to find them
7. For exact-text edits across several files, or in CRLF files, run `local-deploy/tools/multi_replace.py` from the `MDP/` folder
   (`python local-deploy/tools/multi_replace.py - <<'EOF'`; `--dry-run` previews). Format: one `@@@ file PATH` line per file, then
   any number of `@@@ old` / `@@@ new` pairs for it (a second `@@@ file` for the same path is merged in the order written, with a
   note; a trailing `@@@ old` with no `@@@ new` makes the whole call write nothing). **A spec that is long, or has apostrophes,
   backticks or backslashes, goes in a file written with the Write tool and run as `multi_replace.py PATH`, not in a heredoc**
   (a heredoc spec failed to parse on 2026-10-03, 10-05 and 10-08, and each time cost seven or more turns of throwaway Python
   scripts). To delete a long stretch without retyping it, use `@@@ cut` (the text where it starts) and `@@@ until` (the text where it
   stops, kept): both must match once. Use it instead of writing a throwaway script: it writes nothing unless every edit matches, keeps CRLF and refuses control
   characters. The tools live in `local-deploy/tools/` (its README lists them) and are tracked in the Deploy repo.
   For a **structural** JSON edit (a catalog override, a manifest decision, a vocabulary entry) run
   `node local-deploy/tools/json_patch.mjs SPEC|- [--dry-run]` instead: ops `set` / `add` / `replace` / `remove` / `merge` / `test` on
   RFC 6901 paths (`/courses/CSC2400/why`, `/slots/-`), all-or-nothing, indent / EOL / BOM kept. It refuses a file whose
   layout `JSON.stringify` would not reproduce (the generated specs under `degree-specs/<dept>/`, `catalog/equivalents.json`:
   inline arrays), so edit those with `multi_replace.py`. The Deploy repo's CI runs the tools' tests.
8. To open a PR, commit on a branch (explicit paths, never `git add -A`), then run
   `bash local-deploy/tools/open_pr.sh <repo-folder> --title "type(scope): text" --body-file - <<'EOF'` from `MDP/` (the body on stdin: no
   temp file to write and delete; `FILE` also works): a dry run that prints
   the plan; add `--yes` to push and create it (never forced; refuses on `main`, with no new commits, or if a PR is already open).
   To finish a PR (wait for CI, squash-merge, fast-forward local `main`, delete the local branch), run
   `bash local-deploy/tools/finish_pr.sh <repo-folder> <pr> [--dry-run]` from `MDP/`. It deletes the branch only if its tip
   is the merged head, and keeps it (saying how many commits it holds beyond the PR) otherwise. `ccd_pr get_status` reports
   only the session-bound PR: use `gh pr checks <n> --repo <owner/repo>` for a PR in another repo.
9. To see where every repo stands (branch, dirty files, behind/ahead `origin/main`, PR state, which local branches are safe to
   delete), run `bash local-deploy/tools/mdp_status.sh` from `MDP/` once instead of several `git status` / `log` / `branch` calls.
   Quote branch and commit counts from it or from git, not from memory. It is read-only.
10. To see where tool-output tokens go (by category, against the recorded baseline) and whether an earlier retro fix held, run
   `node local-deploy/tools/token_audit.mjs --check-log` from `MDP/` (read-only; `--record --label NAME` appends a row to
   `.claude/retro/metrics.tsv`). When a logged friction gets fixed, the retro appends a `FIXED` line to `.claude/retro/log.md`.
11. After a change to seed data (a course override, a spec, `pools.json`, an exam equivalency), run
   `bash local-deploy/tools/regen.sh` from `MDP/` instead of the three generators by hand. It runs `build_courses.mjs`, then
   `degree-specs/build.mjs`, then `npm run build:catalog` (about 3 s), and lists which of the five generated files changed and
   what to commit where (Prototype first). `--check` restores every file and exits 1 if a committed one is stale. It never
   commits, and the network scrape (`catalog_scrape/scrape_catalog.mjs`) is not part of it. Its changed/unchanged verdict is a
   byte comparison: trust it over `git status`, which shows the Frontend's `src/data/` as modified under `core.autocrlf` when
   it is not.
