# MyDegreePlan — Feature & Bug Priority Report

> Created: 2026-05-07  
> Source: Brady's session kickoff — 7 items scoped from product feedback  
> None of these items were previously logged in docs/claude/ (directory did not exist).

---

## How to Read This Report

Each item has:
- **Status** — `Bug` (existing wrong behavior) or `Feature` (new behavior)
- **Priority** — P0 (quick fix / regression), P1 (core UX), P2 (complex, plan carefully)
- **Effort estimate** — rough session effort (S = ~1 session, M = ~2–3 sessions, L = 4+)
- **Files affected** — verified against current codebase as of this date
- **Implementation notes** — enough context to start coding without re-reading this report

---

## P0 — Quick Fix

### ~~1. Heavy-Load Credit Threshold Off By One~~ ✓ DONE — merged 2026-05-07

**Type:** Bug  
**Effort:** S (one line)

**Problem:** The credit-overload warning fires when a semester exceeds 19 credits, but the
correct threshold is "more than 18" (i.e., ≥ 19 triggers the warning).

**Current code:**
```
// Semester.jsx:66
const creditWarning = totalCr < 12 ? 'low' : totalCr > 19 ? 'high' : null
// Semester.jsx:163
'Heavy load — more than 19 credits'
```

**Fix:**
- Change `totalCr > 19` → `totalCr > 18`
- Change display string to `'Heavy load — more than 18 credits'`

**Files:** [`src/components/Semester.jsx`](../../src/components/Semester.jsx) lines 66, 163

---

### ~~2. Concentration Switch Deletes Prior Credits~~ ✓ DONE — merged 2026-05-07

**Type:** Bug  
**Effort:** S (remove one Supabase call)

**Problem:** `handleConcentrationSwitch()` currently deletes `prior_credits` rows for the student
when they switch concentrations. Prior coursework is student-level data, not plan-level — it
should survive any concentration change.

**Current code:**
```js
// DegreePlan.jsx:1036
await supabase.from('prior_credits').delete().eq('plan_id', profile.id)
```

**Fix:** Remove that line entirely. Prior credits should persist across concentration switches.
The archiving logic in `resolveTransferCredits` already re-evaluates which slots to archive
based on the new concentration's slots on load, so no other changes needed.

**Note:** The concentration switch warning UI (`DegreePlan.jsx:1522`) also says "cannot be
undone" — update that copy to clarify prior coursework is retained.

**Files:** [`src/components/DegreePlan.jsx`](../../src/components/DegreePlan.jsx) lines 1036, 1522

---

## P1 — Core UX (Implement in Order)

### ~~3. Reset Plan Button~~ ✓ DONE — merged 2026-05-07

**Type:** Feature  
**Effort:** S–M

**Problem:** The only way to reset a plan to its concentration defaults is to switch to a
different concentration and switch back — a destructive, non-obvious workaround. Users need
a direct "Reset Plan" button.

**Desired behavior:**
- Clears `student_plan_slots`, `student_free_add_slots`, and `student_semester_notes` for the
  student's current concentration (same DELETE pattern as `handleConcentrationSwitch` minus the
  prior_credits and profile update)
- Does NOT clear `prior_credits` (same rationale as item 2 above)
- Triggers a full re-load of the plan (same effect as switching concentration to itself)
- Should present a confirmation modal before executing — this is irreversible

**Implementation notes:**
- Re-use or extract the delete block from `handleConcentrationSwitch` into a shared
  `clearPlanData(profileId)` helper so both paths stay in sync
- The reset button can live alongside the existing Undo and Switch Concentration buttons in
  `degreeplan-header-actions`

**Files:** [`src/components/DegreePlan.jsx`](../../src/components/DegreePlan.jsx) — `handleConcentrationSwitch`, header actions section (~line 1114)

---

### ~~4. Add Semester Button + Dynamic Semester Numbering~~ ✓ DONE — merged 2026-05-07

**Type:** Feature  
**Effort:** M

**Problem:** A student can drag all courses out of a semester, which causes it to disappear
from the grid. There is no way to add it back without a concentration reset. Students who need
longer degree plans also have no way to extend beyond the template.

