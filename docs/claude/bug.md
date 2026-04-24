# MyDegreePlan — Static Analysis Audit

**Date of audit:** 2026-04-17
**Branch audited:** `main` (both `MyDegreePlan_Frontend` and `MyDegreePlan_Prototype`)
**Branches excluded from scope:** `fix/act-wizard-and-equivalencies`, `fix/prereq-coreq-logic`
**Scope:** static analysis only — no code changes, no fixes, no issues filed. Cross-file consistency included.

> **2026-04-17 update:** The original BUG-1 (HPC declared hours did not match slot total) has been fixed. `csc_hpc.json` Semester 8 now includes a second `GEN_ED` slot, bringing the concentration to 120 hrs, and `migration_tier12.sql` backfills the same slot into the live `requirement_slots` table. Remaining bugs below are renumbered accordingly.

> **2026-04-24 update:** `fix/onboarding-wizard-overhaul` merged. BUG-4 (concentration-agnostic transfer-credit pool resolution), BUG-8 (`validatePriorCredit` did not enforce `min_score`), BUG-27 (no back button on onboarding step 3), BUG-28 (ACT Math gate inaccessible post-freshman-branch removal), BUG-29 (wizard output string concatenation), and BUG-30 (Prior Coursework panel unsorted) are fixed. BUG-26 received its planned interim fix (transfer-credit option disabled + greyed as "Coming soon"). The full fix for BUG-26 is tracked in `BRANCH_QUEUE.md` under Deferred Data Tasks (`data/transferable-course-database`), so the BUG-26 entry is removed from this list. The freshman/non-freshman onboarding branching was removed as part of the same merge. Entries for the seven fixed bugs are deleted below; remaining bug numbering is unchanged.

## Bug counts by severity

| Severity | Count |
|---|---|
| Critical | 1  |
| High     | 10 |
| Medium   | 10 |
| Low      | 5  |
| **Total** | **26** |

---

### BUG-1: `SlotModal.annotate` calls `checkPrereqs` with only 3 arguments, dropping prior credits, catalog, and coreqs

**Severity:** High
**File(s):** `src/components/SlotModal.jsx:138`, `src/lib/prereqChecker.js:96-103`

**Description:** `annotate()` calls `checkPrereqs(course.code, prereqMap, satisfiedCodes)` — omitting `priorCredits`, `courseMap`, and `coreqMap`. `prereqChecker.js` declares those parameters with defaults (`[]`, `{}`, `{}`), so the call compiles, but the consequences are:
- Prior credits that satisfy a prereq are ignored in the modal (e.g. a student with AP Calc AB credit for MATH1910 will still see MATH1920 locked with "Prereqs needed").
- `classifyPrereq` cannot detect placement/consent courses (empty `courseMap`), so those suppressions do not apply in the modal.
- Codes that are only coreqs (not prereqs) will falsely appear as missing prereqs.

`DegreePlan.jsx` correctly passes all six arguments elsewhere, so the grid and modal disagree.

**Impact:** Observable wrong output: courses the student can actually take are rendered as locked, and vice versa for consent/placement courses. Students with significant prior credits will be unable to select downstream courses from the pool-slot modal.

**Suspected fix:** Thread `priorCredits`, `courseMap`, and `coreqMap` (or at least `priorCredits` and `courseMap`) through `SlotModal` props from `DegreePlan` and pass them into `checkPrereqs`.

**Confidence:** High

---

### BUG-2: `SlotModal.satisfiedCodes` includes pool selections and class_codes from every semester, not just prior ones

**Severity:** High
**File(s):** `src/components/SlotModal.jsx:85-89`

**Description:** `satisfiedCodes` is built as the union of *every* non-pool `class_code` plus *every* value in `planSlots`. It does not restrict to slots whose `semester_number < slot.semester_number`. `checkPrereqs` contractually uses `completedCodes` (prior semesters only); this modal hands it "ever-planned codes".

**Impact:** A course whose only prereq is scheduled in a *later* semester appears available in the modal when opened for an *earlier* semester. A student could plan a course into Semester 3 whose prereq they have only placed in Semester 5, and the modal will not block the selection. Contradicts the per-semester prereq semantics enforced by `DegreePlan.prereqWarnings`.

