# PLAN — Redesign: design system and screens

Status (2026-10-13): **Built.** Phases 1 to 8 are merged (Frontend PRs 104 to 115); Phase 9, the cleanup, is the PR that carries this note. The owner accepted the recommended answers to the five open questions on 2026-10-13 and asked for every phase to be built and merged the same day.
What was built differs from the phases below in the ways listed under "What differs from this plan" at the end. Still open: the landing site (its own repo), the app icon, the board images, and the department's word on
"Advising", "Plan check" and "semester". Source: the owner's request of 2026-10-13 for a full redesign.
Design source (private, ask the owner for access): the Claude Design canvas "MyDegreePlan Redesign", <https://claude.ai/artifact/K9ud856hidymk75QEE2Vrb>.
Related: [`ROADMAP.md`](../ROADMAP.md) ("Grid redesign: what is left", "App icon"), [`PLAN_double-major-minor.md`](./PLAN_double-major-minor.md),
[`parity/README.md`](../../../parity/README.md).

## Goal

Make the app calm, readable and easy to follow, on web, the Windows app and Docker, at desktop and phone width, in light and dark, **without changing what
it computes**. No schema change, no change to prerequisite, audit or placement logic. The redesign is a new look, new wording, a shorter first run and a
plan screen that leads with "where am I and what is next".

## What the design decides (the short version)

The canvas has the full detail: an inventory and baseline captures, then four boards of rules (philosophy, color, type and components, language and flow),
then redesigned screens (Plan, Settings, first run, Requirements). The rules the code has to honor:

1. **Palette.** Violet is the quiet background and the one brand color. Five status colors (done, in progress, planned, needs attention, blocked), each with an
   icon and a word, never color alone. Gold shrinks to a small "now" marker (fill only). Every pair is measured: text 5.4:1 or better, input borders 3.8:1 or
   better, focus ring 11:1 or better. Light and dark are designed together. The values are on the Color board.
2. **Type.** Atkinson Hyperlegible for the interface, DM Serif Display for page and dialog titles only, DM Mono for course codes only. Body 16 px, nothing under 13 px,
   sentence case, no all-caps labels.
3. **Targets and focus.** Controls at least 44 px, a 3 px focus ring on every control, no feature that works only by dragging.
4. **Wording.** "Semester", "course", "pick", "hours" (never "cr"), "Plan check" (not Issues or Validation), "Advising" (not Advisement), "Not in the planner yet" (not
   Coming soon). Problems say what, why and what next. Full list on the Language board.
5. **Flow.** Four destinations (Plan, Requirements, Advising, Settings), a bottom tab bar on phones. The plan leads with the finish date and a Plan check strip.
   First run goes from six screens to four and ends on a "Your plan is ready" preview.

## What is true today (checked in the code, 2026-10-13)

**Styles.** About 4,400 lines in seven stylesheets: `Dashboard.css` 2,938 (onboarding, plan, modals, wizard), `AppShell.css` 897, `Auth.css` 206, `UpdateBanner.css` 137,
`ProgramPicker.css` 139, `ErrorBoundary.css` 101, `index.css` 105 (the tokens). Tokens are `--bg`, `--text`, `--gold`, `--danger`, `--status-*`, plus aliases `--navy`,
`--white`, `--muted` marked "do not remove" and about 15 `--ds-*` values. `--gold` is read in 8 files and does eight jobs today (brand, eyebrows, links, active tab,
semester names, primary buttons, planned progress, warnings). Of 121 `font-size` rules in the four main stylesheets, 101 are 12 px or smaller and 9 are 16 px or larger.

**Fonts are not bundled, and in the Windows app they never load.** `index.html` loads DM Serif Display and DM Mono from Google Fonts. The desktop app's policy is
`font-src 'self' data:` and `connect-src 'self' blob: data:` (`MyDegreePlan_Desktop/src/security.js`), so there the fonts fall back to system faces. The landing
site also says the planner "contacts no analytics, fonts, or ad services". Self-hosting fixes both, and the redesign needs it anyway.

**Theme.** `App.jsx` reads `localStorage.theme` (`light` or `dark`), else the device preference, else dark. `DegreePlan.jsx` `toggleTheme` flips it. There is no
"match my device" state, and no early script, so a stored light theme can flash dark on load.

**Navigation.** `Sidebar.jsx` `TABS`: Plan, Requirements, Issues (count badge), Advisement, Settings. At 760 px or less (`PHONE_QUERY` in `lib/dragEnabled.js`, the
breakpoint in `AppShell.css`) the sidebar becomes a top bar that hides its last tabs.

