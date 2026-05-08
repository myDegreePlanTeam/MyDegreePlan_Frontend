# Branch: `feat/onboarding-overhaul`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: 4-step onboarding (student type → concentration → ACT scores → prior credits),
> ACT Math 5-tier placement ladder, DSAI concentration filter, MATH1920 runtime curriculum
> filter for new students, and PriorCreditWizard cleanup.

---

## What This Branch Does

Restructures onboarding from 3 to 4 steps and adds student-type awareness throughout the app.
Absorbs the `fix/act-math-placement` prereq regression check (verify-only; no code expected).

**Three database changes must be applied in Supabase before any frontend work begins:**
1. `migration_tier15.sql` — adds `student_type`, `act_math`, `act_english`, `act_science`,
   `act_reading`, `act_composite` columns to `student_profiles`
2. `migration_math1000.sql` — inserts MATH1000 (Transitional Algebra) into `courses`
3. `test_equivalencies.sql` — replace single ACT Math row with 5-tier ladder

---

## Non-Goals / Out of Scope

- `checkPrereqs`, `checkCoreqs`, `computePlanCredits`, `validatePriorCredit` — signatures frozen.
- `resolveTransferCredits` Rules 1–3 — untouched.
- Transfer Credit data pipeline — button stays greyed out for all student types.
- MATH1906 is not added to any degree template.
- No new concentration JSON files — MATH1920 removal is runtime-only.
- Returning students see MATH1920 and all four concentrations unchanged.
- SAT Math equivalents — deferred to `fix/sat-math-placement`.
- The "returning student started Fall 2026 or later" edge case — deferred.
- No Cambridge wizard step.

---

## Preconditions

1. Apply `migration_tier15.sql`, `migration_math1000.sql`, and the updated
   `test_equivalencies.sql` in the Supabase Dashboard SQL Editor before writing any code.
2. Create branch: `cd MyDegreePlan_Frontend && git checkout -b feat/onboarding-overhaul`
3. Run `npm run test`. Baseline: **16 files, 309 tests passed**. Stop if it does not match.
4. Read before editing:
   - `src/components/Onboarding.jsx` — full file (363 lines)
   - `src/components/PriorCreditWizard.jsx` — focus on lines 25–55 (`CREDIT_TYPES`,
     `TYPE_LABELS`), lines 375–420 (Step 1 type grid render), lines 85–92
     (`typeConfig` and props)
   - `src/components/DegreePlan.jsx` — focus on lines 155–300 (`loadPlan` effect),
     line 289 (`setSlots(slotData)`)
   - `MyDegreePlan_Prototype/test_equivalencies.sql` — ACT section at bottom
5. Verify the prereq regression check (fix/act-math-placement deliverable 4): after DB
   migrations are applied, confirm `checkPrereqs` still handles
   `satisfies_course_code='MATH1910'` in `prior_credits` for a student whose plan
   requires a MATH1910 prereq. No code change expected — just confirm and note in this doc.

---

## Implementation Order

1. `actScoreResolver.js` + tests — pure logic, no deps, easiest to isolate
2. `Onboarding.jsx` — 4-step restructure, ACT step, `handleComplete` changes
3. `PriorCreditWizard.jsx` — ACT removal, new disabled entries, `studentType` filter
4. `DegreePlan.jsx` — `isNewStudent` slot filter

---

## Plan

### 1 — `src/lib/actScoreResolver.js` (new file)

```js
export function resolveActMathPlacement(actMathScore) {
  if (!actMathScore) return null
  const tiers = [
    { min: 29, course: 'MATH1910' },
    { min: 27, course: 'MATH1904' },
    { min: 25, course: 'MATH1730' },
    { min: 19, course: 'MATH1710' },
    { min:  1, course: 'MATH1000' },
  ]
  const tier = tiers.find(t => actMathScore >= t.min)
  if (!tier) return null
  return {
    credit_type:           'act_placement',
    satisfies_course_code: tier.course,
    credits_awarded:       0,
    note:                  `ACT Math: score ${actMathScore}`,
  }
}
```

Write `src/tests/actScoreResolver.test.js` covering:
- Boundary scores: 1, 18, 19, 24, 25, 26, 27, 28, 29, 36
- Null / undefined / 0 → `null`
- Each tier returns the correct `satisfies_course_code`

For ACT English, the existing cumulative query in the wizard already handles it via
`test_equivalencies` — no new resolver function needed. The wizard will query rows where
`test_type = 'act_credit'` and `test_name = 'ACT English'` and produce `prior_credits` rows
via the existing award path.

---

### 2 — `src/components/Onboarding.jsx`

**New state (add to existing state block):**
```js
const [studentType, setStudentType] = useState('incoming_freshman')
const [actScores, setActScores]     = useState({ math: '', english: '', science: '', reading: '', composite: '' })
const [actErrors, setActErrors]     = useState({})
```