**Suspected fix:** Filter `satisfiedCodes` to slots with `semester_number < slot.semester_number` (respecting `planSemesterOverrides`), mirroring the grid's logic.

**Confidence:** High

---

### BUG-3: `resolveTransferCredits` and `resolveTransferDetails` use different Rule 1 skip logic for non-pool slots

**Severity:** High
**File(s):** `src/lib/transferCredits.js:73-87` vs `src/lib/transferCredits.js:131-142`, referenced workaround in `src/components/DegreePlan.jsx:830-851`

**Description:** In `resolveTransferCredits`, Rule 1 intentionally does *not* skip when `planSlots[slot.id]` is set (inline comment at line 75-77). In `resolveTransferDetails`, Rule 1 *does* skip at line 133 (`if (planSlots[slot.id]) continue`). The matching logic is supposed to be identical by design (JSDoc at line 113: "Same matching logic"). The inline comment block at `DegreePlan.jsx:832-835` describing the workaround appears to have been written against the `resolveTransferDetails` behavior, not the actual `resolveTransferCredits` behavior.

**Impact:** A non-pool slot whose `planSlots[slot.id]` is populated (e.g. after a semester drag) plus a matching `satisfies_course_code` prior credit will be:
- archived by `resolveTransferCredits` (the slot shows as transfer-satisfied),
- absent from `resolveTransferDetails` (no credit-type badge, no `priorCreditId` reference).

The UI badge label fails to render ("Transfer" / "AP" / etc.) even though the slot is archived. This is silent enough that it looks like a rendering bug instead of a data-contract violation.

**Suspected fix:** Pick one canonical skip policy for non-pool Rule 1 and apply it in both functions. Update the `DegreePlan.syncArchivedSlots` comment to match. Factor the shared matching logic into one helper so drift cannot recur.

**Confidence:** High

---

### BUG-5: `SlotModal.creditsBefore` ignores `priorCredits` and `planSemesterOverrides`

**Severity:** High
**File(s):** `src/components/SlotModal.jsx:105-116`

**Description:** `creditsBefore` sums `slots.filter(s => s.semester_number < slot.semester_number)`. It uses the *static* `slot.semester_number` rather than the student's active semester via `planSemesterOverrides`, and it ignores credit-bearing `priorCredits`. Standing thresholds are junior=60 and senior=90.

**Impact:**
1. A student with substantial prior credits (common for transfers) will see otherwise-accessible senior-standing courses locked with a "Requires senior standing" hint because the modal never counts their transferred hours. Observable wrong output.
2. A student who drags a course to a later semester than its template position will see standing miscalculated against the original slot positions, not the edited plan.

**Suspected fix:** Include `priorCredits` credit hours in the sum (skipping zero-credit placement rows and deduping by course code, consistent with `computePlanCredits`), and replace `s.semester_number` with `planSemesterOverrides[s.id] ?? s.semester_number`.

**Confidence:** High

---

### BUG-6: `computePlanCredits` does not include `student_free_add_slots`

**Severity:** High
**File(s):** `src/lib/transferCredits.js:180-215`

**Description:** `computePlanCredits` iterates `slots` (template-derived `requirement_slots`) and `priorCredits`, but never `student_free_add_slots`. Free-add slots are courses the student added to the plan outside the template; they are first-class plan data.

**Impact:** Total earned credits displayed to the student understate reality by the sum of every free-added course. `CompletionBadge`, Dashboard summaries, and the standing computation (if it ever uses this) are all affected. Dedup contract ("a course code contributes its credit hours exactly once") is also broken in the other direction — a free-added course not in the template is completely omitted.

**Suspected fix:** Add a third pass over `freeAddSlots` after Pass 2, dedup by `course_code` against `seen`, source `'free_add'`. Thread `freeAddSlots` through the hook/component callers.

**Confidence:** High — the omission is straightforward to see in the function body.

---

### BUG-7: `DegreePlan.handleConcentrationSwitch` does not clear `student_semester_notes`

**Severity:** High
**File(s):** `src/components/DegreePlan.jsx` (`handleConcentrationSwitch`)

