# MyDegreePlan — Static Analysis Audit

**Date of audit:** 2026-04-17
**Branch audited:** `main` (both `MyDegreePlan_Frontend` and `MyDegreePlan_Prototype`)
**Branches excluded from scope:** `fix/act-wizard-and-equivalencies`, `fix/prereq-coreq-logic`
**Scope:** static analysis only — no code changes, no fixes, no issues filed. Cross-file consistency included.

> **2026-04-17 update:** The original BUG-1 (HPC declared hours did not match slot total) has been fixed. `csc_hpc.json` Semester 8 now includes a second `GEN_ED` slot, bringing the concentration to 120 hrs, and `migration_tier12.sql` backfills the same slot into the live `requirement_slots` table. Remaining bugs below are renumbered accordingly.

## Bug counts by severity

| Severity | Count |
|---|---|
| Critical | 0 |
| High     | 7 |
| Medium   | 7 |
| Low      | 5 |
| **Total** | **19** |

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

### BUG-4: `PriorCreditWizard` transfer-credit pool resolution is concentration-agnostic and uses arbitrary object-iteration order

**Severity:** High
**File(s):** `src/components/PriorCreditWizard.jsx:114-120`, `src/lib/poolResolver.js:11-172` (POOL_COURSES)

**Description:** When a transfer-credit award is built, the wizard resolves `satisfies_pool` by iterating `POOL_COURSES` and taking the first pool whose list contains the course:
```
for (const [poolCode, codes] of Object.entries(POOL_COURSES)) {
  if (codes && codes.includes(selectedExam.code)) { satisfiesPool = poolCode; break }
}
```
Multiple pools contain overlapping membership:
- `CSC2220`, `CSC2570`, `CSC2770` are in both `CSC_LOWER_ELECTIVE` and `CSC_ELECTIVE`.
- Most 3000/4000-level CSC courses are in both `CSC_UPPER_ELECTIVE` and `CSC_ELECTIVE`, and several also in `CSC_HPC_ELECTIVE`.

Iteration order (insertion order) is: `GEN_ED`, `ENG_LIT`, `SCIENCE`, `COMM_REQ`, `MATH_STATS`, `CSC_LOWER_ELECTIVE`, `CSC_UPPER_ELECTIVE`, `CSC_ELECTIVE`, `CSC_HPC_ELECTIVE`. So:
- `CSC2220` always resolves to `CSC_LOWER_ELECTIVE`. On the **Cybersecurity** and **Data Science/AI** concentrations there is no `CSC_LOWER_ELECTIVE` slot — the only place `CSC2220` could satisfy is the `CSC_ELECTIVE` pool, but `satisfies_pool='CSC_LOWER_ELECTIVE'` never matches any slot.
- `CSC4220` always resolves to `CSC_UPPER_ELECTIVE`. On **HPC** and **Cybersecurity** there is no `CSC_UPPER_ELECTIVE` slot.

**Impact:** The prior credit is stored (Rule 3), and its credits are counted, but `resolveTransferCredits` Rule 2 never archives any slot — the student keeps both the prior credit *and* the slot, effectively undercutting their plan by wasted capacity. Transfer-credit entry is quietly concentration-hostile.

**Suspected fix:** Pass the active concentration's slot set into the wizard and pick the pool code that (a) contains the course and (b) actually exists as a slot in the student's plan. Fall back to null only if no plan-resident pool matches.

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

### BUG-8: `validatePriorCredit` does not enforce `min_score` thresholds

**Severity:** Medium
**File(s):** `src/lib/validatePriorCredit.js:79-106`

**Description:** For scored exam types, the function filters `test_equivalencies` only by `test_type` and `awarded_course_code` — never by `min_score` against the user-supplied score. It then takes `rows[0].credits_awarded` as authoritative. Because the seed enforces a "lowest threshold" cumulative model, this happens to validate credits correctly when credits match. But nothing stops a direct-API caller from inserting a `prior_credit` claiming AP Calculus AB score=2 → MATH1910, 4 cr — the function says "valid."

**Impact:** The documented purpose of this function is "backend safety net … catches direct API calls and any unexpected wizard state." It does catch credit mismatches, but it does not catch score-gate violations. A determined student bypassing the wizard can award themselves credit they did not earn.

**Suspected fix:** Accept the user's score as a parameter; require `row.min_score <= userScore`. Alternatively, require the caller to pass the specific `test_equivalency_id` and look up that row exactly.

**Confidence:** High — the missing guard is explicit in the code.

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

## Audit notes

- Templates `csc_core.json`, `csc_cybersecurity.json`, `csc_dsai.json`, and (after the 2026-04-17 fix) `csc_hpc.json` each sum exactly to their declared `hours` (120).
- Pool codes referenced in all four JSONs (`GEN_ED`, `ENG_LIT`, `SCIENCE`, `COMM_REQ`, `MATH_STATS`, `CSC_LOWER_ELECTIVE`, `CSC_UPPER_ELECTIVE`, `CSC_ELECTIVE`, `CSC_HPC_ELECTIVE`, `FREE_ELECTIVE`) all exist in `POOL_COURSES` and `POOL_LABELS` and are all in `SATISFIABLE_POOLS`. No orphan pool codes.
- `test_equivalencies` seed awards several course codes that are not obviously used by any CSC concentration template (e.g. `ACCT2110`, `HEC2200`, `DS2810`, `PSY2210`, `MATH1630`, `MATH1000`). They still satisfy Rule 3 (unmatched credits count toward total hours). Not a bug — noted for completeness.
- Cumulative-model invariant in `test_equivalencies.sql` (each `awarded_course_code` appears at exactly one `min_score` per exam) holds for every exam I spot-checked. Any violation would manifest as duplicate `prior_credit` INSERTs in the wizard's Step 4.
