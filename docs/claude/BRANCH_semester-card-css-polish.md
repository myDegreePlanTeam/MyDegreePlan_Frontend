# Branch: `fix/semester-card-css-polish`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: CSS-only polish pass on slot row name alignment (BUG-40) and semester
> card header spacing (BUG-41). No logic changes, no schema changes, no new
> tests required.

---

## What This Branch Does

Fixes two low-severity visual polish bugs that make the grid harder to parse
at a glance. Both are pure CSS edits confined to `Dashboard.css` and touch
no business logic.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-40 (Low)** — Course name text wraps and indents inconsistently across
   slot rows and modal course lists.
2. **BUG-41 (Low)** — Semester card header (title + credits + controls) appears
   cramped; credits-planned text lacks clear visual separation from the title.

---

## Non-Goals / Out of Scope

Do not touch on this branch:

- Any `.jsx` component logic — structural HTML changes are out of scope unless
  a CSS-only fix turns out to be impossible (flag and ask first).
- `Semester.jsx`, `SlotModal.jsx`, `AddCourseModal.jsx` — read to confirm class
  names; do not edit.
- Any color palette or theme variable changes — BUG-38 (contrast audit) is held
  until the `feat/branding` + `feat/dark-mode` coordinated theme pass.
- The `feat/grid-redesign` Phase 3 row anatomy — that will rebuild these layouts
  wholesale; this branch only makes targeted fixes that can land before it.
- No new tests needed — both bugs are CSS presentation; there is no extractable
  logic to unit-test.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/semester-card-css-polish`.
2. Run `npm run test` from `MyDegreePlan_Frontend/`. Baseline: **13 files,
   266 tests passed**. Stop and report if it does not match.
3. Read in full before editing:
   - `src/components/Dashboard.css` — target file for all changes; key
     sections below.
   - `src/components/Semester.jsx` — confirm `.slot-row`, `.slot-info`,
     `.slot-right`, `.slot-code-row`, `.slot-free-add-top` class names
     match what's in the CSS.
   - `src/components/SlotModal.jsx` — confirm `.modal-course-row`,
     `.modal-course-info`, `.modal-course-top`, `.modal-course-name` class
     names match.

---

## Root Causes (verified against live code)

### BUG-40 — Course name indentation

The slot row and modal course row both use a flex column container
(`.slot-info` / `.modal-course-info`) whose children are a "top row" element
and a "name" element:

```
slot-row (flex row, justify-content: space-between)
  └── slot-info (flex col, min-width: 0)      ← no flex: 1
        ├── slot-code OR slot-code-row OR slot-free-add-top
        └── slot-name

modal-course-row (flex row, justify-content: space-between)
  └── modal-course-info (flex col, min-width: 0)  ← no flex: 1
        ├── modal-course-top
        └── modal-course-name
