# Branch: `schema/semester-terms`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: Replace "Semester N" labels with real term labels ("Fall 2025"), add a season-aware
> semester creation wizard, and enforce fall-only / spring-only course restrictions at drag
> time and in the add-course modal. Supersedes the planned `feat/dynamic-semester-count`
> queue entry (persistence of extra semesters is delivered here via Tier 14 migration).

---

## What This Branch Does

Three connected changes that make semester scheduling season-aware:

1. **TERM-1 — Semester term labeling:** Display "Fall 2025" / "Spring 2025" on every semester
   card header. Term is computed from `start_season`/`start_year` (already on
   `student_profiles`) + sorted template position. User-added extra semesters store their
   explicit term via new `term_season`/`term_year` columns on `student_semester_notes`
   (Tier 14 migration). New pure-function file: `src/lib/semesterTerms.js`.

2. **TERM-2 — Add Semester wizard:** Replace the single-click "+ Add semester" button with a
   small modal asking season (Fall/Spring/Summer) and year. Placement appends after the last
   existing semester. Wizard output is persisted to `student_semester_notes` so extra semesters
   survive page reload (previously they were ephemeral).

3. **TERM-3 — Seasonal enrollment restrictions:** Fall-only and Spring-only course lists are
   encoded in a new `src/lib/semesterRestrictions.js`. Dragging a restricted course to a
   wrong-season semester is blocked with a toast. In `AddCourseModal`, restricted courses for
   the wrong season are grayed out.

---

## Non-Goals / Out of Scope

- Summer opt-in toggle — deferred to `feat/rules-filter-sidebar` per queue
- Summer semesters interspersed among template semesters — Summer is user-added extra only
- `projectGraduation()` rewrite — the function is replaced at its call site by `lastNonSummerTerm()` from `semesterTerms.js`; no deeper refactor
- Per-semester term collision detection (two "Fall 2025" semesters) — deferred
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` — signatures unchanged
- No new Supabase tables; only two nullable columns added to `student_semester_notes`

---

## Preconditions

1. Create branch: `cd MyDegreePlan_Frontend && git checkout -b schema/semester-terms`
2. Run `npm run test`. Baseline: **14 files, 279 tests passed**. Stop if it does not match.
3. **Apply Tier 14 migration in Supabase Dashboard SQL Editor before running the app.** The
   migration file is written in commit 1. Apply it before starting commits 2–4.
4. Read before editing:
   - `src/components/DegreePlan.jsx` lines 57 (`extraSemesters` state), 82 (`undoStack`),
     246–280 (notes load `useEffect`), 336–348 (`semesterNumbers`/`allSemesterNumbers` memos),
     1099–1148 (`handleDragEnd` semester-move paths), 1197–1207 (`handleResetPlan`),
     1209–1226 (`handleConcentrationSwitch`), 1380–1440 (grid render loop, add-semester button),
     1542–1555 (`projectGraduation`)
   - `src/components/Semester.jsx` lines 35, 62, 95–97, 125 (`displayNumber` prop usage)
   - `src/components/AddCourseModal.jsx` lines 18–23 (props), 44–100 (search + results rendering)

---

## Implementation Order

TERM-1 → TERM-3 → TERM-2

- TERM-1 establishes `semesterTerms` state and the two new lib files; TERM-3 and TERM-2 read from `semesterTerms`
- TERM-3 before TERM-2 because restriction enforcement is needed before the wizard ships
- TERM-2 last: it extends the add-semester path that TERM-3 already gates

---

## Plan

### TERM-1 — Semester term labeling

**New file `src/lib/semesterTerms.js`:**

```js
// Template semesters: Fall → Spring alternating (no Summer in templates)
// Fall → Spring: year +1; Spring/Summer → Fall: year unchanged
const ADVANCE = {
  Fall:   y => ({ season: 'Spring', year: y + 1 }),
  Spring: y => ({ season: 'Fall',   year: y }),
  Summer: y => ({ season: 'Fall',   year: y }),
}

// templateSemNums: sorted int[] from requirement_slots (not free-adds, not extras)
// extraTerms: { [semNum]: { season, year } } — user-added semesters only
export function computeSemesterTerms(startSeason, startYear, templateSemNums, extraTerms = {}) {
  const result = {}
  let season = startSeason
  let year   = startYear
  for (const n of templateSemNums) {
    result[n] = { season, year }
    const next = ADVANCE[season](year)
    season = next.season
    year   = next.year
  }
  for (const [n, term] of Object.entries(extraTerms)) {
    if (term?.season && term?.year) result[n] = term
  }
  return result
}

export function formatTermLabel(term) {
  return term ? `${term.season} ${term.year}` : null
}

