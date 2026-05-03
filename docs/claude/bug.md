# MyDegreePlan — Static Analysis Audit

**Date of audit:** 2026-04-17
**Branch audited:** `main` (both `MyDegreePlan_Frontend` and `MyDegreePlan_Prototype`)
**Branches excluded from scope:** `fix/act-wizard-and-equivalencies`, `fix/prereq-coreq-logic`
**Scope:** static analysis only — no code changes, no fixes, no issues filed. Cross-file consistency included.

> **2026-04-17 update:** The original BUG-1 (HPC declared hours did not match slot total) has been fixed. `csc_hpc.json` Semester 8 now includes a second `GEN_ED` slot, bringing the concentration to 120 hrs, and `migration_tier12.sql` backfills the same slot into the live `requirement_slots` table. Remaining bugs below are renumbered accordingly.

> **2026-04-24 update:** `fix/onboarding-wizard-overhaul` merged. BUG-4 (concentration-agnostic transfer-credit pool resolution), BUG-8 (`validatePriorCredit` did not enforce `min_score`), BUG-27 (no back button on onboarding step 3), BUG-28 (ACT Math gate inaccessible post-freshman-branch removal), BUG-29 (wizard output string concatenation), and BUG-30 (Prior Coursework panel unsorted) are fixed. BUG-26 received its planned interim fix (transfer-credit option disabled + greyed as "Coming soon"). The full fix for BUG-26 is tracked in `BRANCH_QUEUE.md` under Deferred Data Tasks (`data/transferable-course-database`), so the BUG-26 entry is removed from this list. The freshman/non-freshman onboarding branching was removed as part of the same merge. Entries for the seven fixed bugs are deleted below; remaining bug numbering is unchanged.

> **2026-04-24 update (2):** `fix/slot-modal-prereq-credits` merged. BUG-1 (`SlotModal.annotate` dropped prior credits, catalog, and coreqs from `checkPrereqs`), BUG-2 (`SlotModal.satisfiedCodes` was not restricted to prior semesters), and BUG-5 (`SlotModal.creditsBefore` ignored `priorCredits` and `planSemesterOverrides`) are fixed. Entries deleted below; remaining bug numbering is unchanged. BUG-33 still references "after the BUG-5 fix" — historical pointer, intentional.