**Step order change:** Old Step 1 (concentration) becomes new Step 2. Old Step 2 (start date) merges into new Step 1. Old Step 3 (prior credits) becomes new Step 4. New Step 3 is ACT scores.

**Navigation functions to update:**
- `handleNextStep` (currently goes 1→2): rename to `handleGoToStep2`, guarded by `selectedCode`
  — wait, the concentration is now step 2. Actually the flow is:
  - Step 1: student type + start date. "Continue" → Step 2. (No hard guard — `studentType` always has a default.)
  - Step 2: concentration. "Continue" → Step 3. Guard: `selectedCode`.
  - Step 3: ACT scores. "Continue" or "Skip" → Step 4.
  - Step 4: prior credits → "Build my degree plan".
  
  Simplest approach: rename existing navigation to match new step numbers. The `handleGoToStep3` function currently loads `concSlots` and goes to step 3; move that slot-loading behavior to the Step 2→3 transition. In the new order, the slot load happens at Step 3→4 (when the student advances to prior credits).

**Step 1 render (replace current Step 2 content):**
- Title: `'Tell us about yourself'`
- Three-button toggle: `[ Incoming Freshman ] [ Transfer Student ] [ Returning Student ]`
- Label below toggle adapts: `incoming_freshman`/`transfer` → `'When do you start?'`, `returning` → `'When did you start?'`
- Existing season + year dropdowns follow the label

**Step 2 render (replace current Step 1 content):**
- Title: `'Choose your concentration'`
- Concentration grid — same as today, but filter: if `studentType !== 'returning'`, hide the
  concentration where `c.code === 'dsai'`
- Continue button guarded by `selectedCode`

**Step 3 render (new):**
- Title: `'ACT Scores'`
- Subtitle: `'Enter your ACT scores. Skip if you haven\'t taken the ACT.'`
- Five `<input type="number">` fields: `act_math`, `act_english`, `act_science`, `act_reading`, `act_composite`
- Validation on Continue: each filled field must be integer 1–36; show inline error per field
- "I didn't take the ACT / Skip" button → advances to Step 4 with empty actScores
- "Continue" button → validate, on pass advance to Step 4

**ACT validation helper:**
```js
function validateActScore(val) {
  if (val === '' || val === null) return null   // empty is valid
  const n = Number(val)
  if (!Number.isInteger(n) || n < 1 || n > 36) return 'Must be a whole number between 1 and 36'
  return null
}
```

**Step 4 render:** Same as current Step 3. Back button goes to Step 3.

**Step dots:** 3 dots → 4 dots (lines 162–165).
```jsx
<div className={`onboarding-step ${step >= 1 ? 'active' : ''}`} />
<div className={`onboarding-step ${step >= 2 ? 'active' : ''}`} />
<div className={`onboarding-step ${step >= 3 ? 'active' : ''}`} />
<div className={`onboarding-step ${step >= 4 ? 'active' : ''}`} />
```

**`handleComplete` changes (currently lines 85–124):**
Add to the `student_profiles` update:
```js
.update({
  concentration_id: concData.id,
  start_season:     startSeason,
  start_year:       startYear,
  student_type:     studentType,
  act_math:         actScores.math     !== '' ? Number(actScores.math)      : null,
  act_english:      actScores.english  !== '' ? Number(actScores.english)   : null,
  act_science:      actScores.science  !== '' ? Number(actScores.science)   : null,
  act_reading:      actScores.reading  !== '' ? Number(actScores.reading)   : null,
  act_composite:    actScores.composite !== '' ? Number(actScores.composite) : null,
})
```

Generate ACT `prior_credits` rows before the batch insert:
```js
import { resolveActMathPlacement } from '../lib/actScoreResolver'

// ACT Math — highest-tier-only placement row
const mathRow = resolveActMathPlacement(
  actScores.math !== '' ? Number(actScores.math) : null
)
if (mathRow) priorCreditRecords = [mathRow, ...priorCreditRecords]

// ACT English — query test_equivalencies for act_credit / ACT English cumulative rows
// The existing wizard award-apply path already handles this correctly.
// In handleComplete, use the same award query the wizard uses, filtering by
// test_type='act_credit', test_name='ACT English', min_score <= actScores.english.
// If actScores.english is blank, skip.
```

**Open question on ACT English in handleComplete:** The wizard normally runs its own
Supabase query for the award list. `handleComplete` is synchronous-ish and already does one
Supabase round trip. Options:
1. Query `test_equivalencies` inline before the profile update and generate the English rows
   alongside the math row.
2. Treat ACT English the same as Math — write a small inline resolver using the two known
   thresholds (27 → ENGL1010, 31 → ENGL1020) without a DB round trip, matching the
   `resolveActMathPlacement` pattern.

