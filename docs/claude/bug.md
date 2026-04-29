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

## Bug counts by severity

| Severity | Count |
|---|---|
| Critical | 0  |
| High     | 1  |
| Medium   | 9  |
| Low      | 6  |
| **Total** | **16** |

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

### BUG-31: MATH1910 prerequisite display omits ACT Math 27+ OR gate

**Severity:** Medium
**File(s):** `src/lib/prereqChecker.js`, `src/lib/classifyPrereq.js`,
`src/components/SlotModal.jsx` (prereq display)

**Description:** MATH1910 requires one of MATH1730, MATH1710, or MATH1720 — OR an
ACT Math score of 27+. The OR requirement is encoded in the course description but
does not appear in the prerequisite section rendered by the planner. `classifyPrereq`
detects placement/consent language in descriptions to suppress warnings, but it does
not surface the placement gate as a visible alternative in the prereq list. A student
with ACT Math 27+ sees MATH1910 locked with missing prereqs and no indication that
their score satisfies the requirement.

**Impact:** Students with valid ACT placement are incorrectly shown as unable to take
MATH1910. The prereq section actively contradicts the course description. This is
compounded by BUG-28 (no ACT score entry path), meaning the score can't even be
recorded to resolve the warning.

**Suspected fix:** Extend `classifyPrereq` or the prereq display layer to surface
placement gates as named alternatives in the prereq list (e.g. "or ACT Math 27+")
rather than only suppressing warnings silently. Requires coordination with BUG-28
fix so that a recorded ACT score satisfies the gate and clears the warning.

**Confidence:** Medium — the display fix is clear; the interaction with `classifyPrereq`
suppression logic needs careful tracing before implementing.

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

### BUG-37: Prereq warnings list individual pool member codes instead of the pool name

**Severity:** Medium
**File(s):** `src/components/SlotModal.jsx` (`annotate`, missing-prereq
hint render), `src/components/DegreePlan.jsx` (`prereqWarnings` memo —
Semester slot row badge), `src/lib/poolResolver.js` (`POOL_COURSES`,
`POOL_LABELS` for the lookup)

**Description:** When a course's missing prereq is satisfiable by any course
in a pool — e.g. CSC3040 lists `COMM2025` and `PC2500` (both members of the
COMM_REQ pool) — the warning surface lists the individual codes
("Needs: COMM2025, PC2500"). Freshmen rarely know course codes, so the hint
reads as gibberish. The pool semantics ("any one Communications course will
satisfy this") are visible to the resolver but never reach the user.

**Impact:** Students see a cryptic prereq hint rather than the friendlier
"Needs: Communications class" or "Needs: any course in the Communications
requirement." Particularly painful in the SlotModal availability list and on
slot row warning badges, which is exactly where the student is trying to plan
ahead.

**Suspected fix:** When constructing the `missing` list for prereq warnings,
group consecutive codes that share a pool (per `POOL_COURSES` membership)
into a single label using `POOL_LABELS`. Two design points to settle before
implementation:
- If the prereq lists multiple pool members in an OR group, collapse them all
  into one pool label.
- If the prereq mixes pool members and individual courses (rare but possible),
  show both — e.g. "Needs: Communications class, plus MATH1910."

This requires reading the prereq's group structure (`prerequisite_entries.logic`
+ `group_index`), not just the flat code list. Today's `checkPrereqs` doesn't
return group structure — it returns a flat `missing` array. So either the
checker grows a richer return shape, or the display layer re-derives groups
from `prereqMap`.

**Confidence:** Medium — the goal is clear; the exact rendering logic and
checker API change need product alignment.

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

### BUG-40: Inconsistent indentation of course names across slot rows and modal lists

**Severity:** Low
**File(s):** `src/components/Dashboard.css` (`.modal-course-name`,
`.slot-course-name` or equivalent),
`src/components/Semester.jsx`, `src/components/SlotModal.jsx`

**Description:** Course name text wraps and indents inconsistently across the
grid slot rows and the modal course lists. Some rows show the name flush with
the course code; others appear indented relative to the code; long names wrap
under the credits column instead of within the name column's bounds. Likely a
mix of `flex` alignment defaults, missing `min-width: 0` on flex children, and
inconsistent left padding between the row variants used by Semester slot rows
vs SlotModal CourseRow vs AddCourseModal results.

**Impact:** Low — readability and visual polish. The grid feels inconsistent
because the same data renders differently depending on context.

**Suspected fix:** Audit the four row variants
(`modal-course-row`, `add-credit-result-row`, `slot-row`, free-add slot row)
and align them on a single layout primitive: drag handle | code | name | credits |
status. Apply `min-width: 0` to the name flex child so wrapping respects column
bounds. Likely converges with the `feat/grid-redesign` Phase 3 row-anatomy work,
but a small CSS pass before that lands is reasonable.