// For graduation display: last non-Summer semester in the sorted list
export function lastNonSummerTerm(termMap, allSemNums) {
  const candidates = allSemNums.filter(n => termMap[n]?.season !== 'Summer')
  if (!candidates.length) return null
  return termMap[candidates[candidates.length - 1]]
}
```

**New file `MyDegreePlan_Prototype/migration_tier14.sql`:**

```sql
ALTER TABLE student_semester_notes
  ADD COLUMN IF NOT EXISTS term_season text
    CHECK (term_season IN ('Fall', 'Spring', 'Summer')),
  ADD COLUMN IF NOT EXISTS term_year integer;
```

No back-fill. Existing rows get NULL; only user-added extra semesters populate these columns.

**DegreePlan.jsx — new state:**

```js
const [extraSemesterTerms, setExtraSemesterTerms] = useState({})
```

**DegreePlan.jsx — extend the notes `useEffect` load** (around line 249) to capture term columns:

```js
const extraTermsMap = {}
for (const row of notesData ?? []) {
  if (row.term_season && row.term_year)
    extraTermsMap[row.semester_number] = { season: row.term_season, year: row.term_year }
}
setExtraSemesterTerms(extraTermsMap)
```

The existing `.select('semester_number, note_text, completed_by_student')` query must be
expanded to include `term_season, term_year`.

**DegreePlan.jsx — new memos:**

```js
const templateSemNums = useMemo(
  () => [...new Set(slots.map(s => s.semester_number))].sort((a, b) => a - b),
  [slots]
)

const semesterTerms = useMemo(
  () => computeSemesterTerms(profile.start_season, profile.start_year, templateSemNums, extraSemesterTerms),
  [profile.start_season, profile.start_year, templateSemNums, extraSemesterTerms]
)
```

**DegreePlan.jsx — graduation (line 1246):**

Replace `projectGraduation(...)` with:
```js
const graduation = lastNonSummerTerm(semesterTerms, allSemesterNumbers)
```

The existing `graduation.season` / `graduation.year` display references work unchanged.

**DegreePlan.jsx — pass `termLabel` in the grid render loop** (~line 1385):

```jsx
termLabel={formatTermLabel(semesterTerms[semNum])}
```

**Semester.jsx — accept and use `termLabel`:**

Add `termLabel = null` to props. Both label occurrences (lines 97 and 125):
```jsx
<span className="semester-label">
  {termLabel ?? `Semester ${displayNumber ?? semesterNumber}`}
</span>
```

---

### TERM-3 — Seasonal enrollment restrictions

**New file `src/lib/semesterRestrictions.js`:**

```js
export const FALL_ONLY = new Set([
  'CSC3220', 'CSC3570', 'CSC4240', 'CSC4585', 'CSC4770',
])

export const SPRING_ONLY = new Set([
  'CSC3100', 'CSC4220', 'CSC4260', 'CSC4575', 'CSC4750', 'CSC4760', 'CSC4780',
])

// Returns 'Fall', 'Spring', or null
export function getSeasonRestriction(courseCode) {
  if (FALL_ONLY.has(courseCode))   return 'Fall'
  if (SPRING_ONLY.has(courseCode)) return 'Spring'
  return null
}

