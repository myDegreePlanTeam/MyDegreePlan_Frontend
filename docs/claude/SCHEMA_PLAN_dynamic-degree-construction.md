# Schema Plan — feat/dynamic-degree-construction

**Status:** For Brady's review. No migrations applied, no component code written.  
**Session date:** 2026-05-15

---

## Section 1 — Current `requirement_slots` Shape

Every column that currently exists on `requirement_slots`, assembled from the
original seed INSERT in `seed.js` and every migration through tier 17:

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT | NOT NULL | Primary key, generated always as identity |
| `concentration_id` | INTEGER | NOT NULL | FK → `concentrations.id` |
| `semester_number` | INTEGER | **YES** (nullable since tier 17) | Template hint: which semester this slot was seeded into. NULL means "no hint." |
| `slot_order` | INTEGER | **YES** (nullable since tier 17) | Display order within the template semester. Used for ORDER BY on load. |
| `class_code` | TEXT | NOT NULL | Course code (e.g. `CSC1300`) or pool code (e.g. `GEN_ED`) |
| `is_pool` | BOOLEAN | NOT NULL | `true` → student picks from a pool; `false` → fixed course |
| `flex_credits` | INTEGER | YES | Total credits needed when the slot is a flex-fill pool slot (e.g. 5 for Core FREE_ELECTIVE Sem 8) |

**Important tier 17 context:** The unique constraint on
`(concentration_id, semester_number, slot_order)` was dropped. Both columns
were made nullable. `seed.js` was updated to delete-then-insert rather than
upsert. As a result, `semester_number` and `slot_order` are now advisory
hints rather than enforced structure. Existing seed data retains its values.

---

## Section 2 — What the Algorithm Needs

### Data the algorithm reads

| Need | Where it already lives | Status |
|---|---|---|
| Student's ACT Math score | `student_profiles.act_math` (added tier 15) | ✓ Exists |
| Student type (new vs returning curriculum) | `student_profiles.student_type` (added tier 15) | ✓ Exists |
| Math chain lookup | `Onboarding.jsx` — `MATH_CHAINS_NEW` / `MATH_CHAINS_RETURNING` (already implemented) | ✓ Exists in JS |
| All requirement slots for the concentration | `requirement_slots` | ✓ Exists |
| Prerequisite rules | `prerequisite_entries` | ✓ Exists |
| Corequisite rules | `corequisite_entries` | ✓ Exists |
| Course credit hours | `courses.credits` | ✓ Exists |
| Prior credits (archived slots, earned hours) | `prior_credits` | ✓ Exists |
| Which slots are already archived | `student_plan_slots.archived` | ✓ Exists |

### What the algorithm needs but the schema does NOT currently have

**One thing is missing:** a way to distinguish algorithm-assigned semester
positions from student-dragged positions in `student_plan_slots`.

Currently `student_plan_slots.semester_number` means:
- `NULL` → use `requirement_slots.semester_number` as the fallback display position
- non-NULL → student dragged this slot to a different semester

After the algorithm runs and writes positions for every active slot,
`student_plan_slots.semester_number` will be non-NULL for all rows — but
there is no way to tell whether a given value came from the algorithm or from
a student drag. This distinction is critical for re-runs: if the student
updates their ACT Math score post-onboarding, the algorithm must overwrite
algorithm-placed rows but must leave student-dragged rows alone.

---

## Section 3 — Proposed Schema Changes

### 3.1 — New column: `student_plan_slots.position_source`

**Table:** `student_plan_slots`  
**Change type:** Additive (new nullable column)  
**Column:**

```sql
position_source TEXT CHECK (position_source IN ('algorithm', 'student'))
```

Semantics:
| Value | Meaning |
|---|---|
| `NULL` | No algorithm run yet for this slot; frontend falls back to `requirement_slots.semester_number` |
| `'algorithm'` | The algorithm assigned `semester_number`; re-runs may update this row |
| `'student'` | The student dragged this slot; the algorithm must never overwrite this row |

**Backfill needed:** None. Existing `student_plan_slots` rows (all pre-algorithm)
correctly remain `NULL`. The fallback chain (`planSemesterOverrides[slot.id] ?? slot.semester_number`)
continues to work exactly as before.

**seed.js update needed:** No. This column lives on student data, not catalog data.

**csc_*.json update needed:** No.

### 3.2 — `requirement_slots.semester_number` and `slot_order` — leave as is