**Confidence:** Medium — the bug is real; the right scope (small polish vs
wait for grid redesign) is a judgment call.

---

### BUG-41: Semester header (title + credits planned) appears cramped

**Severity:** Low
**File(s):** `src/components/Dashboard.css` (`.semester-header`),
`src/components/Semester.jsx` (header render)

**Description:** The header row of each semester card crowds the semester title,
credits-planned text, completion toggle, and any warning badges into one tight
horizontal band. The credits-planned text in particular butts up against the
title with no clear separator, making it hard to see at a glance how many hours
a semester contains.

**Impact:** Low — readability. Users have to slow down to parse the header on
each card.

**Suspected fix:** Add explicit gap (`gap` or margin) between header elements;
consider a two-row layout when the card is below a certain width (title on
top, credits + controls underneath). Bump font weight or color contrast on the
credits-planned line so it reads as primary metadata rather than a footnote.

**Confidence:** High — pure CSS edit. May converge with the grid-redesign
Phase 3 work but is small enough to land on its own.

---

### BUG-42: Filled pool slots not archived when a prior credit covers the same pool

**Severity:** Medium
**File(s):** `src/lib/transferCredits.js` (`resolveTransferCredits` /
`resolveTransferDetails` shared `matchPriorCreditsToSlots` helper),
`src/components/DegreePlan.jsx` (`syncArchivedSlots`, drag/unarchive paths)

**Description:** Per the resolver contract Rule 2, a pool slot is archived
when a prior credit's `satisfies_pool` equals the slot's `class_code`. In
practice this works for *empty* pool slots (the AP/IB credit lands and the
slot disappears from the grid). But when the pool slot is already filled
with a student-selected course, the archive does not fire — the slot
remains visible with the student's selection intact.

The student then has two options for the same requirement: their selected
course in the grid, plus the prior credit in the Prior Coursework panel.
If the student notices and clears their selection, the now-empty slot
flips into a "satisfied by AP" indicator — but still does not disappear.
The slot only properly archives if the student takes the manual two-step
of unfilling it.

**Reproduction:**
1. On a CSC plan, fill both SCIENCE pool slots with `CHEM1110` + `CHEM1120`.
2. Open the prior-credit wizard, choose AP Credit → `Chemistry (STEM)` →
   score 5. This produces two prior credits, both with
   `satisfies_pool = 'SCIENCE'`.
3. Apply.
4. **Expected:** both SCIENCE pool slots disappear from the grid (archived);
   the student's selections persist on the row but the slot is hidden, the
   way it does for an unfilled SCIENCE slot.
5. **Observed:** slots remain visible with their CHEM1110/CHEM1120
   selections. Clearing one of the selections shows a "satisfied by AP"
   indicator but the slot still does not archive away.

**Impact:** Real correctness bug, not just polish. The student sees a
double-count in the grid (their own selection plus the prior credit) and
must unfill manually to get the planner into the correct state. Total
hours computation stays correct because of `computePlanCredits`'s dedup
contract, but the visible "what's left" grid is wrong.

**Suspected fix:** Audit `matchPriorCreditsToSlots` (the private helper
shared between `resolveTransferCredits` and `resolveTransferDetails`).
Two plausible roots:
- Rule 2 may currently prefer empty pool slots over filled ones when both
  exist, leaving filled slots un-archived.
- Or the matching may run correctly but `syncArchivedSlots` may treat the
  filled slot's archive transition differently from an empty one.

The right behavior is for Rule 2 to match on `class_code` (the pool name)
without a fill-state filter — Pool credit beats student selection. The
student's `selected_course_code` should persist on the underlying
`student_plan_slots` row so that an unarchive (e.g. user removes the
prior credit) restores it.

Cross-reference: existing `BUG-24` fix (drag-to-Prior-Coursework dedup
guards) and the `fix/transfer-credits-divergence-and-freeadd` Rule 1/2
unification — both nearby; ensure the fix doesn't regress either.

**Confidence:** High that the bug exists; Medium on the exact remediation
path until the matcher is read end-to-end.

---

### BUG-43: GEN_ED slot selection lacks sub-pool (History / Humanities & Arts / Social Science) granularity

**Severity:** Medium
**File(s):** `src/components/SlotModal.jsx` (GEN_ED render path —
`resolvePool('GEN_ED', ...)`), `src/components/PriorCreditWizard.jsx`
(Step 4 award detail — `wizard-award-pool` line),
`src/lib/poolResolver.js` (`GEN_ED_CATEGORIES`, `getGenEdStatus`)