**Issues are mostly open picks.** `lib/planIssues.js` builds one issue per unfinished pick (`Incomplete selection: X`), `info` unless a later course depends on it, then
`warning` (`dependents.length > 0`). On the sample CSC Cybersecurity plan all 12 issues are open picks: 11 `info`, 1 `warning` (Communications, needed by CSC 3040). So
the "Plan check" strip is a **grouping of data that already exists**; no new engine is needed.

**Two dialog systems.** Shell dialogs use `ds-modal` (`SettingsView.jsx`, `AddProgramModal.jsx`, `WhatIfPanel.jsx`, the conflict dialog in `DegreePlan.jsx`). `SlotModal.jsx`,
`AddCourseModal.jsx` and `PriorCreditWizard.jsx` use `modal-backdrop`, `modal-title` and `onboarding-btn-*`.

**Tests have no DOM.** `terminology.test.js` says it: "The Frontend has no DOM test environment, so these read the source." There is no jsdom, no testing library and
no axe. Anything visual is checked in the `parity/` Playwright harness.

**The parity run pins the UI.** `parity/lib/scenario.mjs` finds things by class and exact text: `.ds-sidebar`, `.ds-main`, `.ds-modal, .modal-backdrop`, `.program-college`,
`.program-major`, `.concentration-card`, `select.onboarding-select`, `input.onboarding-input`, `.ds-sem`, `.ds-tab`, `.ds-adv-doc`, `iframe.ds-pdf-iframe`, and the text
"When do you start?", "Test Scores", "Any prior credits?", "Build my degree plan", "Four-Year Plan", "Degree audit" and an "Earliest finish" pattern. A renamed class or
reworded heading fails the run until the scenario is updated in the same PR.

**Counts of what pins wording today.** "Advisement" appears in 2 test files, 2 parity files and 7 source files; "Issues" in 5, 6 and 9; "Coming soon" in 3 tests and 6
source files; `.ds-tab` and `.ds-sem` in 1 test, 1 parity file and 4 source files each.

## What the canvas needs that the app cannot do yet

| Design element | Where it lives | Work |
|---|---|---|
| Self-hosted fonts, three families | `index.html`, new `public/fonts/`, `index.css` | Add woff2 files and `@font-face`; drop the Google links |
| Tokens per role, light and dark | `index.css`, `AppShell.css`, `Dashboard.css` | New semantic tokens; migrate usages by role, not by value |
| "Match my device / Light / Dark" | `App.jsx`, `DegreePlan.jsx`, `SettingsView.jsx`, `index.html` | Three-state preference; early inline script against flash |
| "You finish Spring 2030", "83 of 120 hours planned" | `DegreePlan.jsx` plan header | Reads `graduation` and `creditTotals`, which exist |
| Plan check strip, "Start with Communications" | `lib/planIssues.js`, `IssuesView.jsx` | New pure helper `lib/planCheck.js` over the issues; tests |
| Status on the semester header, plain rows | `Semester.jsx`, `AppShell.css` | Remove per-row dots and chips except exceptions; header chip from `semesterPhase` |
| Later semesters collapsed by default | `DegreePlan.jsx` (`semesterExpanded`) | Default open only for the current and next semester |
| Row "more" menu with "Move to…" | `Semester.jsx`, `CoursePanel.jsx` (mode `move`) | Menu button per row; reuse the move list; sheet on phones |
| Details panel that pushes content | `CoursePanel.jsx`, `AppShell.css` | Layout change, not a new panel |
| Bottom tab bar on phones | `Sidebar.jsx`, `AppShell.css` | Same component, second layout |
| Plan check opens the Issues list | `DegreePlan.jsx` `view` | Keep view `issues`, remove it from the nav, open it from the strip |
| One dialog (desktop dialog, phone sheet) | new `components/Dialog.jsx` | Focus trap, Esc, return focus; migrate 3 modals |
| Four-step first run, search-first picker | `Onboarding.jsx`, `ProgramPicker.jsx`, `lib/programPicker.js` | New step list, one major screen with inline concentration |
| "Your plan is ready" preview | `Onboarding.jsx` `handleComplete` | Split "build the plan" from "save it" so the preview can show the finish before anything is written |
| "Show the rest" for programs not in the planner | `ProgramPicker.jsx` | Replaces "Show closed programs" |
| "hours", never "cr" | many | One wording pass, pinned by a new source test |

## Plan: phases

