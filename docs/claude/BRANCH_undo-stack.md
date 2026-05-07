# Branch: `feat/undo-stack`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: Replace the single-step `lastSelection` undo with a multi-step undo stack covering
> pool slot selections, free-add additions, drag-moves, note saves, slot status changes, and
> semester completion toggles. Prior credit undo is deferred.

---

## What This Branch Does

Replaces `lastSelection: null | { slot, courseCode }` (line 82 of `DegreePlan.jsx`) with
`undoStack: UndoRecord[]` capped at 20 entries. Each mutation handler pushes a record before
applying its change. `handleUndo` pops the top record and reverses it directly (no recursive
handler calls — inline state + Supabase reversals only).

**In-scope mutation handlers** (7):
1. `handleSave` (line 547) — pool slot course selection
2. `handleStatusChange` (line 591) — template slot status cycle
3. `handleFreeAddStatusChange` (line 617) — free-add slot status cycle
4. `handleAddCourse` (line 658) — free-add insertion
5. `handleSemesterComplete` (line 755) — semester completion toggle
6. `handleNoteSave` (line 866) — semester note save/clear
7. `handleDragEnd` semester-move paths (lines 990–1036) — requirement_slot and free_add moves

---

## Non-Goals / Out of Scope

- **Prior credit undo** — deferred. Undoing a prior credit requires deleting a DB row AND
  re-unarchiving any slot it triggered; that interaction is complex enough to warrant its own
  branch after this one.
- **Drag-to-Prior-Coursework undo** — same reason (creates a prior credit).
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` — signatures unchanged.
- No schema changes. No new Supabase tables.
- No persistence of the undo stack across page reloads.

---

## Preconditions

1. From `main`: `git checkout -b feat/undo-stack`
2. Run `npm run test`. Baseline: **14 files, 279 tests passed**. Stop if it does not match.
3. Read before editing:
   - `src/components/DegreePlan.jsx` lines 82 (state), 547–655 (save / status / undo
     handlers), 658–705 (free-add), 755–825 (semester complete), 866–885 (notes),
     990–1036 (drag semester-move paths), 1085–1115 (reset / concentration switch),
     1185–1195 (Undo button JSX)

---

## Implementation Order

Single commit scope. All changes are in `DegreePlan.jsx` only.

1. Replace `lastSelection` with `undoStack`
2. Add `pushUndo` helper
3. Update `handleUndo` dispatch
4. Update all seven in-scope mutation handlers

---

## Plan

### Step 1 — Replace state and helper

**Line 82 — replace:**
```js
// Before
const [lastSelection, setLastSelection] = useState(null)