**Recommendation:** Do NOT drop these columns. Do NOT make any further changes.

After tier 17 made them nullable, they serve a clean role:
- **Algorithm hints.** The algorithm can use them as a starting point
  (e.g., treat the seeded semester as a soft suggestion when resolving
  conflicts).
- **Fallback for new students before the algorithm runs.** The existing
  `planSemesterOverrides[slot.id] ?? slot.semester_number` pattern in every
  consumer already handles the fallback correctly. No code change is needed.
- **Fallback for empty-pool slots.** Pool slots with no course selected yet
  don't produce a `student_plan_slots` row (the algorithm only writes rows
  for slots it assigns a course to). The template hint positions them on
  screen while they await a student choice.

Once the algorithm has written `semester_number` for every active student's
every non-archived slot, these template columns become redundant. A future
migration (tier N+1 after launch) can strip them. Do not strip now.

### 3.3 — No new table needed

The algorithm's output is just a set of `(requirement_slot_id, semester_number)`
assignments per student. That maps exactly to the existing
`student_plan_slots` table. Writing the algorithm's output there — with
`position_source = 'algorithm'` and the appropriate `semester_number` —
is sufficient.

No intermediate or algorithm-specific table is needed.

### 3.4 — Math chain courses that aren't in `requirement_slots`

The math chain (MATH1000, MATH1710, MATH1720, MATH1730, MATH1904, MATH1906)
does not appear in any JSON template. These courses only enter the plan
when a student's ACT Math score places them below MATH1910.

**Two options (open question for Brady — see Section 6):**

**Option A — Place as `student_free_add_slots`.**  
The algorithm writes underprepared-math courses into `student_free_add_slots`
with the computed semester number. They appear on the grid exactly like
student-added courses. The algorithm does not touch `requirement_slots` or
`student_plan_slots` for these.

Pros: No schema change. Simple.  
Cons: Free-add slots don't participate in prereq-warning checks the same
way as template slots do (prereq checking walks `slots`, not `freeAddSlots`,
for its primary loop). The existing code does include free-add slots in the
placed array inside `prereqWarnings` and `coreqWarnings`, so this may
actually be fine — needs confirmation.

**Option B — Add conditional `requirement_slots` rows for each math chain
entry per concentration.**  
Each concentration template would gain placeholder rows for the math-chain
courses (with `semester_number = NULL`). The algorithm assigns them
semester numbers via `student_plan_slots`.

Pros: These courses participate fully in the template-slot system.  
Cons: Requires updating all four csc_*.json files and re-seeding. The math
chain is student-specific (depends on ACT score), so multiple math-chain
rows would need to be archived for students who don't need them, which
complicates the archiving logic significantly.

**Recommendation: Option A.** Simpler, no seed changes, no template changes.
The algorithm places underprepared-math courses as free-add slots.
`prereqWarnings` and `coreqWarnings` already include free-add slots in their
`placed` arrays, so prereq checking will work correctly.

---

## Section 4 — Migration Tier

**Next tier: Tier 18.**

Confirmed by reviewing the files in `MyDegreePlan_Prototype/`:
- `migration_tier17.sql` — most recent (drops unique constraint, makes
  `semester_number` and `slot_order` nullable on `requirement_slots`)
- `migration_math1000.sql` — standalone course insert (not a tier migration)
- `wipe_student_data.sql` — utility script (not a tier migration)

The tier 18 file would be `migration_tier18.sql`.

### Full SQL for tier 18

```sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- MyDegreePlan — Tier 18 Migration
-- Date: TBD
--
-- What this script does:
--   Adds position_source to student_plan_slots to distinguish semester
--   positions written by the plan-balancer algorithm ('algorithm') from
--   positions set by student drag-and-drop ('student').
--
-- Why:
--   The algorithm writes semester_number to student_plan_slots for every
--   active requirement slot at onboarding completion. When the student later
--   updates their ACT Math score and the algorithm re-runs, it must update
--   only 'algorithm'-sourced rows — student-dragged rows ('student') must
--   survive unchanged.
--
--   NULL = slot not yet assigned by the algorithm; frontend falls back to
--          requirement_slots.semester_number as the display position.
--
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE student_plan_slots
  ADD COLUMN IF NOT EXISTS position_source TEXT
    CHECK (position_source IN ('algorithm', 'student'));
```

> **Stop here — this is the only SQL for tier 18.** No other schema changes
> are required before implementation begins.