```

**Problem 1 — No `flex: 1` on the info column.** Without `flex: 1`, `.slot-info`
and `.modal-course-info` only take intrinsic width. The `justify-content:
space-between` on the parent pushes `.slot-right` / `.modal-course-credits` to
the far right, but the info column has no defined bound. On narrow cards a long
course name can overflow past the credits column rather than truncating within
the info column's own space.

**Problem 2 — `slot-code-row` gap is 0 (`gap: 0`).** The `.slot-code-row` rule
at `Dashboard.css:2043` sets `gap: 0`, making the code and transfer badge
visually run together with no breathing room. `.slot-free-add-top` has `gap:
0.4rem` (consistent). `.modal-course-top` has `gap: 0.5rem` (consistent). The
required-slot code row is the odd one out.

**Fix:** Add `flex: 1` to `.slot-info` and `.modal-course-info`. Correct the
`gap` on `.slot-code-row` to `0.4rem` to match `.slot-free-add-top`.

### BUG-41 — Semester header crowding

The `.semester-header` is a flex row with `.semester-header-left` (collapse
button + "Semester N" label) and `.semester-header-right` (credits text + notes
icon + "Mark Complete" button). The right group has `gap: 0.5rem`
(`Dashboard.css:1107`) — that gap is the only visual separation between the
credit count and the Mark Complete button.

The `.semester-credits` style is `font-size: 0.72rem; color: var(--muted)` —
the same size and a de-emphasized color. The "Mark Complete" button is also
`0.72rem`. Everything in the header reads at the same visual weight, so the
credits number doesn't stand out as primary metadata.

**Fix:**
- Increase the gap in `.semester-header-right` from `0.5rem` to `0.75rem` so
  the controls breathe more.
- Boost `.semester-credits` to `font-weight: 500` and `color: var(--white)` so
  the hour count reads as primary data at a glance, distinguishable from the
  muted label and the button.
- Add a thin separator (`border-left: 1px solid var(--navy-light)` +
  `padding-left: 0.75rem`) between the credits span and the notes icon to
  visually group the informational text apart from the action controls.

---

## Implementation Order

Both bugs are independent; no ordering dependency. Do BUG-40 first (larger
visual impact), then BUG-41.

---

## Plan

### BUG-40 — Three targeted CSS edits in `src/components/Dashboard.css`

**Edit 1** — Add `flex: 1` to `.slot-info` (line 346):

```css
/* Before */
.slot-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

/* After */
.slot-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  flex: 1;
}
```

**Edit 2** — Add `flex: 1` to `.modal-course-info` (line 540):

```css
/* Before */
.modal-course-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

/* After */
.modal-course-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  flex: 1;
}
```

**Edit 3** — Fix `.slot-code-row` gap (line 2043):

```css
/* Before */
.slot-code-row {
  display: flex;
  align-items: center;
  gap: 0;
}

/* After */
.slot-code-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
```

### BUG-41 — Two targeted CSS edits in `src/components/Dashboard.css`

**Edit 4** — Update `.semester-header-right` gap and add credits separator
(line 1107):

```css
/* Before */
.semester-header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* After */
.semester-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
```

**Edit 5** — Elevate `.semester-credits` visual weight (line 316):

```css
/* Before */
.semester-credits {
  font-size: 0.72rem;
  color: var(--muted);
}

/* After */
.semester-credits {
  font-size: 0.72rem;
  color: var(--white);
  font-weight: 500;
  padding-right: 0.25rem;
  border-right: 1px solid var(--navy-light);
  margin-right: 0.25rem;
}
```

This adds a thin right-border separator between the credits count and the notes
icon / Mark Complete button, making the informational side of the header
visually distinct from the action side.

> **Note:** If the border-right on `.semester-credits` looks off against the
> collapsed-semester row (which also renders `.semester-credits` inside
> `.semester-collapsed-meta`), remove it from `.semester-credits` and apply it
> only to `.semester-header-right .semester-credits` instead.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/Dashboard.css` | BUG-40, BUG-41 | 5 targeted rule edits |

No test files change — pure CSS, nothing extractable to unit test.

Close-out (docs-only commit):

| File | Change |
|---|---|
| `docs/claude/bug.md` | Remove BUG-40 and BUG-41 entries |
| `docs/claude/BRANCH_QUEUE.md` | Move `fix/semester-card-css-polish` to Merged Branches |
| `docs/claude/PACKAGES.md` | Mark Package L ✅ COMPLETE; update bug counts |
| `docs/claude/BRANCH_semester-card-css-polish.md` | Delete this file |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline before editing: **13 files, 266 tests passed**. This branch adds no
new tests. The count must remain 266 after all edits — a drop signals an
accidental JS change.

Manual verification (see below) is the bar here, not the test suite.

---

## Commit Plan

```
fix(css): add flex:1 to slot/modal info columns, fix slot-code-row gap (BUG-40)
```
Body: "slot-info and modal-course-info lacked flex:1, letting long names overflow
past the credits column. slot-code-row had gap:0, running code and transfer badge
together."