// After
const [undoStack, setUndoStack] = useState([])
```

Add a `pushUndo` helper immediately after (after line 82 or near the handler block):
```js
function pushUndo(record) {
  setUndoStack(prev => [...prev.slice(-19), record])  // cap at 20
}
```

---

### Step 2 — Update `handleUndo` (line 651)

Replace the body entirely:

```js
async function handleUndo() {
  if (!undoStack.length) return
  const record = undoStack[undoStack.length - 1]
  setUndoStack(prev => prev.slice(0, -1))

  if (record.type === 'pool_select') {
    if (record.prevCourseCode === null) {
      await handleRemove(slots.find(s => s.id === record.slotId))
    } else {
      // Restore prev selection directly — mirror handleSave internals without pushing
      setPlanSlots(prev => ({ ...prev, [record.slotId]: record.prevCourseCode }))
      setPlanStatuses(prev => ({ ...prev, [record.slotId]: record.prevStatus ?? 'planned' }))
      setPlanCreditsRemaining(prev => ({ ...prev, [record.slotId]: record.prevCreditsRemaining ?? 0 }))
      const slot = slots.find(s => s.id === record.slotId)
      await supabase.from('student_plan_slots').upsert({
        student_id: profile.id, requirement_slot_id: record.slotId,
        selected_course_code: record.prevCourseCode,
        status: record.prevStatus ?? 'planned',
        semester_number: planSemesterOverrides[record.slotId] ?? null,
        credits_remaining: record.prevCreditsRemaining ?? 0,
      }, { onConflict: 'student_id, requirement_slot_id' })
    }

  } else if (record.type === 'slot_status') {
    setPlanStatuses(prev => ({ ...prev, [record.slotId]: record.prevStatus }))
    const slot = slots.find(s => s.id === record.slotId)
    const courseCode = slot?.is_pool ? planSlots[record.slotId] : slot?.class_code
    if (courseCode) {
      await supabase.from('student_plan_slots').upsert({
        student_id: profile.id, requirement_slot_id: record.slotId,
        selected_course_code: courseCode, status: record.prevStatus,
        semester_number: planSemesterOverrides[record.slotId] ?? null,
        credits_remaining: planCreditsRemaining[record.slotId] ?? 0,
      }, { onConflict: 'student_id, requirement_slot_id' })
    }

  } else if (record.type === 'free_status') {
    setFreeAddSlots(list => list.map(f => f.id === record.freeAddId ? { ...f, status: record.prevStatus } : f))
    await supabase.from('student_free_add_slots').update({ status: record.prevStatus }).eq('id', record.freeAddId)

  } else if (record.type === 'free_add') {
    const fa = freeAddSlots.find(f => f.id === record.freeAddId)
    if (fa) handleRemoveFreeAdd(fa)

  } else if (record.type === 'sem_complete') {
    // Restore per-slot statuses saved at push time
    setPlanSemesterCompleted(prev => ({ ...prev, [record.semNum]: record.prevCompleted }))
    setSemesterExpanded(prev => ({ ...prev, [record.semNum]: record.prevCompleted ? false : true }))
    setPlanStatuses(prev => ({ ...prev, ...record.prevStatuses }))
    setFreeAddSlots(list => list.map(f => {
      const saved = record.prevFreeAdds.find(pf => pf.id === f.id)
      return saved ? { ...f, status: saved.status } : f
    }))
    // Persist
    await supabase.from('student_semester_notes').upsert({
      student_id: profile.id, concentration_id: profile.concentration_id,
      semester_number: record.semNum, note_text: semesterNotes[record.semNum] ?? '',
      updated_at: new Date().toISOString(), completed_by_student: record.prevCompleted,
    }, { onConflict: 'student_id, concentration_id, semester_number' })
    const semSlotIds = Object.keys(record.prevStatuses)
    if (semSlotIds.length > 0) {
      // Restore each slot to its individual prevStatus (batch not possible here since values differ)
      for (const slotId of semSlotIds) {
        await supabase.from('student_plan_slots')
          .update({ status: record.prevStatuses[slotId] })
          .eq('student_id', profile.id)
          .eq('requirement_slot_id', Number(slotId))
      }
    }
    for (const pf of record.prevFreeAdds) {
      await supabase.from('student_free_add_slots').update({ status: pf.status }).eq('id', pf.id)
    }

  } else if (record.type === 'note') {
    setSemesterNotes(prev => ({ ...prev, [record.semNum]: record.prevNote }))
    await supabase.from('student_semester_notes').upsert({
      student_id: profile.id, concentration_id: profile.concentration_id,
      semester_number: record.semNum, note_text: record.prevNote,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id, concentration_id, semester_number' })

  } else if (record.type === 'drag_slot') {
    const prevSem = record.prevSemester
    setPlanSemesterOverrides(prev => ({ ...prev, [record.slotId]: prevSem }))
    const slot = slots.find(s => s.id === record.slotId)
    await supabase.from('student_plan_slots').upsert({
      student_id: profile.id, requirement_slot_id: record.slotId,
      selected_course_code: slot?.is_pool ? planSlots[record.slotId] ?? null : slot?.class_code ?? null,
      status: planStatuses[record.slotId] ?? 'planned',
      semester_number: prevSem,
      credits_remaining: planCreditsRemaining[record.slotId] ?? 0,
    }, { onConflict: 'student_id, requirement_slot_id' })

  } else if (record.type === 'drag_free') {
    setFreeAddSlots(list => list.map(f => f.id === record.freeAddId ? { ...f, semester_number: record.prevSemester } : f))
    await supabase.from('student_free_add_slots').update({ semester_number: record.prevSemester }).eq('id', record.freeAddId)
  }
}
```

**Note on `sem_complete` slot restore:** Each slot has an individual `prevStatus` — they may
differ if some were 'in-progress' before the batch complete. A single batch UPDATE cannot
restore heterogeneous values. The loop above issues one UPDATE per slot. If there are many
slots this is N round trips; acceptable for an undo path.

---

### Step 3 — Update mutation handlers

**`handleSave` (line 547)** — replace `setLastSelection(...)` at line 564:
```js
// Before
setLastSelection({ slot, courseCode: course.code })

// After — push before the Supabase call (line 564 area)
pushUndo({
  type: 'pool_select', slotId: slot.id,
  prevCourseCode: planSlots[slot.id] ?? null,
  prevStatus: planStatuses[slot.id] ?? null,
  prevCreditsRemaining: planCreditsRemaining[slot.id] ?? 0,
})
```
Also in the error rollback (line 581): remove the `setLastSelection(null)` line.

**`handleStatusChange` (line 591)** — push before `setPlanStatuses`:
```js
pushUndo({ type: 'slot_status', slotId: slot.id, prevStatus: planStatuses[slot.id] ?? 'planned' })
```

**`handleFreeAddStatusChange` (line 617)** — push before `setFreeAddSlots`:
```js
pushUndo({ type: 'free_status', freeAddId: freeAdd.id, prevStatus: freeAdd.status })
```

**`handleAddCourse` (line 688)** — push after successful insert, at the `setFreeAddSlots` call:
```js
// After: setFreeAddSlots(prev => [...prev, data])
if (data) pushUndo({ type: 'free_add', freeAddId: data.id })
```

**`handleSemesterComplete` (line 755)** — push before optimistic updates (before line 764):
```js
const semSlotIds = (semesterMap[semNum] ?? []).map(s => s.id)
const prevStatuses = Object.fromEntries(semSlotIds.map(id => [id, planStatuses[id] ?? 'planned']))
const prevFreeAdds = freeAddSlots
  .filter(f => f.semester_number === semNum)
  .map(f => ({ id: f.id, status: f.status }))
pushUndo({
  type: 'sem_complete', semNum,
  prevCompleted: planSemesterCompleted[semNum] ?? false,
  prevStatuses,
  prevFreeAdds,
})
```

**`handleNoteSave` (line 866)** — push before `setSemesterNotes`:
```js
pushUndo({ type: 'note', semNum: semesterNumber, prevNote: semesterNotes[semesterNumber] ?? '' })
```

**`handleDragEnd` — requirement_slot semester move (line 997)** — push before `setPlanSemesterOverrides`:
```js
pushUndo({ type: 'drag_slot', slotId, prevSemester: currentSemester })
```

**`handleDragEnd` — free_add semester move (line 1022)** — push before `setFreeAddSlots`:
```js
pushUndo({ type: 'drag_free', freeAddId: slotId, prevSemester: fa.semester_number })
```

---

### Step 4 — Clear stack on reset / switch

**`handleResetPlan` (line 1085)** — replace `setLastSelection(null)`:
```js
setUndoStack([])
```

**`handleConcentrationSwitch` (line 1097)** — replace `setLastSelection(null)`:
```js
setUndoStack([])
```

---

### Step 5 — Update Undo button (line 1188)

```jsx
// Before
onClick={handleUndo}
disabled={!lastSelection}
title={lastSelection ? `Undo: remove ${lastSelection.courseCode}` : 'Nothing to undo'}

// After
onClick={handleUndo}
disabled={!undoStack.length}
title={undoStack.length ? `Undo last action (${undoStack.length} available)` : 'Nothing to undo'}
```

---

## Files Expected to Change

| File | Summary |
|---|---|
| `src/components/DegreePlan.jsx` | `lastSelection` → `undoStack`; `pushUndo` helper; new `handleUndo` dispatch; push calls in 7 mutation handlers; stack clear in reset/switch; Undo button title/disabled |

No new files. No schema changes.

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline: **14 files, 279 tests passed**. No new unit tests required (no extracted pure
logic). Count must remain 279 after all edits. Verify behavior manually.

---

## Commit Plan

Single commit:
```
feat(undo): replace lastSelection with multi-step undo stack
```
Body: "Replaces the single-step lastSelection undo with an undoStack array (capped at 20).
Covers pool slot selections, slot status, free-add status, free-add additions, semester
completion, note saves, and drag-moves. handleUndo dispatches inline reversals for each
record type. Prior credit undo deferred."

---

## Known Constraints

- `handleUndo` reverses state directly, not by calling mutation handlers — avoids re-pushing
  to the stack during undo.
- `sem_complete` undo issues one Supabase UPDATE per slot rather than a batch, because
  per-slot statuses before completion may have been heterogeneous.
- Undo stack is ephemeral — cleared on page reload, concentration switch, and plan reset.
  No cross-session undo is planned.
- `slots` in the `handleUndo` `drag_slot` path is the live `slots` state (requirement slot
  catalog). It is read-only and does not change during a session; safe to reference at undo time.
- Pool slot `prevCourseCode = null` means the slot was empty before the selection; undo calls
  `handleRemove` which also handles non-pool cleanup.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`.

1. **Pool selection:** Select a course for a pool slot. Click Undo. Confirm slot is empty.
   Select course A, then course B in the same slot. Click Undo. Confirm it reverts to A (not empty).
2. **Free-add:** Add a free-add course. Click Undo. Confirm it disappears.
3. **Drag-move:** Drag a slot to a different semester. Click Undo. Confirm it snaps back.
4. **Note:** Type a semester note. Click Undo. Confirm note reverts to prior text.
5. **Slot status:** Cycle a slot's status. Click Undo. Confirm it reverts.
6. **Semester complete:** Mark semester 1 complete. Click Undo. Confirm semester is un-completed
   and all slot statuses revert to their pre-complete values.
7. **Multi-step:** Perform 3 different actions (pool select, free-add, drag). Undo three times.
   Confirm each reversal is correct in reverse order.
8. **Reset clears stack:** Perform an action. Click Reset Plan. Confirm Undo button is disabled.

---

## Post-branch Checklist

- [ ] `npm run test` — 14 files, 279 tests passed.
- [ ] Manual verification passes for all 8 scenarios above.
- [ ] `docs/claude/BRANCH_QUEUE.md` — `feat/undo-stack` moved to Merged Branches with today's date.
- [ ] `docs/claude/BRANCH_undo-stack.md` deleted in close-out commit.
- [ ] Merge to `main`. Do not force-push.