---

## Section 5 — Component Impact

### Files that read `semester_number` or `slot_order` from `requirement_slots`

Only `DegreePlan.jsx` directly queries `requirement_slots`. All other
components receive `slot` objects as props from `DegreePlan.jsx`; those
objects carry `semester_number` and `slot_order` from the query result.

---

#### `DegreePlan.jsx` — [src/components/DegreePlan.jsx](../src/components/DegreePlan.jsx)

**Direct `requirement_slots` query (line 159–162):**
```js
.select('id, semester_number, slot_order, class_code, is_pool, flex_credits')
.order('semester_number', { ascending: true })
.order('slot_order',      { ascending: true })
```

**`slot.semester_number` used as fallback in ~10 places, for example:**
```js
const sem = planSemesterOverrides[slot.id] ?? slot.semester_number
```
These appear in: `semesterMap`, `templateSemNums`, `prereqWarnings`,
`coreqWarnings`, `standingWarnings`, the seed-on-first-load effect,
`handleDragEnd` (lines 1104, 1178), and `syncArchivedSlots`.

**What breaks if both columns are removed:**
- The `?? slot.semester_number` fallback would silently produce `undefined`,
  collapsing all unassigned slots into the `undefined` key in `semesterMap`.
  The grid would render one broken "semester" containing all courses.
- The `ORDER BY` clause would error (column does not exist).
- `templateSemNums` (used for term label calculation) would produce an empty
  Set, breaking semester term display for all semesters.
- Prereq/coreq/standing warning calculations would treat every slot as
  semester `undefined`, making all of them appear concurrent — all prereq
  warnings would disappear.

**Fix shape (if columns were eventually removed):**
Replace every `planSemesterOverrides[slot.id] ?? slot.semester_number`
with just `planSemesterOverrides[slot.id]`. This requires that the algorithm
has written a `semester_number` for every active non-archived slot before
the user reaches the plan grid — i.e., the fallback behavior is no longer
needed because the algorithm guarantees coverage. Remove the ORDER BY from
the query and order in JS by the algorithm-assigned semester numbers from
`student_plan_slots`.

**Current plan: do not remove.** The fallback is still needed for:
(a) new students before the algorithm finishes writing,
(b) empty pool slots the algorithm didn't fill with a course,
(c) any slot in an error path where the algorithm didn't run to completion.

---

#### `SlotModal.jsx` — [src/components/SlotModal.jsx](../src/components/SlotModal.jsx)

**Reads `slot.semester_number` in two `useMemo` hooks (lines 97, 100, 130, 143):**
```js
const targetSem = planSemesterOverrides?.[slot.id] ?? slot.semester_number
```
Used to build `satisfiedCodes` (prereq checking) and `creditsBefore`
(standing requirement checking) in the modal's course list filter.

**Also displays `slot.semester_number` in the modal header (line 350):**
```jsx
<p className="modal-sub">Semester {slot.semester_number}</p>
```