**Description:** The TTU general education requirement is internally three
sub-pools (History 6 hr, Humanities & Arts 6 hr, Social Science 6 hr) but
the planner exposes GEN_ED as a single flat list. Two related UX gaps:

(a) **Modal selection.** When a student opens a GEN_ED slot in the grid,
the modal shows every gen-ed course in one list. There is no signal that
they have already filled their History allotment, and they can pick a
History course for a GEN_ED slot when the History sub-pool is already
satisfied. The modal should ask the student which sub-category they are
filling and grey-out sub-categories that are already satisfied with an
explanation ("History requirement already satisfied").

(b) **Wizard Step 4 disclosure.** When a student adds a gen-ed course
through the prior-credit wizard, Step 4's confirmation says only "Also
satisfies: GEN_ED pool requirement" (`wizard-award-pool` line). The
student does not see which specific sub-pool the credit fills. Same gap
applies to any other pool with internal categories (none today, but the
SCIENCE pool's sequence pairing is conceptually similar).

**Impact:** Students can over-allocate one sub-pool (e.g. take three
History courses) and under-allocate another (zero Humanities). The
`getGenEdStatus` "at risk" warning does fire on the grid but only after
the over-allocation has happened — guiding the student during selection
is the missing piece. For prior credits the disclosure mismatch is
cosmetic but undermines the wizard's "what will I receive" promise.

**Implementation notes:**
- The data already exists. `GEN_ED_CATEGORIES` in `poolResolver.js` maps
  every gen-ed course code to its sub-category, and `getGenEdStatus`
  already tracks per-category fill counts and at-risk state.
- The modal currently calls `resolvePool('GEN_ED', courseMap)` which
  returns the flat list — no sub-grouping.
- This partially overlaps with the existing `ROADMAP.md` entry
  *"GEN_ED sub-requirement enforcement"* — but the user's bug is more
  specific (modal sub-category surfacing + wizard Step 4 labeling) and
  stops short of full enforcement (e.g. blocking a History pick when
  History is satisfied).
- Long-term fix would split GEN_ED into named sub-pools
  (`GEN_ED_HISTORY`, `GEN_ED_HUMANITIES`, `GEN_ED_SOCIAL`) on
  `requirement_slots` — covered by the ROADMAP entry. Short-term fix:
  add sub-grouping to the modal render and wizard disclosure without
  splitting the schema.

**Suspected fix:**
- `SlotModal`: when `slot.class_code === 'GEN_ED'`, render a sub-category
  selector or three-section list grouped by `GEN_ED_CATEGORIES`. Use
  `getGenEdStatus(planSlots, slots, courseMap)` to determine which
  sub-pools are satisfied; render those sub-sections greyed with
  explanations.
- `PriorCreditWizard` Step 4: when an awarded course's code is in the
  GEN_ED pool, look up its sub-category from `GEN_ED_CATEGORIES` and
  surface that label ("History sub-pool" / "Humanities & Arts sub-pool"
  / "Social Science sub-pool") instead of the bare "GEN_ED."

**Confidence:** Medium — the data and helpers exist; the rendering
changes are well-bounded. Greying-out a satisfied sub-pool needs a
product decision on whether to soft-warn or hard-block (audit suggests
soft, matching today's `getGenEdStatus` philosophy).

---

## Audit notes

- Templates `csc_core.json`, `csc_cybersecurity.json`, `csc_dsai.json`, and (after the 2026-04-17 fix) `csc_hpc.json` each sum exactly to their declared `hours` (120).
- Pool codes referenced in all four JSONs (`GEN_ED`, `ENG_LIT`, `SCIENCE`, `COMM_REQ`, `MATH_STATS`, `CSC_LOWER_ELECTIVE`, `CSC_UPPER_ELECTIVE`, `CSC_ELECTIVE`, `CSC_HPC_ELECTIVE`, `FREE_ELECTIVE`) all exist in `POOL_COURSES` and `POOL_LABELS` and are all in `SATISFIABLE_POOLS`. No orphan pool codes.
- `test_equivalencies` seed awards several course codes that are not obviously used by any CSC concentration template (e.g. `ACCT2110`, `HEC2200`, `DS2810`, `PSY2210`, `MATH1630`, `MATH1000`). They still satisfy Rule 3 (unmatched credits count toward total hours). Not a bug — noted for completeness.
- Cumulative-model invariant in `test_equivalencies.sql` (each `awarded_course_code` appears at exactly one `min_score` per exam) holds for every exam I spot-checked. Any violation would manifest as duplicate `prior_credit` INSERTs in the wizard's Step 4.