```
fix(css): increase semester header spacing and elevate credits weight (BUG-41)
```
Body: "semester-header-right gap raised 0.5rem → 0.75rem; semester-credits gets
font-weight:500, white color, and a border-right separator to read as primary
metadata rather than a footnote."

```
docs: close out fix/semester-card-css-polish (BUG-40, BUG-41)
```

---

## Known Constraints

- Do not change any color variables — BUG-38 contrast audit is held for the
  coordinated theme pass (see `BRANCH_QUEUE.md` Package N).
- `var(--navy-light)` is the correct border color for internal dividers — used
  consistently across `.semester-header`, `.slot-row`, and `.modal-footer`.
- `var(--white)` and `var(--muted)` are defined in `src/index.css`; do not
  introduce new variables.
- The `flex: 1` additions must not break the drag handle's fixed width on the
  left. `.slot-drag-handle` is `flex-shrink: 0` implicitly (it has fixed
  dimensions); `.slot-right` is explicitly `flex-shrink: 0` (`Dashboard.css:721`).
  Adding `flex: 1` to `.slot-info` only makes it grow into the remaining space —
  the flanking elements keep their widths.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Use a CSC plan with a full
semester grid.

**BUG-40 scenarios:**

1. **Long course name truncation (slot row).**
   Find a slot with a long course name (e.g. "Topics in Computer Science" or a
   long MATH/ENGL course). Before fix: the name may wrap under the credits column.
   After fix: name truncates with ellipsis within the slot-info column.

2. **Code-badge gap on required slots.**
   Add a transfer credit that fills a required course slot (e.g. ENGL1301). The
   slot row now shows `[code]` and `[Transfer]` badge side-by-side. Before fix:
   gap is 0, they run together. After fix: `0.4rem` gap matches the free-add row.

3. **Modal course list name alignment.**
   Open any pool slot (e.g. GEN_ED, SCIENCE). In the course list, compare rows
   with and without locked/taken badges. Before fix: names under rows with badges
   appear indented differently than rows without. After fix: name text in all rows
   aligns consistently at the left edge of `.modal-course-info`.

4. **Free-add row regression.** Verify `.slot-free-add-top` rows still look
   correct — the gap change only touched `.slot-code-row`, not free-add rows.

**BUG-41 scenarios:**

5. **Semester header readability.**
   Before fix: header shows "Semester 1" and "15 cr Mark Complete" in a tight
   cluster; credits and button bleed together. After fix: "15 cr" reads in white,
   clearly separated from the notes icon and "Mark Complete" button by the
   increased gap and the border-right divider.

6. **Collapsed semester row regression.**
   Collapse a semester (click ▲). The collapsed summary row shows semester label
   + credits. Verify the credits text doesn't show an unwanted separator border
   in the collapsed view. If it does, scope the border to
   `.semester-header-right .semester-credits` instead of `.semester-credits` and
   note this as the fix applied.

7. **Completed semester regression.**
   Mark a semester complete and verify the "Completed ✓" badge in the collapsed
   row still renders correctly alongside the credits.

---

## Post-branch Checklist

- [ ] `npm run test` reports 13 files, 266 tests passed.
- [ ] Manual verification scenarios 1–7 pass.
- [ ] `docs/claude/bug.md` — BUG-40 and BUG-41 entries removed; severity
      counts updated (Low 6 → 4, Total 12 → 10). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches table
      with today's date and BUG-40 + BUG-41 targets.
- [ ] `docs/claude/PACKAGES.md` — Package L marked ✅ COMPLETE; sequence
      strikethrough updated to `~~J~~ → ~~I~~ → ~~K~~ → ~~L~~ → M`; repo-state
      bug-count update appended.
- [ ] `docs/claude/BRANCH_semester-card-css-polish.md` deleted in the
      close-out commit.
- [ ] Merge to `main` `--ff-only`. Do not force-push.