**Desired behavior:**

*Add Semester:*
- A button (e.g., below the last semester card) that appends a new empty semester to the grid
- The new semester is a free-add-only semester (no `requirement_slots` rows — it exists in UI
  state only, or via a lightweight record in `student_semester_notes`)
- Free-add courses can be dropped into it via `AddCourseModal`

*Dynamic renumbering:*
- Semester display labels must derive from the sorted position in the active semester list,
  not from the raw `semester_number` DB column value
- If semester 2 becomes empty and disappears, semester 3 should display as "Semester 2"
- The underlying DB column values do not need to change — only the display label is re-derived
  from the sorted render order (e.g., `index + 1`)

**Implementation notes:**
- Currently, `groupedSemesters` (or equivalent) in DegreePlan is built by grouping slots by
  their effective `semester_number`. The display label needs to be decoupled from that raw value.
- An empty semester disappears because the group has no slots. Track "active semesters" as a
  separate piece of state that can include semesters with zero template slots (user-added ones).
- Consider storing user-added semesters as a max semester number in `student_profiles` or as a
  count in local state, reset on concentration switch.

**Files:** [`src/components/DegreePlan.jsx`](../../src/components/DegreePlan.jsx) (semester grouping logic), [`src/components/Semester.jsx`](../../src/components/Semester.jsx) (header label)

---

### ~~5. Mark Semester Complete — Three Enforcement Rules~~ ✓ DONE — merged 2026-05-07

**Type:** Feature (enhancing existing behavior)  
**Effort:** M

**Problem:** The current mark-complete button on a semester card only checks for prereq/coreq
warnings. Three additional rules are needed:

**Rule A — Pool slots must have a course selected:**
- If any `is_pool = true` slot in the semester has no `selected_course_code`, the button is
  disabled with a message: "Select a course for all pool slots before marking complete."

**Rule B — Individual courses are marked complete:**
- When a semester is marked complete, every slot in that semester (both `requirement_slots` and
  `student_free_add_slots`) should have its `status` set to `'completed'` via Supabase UPDATE
- When undone, those statuses should revert to `'planned'` (or their prior status if tracked)

**Rule C — Sequential ordering:**
- A semester cannot be marked complete if any earlier semester (lower `semester_number`) is not
  yet complete
- The button for a later semester should be disabled with a tooltip like: "Complete earlier
  semesters first."

**Implementation notes:**
- Rule A: Check can happen inside `Semester.jsx` using the existing `slots` and `planSlots`
  props — no new props needed.
- Rule B: `onMarkComplete(true)` in DegreePlan needs to also fire batch UPDATEs on slot statuses.
  Consider a `handleMarkSemesterComplete(semNum, value)` that does the status sweep.
- Rule C: Requires `DegreePlan` to pass down a `priorSemestersAllComplete` boolean prop to each
  `Semester`. Can be derived from the sorted semester list and `planSemesterCompleted` state.

**Files:** [`src/components/Semester.jsx`](../../src/components/Semester.jsx) (button logic), [`src/components/DegreePlan.jsx`](../../src/components/DegreePlan.jsx) (`handleMarkComplete`, slot status updates)

---

## P2 — Complex / Plan Carefully

### 6. Full Undo Stack (All Change Types)

**Type:** Feature (major expansion of existing undo)  
**Effort:** L

**Problem:** The current undo button (`handleUndo` in DegreePlan.jsx) only undoes the most
recent pool slot course selection. `lastSelection` is a single `useState` value, not a stack.
The button is disabled at all other times.

**Desired scope of undo:**
- Pool slot course selections (already works)
- Free-add course additions
- Course drag-moves between semesters
- Prior credit inputs (adding a prior_credit row)
- Marking a semester complete/incomplete
- Adding a comment / clearing a comment
- Status changes (planned → in-progress → completed on individual slots)

**Implementation approach (recommended):**

Replace `lastSelection: state` with `undoStack: Array<UndoRecord>` where each record is a
discriminated union:

```js
// Examples of undo record shapes
{ type: 'pool_select',  slotId, prevCourseCode }
{ type: 'free_add',     freeAddId }
{ type: 'drag_move',    slotId, prevSemesterNumber }
{ type: 'prior_credit', priorCreditId }
{ type: 'sem_complete', semNum, prevCompleted, prevSlotStatuses: { [slotId]: status } }
{ type: 'note',         semNum, prevNote }
{ type: 'slot_status',  slotId, prevStatus }
```

Each action that mutates state pushes to the stack before applying the change. `handleUndo`
pops the top record and dispatches the appropriate reverse operation.

**Caution:** Prior credit undo requires deleting a `prior_credits` row from Supabase AND
reverting any archiving that the credit triggered — meaning archived slots must be un-archived.
This is the most complex undo case and may be worth deferring to a follow-on.

**Suggested split:** Implement undo for pool selections, free-add, drag-move, note, and
slot-status in one session. Prior credit undo in a separate session.

**Files:** [`src/components/DegreePlan.jsx`](../../src/components/DegreePlan.jsx) — `lastSelection` state, `handleUndo`, every mutation handler

---

### 7. Auto-Fill Holes After Prior Credits Applied

**Type:** Feature  
**Effort:** L

**Problem:** When a student's prior credits archive requirement slots, early semesters can drop
below full-time (12 credits). The planner should detect this and automatically propose or apply
moving courses from later semesters earlier to rebalance.

**Desired behavior:**
- After prior credits are resolved and archived slots are removed, evaluate each semester's
  credit total in order
- **Pass 1 (below 12):** For semesters under 12 credits, pull the earliest eligible course
  from the next semester that can be moved (prereqs satisfied by the prior semesters)
- **Pass 2 (below 15):** Repeat for semesters still under 15 credits
- Eligibility check: a course can move to an earlier semester only if all its prereqs are
  satisfied by courses in semesters before it (use existing `checkPrereqs` logic)
- Coreqs: if a course has a coreq that is in the same semester, both must move together or
  neither moves

**Implementation notes:**
- This is essentially a constrained backfill algorithm. It runs after `resolveTransferCredits`
  returns and after archived slots are excluded from the render.
- The output is a set of `semester_number` overrides written to `student_plan_slots`
  (same column as drag-move overrides). So the fill is persistent but reversible via drag.
- Consider making this opt-in (a "Rebalance Plan" button) rather than automatic on load —
  automatic rebalancing on every load could fight the student's manual arrangement.
- The algorithm must avoid an infinite loop: track which slots have already been moved in this
  pass; do not re-evaluate them.
- Science sequence pairs (PHYS/CHEM lecture + lab) must stay in the same semester.
  `getScienceWarnings` in `poolResolver.js` already detects mismatches — use it to block
  separating pairs.

**Files:** New file `src/lib/planBalancer.js` (pure function), called from [`src/components/DegreePlan.jsx`](../../src/components/DegreePlan.jsx) after credits resolve

---

## Implementation Order Recommendation

| # | Item | Priority | Effort | Start Here? |
|---|------|----------|--------|-------------|
| ~~1~~ | ~~Heavy-load threshold fix~~ | P0 | S | ✓ Done |
| ~~2~~ | ~~Concentration switch retains prior credits~~ | P0 | S | ✓ Done |
| ~~3~~ | ~~Reset plan button~~ | P1 | S–M | ✓ Done |
| ~~5~~ | ~~Mark complete — 3 rules~~ | P1 | M | ✓ Done |
| ~~4~~ | ~~Add semester + dynamic numbering~~ | P1 | M | ✓ Done |
| 6 | Full undo stack | P2 | L | Own session |
| 7 | Auto-fill holes | P2 | L | Own session; do after undo |

Items 1 and 2 can be done in the same branch (`fix/credits-and-concentration`).  
Items 3, 4, 5 fit a single feature branch (`feat/plan-controls`).  
Items 6 and 7 each warrant their own branches.

---

## Branch Naming (per project convention)

```
fix/credits-and-concentration      ← items 1 + 2
feat/plan-controls                 ← items 3, 4, 5
feat/undo-stack                    ← item 6
feat/plan-balancer                 ← item 7
```