Each phase is screen-complete: after it merges, `main` has no half-restyled screen. Phases 2 to 5 touch `DegreePlan.jsx`, so they merge back to back, each rebased on the
last (the rule in `CLAUDE.md`, "Branches that touch one file"). Keep the existing `.ds-*` class names as hooks wherever an element's job is unchanged, so the parity run
and the tests change less; restyle by tokens, not by renaming.

### Phase 0 — Decisions (no code)

**Taken on 2026-10-13** (the owner accepted the recommendation on each):
1. **Color.** Violet is the one brand color; gold is retired as a general color and kept only as a small "now" marker. The owner did not say gold is required branding.
   Revisit only if the department objects: gold would then stay as a small accent and the rest holds.
2. **Navigation.** Four destinations (Plan, Requirements, Advising, Settings). Issues folds into the Plan check strip and opens the same list.
3. **First run.** Four steps (major, start, scores and credits, plan ready).
4. **Rollout.** Phase by phase, straight to `main`, no long-lived branch and no feature flag (a flag would need two copies of the CSS). Each phase is screen-complete.
5. **Landing site.** Not in the same release. It follows in its own repo and PR, after Phase 9, with the same tokens and fonts.
6. **Fonts.** Atkinson Hyperlegible, DM Serif Display and DM Mono, committed as woff2 files under `public/fonts/` (SIL Open Font License, so the license files ship with them).
7. **PDFs.** The degree map and degree audit keep the department's form and are **not** restyled.

**Still open, and not the owner's to settle alone:**
- Vocabulary: "semester", "Advising", "Plan check", "Not in the planner yet". The department should confirm "semester" and "Advising" before Phase 2 ships them; until
  then they are the working words.
- The approved canvas boards should be exported as PNGs into `docs/claude/design/` so the reference outlives the private link. The canvas's own export has to do this
  (it cannot be scripted from here): the owner exports, and the PNGs go in with the Phase 1 PR.

### Phase 1 — Foundations (1 PR, one visible fix)

- Add `public/fonts/` and `@font-face` for the three families; remove the Google Fonts links from `index.html`. **The Windows app gets its real fonts for the first time**, and
  the "no fonts service" claim becomes true. Keep the old families as the fallback stack until Phase 2.
- Add the semantic token layer to `index.css`: surfaces, hairline, strong border, three text levels, primary, link, focus, five statuses with tints, marker, for light
  and dark. Nothing consumes it yet except the new type scale variables. Do **not** change `--gold` or the aliases yet.
- Theme: a three-state preference (`system`, `light`, `dark`), an early inline script in `index.html` to set `data-theme` before first paint, `App.jsx` and
  `toggleTheme` updated. A stored `light` or `dark` keeps working.
- Tests: `src/tests/designTokens.test.js` parses `index.css` and fails if any listed text pair is under 4.5:1 or any border or ring pair under 3:1 (the numbers on the
  Color board), and a source scan that fails on a Google Fonts URL anywhere in `index.html` or `src`.
- Files: `index.html`, `index.css`, `App.jsx`, `DegreePlan.jsx` (theme only), `public/fonts/*`, one test. No layout change.

### Phase 2 — Shell and navigation (1 PR)

- `Sidebar.jsx`: four destinations (Plan, Requirements, Advising, Settings), 240 px rail, brand wordmark, the "On this device, saved at" footer. Phones: a bottom tab bar, 56 px,
  four labeled tabs, safe-area padding. Remove the count badge.
- `DegreePlan.jsx` view routing: keep `view === 'issues'`, but reached from the Plan check strip and the course rows, not the nav. Rename the Advisement tab and page to
  "Advising" (`AdvisementView.jsx` can keep its file name; rename it only if it is cheap).
- Switch the shell to the new tokens and fonts (this is the point where mono-to-proportional changes widths: check every fixed-width grid in `AppShell.css`).
- Parity: `.ds-tab` lookups by text change from "Advisement" and "Issues"; update `scenario.mjs` and `expected-differences.json` in this PR. Wording tests that name
  "Advisement" or "Issues" change with it. `CLAUDE.md` terminology paragraph and `REFERENCE.md` change in the same PR.

### Phase 3 — Plan screen (4 PRs, in order)