**Description:** On concentration switch, the handler deletes rows from `student_plan_slots`, `student_free_add_slots`, and `prior_credits`, but leaves `student_semester_notes` intact. Notes include `completed_by_student` semester flags, which are specific to the old concentration's semester layout.

**Impact:** A student who marked Semester 3 complete on the Core concentration, then switched to HPC, will see HPC's Semester 3 auto-collapsed to the completion summary — despite never having reviewed it. Notes for a deleted layout persist and mis-apply. Silent state leak; no data loss but a visibly wrong UI.

**Suspected fix:** Delete the student's `student_semester_notes` rows in the same transaction as the other three tables, or keyspace notes per-concentration.

**Confidence:** High

---

### BUG-9: `computePlanCredits` dedup key collides on repeated pool pool_codes

**Severity:** Medium
**File(s):** `src/lib/transferCredits.js:196-211`

**Description:** Pass 2 iterates `slots`; for a non-pool slot it uses `code = slot.class_code`. Templates never repeat non-pool `class_code`s, so that path is safe. But for pool slots, the `code` is the course the student picked — different slots should be independent. That's fine. The subtle case: for an *unfilled* pool slot the function `continue`s (line 202), so no dedup key is set — correct. For a *filled* pool slot, if two pool slots in different semesters happen to select the same course (which is disallowed by `takenCodes`, but the validation is UI-only), the second one is silently dropped from the breakdown.

**Impact:** If `takenCodes` enforcement ever fails (see BUG-2 and the stale satisfiedCodes/takenCodes patterns in `SlotModal`), or if two pool slots somehow resolve to the same course via drag-and-drop, credit totals undercount by the shared course's credits rather than double-counting. Behavior is arguably correct (dedup semantics), but it masks a data-integrity problem upstream rather than surfacing it.

**Suspected fix:** Intentional per spec; no fix required — but flag duplicate pool selections at save time and reject them at the UI layer.

**Confidence:** Medium

---

### BUG-10: `getScienceWarnings` treats all Biology codes as the same sequence, missing a real conflict

**Severity:** Medium
**File(s):** `src/lib/poolResolver.js:210-313`

**Description:** `SCIENCE_SEQUENCE_NAMES` maps `BIOL1113`, `BIOL1123`, `BIOL2310` all to `'Biology'`. `SCIENCE_SEQUENCES` only includes the pairs `{BIOL1123, BIOL1113}` and `{BIOL2310, BIOL1113}` — the pair `{BIOL1123, BIOL2310}` is *not* a valid TTU sequence (they are alternative second-course options that share BIOL1113 as partner). But `getScienceWarnings` triggers a conflict only when `seqA !== seqB`. Because both codes are "Biology," a `{BIOL1123, BIOL2310}` selection produces *no* warning despite being invalid.

**Impact:** Students can silently fill both SCIENCE slots with BIOL1123 + BIOL2310 and pass completion without a valid 8-hour biology sequence. `resolveScience` narrow/autofill paths prevent this during modal-driven selection (BIOL1113 narrow mode restricts to BIOL1123/BIOL2310 only when BIOL1113 is already picked — so the combo can only be reached by unfilling the partner), but once reached, no warning appears.

**Suspected fix:** Check sequence membership rather than label equality — a configuration is valid iff both codes appear in the same entry of `SCIENCE_SEQUENCES`.

**Confidence:** Medium

---

### BUG-11: `resolveScience` only considers the first filled SCIENCE slot

**Severity:** Medium
**File(s):** `src/lib/poolResolver.js:220-252`

**Description:** `const alreadySelected = selectedScienceCodes[0]`. If a concentration template has more than two `SCIENCE` slots (none currently do), or if both slots are filled with codes from different partial sequences, resolution is driven by only one code — arbitrary if the first-filled-slot ordering changes. Combined with the `SlotModal` workaround that passes `otherPlanSlots` (one code max), current templates happen to work, but the invariant (exactly one "other" SCIENCE code) is undocumented in the helper.

**Impact:** Low today because both CSC concentrations have exactly two SCIENCE slots. Will silently break if a future concentration adds a third.