// null semesterSeason → allow (unknown term — don't block)
// Summer → only unrestricted courses allowed
export function isEnrollmentAllowed(courseCode, semesterSeason) {
  const r = getSeasonRestriction(courseCode)
  if (!r || !semesterSeason)         return true
  if (semesterSeason === 'Summer')   return false
  return r === semesterSeason
}
```

**DegreePlan.jsx — drag enforcement** (insert before `pushUndo` in both drag paths):

*requirement_slot path* (after line 1112, where `courseCode` is already assigned):
```js
const targetSeason = semesterTerms[newSemester]?.season
if (!isEnrollmentAllowed(courseCode, targetSeason)) {
  showSaveError(`${courseCode} is ${getSeasonRestriction(courseCode)}-only and cannot be placed in a ${targetSeason} semester.`)
  return
}
```

*free_add path* (after `fa` is confirmed, before `pushUndo` at line 1134):
```js
const targetSeason = semesterTerms[newSemester]?.season
if (!isEnrollmentAllowed(fa.course_code, targetSeason)) {
  showSaveError(`${fa.course_code} is ${getSeasonRestriction(fa.course_code)}-only and cannot be placed in a ${targetSeason} semester.`)
  return
}
```

**AddCourseModal.jsx — add `semesterSeason` prop:**

```js
export default function AddCourseModal({ semesterNumber, takenCodes, semesterSeason = null, onAdd, onClose })
```

In the results list, per course row:
```js
const seasonBlocked = !isEnrollmentAllowed(course.code, semesterSeason)
```

Apply `.modal-course-row.season-blocked` class (same visual treatment as `.status-taken`).
Add `title` attribute: `"Fall-only — not available in Spring/Summer"` (or Spring-only equivalent).
Disable selection for `seasonBlocked` rows (same as `isTaken`).

**DegreePlan.jsx — pass `semesterSeason` to AddCourseModal** (at the `<AddCourseModal>` render):
```jsx
semesterSeason={semesterTerms[addCourseTarget]?.season ?? null}
```

---

### TERM-2 — Add Semester wizard

**DegreePlan.jsx — new state:**
```js
const [showAddSemesterModal, setShowAddSemesterModal] = useState(false)
const [addSemSeason, setAddSemSeason]                 = useState('Fall')
const [addSemYear,   setAddSemYear]                   = useState(new Date().getFullYear())
```

**New handler `handleAddSemesterConfirm`:**
```js
async function handleAddSemesterConfirm() {
  const newSemNum = allSemesterNumbers.length > 0 ? Math.max(...allSemesterNumbers) + 1 : maxTemplateSem + 1
  await supabase.from('student_semester_notes').upsert({
    student_id:            profile.id,
    concentration_id:      profile.concentration_id,
    semester_number:       newSemNum,
    note_text:             '',
    updated_at:            new Date().toISOString(),
    completed_by_student:  false,
    term_season:           addSemSeason,
    term_year:             addSemYear,
  }, { onConflict: 'student_id, concentration_id, semester_number' })

  setExtraSemesters(prev => [...prev, newSemNum])
  setExtraSemesterTerms(prev => ({ ...prev, [newSemNum]: { season: addSemSeason, year: addSemYear } }))
  setShowAddSemesterModal(false)
}
```

**Replace the add-semester button `onClick`** (line 1433):
```jsx
onClick={() => setShowAddSemesterModal(true)}
```
Remove the previous inline `setExtraSemesters` arrow.

**Wizard modal JSX** (add near the reset/switch modals):
```jsx
{showAddSemesterModal && (
  <div className="degreeplan-modal-overlay" onClick={() => setShowAddSemesterModal(false)}>
    <div className="degreeplan-modal" onClick={e => e.stopPropagation()}>
      <h2 className="degreeplan-modal-title">Add Semester</h2>
      <div className="degreeplan-modal-body">
        <label>
          Season
          <select value={addSemSeason} onChange={e => setAddSemSeason(e.target.value)}>
            <option>Fall</option><option>Spring</option><option>Summer</option>
          </select>
        </label>
        <label>
          Year
          <input type="number" value={addSemYear}
            onChange={e => setAddSemYear(Number(e.target.value))}
            min={2020} max={2040} />
        </label>
      </div>
      <div className="degreeplan-modal-actions">
        <button className="degreeplan-modal-confirm" onClick={handleAddSemesterConfirm}>Add</button>
        <button className="degreeplan-modal-cancel" onClick={() => setShowAddSemesterModal(false)}>Cancel</button>
      </div>
    </div>
  </div>
)}
```

**Update `onDelete` handler for extra semesters** (line 1422–1424) to also persist removal:
```js
onDelete={extraSemesters.includes(semNum)
  ? async () => {
      await supabase.from('student_semester_notes')
        .delete().eq('student_id', profile.id).eq('semester_number', semNum)
      setExtraSemesters(prev => prev.filter(n => n !== semNum))
      setExtraSemesterTerms(prev => { const next = { ...prev }; delete next[semNum]; return next })
    }
  : null}
