# Branch: `fix/gen-ed-sub-pool-surfacing`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: surface the existing GEN_ED sub-categories (History / Humanities &
> Arts / Social Science) in the SlotModal selection list and in
> PriorCreditWizard Step 4's award detail. No schema change, no migration,
> no new pool codes, no `requirement_slots` split.

---

## What This Branch Does

Closes BUG-43: GEN_ED is internally split into three sub-categories
(History, Humanities, Social) via the existing `GEN_ED_CATEGORIES` and
`getGenEdStatus` helpers in `poolResolver.js`, but the planner never
surfaces that split. Two surfaces become sub-category-aware:

(a) **SlotModal — GEN_ED slot selection.** When a student opens a GEN_ED
slot and the search box is empty, the course list renders in three
labeled sections; the section header for an already-satisfied
sub-category gets a "(already satisfied)" suffix and a CSS-greyed
treatment so the student sees which sub-pool still needs credits. The
search path remains flat (matches the existing `renderFreeSections`
pattern).

(b) **PriorCreditWizard — Step 4 award detail.** The
`wizard-award-pool` line currently reads
`Also satisfies: GEN_ED pool requirement`. After this fix it reads
`Also satisfies: General Education — History sub-pool` (or Humanities &
Arts / Social Science) when the awarded course is in GEN_ED. For other
pools the line uses `POOL_LABELS` instead of the raw pool code, so e.g.
`Also satisfies: Natural Science pool requirement`.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-43 (Medium)** — GEN_ED slot selection lacks sub-pool granularity.

Greying is **soft** — students may still pick courses from a satisfied
sub-pool (over-allocation is sometimes intentional). This matches the
audit recommendation and `getGenEdStatus`'s existing "at risk" warning
philosophy. Hard-blocking selection is out of scope.

---

## Out of Scope

Do not touch on this branch:

- Splitting `requirement_slots` into named sub-pools
  (`GEN_ED_HISTORY`, `GEN_ED_HUMANITIES`, `GEN_ED_SOCIAL`). The long-term
  schema fix is documented in `ROADMAP.md` under "GEN_ED sub-requirement
  enforcement" — explicitly deferred.
- Hard-blocking selection of a course whose sub-category is already
  satisfied. Soft greying only.
- Any change to `POOL_COURSES.GEN_ED` membership. The flat list is
  preserved for backward compatibility with `resolvePool`.
- `getGenEdStatus` return shape — read-only consumer here.
- The "at risk" warning surface (already wired through
  `getGenEdStatus`). Not regressed, not extended.
- The wizard's exam selection (Steps 1–3) — only the Step 4 detail line
  changes.
- BUG-37's display helper. Reuse but do not extend.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/gen-ed-sub-pool-surfacing`.
2. Run `npm run test`. Baseline: **12 files, 257 tests passed**. If it
   does not match, stop and report.
3. Read in full before editing:
   - `src/lib/poolResolver.js` lines 361–471 — the existing
     `GEN_ED_CATEGORIES`, `GEN_ED_CATEGORY_LABELS`, and `getGenEdStatus`.
     Both maps are private; this branch exports `GEN_ED_CATEGORIES` and
     adds a new `getGenEdSubCategory(courseCode)` helper.
   - `src/components/SlotModal.jsx` lines 80–82 (current
     `resolvePool(slot.class_code, ...)` call), 230–265 (the
     `renderFreeSections` pattern that the GEN_ED rendering mirrors), and
     305–320 (the modal-course-list render block where the new branch
     hooks in).
   - `src/components/PriorCreditWizard.jsx` lines 525–529 — the only
     line that changes in the wizard.
   - `src/components/Dashboard.css` lines 661–668 — the existing
     `.modal-section-label` rule that the new
     `.modal-section-satisfied` modifier extends.

---

## Implementation Order

Single bug, four commits:

1. **Helpers + tests** — export `GEN_ED_CATEGORIES`, add
   `getGenEdSubCategory`, write tests. No consumer changes yet.
2. **SlotModal sub-section render** — render GEN_ED as three sub-sections
   when `search === ''`; flat search behavior unchanged. Add the
   `modal-section-satisfied` CSS rule.
3. **Wizard Step 4 sub-pool label** — surface the sub-category for
   GEN_ED awards; use `POOL_LABELS` for all other pools.
4. **Close-out** — `bug.md`, `BRANCH_QUEUE.md`, `PACKAGES.md`, delete
   planning docs.

---

## Plan