**Suspected fix:** Either assert `selectedScienceCodes.length <= 1` in `resolveScience`, or extend the algorithm to handle multi-slot cases explicitly.

**Confidence:** Medium

---

### BUG-12: `AddCourseModal` and `PriorCreditWizard` raw-interpolate user input into PostgREST `.or()` filters

**Severity:** Medium
**File(s):** `src/components/AddCourseModal.jsx` (course search), `src/components/PriorCreditWizard.jsx:178`

**Description:**
```js
.or(`code.ilike.%${term}%,name.ilike.%${term}%`)
```
`term` is raw user input. PostgREST treats commas, parentheses, and special characters as structural delimiters inside `.or()`. A user typing a comma will produce an invalid filter that the server rejects; a malicious user can construct filters that break out of the intended predicate.

**Impact:** At best, search breaks on names containing commas or parentheses (many real course names have parentheses, e.g. "Physics 1: Algebra-Based" — safe, but "Calculus BC (Subscore)" style names can collide with IB/AP test names). At worst, a crafted input alters the filter tree in ways the developer did not intend. Row-level security still scopes results, so direct data exfiltration is unlikely, but query breakage from benign input is a real UX regression.

**Suspected fix:** Sanitize or URL-encode `term` before interpolation, escape commas and parentheses, or split into two sequential queries. PostgREST documents percent-encoding for special characters inside filters.

**Confidence:** Medium

---

### BUG-13: `DegreePlan.prereqWarnings` treats codes from a semester the student marked "complete" as completed regardless of the warning target's semester

**Severity:** Medium
**File(s):** `src/components/DegreePlan.jsx` (prereqWarnings/coreqWarnings memo)

**Description:** When a semester is marked `completed_by_student`, every code in that semester is added to the "satisfied" set fed into `checkPrereqs`, regardless of whether the completed semester comes *before* or *after* the semester containing the course whose prereqs are being evaluated. There is no direction check.

**Impact:** If a student accidentally marks Semester 6 complete (or intentionally does so to collapse the card), and Semester 3 contains a course whose only prereq lives in Semester 6, the Semester 3 course will look prereq-satisfied. Implausible but not prevented. Worst case: a student who toggles a wrong semester temporarily gets green-light warnings and commits to a scheduling decision that the eventual UI correction would reverse.

**Suspected fix:** Only pull satisfied codes from completed *earlier* semesters (positional `semester_number < target.semester_number`, honoring overrides). Completion of a later semester should not feed back into earlier prereq resolution.

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

### BUG-17: `SCIENCE_SEQUENCES` lists `GEOL1040 / GEOL1045` in both orderings; the second entry is unreachable

**Severity:** Low
**File(s):** `src/lib/poolResolver.js:210-218`

**Description:**
```
{ courses: ['GEOL1040', 'GEOL1045'] },
{ courses: ['GEOL1045', 'GEOL1040'] },
```
`resolveScience` iterates and matches on `includes(alreadySelected)`, then `find(c => c !== alreadySelected)` returns the partner. The first entry already handles both selection orders — the second is redundant. Not wrong, but cosmetic noise. Other sequences (BIOL1123/BIOL1113, BIOL2310/BIOL1113) are correctly listed once each.

**Impact:** None functionally. Maintenance ambiguity.

**Suspected fix:** Delete the second GEOL entry.

**Confidence:** High

---

### BUG-18: `getScienceWarnings` only examines the first two SCIENCE pool slots

**Severity:** Low
**File(s):** `src/lib/poolResolver.js:280-313`

**Description:** `const [slotA, slotB] = scienceSlots` destructures only the first two; extra SCIENCE slots are ignored. Only relevant if a concentration has ≥3 SCIENCE slots — current templates do not.

**Impact:** Latent. Future-concentration-bug risk.

**Suspected fix:** Iterate pairs or compute warnings per-slot against the rest of the set.

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

### BUG-20: Prior credit wizard accepts freeform transfer course codes with no validation

**Severity:** Critical
**File(s):** `src/components/PriorCreditWizard.jsx` (transfer credit step), `src/lib/validatePriorCredit.js`