```

**Reset / concentration-switch cleanup** — add to both `handleResetPlan` and `handleConcentrationSwitch`:
```js
setExtraSemesterTerms({})
```

---

## Files Expected to Change

| File | Items | Summary |
|---|---|---|
| `src/lib/semesterTerms.js` | TERM-1 | New: `computeSemesterTerms`, `formatTermLabel`, `lastNonSummerTerm` |
| `src/lib/semesterRestrictions.js` | TERM-3 | New: `FALL_ONLY`, `SPRING_ONLY`, `getSeasonRestriction`, `isEnrollmentAllowed` |
| `MyDegreePlan_Prototype/migration_tier14.sql` | TERM-1 | New: `term_season`, `term_year` on `student_semester_notes` |
| `src/components/DegreePlan.jsx` | 1, 2, 3 | `extraSemesterTerms` state; `templateSemNums`/`semesterTerms` memos; notes load; drag enforcement; wizard state + handler + modal JSX; `onDelete` persistence; reset/switch cleanup; `termLabel`/`semesterSeason` prop pass-through |
| `src/components/Semester.jsx` | TERM-1 | `termLabel` prop; header label replacement (2 sites) |
| `src/components/AddCourseModal.jsx` | TERM-3 | `semesterSeason` prop; `seasonBlocked` row class + disabled |
| `src/tests/semesterTerms.test.js` | TERM-1 | New: ~12 tests |
| `src/tests/semesterRestrictions.test.js` | TERM-3 | New: ~12 tests |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline: **14 files, 279 tests passed**. Expected after: **16 files, ~303+ tests passed**.

**New tests — `src/tests/semesterTerms.test.js`:**
- Fall start: semesters 1–4 → Fall/Spring/Fall/Spring with correct years
- Spring start: semesters 1–4 → Spring/Fall/Spring/Fall with correct years
- Summer start: semester 1 = Summer, semester 2 = Fall (same year)
- Extra semester term overrides computed template term
- `formatTermLabel` returns "Fall 2025" / null fallback
- `lastNonSummerTerm` skips Summer extras, returns last non-Summer

**New tests — `src/tests/semesterRestrictions.test.js`:**
- `getSeasonRestriction`: each FALL_ONLY code returns 'Fall'; each SPRING_ONLY returns 'Spring'; unrestricted returns null
- `isEnrollmentAllowed`: fall-only in Fall → true; fall-only in Spring → false; fall-only in Summer → false
- `isEnrollmentAllowed`: spring-only in Spring → true; spring-only in Fall → false
- `isEnrollmentAllowed`: unrestricted in Summer → true; null season → true

---

## Commit Plan

Commit 1:
```
schema(semester): add term_season/term_year to student_semester_notes (Tier 14)
```
Body: "migration_tier14.sql adds nullable term_season (check: Fall/Spring/Summer) and
term_year (integer) to student_semester_notes. Only user-added extra semesters populate
these. Template semesters are computed from start_season/start_year at render time."

Commit 2:
```
feat(semester): compute and display Fall/Spring labels on semester cards (TERM-1)
```
Body: "New semesterTerms.js: computeSemesterTerms, formatTermLabel, lastNonSummerTerm.
DegreePlan loads extra semester terms from notes on startup, builds semesterTerms memo.
Semester cards display 'Fall 2025' etc. projectGraduation replaced by lastNonSummerTerm."

Commit 3:
```
feat(semester): enforce fall-only / spring-only enrollment restrictions (TERM-3)
```
Body: "New semesterRestrictions.js: 5 fall-only, 7 spring-only CSC courses. handleDragEnd
blocks restricted-course drags to wrong-season semesters with a toast. AddCourseModal
grays out season-blocked courses (same visual treatment as taken courses)."

Commit 4:
```
feat(semester): replace add-semester button with season/year wizard (TERM-2)
```
Body: "Add Semester button opens a modal (season + year picker). Confirmed extra semesters
are persisted to student_semester_notes via term_season/term_year and restored on reload.
Deleting an extra semester also removes its notes row."

---

## Known Constraints

- `computeSemesterTerms` sequences **template semesters only** in Fall/Spring order. Extra
  semesters (including Summer) injected between template numbers don't shift the template term
  sequence — their explicit `extraTerms` entry overwrites the computed value for that number.
- `onConflict: 'student_id, concentration_id, semester_number'` — do not change the upsert
  conflict key on `student_semester_notes`.
- `isEnrollmentAllowed` returns `true` when `semesterSeason` is null — existing functionality
  is not broken before `semesterTerms` has entries.
- `courseCode` in the requirement_slot drag path (line 1112) may be a pool code (e.g.
  `'GEN_ED'`). `getSeasonRestriction` returns null for pool codes — the check silently allows
  moving unfilled pool slots to any semester.

---

## Manual Verification

Boot `npm run dev`.

**TERM-1:** Log in with start term Fall 2024. Confirm cards show "Fall 2024", "Spring 2025",
"Fall 2025", "Spring 2026", … Confirm projected graduation in header updates accordingly.

**TERM-3:** Drag CSC3220 (Fundamentals of Data Science — Fall-only) from a Fall semester to
a Spring semester. Expect drag blocked with a toast. Open Add Course for a Spring semester;
confirm CSC3220 is grayed out. Drag an unrestricted course between any semesters — expect allowed.

**TERM-2:** Click "+ Add semester". Confirm modal appears. Choose "Summer 2025", click Add.
Confirm "Summer 2025" card appears. Reload — confirm it persists. Delete it; reload — confirm gone.

---

## Post-branch Checklist

- [ ] `npm run test` — 16 files, ≥ 303 tests passed
- [ ] Tier 14 migration applied in Supabase **before** first `npm run dev`
- [ ] Manual verification for all three items passes
- [ ] `docs/claude/BRANCH_QUEUE.md` — move `schema/semester-terms` to Merged Branches; annotate `feat/dynamic-semester-count` as "superseded by feat/plan-controls + schema/semester-terms"
- [ ] `docs/claude/BRANCH_semester-terms.md` deleted in close-out commit
- [ ] Merge to `main`. Do not force-push.