Option 2 is simpler and avoids an extra round trip. The thresholds match the current
`test_equivalencies.sql` seed. If the seed changes, the resolver would need updating too —
acceptable for a prototype. Use option 2 unless the implementer has a strong reason otherwise.

Add `resolveActEnglishCredit(actEnglishScore)` in `actScoreResolver.js`:
```js
export function resolveActEnglishCredit(actEnglishScore) {
  if (!actEnglishScore) return []
  const rows = []
  if (actEnglishScore >= 27) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1010', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  if (actEnglishScore >= 31) rows.push({ credit_type: 'act_credit', satisfies_course_code: 'ENGL1020', credits_awarded: 3, note: `ACT English: score ${actEnglishScore}` })
  return rows
}
```

Add unit tests for `resolveActEnglishCredit` in `actScoreResolver.test.js`.

---

### 3 — `src/components/PriorCreditWizard.jsx`

**Remove ACT from CREDIT_TYPES (lines 36–38):**
```js
// Remove:
{ value: 'act', label: 'ACT Score', hasScore: true, testTypes: ['act_credit', 'act_placement'] },
```
`act_credit` and `act_placement` strings may remain in `TYPE_LABELS` (lines 50–51) as they are
used for note-building internally — only the CREDIT_TYPES entry is removed.

**Add two new disabled entries to CREDIT_TYPES:**
```js
{ value: 'dual_credit',      label: 'Dual Credit',      disabled: true },
{ value: 'dual_enrollment',  label: 'Dual Enrollment',  disabled: true },
```
Use the existing `wizard-type-btn-disabled` class and `wizard-type-btn-pill` badge (pattern
already used by the Transfer Credit disabled entry).

**Accept `studentType` prop (add to component signature):**
```js
export default function PriorCreditWizard({ onSave, onClose, planSlots, slots, studentType = null }) {
```

**Filter Transfer Credit in the rendered CREDIT_TYPES list (Step 1 render, lines 378–420):**
```js
const visibleCreditTypes = CREDIT_TYPES.filter(t => {
  if (t.value === 'transfer_credit' && studentType === 'incoming_freshman') return false
  return true
})
```
Use `visibleCreditTypes` in place of `CREDIT_TYPES` inside the Step 1 map. The filter lives
inside the component, not at the callsite.

**Pass `studentType` from `Onboarding.jsx`:**
```jsx
<PriorCreditWizard
  onSave={handleWizardSave}
  onClose={() => setShowWizard(false)}
  planSlots={{}}
  slots={concSlots}
  studentType={studentType}
/>
```

**Dashboard/degree-plan context:** Find all other `PriorCreditWizard` mounts in the codebase
and pass `studentType={profile?.student_type ?? null}`. The filter treats `null` as "show all",
so existing mounts are safe if `student_type` is not yet available.

---

### 4 — `src/components/DegreePlan.jsx` (line 289 area)

Before `setSlots(slotData)` at line 289, apply the curriculum filter:
```js
// New students (incoming_freshman or transfer) follow the Fall 2026+ CS curriculum:
// MATH1920 (Calculus II) is not required. Returning students see the full plan.
// Note: student_type is used as a proxy for "started Fall 2026 or later".
// A returning student voluntarily on the new curriculum is a deferred edge case.
const isNewStudent = profile.student_type === 'incoming_freshman'
  || profile.student_type === 'transfer'
const filteredSlots = isNewStudent
  ? slotData.filter(s => s.class_code !== 'MATH1920')
  : slotData
```
Replace `setSlots(slotData)` with `setSlots(filteredSlots)`.

All downstream uses of `slots` state are unchanged — they already reference the `slots`
React state variable, which will now contain `filteredSlots` for new students.

---

## Files Expected to Change

| File | Summary |
|---|---|
| `src/lib/actScoreResolver.js` | New: `resolveActMathPlacement`, `resolveActEnglishCredit` |
| `src/tests/actScoreResolver.test.js` | New: tier boundary tests, English credit tests |
| `src/components/Onboarding.jsx` | 4-step flow; student type toggle; ACT score step; updated `handleComplete` |
| `src/components/PriorCreditWizard.jsx` | Remove ACT from `CREDIT_TYPES`; add Dual Credit/Enrollment disabled entries; `studentType` prop + Transfer Credit filter |
| `src/components/DegreePlan.jsx` | `isNewStudent` filter before `setSlots` (line 289) |

**DB files (in `MyDegreePlan_Prototype/` — apply manually before frontend work):**

| File | Action |
|---|---|
| `migration_tier15.sql` | New: `student_type`, `act_*` columns on `student_profiles` |
| `migration_math1000.sql` | New: insert MATH1000 into `courses` |
| `test_equivalencies.sql` | Edit: replace single ACT Math row with 5-tier ladder |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline: **16 files, 309 tests passed**.
After `actScoreResolver.test.js` is added, expected: **17 files, ≥ 325 tests** (16 boundary
tests for Math + 4–6 for English + existing 309).