> **2026-04-24 update (3):** Audit reconciliation — BUG-20, BUG-21, BUG-23, and BUG-24 were implemented in prior branches but never deleted from this document. Verified against `main`:
> - **BUG-20** (transfer-credit course-code validation): fixed in `src/lib/validatePriorCredit.js` Rule 3 (rejects course codes absent from the catalog); the wizard's transfer-credit option is also disabled ("Coming soon") per the 2026-04-24 BUG-26 interim.
> - **BUG-21** (user-editable credits field for transfer entries): no longer applicable — the wizard auto-populates `credits_awarded` from the catalog at `PriorCreditWizard.jsx` Step 4 and Step 2 results are read-only; transfer option is also disabled.
> - **BUG-23** (AP/placement credits don't archive slots on first load): fixed by the one-shot sync effect in `DegreePlan.jsx` keyed on `[loading, slots, priorCredits, planArchived]`, explicitly labelled "BUG-23" inline.
> - **BUG-24** (drag-to-Prior-Coursework duplicates prior-credit rows): fixed by the dedup guards in `DegreePlan.jsx` `handleDragEnd` for both `requirement_slot` and `free_add` drag sources, explicitly labelled "BUG-24" inline.
>
> Entries deleted below; remaining bug numbering is unchanged.

> **2026-04-27 update:** `fix/transfer-credits-divergence-and-freeadd` merged. BUG-3 (`resolveTransferCredits`/`resolveTransferDetails` Rule 1 divergence) and BUG-6 (`computePlanCredits` did not include `student_free_add_slots`) are fixed. The two resolver functions now share a private `matchPriorCreditsToSlots` helper so they cannot drift again; `computePlanCredits` accepts an optional `freeAddSlots` parameter and dedups across all three sources via a shared `seen` set. Tests grew from 194 → 210 (parity coverage for `resolveTransferDetails`, free-add coverage for `computePlanCredits`). Entries deleted below; remaining bug numbering is unchanged. BUG-34 added in the same pass — see new entry at the bottom of the list.

> **2026-04-29 update:** `fix/concentration-switch-clears-notes` merged. BUG-7 (`handleConcentrationSwitch` did not clear `student_semester_notes`) is fixed by adding the missing delete call alongside the existing sibling deletes for plan slots, free-adds, and prior credits. Audit framing was partially stale: the table is keyed by `(student_id, concentration_id, semester_number)` (Tier 9), so old-concentration notes did not bleed into the new concentration's view, but switch-back resurrection (notes reappearing after Core → HPC → Core) was the real visible symptom. Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-29 update (2):** `fix/science-pool-warnings` merged. BUG-10 (`getScienceWarnings` used label equality, missing `BIOL1123 + BIOL2310` as an invalid pair), BUG-11 (`resolveScience` indexed `selectedScienceCodes[0]`, biased to the first filled slot), BUG-17 (redundant reversed `GEOL1040/GEOL1045` entry in `SCIENCE_SEQUENCES`), and BUG-18 (`getScienceWarnings` destructured only the first two SCIENCE slots) are fixed. `getScienceWarnings` now compares against `SCIENCE_SEQUENCES` membership and iterates pairwise across all SCIENCE slots; `resolveScience` is multi-code-aware. Tests grew from 210 → 226 (10 new `getScienceWarnings` cases — no prior coverage — plus 3 `resolveScience` regression cases). Entries deleted below; remaining bug numbering is unchanged.

> **2026-04-29 update (3):** `fix/free-add-dedup-guard` merged. BUG-34 (free-add picker accepted course codes already in the plan) is fixed by a new pure helper `getTakenCodes` in `src/lib/transferCredits.js` that mirrors `computePlanCredits`'s Pass-1/2/3 dedup keyspace exactly. `DegreePlan` memoizes the Set and threads it into `AddCourseModal`, which greys out matching rows and disables selection; `handleAddCourse` adds a final guard before the Supabase insert. Existing `.modal-course-row.status-taken` and `.modal-status-badge.taken` styles are reused — no new CSS. Tests grew from 226 → 237 (11 new cases in `src/tests/getTakenCodes.test.js`). Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-29 update (4):** `fix/prereq-warnings-semester-order` merged. BUG-13 (`prereqWarnings`/`coreqWarnings` treated any completed-semester code as satisfied regardless of direction) is fixed by dropping the redundant `planSemesterCompleted` clause from both memos. The first clause `p.sem < item.sem` already counts every code in a strictly earlier semester as satisfied, so restricting the completion check to "earlier" — per the audit's suggested fix — makes the clause redundant. Aligns with `CLAUDE.md` core principle 3: semester completion is a UI collapse affordance, not prereq-satisfaction semantics. No test changes (memo not extracted; existing `checkPrereqs`/`checkCoreqs` coverage holds). Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-29 update (5):** `fix/postgrest-input-sanitization` merged. BUG-12 (raw user input interpolated into PostgREST `.or()` filters in `AddCourseModal` and `PriorCreditWizard`) is fixed by a new helper `src/lib/postgrestEscape.js` exporting `escapeIlikeValue` (strips backslashes and double quotes). Both call sites now wrap each ilike value in PostgREST's double-quote literal syntax so commas and parentheses pass through as literal bytes. Tests grew from 237 → 245 (8 new cases). Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-29 update (6):** Audit reconciliation — BUG-25 (notes field in transfer credit wizard with no product purpose) was already addressed in prior work and never deleted from this document. Verified against `main`:
> - `src/components/PriorCreditWizard.jsx` contains exactly one `<input>` element (line 416), the course-search field used by the transfer-credit step. There is no free-text notes input anywhere in the wizard.
> - Every write to `prior_credits.note` in the codebase is either auto-generated by `buildNote()` in the wizard (`PriorCreditWizard.jsx:312`) or a system-generated drag-context label (`DegreePlan.jsx:869, 912` — `"Dragged from Semester N"`). No path exposes the field to user free text.
> - Likely removed during `fix/onboarding-wizard-overhaul` (2026-04-24) when the freshman-branch onboarding was deleted, but the audit entry was not deleted at that time.
>
> Entry deleted below; remaining bug numbering is unchanged. No fix branch was opened.

> **2026-04-29 update (7):** Seven new bugs (BUG-35 through BUG-41) added from a developer meeting. Identified through review of student-facing UX, accessibility, and the prior-credit wizard. New severity additions: Medium +3, Low +4. New totals: Critical 0, High 1, Medium 8, Low 7, Total 16. The meeting also produced several feature requests and scope expansions that are tracked outside `bug.md` — see `BRANCH_QUEUE.md` (Phase 2 scope expansions for `fix/mark-complete-behavior`, `feat/branding`, `schema/semester-terms`; new entries `feat/rules-filter-sidebar`, `feat/dynamic-semester-count`, `feat/dark-mode`, `feat/exemption-gating`) and `ROADMAP.md`.

> **2026-04-29 update (8):** `fix/wizard-step3-cleanup` merged. BUG-39 (`PriorCreditWizard` Step 3 prematurely showed credit-hour award) is fixed by dropping the `wizard-score-detail` ternary block from the Step 3 render. Step 3 now shows only "Score X+" buttons; Step 4's existing per-award cards remain the single disclosure surface for credit-bearing and placement-only outcomes. Pure render edit; no test changes (no wizard-component coverage today). Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-29 update (9):** `fix/ap-chem-stem-filter` merged. BUG-35 (AP Chemistry STEM/non-STEM duplicate rows in the wizard) is fixed by adding a single-line filter to the wizard's Step 2 exam loader: any `test_equivalencies.test_name` containing `"(Non-STEM)"` is skipped. The filter applies unconditionally because every prototype concentration is STEM (all CSC). The proper long-term implementation (a `stem_only` column on `test_equivalencies` plus a `stem` flag on `concentrations`) is left deferred. Pure UI filter, no schema change, no test changes. Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-29 update (10):** Two new bugs (BUG-42 and BUG-43) added from a developer flow walkthrough. Both surface in the prior-credit / pool-slot interaction. BUG-42 is a transfer-credit archive correctness issue (filled pool slots not archiving when a prior credit covers the same pool). BUG-43 is a sub-pool granularity gap in GEN_ED selection — partially overlaps with the existing `ROADMAP.md` entry "GEN_ED sub-requirement enforcement" but adds concrete UX scope (modal sub-category surfacing, wizard Step 4 sub-pool labeling). New severity additions: Medium +2. New totals: Critical 0, High 1, Medium 9, Low 6, Total 16.

> **2026-04-30 update:** `fix/pool-archive-filled-slots` merged. BUG-42 (filled pool slots not archived when a prior credit's `satisfies_pool` covers the same pool) is fixed by removing the `if (planSlotsMap[slot.id]) continue` guard from Rule 2 of the shared `matchPriorCreditsToSlots` helper in `src/lib/transferCredits.js`. Rule 2 is now purely class-code-driven: pool credit beats student selection. `syncArchivedSlots` reads `planSlots[slot.id]` for the upserted `selected_course_code`, so the student's selection is preserved on the DB row and the slot restores correctly within the session if the prior credit is later removed (cross-reload restoration is the deferred ROADMAP "Pool-slot drag-back restoration" item). Two existing tests that asserted the prior contract were flipped; one new BUG-42 regression test was added. Tests grew from 245 → 246. Drag-handler comment in `DegreePlan.jsx` refreshed to reflect the new contract; the explicit upsert in that branch now functions as defensive belt-and-suspenders. Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-30 update (2):** `fix/prereq-pool-name-display` merged. BUG-37 (prereq warnings list individual pool member codes instead of the pool name) is fixed by adding a pure display helper `formatMissingForDisplay` to `src/lib/poolResolver.js` and routing the seven `missing.join(', ')` consumer sites in `SlotModal.jsx` (1) and `Semester.jsx` (6) through it. Pool-member codes inside an OR group collapse to the pool's `POOL_LABELS` value when ≥2 codes from the same pool appear; mixed groups keep individual codes alongside the label (e.g. `(Communications or MATH1910)`); single pool members never collapse. `checkPrereqs` and `checkCoreqs` signatures and return shapes are unchanged per `CLAUDE.md`. Tests grew from 246 → 257 (11 new cases in `src/tests/formatMissingForDisplay.test.js`). Entry deleted below; remaining bug numbering is unchanged.

> **2026-04-30 update (3):** `fix/gen-ed-sub-pool-surfacing` merged. BUG-43 (GEN_ED slot selection lacks sub-pool granularity) is fixed by surfacing the existing History / Humanities & Arts / Social Science split in two places: (a) `SlotModal` renders GEN_ED courses in three labeled sub-sections when search is empty, with already-satisfied sub-pools dimmed via a new `.modal-section-satisfied` CSS rule; (b) `PriorCreditWizard` Step 4's `wizard-award-pool` line now reads "Also satisfies: General Education — History sub-pool" (or Humanities & Arts / Social Science) for GEN_ED awards and uses `POOL_LABELS` for non-GEN_ED awards. New helper `getGenEdSubCategory` in `poolResolver.js`; `GEN_ED_CATEGORIES` is now exported. Soft greying only — students may still pick from a satisfied sub-pool. Schema-level GEN_ED splitting (ROADMAP "GEN_ED sub-requirement enforcement") remains deferred. Tests grew from 257 → 262 (5 new cases in `src/tests/getGenEdSubCategory.test.js`). Entry deleted below; remaining bug numbering is unchanged.

## Bug counts by severity

| Severity | Count |
|---|---|
| Critical | 0  |
| High     | 1  |
| Medium   | 5  |
| Low      | 4  |
| **Total** | **10** |

---

### BUG-9: `computePlanCredits` dedup key collides on repeated pool pool_codes

**Severity:** Medium
**File(s):** `src/lib/transferCredits.js:196-211`

**Description:** Pass 2 iterates `slots`; for a non-pool slot it uses `code = slot.class_code`. Templates never repeat non-pool `class_code`s, so that path is safe. But for pool slots, the `code` is the course the student picked — different slots should be independent. That's fine. The subtle case: for an *unfilled* pool slot the function `continue`s (line 202), so no dedup key is set — correct. For a *filled* pool slot, if two pool slots in different semesters happen to select the same course (which is disallowed by `takenCodes`, but the validation is UI-only), the second one is silently dropped from the breakdown.

**Impact:** If `takenCodes` enforcement ever fails (see BUG-2 and the stale satisfiedCodes/takenCodes patterns in `SlotModal`), or if two pool slots somehow resolve to the same course via drag-and-drop, credit totals undercount by the shared course's credits rather than double-counting. Behavior is arguably correct (dedup semantics), but it masks a data-integrity problem upstream rather than surfacing it.

**Suspected fix:** Intentional per spec; no fix required — but flag duplicate pool selections at save time and reject them at the UI layer.

**Confidence:** Medium

---

### BUG-14: `computePlanCredits` allows flex pool slots to claim the configured `flex_credits` even when the selected pool course has a different catalog `credits`

**Severity:** Medium
**File(s):** `src/lib/transferCredits.js:200-207`

**Description:** For a pool slot the function computes `credits = (courses ?? {})[code]?.credits ?? slot.flex_credits ?? 3`. If the catalog course exists, catalog wins (correct). If not (course missing from catalog), it falls back to `flex_credits ?? 3`. In well-seeded environments, every pool member is in the catalog, so `flex_credits` is rarely used. But `FREE_ELECTIVE` slots that bank leftover hours rely on `flex_credits` exclusively when the course is not in the catalog. Meanwhile `usePlanCompleteness` counts unfilled `FREE_ELECTIVE` slots as filled (documented TODO), so the credit number reflects "planned" hours, not "earned" hours.

**Impact:** Total-earned and total-planned are conflated for free-elective slots. The completeness guard masks a conceptual gap until a proper free-elective resolver lands.

**Suspected fix:** Distinguish earned vs planned in `computePlanCredits`, or explicitly gate `FREE_ELECTIVE` slots out of "earned" totals until a student fills them.

**Confidence:** Medium

---

### BUG-15: `test_equivalencies.test_type` CHECK constraint still lists `'dual_enrollment'` after Tier 11

**Severity:** Low
**File(s):** `MyDegreePlan_Prototype/migration_tier11.sql:19-23`

**Description:** Tier 11 explicitly states: *"the test_equivalencies.test_type CHECK constraint (which still lists 'dual_enrollment' from Tier 10) is intentionally NOT updated here. Removing the rows is sufficient"*. `CLAUDE.md` (this project's canonical schema doc) lists `test_equivalencies.test_type` as `ap_credit | test_out | ib_credit | cambridge | act_credit` — excluding `dual_enrollment`. The migration's behavior contradicts the spec doc.

**Impact:** Schema is technically wider than documented; a direct INSERT of a dual_enrollment row would not be rejected by the DB. No frontend code issues such an INSERT today, so the risk is latent.

**Suspected fix:** Either add a constraint tightening to a future migration, or update CLAUDE.md to match the actual constraint.

**Confidence:** High

---

### BUG-16: Placement-tests fixtures use the removed `'dual_enrollment'` credit_type

**Severity:** Low
**File(s):** `src/tests/prereqCheckerPlacement.test.js` (per earlier summary; lines ~126, ~143)

**Description:** Two fixtures still use `credit_type: 'dual_enrollment'`. Tier 11 removed that value from the `prior_credits.credit_type` CHECK constraint and deleted any matching rows. `checkPrereqs` does not read `credit_type`, only `satisfies_course_code`, so tests still pass — but the fixtures represent schema state that no longer exists.

**Impact:** Tests pass under false assumptions; a future contributor copying the fixture pattern will produce code that violates the live DB constraint.

**Suspected fix:** Update fixtures to use `'transfer_credit'` or another still-valid value. No behavior change expected.

**Confidence:** High

---

### BUG-19: `classifyPrereq` accepts a `prereqCode` parameter it never uses

**Severity:** Low
**File(s):** `src/lib/classifyPrereq.js:37-56`

**Description:** The function signature is `classifyPrereq(courseCode, prereqCode, courseMap)`; the parameter is explicitly reserved for future use. `prereqChecker.js` already passes `null` in its only call site. Not a bug — a documented API debt — but means every caller (tests and code) carries a dead parameter. Deferred per `CLAUDE.md` principles.

**Impact:** None at runtime. Minor API clutter.

**Suspected fix:** Either begin using `prereqCode` for per-edge classification (not deferred work today) or drop the parameter when the feature is declared out of scope permanently.

**Confidence:** High

---

> **2026-04-20 update:** Six new bugs (BUG-20 through BUG-25) added from live onboarding session testing. Identified through manual user-flow testing, not static analysis. All are in the onboarding and prior credit wizard flow. Severity counts updated: Critical +1, High +3, Medium +1, Total +6. New totals: Critical 1, High 10, Medium 8, Low 5, Total 25.

---

### BUG-22: Prior credit wizard is scoped to Semester 1 placement-adjacent credits only; full prior coursework onboarding is not supported

**Severity:** High
**File(s):** `src/components/PriorCreditWizard.jsx`, `src/components/Onboarding.jsx`

**Description:** The "Any prior credits or placement scores?" onboarding step surfaces only AP/IB/ACT/placement-style credits — the kinds relevant to Semester 1 course placement. It does not support full prior coursework onboarding for transfer students, continuing students, or dual-enrollment students who may have completed 30–60 credits before arriving. A transfer student using the wizard has no path to enter their completed coursework except manually after onboarding, one entry at a time, through the Prior Coursework panel.

**Impact:** The primary onboarding promise — "the app loads a plan tailored to where you are" — fails entirely for any student who is not a first-time freshman with zero prior credits. Transfer students see a full 8-semester plan with no prior credits applied and must manually reconstruct their history before the plan becomes useful. This is the exact friction the wizard is meant to eliminate.

**Suspected fix:** Expand the wizard to cover all `credit_type` values across all semesters. Add a branching question at onboarding: "Are you a first-time freshman?" → Yes: current AP/ACT flow. No: full prior coursework entry flow covering transfer credits, dual enrollment, CLEP, and completed TTU courses by semester. Mandatory for the prototype to serve non-freshman users.

**Confidence:** High

---

> **2026-04-21 update:** Seven new bugs (BUG-26 through BUG-32) added from post-merge
> onboarding session review. Identified through live testing of the merged
> fix/onboarding-prior-credit branch. Severity counts updated: High +3, Medium +3,
> Low +1, Total +7. New totals: Critical 1, High 13, Medium 11, Low 6, Total 32.

---

### BUG-32: Course descriptions contain redundant prerequisite, corequisite, and placement text

**Severity:** Medium
**File(s):** `MyDegreePlan_Prototype/prototype.json` (immediate scope),
`MyDegreePlan_Prototype/coursesFile.json` (deferred — 30,000 lines, separate task)

**Description:** Course `description` fields in the catalog JSON include prerequisite,
corequisite, and placement requirement text that the planner already parses and
displays in dedicated sections. This makes descriptions bloated and repetitive —
a student sees the same information twice, with the description version being less
structured and harder to read.

**Impact:** Every course detail view is noisier than necessary. For courses with
complex prereq chains (e.g. MATH1910, CSC3350), the description is dominated by
prerequisite text rather than actual course content. Descriptions are the student's
primary signal for whether a course is relevant to their interests.

**Interim fix (prototype scope):** Programmatically strip prerequisite, corequisite,
and placement language from `description` fields in `prototype.json`. Re-seed
`MyDegreePlan_Prototype/` after stripping. Claude Code should write a script to
perform the strip and preview the diff before applying.

**Full fix (post-prototype):** Apply the same stripping logic to `coursesFile.json`
once the catalog data task is in scope. `coursesFile.json` is 30,000 lines and is
a separate, larger data task — do not attempt in the same session as `prototype.json`.

**Confidence:** High for the stripping approach; Medium for the exact regex/pattern
needed (descriptions are inconsistently formatted across courses).

---

### BUG-33: Manual semester completion credits not counted toward standing thresholds in SlotModal

**Severity:** Medium
**File(s):** `src/components/SlotModal.jsx` (`creditsBefore`), `src/components/DegreePlan.jsx` (manual completion path)

**Description:** `creditsBefore` in `SlotModal` now correctly counts prior credits
(AP, transfer, etc.) toward junior/senior standing thresholds after the BUG-5 fix.
However, credits from manually completed semesters (`completed_by_student = true` on
`student_semester_notes`) are not counted the same way. A student who marks 60+ credits
complete in the grid does not see the junior standing threshold clear in the modal —
the two paths feed different calculations.

**Impact:** Students with manually completed semesters see incorrect standing
requirements in slot modals. Inconsistent with the prior-credits path which now
works correctly after BUG-5.

**Suspected fix:** Include credits from completed semesters in the `creditsBefore`
sum, consistent with how `computePlanCredits` handles completion state. Coordinate
with the mark-complete behavior fix (Phase 2, `fix/mark-complete-behavior`) since
that branch will overhaul how completion credits are tracked.

**Confidence:** High

---

### BUG-36: Visual flicker when dragging a course to Prior Coursework

**Severity:** Low
**File(s):** `src/components/DegreePlan.jsx` (`handleDragEnd` —
drag-to-prior-coursework path), `src/components/Semester.jsx` (slot row
remove transition)

**Description:** Dragging a course from a semester onto the Prior Coursework
panel briefly snaps the slot back to its original semester, then immediately
re-renders with the slot removed. The user perceives a "snap-back-then-remove"
flicker rather than a clean transfer. Likely caused by the optimistic state
update path: the drag-end handler creates the prior credit row (which arrives
asynchronously), and `syncArchivedSlots` only fires once the new credit lands
in state, leaving a render frame where the slot is unchanged before the
archive flag flips.

**Impact:** Low — the final state is correct. UX is jarring and can leave a
student briefly uncertain whether the drag worked.

**Suspected fix:** In the `prior_credit` drag-end branch of `handleDragEnd`,
optimistically mark the slot archived in local state before awaiting the
Supabase insert. Roll the optimistic flag back if the insert errors. Mirrors
the optimistic patterns already used in `handleAddCourse` and the move
handlers.

**Confidence:** Medium — the root cause is plausible but unconfirmed without
devtools profiling. May be entirely a CSS transition timing issue.

---

### BUG-38: Site-wide low contrast (accessibility regression)

**Severity:** Medium
**File(s):** `src/components/Dashboard.css` (primary surface), `src/index.css`
(theme variables — `--muted`, `--gold`, `--danger`, `--bg`, etc.),
`src/pages/Auth.css`

**Description:** Multiple text-on-background pairings across the planner do
not meet WCAG 2.1 AA contrast (4.5:1 for normal text, 3:1 for large/UI). Most
visibly: `var(--muted)` body text on the dark navy background, the modal
status badges (`.modal-status-badge.taken`, `.locked`), credit-bar fills
against the track, and small metadata such as the eyebrow/sub text in modal
headers.

**Impact:** Accessibility — fails legal/compliance baselines that TTU is
likely to require for an officially-deployed planner. Practical: students with
mild visual impairment or in bright lighting struggle to read the grid.

**Suspected fix:** Audit every foreground/background pair via a contrast tool;
adjust theme variables (`--muted`, `--gold`, `--danger`, the body
`background`/`color`) so the AA bar is met. Likely needs a coordinated theme
pass rather than spot fixes — change one variable, ripple through all consumers.
Coordinate with the TTU-purple recolor (see `feat/branding` scope expansion in
`BRANCH_QUEUE.md`) since the new accent color will set the contrast budget for
all gold/purple pairs.

**Confidence:** High that the bug exists; Medium on the exact remediation
because it spans a theme rework.

---

## Audit notes

- Templates `csc_core.json`, `csc_cybersecurity.json`, `csc_dsai.json`, and (after the 2026-04-17 fix) `csc_hpc.json` each sum exactly to their declared `hours` (120).
- Pool codes referenced in all four JSONs (`GEN_ED`, `ENG_LIT`, `SCIENCE`, `COMM_REQ`, `MATH_STATS`, `CSC_LOWER_ELECTIVE`, `CSC_UPPER_ELECTIVE`, `CSC_ELECTIVE`, `CSC_HPC_ELECTIVE`, `FREE_ELECTIVE`) all exist in `POOL_COURSES` and `POOL_LABELS` and are all in `SATISFIABLE_POOLS`. No orphan pool codes.
- `test_equivalencies` seed awards several course codes that are not obviously used by any CSC concentration template (e.g. `ACCT2110`, `HEC2200`, `DS2810`, `PSY2210`, `MATH1630`, `MATH1000`). They still satisfy Rule 3 (unmatched credits count toward total hours). Not a bug — noted for completeness.
- Cumulative-model invariant in `test_equivalencies.sql` (each `awarded_course_code` appears at exactly one `min_score` per exam) holds for every exam I spot-checked. Any violation would manifest as duplicate `prior_credit` INSERTs in the wizard's Step 4.