### Step 1 — `src/lib/poolResolver.js`

Two additions, no removals.

**a)** Export `GEN_ED_CATEGORIES` (currently private, line 366):

```js
// Before:
const GEN_ED_CATEGORIES = { ... }

// After:
export const GEN_ED_CATEGORIES = { ... }
```

**b)** Add a new helper near `getGenEdStatus`:

```js
// ── getGenEdSubCategory ───────────────────────────────────────────────────────
// Returns { category, label } for any GEN_ED course code, or null if the code
// is not a GEN_ED member.  Used by SlotModal section grouping and by
// PriorCreditWizard Step 4 to label which sub-pool an awarded credit fills.

export function getGenEdSubCategory(courseCode) {
  if (!courseCode) return null
  for (const [category, codes] of Object.entries(GEN_ED_CATEGORIES)) {
    if (codes.includes(courseCode)) {
      return { category, label: GEN_ED_CATEGORY_LABELS[category] }
    }
  }
  return null
}
```

Adds one new export, leaves `GEN_ED_CATEGORY_LABELS` private (only the
helper reads it).

### Step 2 — Test coverage

New file: `src/tests/getGenEdSubCategory.test.js`. Five cases:

1. Returns null for `null` / `undefined` / `''` input.
2. Maps `'HIST2010'` → `{ category: 'History', label: 'History' }`.
3. Maps `'PHIL2250'` → `{ category: 'Humanities', label: 'Humanities & Arts' }`.
4. Maps `'ECON2020'` → `{ category: 'Social', label: 'Social Science' }`.
5. Returns null for a non-GEN_ED code (e.g. `'CSC1300'`).

Test count: **257 → 262**.

### Step 3 — `src/components/SlotModal.jsx`

**a)** Extend the import:
```js
import {
  resolvePool, resolveScience, resolveFreeElective,
  POOL_LABELS, formatMissingForDisplay,
  GEN_ED_CATEGORIES, getGenEdStatus,
} from '../lib/poolResolver'
```

**b)** Add a `renderGenEdSections` helper alongside `renderFreeSections`:

```js
function renderGenEdSections(annotated) {
  const status = getGenEdStatus(planSlots, slots, courseMap)
  const codeToCategory = {}
  for (const [cat, codes] of Object.entries(GEN_ED_CATEGORIES)) {
    for (const code of codes) codeToCategory[code] = cat
  }

  const grouped = { History: [], Humanities: [], Social: [], Other: [] }
  for (const course of annotated) {
    const cat = codeToCategory[course.code] ?? 'Other'
    grouped[cat].push(course)
  }

  return (
    <>
      {['History', 'Humanities', 'Social'].map(cat => {
        const list = grouped[cat]
        if (list.length === 0) return null
        const catStatus = status.find(s => s.category === cat)
        const satisfied = catStatus?.satisfied
        const className = satisfied
          ? 'modal-section-label modal-section-satisfied'
          : 'modal-section-label'
        return (
          <div key={cat}>
            <p className={className}>
              {catStatus?.label ?? cat}
              {satisfied && ' (already satisfied)'}
            </p>
            {list.map(course => (
              <CourseRow
                key={course.code}
                course={course}
                selected={selected}
                onSelect={setSelected}
              />
            ))}
          </div>
        )
      })}
      {grouped.Other.length > 0 && (
        <div>
          <p className="modal-section-label">Other</p>
          {grouped.Other.map(course => (
            <CourseRow
              key={course.code}
              course={course}
              selected={selected}
              onSelect={setSelected}
            />
          ))}
        </div>
      )}
    </>
  )
}
```

**c)** Hook into the existing render block:

```jsx
<div className="modal-course-list">
  {freeSections && search === '' ? (
    renderFreeSections()
  ) : slot.class_code === 'GEN_ED' && search === '' ? (
    renderGenEdSections(filtered)   // filtered already annotates + sorts
  ) : filtered.length === 0 ? (
    <p className="modal-empty">No courses match your search.</p>
  ) : (
    filtered.map(course => (
      <CourseRow ... />
    ))
  )}
</div>
```

`filtered` passes through unchanged when `search === ''` (an empty search
matches everything via `includes('')`), so the same `annotated` list
flows into the sub-section grouper. The sort order inside sub-sections
follows the order in `GEN_ED_CATEGORIES` arrays — alphabetical mostly,
matching the existing flat-list order.

**d)** New CSS rule in `src/components/Dashboard.css`, immediately after
`.modal-section-label`:

```css
.modal-section-satisfied {
  opacity: 0.55;
  color: var(--muted);
}

.modal-section-satisfied + .modal-course-row {
  opacity: 0.55;
}

.modal-section-satisfied ~ .modal-course-row {
  opacity: 0.55;
}
```

The sibling-combinator selectors visually grey the rows under a
satisfied header. Selection still works (no `pointer-events: none`),
matching the soft-warning intent.

> Wait — the section uses a wrapping `<div>` so the sibling combinator
> won't reach inside it. **Use a CSS class on the wrapping div instead**
> and apply opacity to the entire `<div>` (`.modal-section-satisfied
> .modal-course-row { opacity: 0.55 }`). When implementing, attach the
> `modal-section-satisfied` class to the wrapping `<div>`, not to the
> `<p>` header — the `<p>` keeps `modal-section-label` and adds nothing
> else. The CSS becomes:
>
> ```css
> .modal-section-satisfied .modal-section-label {
>   color: var(--muted);
> }
> .modal-section-satisfied .modal-course-row {
>   opacity: 0.55;
> }
> ```

### Step 4 — `src/components/PriorCreditWizard.jsx`

Extend the imports to include `POOL_LABELS` and `getGenEdSubCategory`
(if not already imported). Then update the `wizard-award-pool` block at
lines 525–529:

```jsx
{/* Before */}
{award.satisfies_pool && (
  <p className="wizard-award-pool">
    Also satisfies: {award.satisfies_pool} pool requirement
  </p>
)}

{/* After */}
{award.satisfies_pool && (() => {
  if (award.satisfies_pool === 'GEN_ED') {
    const sub = getGenEdSubCategory(award.awarded_course_code)
    if (sub) {
      return (
        <p className="wizard-award-pool">
          Also satisfies: General Education — {sub.label} sub-pool
        </p>
      )
    }
  }
  return (
    <p className="wizard-award-pool">
      Also satisfies: {POOL_LABELS[award.satisfies_pool] ?? award.satisfies_pool} pool requirement
    </p>
  )
})()}
```

The IIFE keeps the JSX inline without lifting a helper into the
component scope — the logic is two checks and a fallback.

---

## Open Questions (resolved)

**Q1 — Soft greying vs hard block.** Audit suggests soft. ROADMAP entry
calls full enforcement out as deferred. *Decision: soft*. CSS opacity +
header suffix only; the `<button>` stays clickable.

**Q2 — Empty-search vs search-active rendering.** FreeSections already
sub-sections only when `search === ''`. *Decision: same pattern for
GEN_ED.* When the student is searching, the list goes flat (like every
other slot). When the search field is empty, the three sub-sections
appear.

**Q3 — Order of sub-sections.** `GEN_ED_CATEGORIES` is declared in
History → Humanities → Social order; `getGenEdStatus` returns the same
order. *Decision: render in that order regardless of fill state.*
Reordering satisfied sections to the bottom would be a UX flourish; keep
it stable for predictability.

**Q4 — Pool label phrasing on the wizard award line.** For non-GEN_ED
pools the existing copy reads "Also satisfies: GEN_ED pool requirement"
(raw code). *Decision: swap the raw code for `POOL_LABELS[pool]`.*
Cheap quality-of-life win that matches BUG-37's display philosophy.
Pure visual; no logic change.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/lib/poolResolver.js` | 43 | Export `GEN_ED_CATEGORIES`; add `getGenEdSubCategory` |
| `src/tests/getGenEdSubCategory.test.js` | 43 | New test file, 5 cases |
| `src/components/SlotModal.jsx` | 43 | New `renderGenEdSections`; one render-block branch |
| `src/components/PriorCreditWizard.jsx` | 43 | Update wizard-award-pool render |
| `src/components/Dashboard.css` | 43 | New `.modal-section-satisfied` rule |
| `docs/claude/bug.md` | — | Remove BUG-43 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move into Merged Branches table on close-out |
| `docs/claude/PACKAGES.md` | — | Mark Package K complete on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **12 files, 257
tests passed**. After fix: **13 files, 262 tests passed** (one new test
file with 5 cases).

Manual verification (below) is the bar for the rendering surfaces — no
React-component coverage today and adding it for two render edits is
scope creep.

---

## Commit Plan

```
fix: surface GEN_ED sub-categories in SlotModal and wizard Step 4 (BUG-43)

refactor: route wizard award line through POOL_LABELS for non-GEN_ED pools

