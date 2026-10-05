# MyDegreePlan — Live Bugs

Bugs that are open now. Fixed, intentional and not-a-bug entries live in [`tracking/bug_archive.md`](./bug_archive.md); Grep it for `BUG-N` to find why
something was changed. Bug numbers are never reused: **the next number is BUG-56.**

**When you log a bug,** add an entry below in the shape of the one that is there (Severity, File(s), Description, Impact, Suspected fix,
Confidence) and update the counts. **When you close one** (fixed, found intentional, or found not to be a bug), delete its entry here,
append a dated note to the end of the notes in `tracking/bug_archive.md` saying what was done and which branch or PR did it, and update the counts.
A bug found and fixed in one session goes straight to the archive and leaves the counts alone.

## Bug counts by severity

| Severity | Count |
|---|---|
| Critical | 0  |
| High     | 1  |
| Medium   | 0  |
| Low      | 1  |
| **Total** | **2** |

---

### BUG-22: Prior credit wizard is scoped to Semester 1 placement-adjacent credits only; full prior coursework onboarding is not supported

**Severity:** High
**File(s):** `src/components/PriorCreditWizard.jsx`, `src/components/Onboarding.jsx`

**Status (2026-10-05):** Partly addressed. Onboarding now asks the student type (incoming freshman or returning), and the wizard carries the code for transfer
entry (hidden from incoming freshmen, a course search, catalog validation). But the Transfer Credit, Dual Credit and Dual Enrollment buttons are still
`disabled` ("Coming soon") in `CREDIT_TYPES`, so no student can reach it: the interim grey-out from BUG-26, which waited on a transferable-course database
("Transferable-course database" in `ROADMAP.md`). The catalog now holds the full Tennessee Tech course list, so whether that blocker still applies is the first thing to check. The original
description below is the April state.

**Description:** The "Any prior credits or placement scores?" onboarding step surfaces only AP/IB/ACT/placement-style credits — the kinds relevant to Semester 1 course placement. It does not support full prior coursework onboarding for transfer students, continuing students, or dual-enrollment students who may have completed 30–60 credits before arriving. A transfer student using the wizard has no path to enter their completed coursework except manually after onboarding, one entry at a time, through the Prior Coursework panel.

**Impact:** The primary onboarding promise — "the app loads a plan tailored to where you are" — fails entirely for any student who is not a first-time freshman with zero prior credits. Transfer students see a full 8-semester plan with no prior credits applied and must manually reconstruct their history before the plan becomes useful. This is the exact friction the wizard is meant to eliminate.

**Suspected fix:** Expand the wizard to cover all `credit_type` values across all semesters. Add a branching question at onboarding: "Are you a first-time freshman?" → Yes: current AP/ACT flow. No: full prior coursework entry flow covering transfer credits, dual enrollment, CLEP, and completed TTU courses by semester. Mandatory for the prototype to serve non-freshman users.

**Confidence:** High

---

### BUG-55: Onboarding's math-sequence step shows the CSC statistics fork and a fixed chain, whatever the program

**Severity:** Low (display only, and not reachable while only CSC-department programs can be chosen)
**File(s):** `src/components/Onboarding.jsx` (`MATH_FORK_CODES`, step 4), `src/lib/mathPlacement.js` (`mathCurriculumFor`, the chain tables)

**Description:** Step 4 appends MATH 3070 and MATH 3470 (the CSC statistics fork) to every chain, and builds the chain from fixed tables chosen by
curriculum, not from the courses the chosen plan itself contains. Found in the 2026-10-01 Engineering trial: Nuclear Engineering's chain listed
MATH 2010, which is not on its map, and omitted MATH 2110 and MATH 2120. The trial's picker and wording findings were fixed by the program-first
onboarding (#24); this one was not re-run after it.

**Impact:** once a non-CSC program is opened, its students see an inaccurate math sequence at onboarding. Placement is unaffected (the degree builder
decides it).

**Suspected fix:** build the chain from the plan's own math slots, and show the statistics fork only when the plan has it.

**Confidence:** Medium (read from the code, not re-run)

---