**What breaks if the column is removed:**
- `targetSem` would be `undefined` for slots not yet overridden, meaning
  every prior-semester slot would appear to be in "semester undefined" —
  no slots would be treated as "before" this one, so all prereqs would
  appear satisfied (false positives in the modal's course availability).
- The "Semester X" subtitle would display "Semester undefined."

**Fix shape:** Same as DegreePlan.jsx — replace the fallback with
`planSemesterOverrides?.[slot.id]` only. The "Semester X" display would
need to receive the effective semester number from a prop or derive it from
`planSemesterOverrides`. This is straightforward once the algorithm guarantees
every slot has a written position.

---

#### `PriorCreditWizard.jsx` — [src/components/PriorCreditWizard.jsx](../src/components/PriorCreditWizard.jsx)

**Reads `slot.semester_number` for display only (line 499):**
```jsx
? (slot.semester_number ?? '?')
```
Used in the wizard's course-slot display to show which semester a slot is
currently in.

**What breaks if the column is removed:**
- Would display '?' for all slots that don't have an override.

**Fix shape:** Receive or derive effective semester from `planSemesterOverrides`.
Low priority — this is display-only and '?' is already the graceful fallback.

---

#### Files with NO direct reads of `requirement_slots` columns

- `Semester.jsx` — receives `slots` array as a prop, does not read
  `slot.semester_number` or `slot.slot_order` directly. It renders slots
  in the order the array arrives (already sorted by `slot_order` in the
  Supabase query).
- `usePlanCompleteness.js`, `transferCredits.js`, `prereqChecker.js`,
  `poolResolver.js` — none query `requirement_slots` directly; none access
  `semester_number` or `slot_order` on slot objects passed to them.
- `Onboarding.jsx` — fetches `requirement_slots` during onboarding to build
  `concSlots` for the wizard, but only uses `id`, `class_code`, and `is_pool`
  from those rows — not `semester_number` or `slot_order`.

---

## Section 6 — Open Questions

These cannot be resolved without Brady's input.

---

**Q1 — Math chain courses as free-add vs template slots.**  
When a student's ACT score puts them at MATH1000, MATH1710, or MATH1730,
those pre-MATH1910 courses don't exist in any concentration template.
Section 3.4 above recommends placing them as `student_free_add_slots`.
Do you agree with Option A (free-add), or should the templates be updated
to include them as conditional slots (Option B)?

---

**Q2 — Does the algorithm place specific courses for pool slots, or just positions?**  
For pool slots like `GEN_ED`, `SCIENCE`, `ENG_LIT`, and `CSC_ELECTIVE`,
the algorithm assigns the slot to a semester. Does it also:
(a) pre-fill a specific course choice for pool slots, or
(b) place the slot in the semester and leave it empty for the student to fill?

For `SCIENCE` specifically: the algorithm needs a valid sequence pair (e.g.,
CHEM1110 + CHEM1120). Does the algorithm pick a default sequence, or does
it place the two SCIENCE pool slots in adjacent semesters and let the student
choose?

---

**Q3 — CSC1300 + MATH1910 concurrent placement.**  
The task brief says "CSC1300 has a prereq/coreq on MATH1910 and cannot be
placed until MATH1910 is in a prior semester." However, all four JSON templates
place CSC1300 and MATH1910 in the same semester (Semester 1). This implies
MATH1910 is a *corequisite* (concurrent allowed), not a strict prerequisite.

Confirm: is the intent that MATH1910 must be in a strictly prior semester
(prerequisite), or that it may be taken in the same semester (corequisite)?
This is consequential for the algorithm: if it's a strict prerequisite, the
algorithm can never place CSC1300 in Semester 1 (because MATH1910 would also
be Semester 1 — nothing prior). If it's a corequisite, the current template
layout is correct and the algorithm replicates it.

---

**Q4 — Re-run trigger location.**  
The algorithm runs at onboarding completion and again when the student
updates their ACT Math score. Is there already a UI surface for updating
ACT scores post-onboarding (a profile/settings page), or will that need
to be built as part of this feature? Knowing this affects the hook placement
for the re-run.

---

**Q5 — Summer semester credit targets.**  
The algorithm targets 15–16 credit hours per semester, with a hard cap of 18
and a minimum of 12. Do Summer semesters have different targets? Summer
sessions at most universities carry lighter loads (e.g., 6–9 hours). If the
student's start_season is Summer, the algorithm needs either to skip Summer
or use a different target.

---

**Q6 — Behavior when ACT Math score is absent.**  
What happens if a student completes onboarding without entering an ACT Math
score (e.g., a transfer student who placed directly into MATH1910 via
transfer credits)? Does the algorithm assume MATH1910 as the starting point
of the math chain, or does it require a score before running?

---

**Q7 — slot_order within newly-assigned semesters.**  
When the algorithm places slots from different template semesters into the
same algorithm semester, the within-semester display order is determined by
`slot_order` from `requirement_slots` (which was relative to the original
template semester). The result may look arbitrary.

Is display order within a semester important enough to warrant adding a
`slot_order` column to `student_plan_slots`, or is arbitrary ordering
acceptable for the MVP? Adding it now is easy (one extra column in tier 18);
retrofitting it later requires touching the algorithm and migration.

---

**Q8 — GEN_ED sub-requirement enforcement in the algorithm.**  
The algorithm places GEN_ED pool slots into semesters. If it also pre-fills
specific course choices for GEN_ED slots (see Q2), should it enforce the
6-hr History / 6-hr Humanities / 6-hr Social Science sub-requirements when
making those selections? Or does it treat all GEN_ED slots as interchangeable
and leave sub-requirement tracking to the existing `getGenEdStatus`
warning system?

---

*End of schema plan. Awaiting Brady's review and answers to Section 6 before implementation begins.*