docs: close out fix/gen-ed-sub-pool-surfacing (BUG-43)
```

The split:
- Commit 1 — helper export + tests + SlotModal + Dashboard.css (the
  primary user-facing change).
- Commit 2 — wizard line update (separated for review).
- Commit 3 — close-out.

If a reviewer prefers a single behavior commit, fold 1 + 2 — the wizard
edit is two lines.

---

## Known Constraints

- `getGenEdStatus` and `GEN_ED_CATEGORY_LABELS` semantics unchanged.
- `POOL_COURSES.GEN_ED` flat list unchanged — `resolvePool('GEN_ED', ...)`
  still works for callers that do not care about sub-categories.
- Soft-greying does not block selection. A student picking a 7th GEN_ED
  course in an already-satisfied sub-pool sees the at-risk warning fire
  via `getGenEdStatus` — same as before.
- The `awarded_course_code` on `award` rows is the canonical key used by
  `getGenEdSubCategory` in the wizard. Confirmed exists at
  `PriorCreditWizard.jsx:501`.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Use a CSC plan.

1. **GEN_ED modal — empty state.**
   - Open a GEN_ED slot in any semester. Clear the search field.
   - **Before fix:** the modal shows one flat alphabetical list of every
     GEN_ED-eligible course.
   - **After fix:** three labeled sections appear — `History`,
     `Humanities & Arts`, `Social Science` — each containing only that
     sub-category's courses.

2. **GEN_ED modal — satisfied sub-pool greying.**
   - Fill enough GEN_ED slots with History courses (e.g. HIST2010 + HIST2020 = 6 hrs)
     so the History sub-pool is satisfied.
   - Open a still-empty GEN_ED slot.
   - **Expected:** the `History (already satisfied)` header appears
     greyed; the rows beneath are dimmed but still selectable.

3. **GEN_ED modal — search regression.**
   - Open a GEN_ED slot, type `econ` into the search box.
   - **Expected:** the sub-section grouping disappears; the result is a
     flat list of matching courses (matches the pre-fix behavior under
     search). Same as every other slot's modal.

4. **Wizard Step 4 — GEN_ED sub-pool label.**
   - Run the prior-credit wizard. AP Credit → `Macroeconomics` → Score 3.
   - Step 4 award detail line.
   - **Before fix:** `Also satisfies: GEN_ED pool requirement`.
   - **After fix:** `Also satisfies: General Education — Social Science sub-pool`.

5. **Wizard Step 4 — non-GEN_ED label regression.**
   - Run the wizard. AP Credit → `Chemistry (STEM)` → Score 5.
   - Step 4 award detail line for CHEM1110/CHEM1120 (both
     `satisfies_pool = 'SCIENCE'`).
   - **Before fix:** `Also satisfies: SCIENCE pool requirement`.
   - **After fix:** `Also satisfies: Natural Science pool requirement`.

6. **Non-GEN_ED slot regression.**
   - Open a SCIENCE / CSC_ELECTIVE / etc. slot.
   - **Expected:** rendering is unchanged from before (no sub-section
     grouping, no greying). The new render branch is gated on
     `slot.class_code === 'GEN_ED'`.

7. **At-risk warning regression.**
   - Configure a plan that triggers the existing `getGenEdStatus` "at
     risk" path (e.g. fill all six GEN_ED slots with History courses
     leaving Humanities and Social at 0 hrs).
   - **Expected:** the existing at-risk warning still fires on the grid.
     This branch did not touch that code path.

---

## Post-branch Checklist

- [ ] `npm run test` reports 13 files, 262 tests passed.
- [ ] Manual verification scenarios 1–7 pass.
- [ ] `docs/claude/bug.md` — BUG-43 entry removed; severity counts
      updated (Medium 7 → 6, Total 14 → 13). Do not renumber remaining
      bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches
      table with today's date.
- [ ] `docs/claude/PACKAGES.md` — Package K marked ✅ COMPLETE; sequence
      strikethrough updated to `~~J~~ → ~~I~~ → ~~K~~ → L → M`. Repo-state
      bug-count update appended.
- [ ] `docs/claude/BRANCH_gen-ed-sub-pool-surfacing.md` deleted in the
      close-out commit.
- [ ] `docs/claude/PROMPT_gen-ed-sub-pool-surfacing.md` deleted in the
      close-out commit (per the 2026-04-29 docs convention).
- [ ] Merge to `main` `--ff-only`. Do not force-push.