**Description:** The "Transfer credit for a specific course" option in the wizard allows a student to type any arbitrary string as a course code (e.g. "Jimmy") with no validation against the course catalog. `validatePriorCredit` caps transfer credits at catalog hours or 6 if the course is not found — but it does not reject a course code that does not exist in the catalog at all. A nonsense course code passes validation and is inserted into `prior_credits` as a real record. Credits awarded by this record are counted toward the student's total degree hours.

**Impact:** Data corruption at onboarding. A student can award themselves arbitrary credits for nonexistent courses. Credit totals are inflated. Any downstream logic reading `prior_credits` (slot archiving, `computePlanCredits`, `CompletionBadge`) operates on fabricated data. This is the highest-risk bug in the onboarding flow because it happens at the point of first use and silently corrupts the plan.

**Suspected fix:** Validate `satisfies_course_code` against the live course catalog in `validatePriorCredit` for `transfer_credit` type — reject if the code does not exist in `courseCatalog`. Surface a clear error in the wizard ("We don't recognize that course code. Please check the TTU catalog or contact your advisor."). Replace free-text course code entry with a searchable dropdown bound to the catalog.

**Confidence:** High

---

### BUG-21: Transfer credit wizard allows user-editable credits field; credits should be read from catalog

**Severity:** High
**File(s):** `src/components/PriorCreditWizard.jsx` (transfer credit step)

**Description:** The wizard presents a free-entry credits field for transfer credit entries. Students should not be able to self-report credit hours — the app should look up the course in the catalog and display the hours as read-only. This is already the documented principle for scored exam types (`credits_awarded` is always read from `test_equivalencies`, never user-editable per `CLAUDE.md`). Transfer credits are inconsistently exempt from this rule.

**Impact:** Students can input inflated or incorrect credit values for real courses. A student transferring MATH1910 (4 cr) could enter 6 credits and the record is inserted without rejection. Combined with BUG-20, the wizard has no floor on credit integrity for transfer entries.

**Suspected fix:** On course code selection (once BUG-20 is fixed with a catalog-bound picker), auto-populate `credits_awarded` from `courses.credits` and render it as read-only. For courses genuinely not in the catalog (rare edge case for non-TTU transfer equivalencies), flag for advisor review rather than allowing student self-entry.

**Confidence:** High

---

### BUG-22: Prior credit wizard is scoped to Semester 1 placement-adjacent credits only; full prior coursework onboarding is not supported

**Severity:** High
**File(s):** `src/components/PriorCreditWizard.jsx`, `src/components/Onboarding.jsx`

**Description:** The "Any prior credits or placement scores?" onboarding step surfaces only AP/IB/ACT/placement-style credits — the kinds relevant to Semester 1 course placement. It does not support full prior coursework onboarding for transfer students, continuing students, or dual-enrollment students who may have completed 30–60 credits before arriving. A transfer student using the wizard has no path to enter their completed coursework except manually after onboarding, one entry at a time, through the Prior Coursework panel.

**Impact:** The primary onboarding promise — "the app loads a plan tailored to where you are" — fails entirely for any student who is not a first-time freshman with zero prior credits. Transfer students see a full 8-semester plan with no prior credits applied and must manually reconstruct their history before the plan becomes useful. This is the exact friction the wizard is meant to eliminate.

**Suspected fix:** Expand the wizard to cover all `credit_type` values across all semesters. Add a branching question at onboarding: "Are you a first-time freshman?" → Yes: current AP/ACT flow. No: full prior coursework entry flow covering transfer credits, dual enrollment, CLEP, and completed TTU courses by semester. Mandatory for the prototype to serve non-freshman users.

**Confidence:** High

---

### BUG-23: AP/placement credits entered at onboarding tag courses in semesters but do not remove them from the grid

**Severity:** High
**File(s):** `src/components/DegreePlan.jsx` (`syncArchivedSlots`), `src/lib/transferCredits.js` (`resolveTransferCredits`)

**Description:** When a student enters an AP or placement credit during onboarding, the credit is recorded in `prior_credits` and tagged on the relevant semester slot — but the slot is not archived and removed from the grid. The course remains visible as a requirement the student still needs to complete, despite having credit for it. The slot archiving logic in `syncArchivedSlots` / `resolveTransferCredits` is either not called at onboarding completion or fails silently for these entries.