- **3a Header, finish line, Plan check.** New `lib/planCheck.js`: from the issues, the number of open picks, the first pick a later course depends on (label and dependents),
  and any real problems (blockers, and warnings that are not picks). Tests cover the sample plan's 12 picks and the 1 dependent. Header: title, program line, "You finish
  {season year}" from `graduation`, "{n} of {total} hours planned" with the done, in progress, planned and picks-to-make split from `creditTotals`. The strip is neutral violet; a real problem
  adds an amber or red line above it. "Credits you already have: N hours" replaces the prior-coursework strip (the strip's drop-to-transfer behavior stays).
- **3b Semester cards and rows.** `Semester.jsx`: header carries the status chip (in progress, planned, done) and hours; rows are plain; a row shows a chip only for needs attention or
  blocked, or a "Pick a course" button for an open pick. Later semesters collapsed by default, past semesters as one line. "cr" becomes "hours".
- **3c Details panel and Move to.** `CoursePanel.jsx`: facts list, "Move to…" as the primary action, and the panel pushes content on desktop. Row "more" menu. On phones the same
  content is a bottom sheet with a radio list of semesters (the existing move logic, `moveToSemester`, unchanged; a prerequisite conflict still opens the confirm dialog).
- **3d Phone layout and undo.** Single-column semesters, 44 px rows, Undo as a labeled toast ("Moved CSC 1310 to Fall 2027. Undo") instead of an always-visible disabled button.
  `lib/undoStore.js` is untouched.
- Parity: `.ds-sem` facts, "Four-Year Plan" wait. Keep both until the scenario is updated in 3a.

### Phase 4 — Requirements (1 PR)

`RequirementsView.jsx` (353 lines) and `GenEdProgress.jsx`: restyle to sections with a count, categories as headers with "N of M hours", open picks as "Pick a course" buttons,
finish line as a headline with one plain sentence. Page title becomes "Requirements" (today "Degree audit"). **The audit and projection data do not change.**
Parity: the scenario waits for the text "Degree audit" and the "Earliest finish" pattern; update both in this PR and keep "Degree audit" as the Advising document name.

### Phase 5 — Settings (1 PR)

`SettingsView.jsx`, `DeviceDataCard.jsx`, `WhatIfPanel.jsx`: two columns of cards; sections Your majors, Try before you add, Test scores, Appearance (three-way), Your data, Start over (Reset
plan and Erase everything separated and worded differently). The Change dialog and the add-major dialog move to the shared Dialog in Phase 6. Copy from the Language board.
Platform words stay in `lib/platform.js` (`platformWords`): never write "this browser" in a component (`terminology.test.js`).

### Phase 6 — One dialog (2 PRs)

- 6a `components/Dialog.jsx`: dialog on desktop, bottom sheet at 760 px or less; `role="dialog"`, `aria-modal`, labelled title, focus trap, Esc, return focus, scrim.
  Migrate the shell dialogs (`ds-modal` users).
- 6b Migrate `SlotModal`, `AddCourseModal`, `PriorCreditWizard`; delete the `modal-*` and `onboarding-btn-*` styles that become unused.
- Parity reads `.ds-modal, .modal-backdrop`: after 6b only one remains, update the selector in the same PR.

### Phase 7 — First run (2 PRs)

- 7a Picker and steps: `lib/programPicker.js` `onboardingSteps` becomes `major`, `term`, `scores-and-credits`, `ready`. `ProgramPicker.jsx`: search first, college as filter chips,
  open majors grouped by college, concentration as inline radios under the chosen major, "Show the rest" for programs not in the planner yet. Keep Import a backup. Update
  `programPicker.test` and the Onboarding text in `CLAUDE.md` ("Onboarding is one screen per step").
- 7b "Your plan is ready": split `handleComplete` in `Onboarding.jsx` into build (pure, from the choices) and save, show the finish, this semester's hours, the math placement and
  the first pick that matters, and write only when the student chooses "Open my plan". Back goes to the earlier step with nothing written.
- Parity: the onboarding half of `scenario.mjs` is rewritten for four steps in 7a and 7b; run the Docker leg from the branch before merging (`parity/README.md`).

### Phase 8 — Edges (1 PR)

`Auth.css` and the sign-in and create-account pages (Docker only), `UpdateBanner`, `DesktopUpdateCard`, `ErrorBoundary`, `Skeletons.jsx` (match the new layout so loading does not jump),
the profile-load error line in `pages/Dashboard.jsx` (today a bare paragraph).

### Phase 9 — Cleanup

Remove the `--navy`, `--white`, `--muted` and gold-for-everything aliases once a source scan shows zero references; delete dead CSS; update `CLAUDE.md`, `REFERENCE.md`; rewrite the
ROADMAP "Grid redesign: what is left" entry (which of its items shipped: tap-to-move on phones via "Move to…", purple for progress, gold for the current semester only); refresh
the app icon if the owner wants it (`public/favicon.svg` is still the Vite default). The landing site (`MyDegreePlan_Site`, its own repo) gets the same tokens and fonts in a
separate PR.

## Definition of done, every phase

- `npm run verify` green, `npm run lint:changed` clean, and the parity run green on web and desktop; Docker leg tried from the branch when `parity/` changed.
- New or changed text uses only the vocabulary above; the source test for "cr" and for banned words passes.
- No `font-size` under 13 px and no control under 44 px in the files the phase touched (source scan for the first, a Playwright measure in `parity/` for the second).
- Light and dark both checked at 1440 px and 390 px against the canvas boards; contrast test passes.
- Keyboard: every control reachable, focus ring visible and not hidden by a sticky bar; no feature that works only by dragging (the plan already offers Move to).
- Docs updated in the same PR when code and docs would disagree.

## Risks

1. **Mono to proportional type changes widths everywhere.** Semester rows, the audit and the PDF preview frame all assume mono widths. Phase 2 and 3 are where it shows; budget a pass per screen.
2. **Larger text makes the plan longer.** 16 px body and 56 px rows lengthen the page; collapsing later semesters is what keeps it usable. Check a 21-hour semester.
3. **Parity churn.** The scenario is wording-sensitive by design. Updating it in the same PR as each wording change is the rule, and each phase's PR lists its scenario edits.
4. **`DegreePlan.jsx` conflicts.** 2,324 lines, 78 hooks, touched by Phases 2 to 5. Sequence them; do not parallelize.
5. **Onboarding rewrite is the largest logic change** (`handleComplete` split, new step list). It comes last of the screens, after the dialogs, so the wizard it opens is already migrated.
6. **Gold removal may clash with the department's expectations.** Decided in Phase 0, item 1, on the owner's word; the fallback is a small gold accent.
7. **Closed-program wording.** "Show the rest" must still hide closed programs by default and keep the replacement offer for a closed program (see the onboarding notes in `CLAUDE.md`).

## Out of scope

Anything that changes data or logic (catalog, plans, prerequisites, placement, audit), the PDF documents, an advisor view, accounts, new features from `ROADMAP.md`, and the landing site beyond
tokens and fonts. Not decided here: dual credit and dual enrollment (still disabled in the wizard, `ROADMAP.md`).

## Open questions

All five questions this plan first asked are answered in Phase 0. What remains: the department's confirmation of "semester" and "Advising", and the export of the approved boards
(Phase 0, "Still open"). Phase 1 can start on the owner's go-ahead.

## What differs from this plan (written when Phase 9 merged)

- **Phase 3c, the row "more" menu**: not built. The whole row already opens the details, where Move to… is the first button; a second button inside the row's button would not be valid markup.
- **Phase 7 was one PR, not two**: 7a and 7b rewrite the same file and the same half of the parity scenario.
- **"Your plan is ready" does not name the first pick that matters**: that needs the plan view's dependency check, which is not in a lib. The screen gives the count and points at Plan check; the plan says which pick once it is open.
- **"Saved as you go" is not shown in first run**: nothing is saved until "Open my plan", so it would be untrue.
- **The theme script is a file** (`public/theme-init.js`), not an inline script: the Windows app and the Docker web container refuse inline scripts.
- **"Coming soon" has two meanings and kept one**: a major the planner does not have reads "Not in the planner yet"; a feature held back by `lib/features.js` still reads "Coming soon".
- **Phase 8 was not looked at on a real install**: the sign-in pages (Docker) and the update banner and card (Docker, the Windows app) are covered by tests and by reading the diff only.
- **Docker parity leg**: the definition of done asks for it from the branch whenever `parity/` changes. It was not run for any phase (web ran locally, web and the Windows app in CI). The first nightly run after these merges is the first time Docker walks the new first run.
- **The Plan check list kept the old words until a follow-up PR** (`fix/plan-check-wording`): `lib/planIssues.js` now says "pick", "hours" and "semester", writes codes with a space (`spaceCourseCodes`), and each message ends with what to do next; `planIssues.test.js` builds every kind of message and fails on "slot", "credit", "term" or an unspaced code. The same pass changed "term" to "semester" in the course details, the row notes, Requirements, the move list, the undo label and two dialogs. The printed plan and audit still say "term" (the PDF documents are out of this plan's scope).
- **Board images**: the approved boards were not exported to `docs/claude/design/`; only the canvas can export them.
- **Not started**: the landing site's tokens and fonts (`MyDegreePlan_Site`, its own PR), and the app icon (`public/favicon.svg` is still the Vite default).