---

## Commit Plan

Commit 1 — `feat(act): actScoreResolver with Math placement and English credit logic`
Body: "New pure functions resolveActMathPlacement (5-tier highest-only) and resolveActEnglishCredit
(cumulative). Unit tests cover all tier boundaries and null/0 input."

Commit 2 — `feat(onboarding): 4-step flow with student type, ACT scores, and DSAI filter`
Body: "Step 1 collects student type (incoming_freshman / transfer / returning) + start date.
Step 2 shows concentration picker filtered to hide DSAI for non-returning students.
Step 3 collects ACT subscores with per-field validation and a skip path.
Step 4 is the existing prior credits step. handleComplete saves student_type, ACT score
columns, and generates ACT Math/English prior_credit rows."

Commit 3 — `feat(wizard): remove ACT entry, add Dual Credit/Enrollment stubs, filter by student type`
Body: "ACT Score removed from CREDIT_TYPES (handled by onboarding step 3). Dual Credit and
Dual Enrollment added as disabled Coming Soon entries. studentType prop filters Transfer Credit
for incoming_freshman students. TYPE_LABELS entries for act_credit/act_placement retained for
internal note-building."

Commit 4 — `feat(degreeplan): filter MATH1920 from plan for new students`
Body: "incoming_freshman and transfer students follow the Fall 2026+ CS curriculum which does
not require Calculus II. filteredSlots removes MATH1920 before setSlots; returning students
see the full plan unchanged."

---

## Known Constraints

- `migration_tier15.sql` must be applied before any student_type or act_* DB writes will succeed.
  If migrations are not applied, the `handleComplete` Supabase update will error on the new columns.
- `resolveActMathPlacement` uses highest-tier-only logic (NOT cumulative). This differs from
  the wizard's existing cumulative award model. Do not apply cumulative logic here.
- `migration_math1000.sql` uses `ON CONFLICT (code) DO NOTHING` — safe to re-run.
- `test_equivalencies.sql` has a `DELETE FROM test_equivalencies WHERE test_type = 'act_placement'`
  at the top — the old MATH1910 row is cleared on re-run before the 5-row ladder is inserted.
- The DSAI filter is applied at render time in `Onboarding.jsx`, not in the DB query.
  It reads `c.code === 'dsai'` from the fetched concentrations array.
- `filteredSlots` is a derived copy — the fetched `slotData` is never mutated.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`. Use a test account or new signup.

1. **Incoming freshman path:** Select "Incoming Freshman". Verify DSAI is absent from the
   concentration grid. Complete onboarding. Open the degree plan. Confirm MATH1920 is not
   in the semester grid.
2. **Returning student path:** Select "Returning Student". Verify all four concentrations
   including DSAI are shown. Complete onboarding. Confirm MATH1920 appears in the plan.
3. **ACT Math placement:** Enter ACT Math score 29. Complete onboarding. Confirm a prior
   credit row appears for MATH1910 with `credits_awarded = 0`.
4. **ACT Math placement (mid-tier):** Enter score 27. Confirm row for MATH1904 (not MATH1910).
5. **ACT English credit:** Enter score 31. Confirm two prior credit rows: ENGL1010 (3 cr)
   and ENGL1020 (3 cr).
6. **Skip ACT:** Click "I didn't take the ACT / Skip". Confirm no ACT prior credit rows.
7. **ACT field validation:** Enter 37 in ACT Math. Confirm inline error. Enter 0. Confirm error.
8. **Prior credit wizard — ACT removed:** Open "+ Add prior credit". Confirm "ACT Score" button
   is gone from the type grid. Confirm "Dual Credit" and "Dual Enrollment" appear as greyed
   Coming Soon entries.
9. **Transfer Credit for freshman:** Incoming freshman opens the wizard. Confirm "Transfer Credit"
   is absent from the type grid entirely.
10. **Transfer Credit for transfer student:** Transfer student opens the wizard. Confirm
    "Transfer Credit" appears but is greyed out as Coming Soon.

---

## Post-branch Checklist

- [ ] `npm run test` — 17 files, ≥ 325 tests passed.
- [ ] Manual verification passes for all 10 scenarios.
- [ ] `migration_tier15.sql`, `migration_math1000.sql` committed to `MyDegreePlan_Prototype/`.
- [ ] `test_equivalencies.sql` updated ACT Math section committed to `MyDegreePlan_Prototype/`.
- [ ] `docs/claude/BRANCH_QUEUE.md` — `feat/onboarding-overhaul` moved to Merged Branches.
- [ ] `docs/claude/BRANCH_onboarding-overhaul.md` deleted in close-out commit.
- [ ] Merge to `main`. Do not force-push.