**Impact:** Observable wrong output on first plan load. A freshman who entered AP Calculus AB credit during onboarding will see MATH1910 still present in Semester 1 or 2 as an unfilled requirement. The plan does not reflect the student's actual starting position, directly undermining the core product promise.

**Suspected fix:** Ensure `syncArchivedSlots` is called (or equivalent resolution logic runs) immediately after `handleAddPriorCredit` completes for each wizard entry. Verify that AP/placement credit types are processed by `resolveTransferCredits` Rule 1. Add an integration test: wizard entry of AP Calc AB → MATH1910 slot is archived on plan load.

**Confidence:** High

---

### BUG-24: Dragging a prior-credit-covered course to the Prior Coursework panel duplicates the record

**Severity:** High
**File(s):** `src/components/DegreePlan.jsx` (drag-to-transfer handler)

**Description:** When a student drags a course slot that is already covered by a prior credit (e.g. MATH1910 covered by AP Calc AB entered at onboarding) onto the Prior Coursework panel, the drag handler creates a second `prior_credits` record for the same course. The original wizard-entered record is not detected or deduplicated. The result is two `prior_credits` rows for the same course, both counted by `computePlanCredits`, inflating total credits by the course's credit hours.

**Impact:** Silent credit inflation on a action a student would naturally take. Slot archiving may behave unpredictably with two competing records pointing at the same slot. The dedup logic in `computePlanCredits` (course code seen-set) may mask the symptom in credit totals while leaving duplicate rows in the database.

**Suspected fix:** Before creating a drag-to-transfer `prior_credits` record, check whether a record with the same `satisfies_course_code` already exists for this student. If it does, block the drag with a message ("This course is already in your Prior Coursework") or silently no-op. Do not insert a duplicate.

**Confidence:** High

---

### BUG-25: Notes field in transfer credit wizard accepts and stores arbitrary free text with no product purpose

**Severity:** Medium
**File(s):** `src/components/PriorCreditWizard.jsx` (transfer credit step)

**Description:** The transfer credit wizard includes an optional "notes" free-text field. No part of the application reads, displays, or acts on this field in any meaningful way. The field accepts any input and stores it in `prior_credits.note`. There is no UI surface that shows these notes to the student or advisor, no validation, and no documented intent for the field beyond future use.

**Impact:** Low functional impact today, but the field signals to users that the wizard accepts inputs it doesn't validate, and it adds noise to the `prior_credits` table. Its presence implies the app will do something with the note — a promise the current UI never keeps.

**Suspected fix:** Remove the notes field from the wizard entirely for the prototype, or wire it to a visible display in the Prior Coursework panel so the promise is kept. Do not leave a data-entry field that leads nowhere.

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

## Audit notes

- Templates `csc_core.json`, `csc_cybersecurity.json`, `csc_dsai.json`, and (after the 2026-04-17 fix) `csc_hpc.json` each sum exactly to their declared `hours` (120).
- Pool codes referenced in all four JSONs (`GEN_ED`, `ENG_LIT`, `SCIENCE`, `COMM_REQ`, `MATH_STATS`, `CSC_LOWER_ELECTIVE`, `CSC_UPPER_ELECTIVE`, `CSC_ELECTIVE`, `CSC_HPC_ELECTIVE`, `FREE_ELECTIVE`) all exist in `POOL_COURSES` and `POOL_LABELS` and are all in `SATISFIABLE_POOLS`. No orphan pool codes.
- `test_equivalencies` seed awards several course codes that are not obviously used by any CSC concentration template (e.g. `ACCT2110`, `HEC2200`, `DS2810`, `PSY2210`, `MATH1630`, `MATH1000`). They still satisfy Rule 3 (unmatched credits count toward total hours). Not a bug — noted for completeness.
- Cumulative-model invariant in `test_equivalencies.sql` (each `awarded_course_code` appears at exactly one `min_score` per exam) holds for every exam I spot-checked. Any violation would manifest as duplicate `prior_credit` INSERTs in the wizard's Step 4.
