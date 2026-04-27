# CLAUDE.md — MyDegreePlan Project Context

> Read this file at the start of every session. Do not skip it.

---

## Project Overview

**MyDegreePlan** is a web-based degree planner for Texas Tech University (TTU) Computer Science
students. It is a prototype commissioned by the TTU CSC department. The target users are incoming
and current TTU CSC students who need to map out their remaining coursework across semesters.

**Tech stack**
- Frontend: React 19 + Vite 8 (uses rolldown as bundler — not classic Rollup)
- Routing: react-router-dom 7
- Database/Auth: PostgreSQL via Supabase (direct `@supabase/supabase-js` client — no Node/Express server)
- Drag-and-drop: @dnd-kit/core + @dnd-kit/sortable
- Testing: Vitest 4
- Deployment: Vercel (frontend) + Supabase (database + auth)
- No TypeScript — everything is plain JavaScript (.js / .jsx)

---

## Repository Structure

The workspace root (`MDP/`) contains two sub-repos plus shared seed files:

```
MDP/
├── CLAUDE.md                          ← this file
├── MyDegreePlan_Frontend/             ← React/Vite app (its own git repo)
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   └── src/
│       ├── App.jsx                    ← root component, route definitions
│       ├── main.jsx                   ← entry point
│       ├── index.css                  ← global styles
│       ├── assets/                    ← static images (hero.png, vite.svg)
│       ├── components/
│       │   ├── DegreePlan.jsx         ← main grid; orchestrates all state and Supabase calls
│       │   ├── Semester.jsx           ← one semester card + slot rows
│       │   ├── SlotModal.jsx          ← course-selection modal for pool and free-add slots
│       │   ├── AddCourseModal.jsx     ← free-add course picker
│       │   ├── CourseDetailModal.jsx  ← read-only course info (prereqs, description)
│       │   ├── Onboarding.jsx         ← concentration selection + prior credit wizard entry
│       │   ├── PriorCreditWizard.jsx  ← multi-step wizard for entering prior credits
│       │   ├── CompletionBadge.jsx    ← plan-completeness progress indicator
│       │   ├── ErrorBoundary.jsx      ← React error boundary
│       │   └── Skeletons.jsx          ← loading skeleton screens
│       ├── lib/
│       │   ├── prereqChecker.js       ← checkPrereqs / checkCoreqs (pure logic)
│       │   ├── classifyPrereq.js      ← placement/consent/completion classification
│       │   ├── poolResolver.js        ← POOL_COURSES, POOL_LABELS, resolvePool, science helpers
│       │   ├── transferCredits.js     ← resolveTransferCredits, computePlanCredits
│       │   ├── validatePriorCredit.js ← prior credit validation before INSERT
│       │   ├── usePlanCompleteness.js ← React hook for plan-completeness tracking
│       │   ├── supabaseClient.js      ← single shared Supabase client instance
│       │   └── __tests__/
│       │       ├── poolResolver.test.js
│       │       └── prereqChecker.test.js
│       ├── pages/
│       │   ├── Dashboard.jsx          ← authenticated landing (plan summary)
│       │   ├── Login.jsx
│       │   ├── Signup.jsx
│       │   └── Auth.css
│       └── tests/                     ← primary test suite
│           ├── computePlanCredits.test.js
│           ├── planCompleteness.test.js
│           ├── prereqCheckerCoreq.test.js
│           ├── prereqCheckerPlacement.test.js
│           ├── transferCredits.test.js
│           └── validatePriorCredit.test.js
│
└── MyDegreePlan_Prototype/            ← schema, migrations, seed script (its own git repo)
    ├── seed.js                        ← inserts catalog data from JSON into Supabase
    ├── rls_migration.sql              ← Tier 5: RLS policies for all tables
    ├── migration_tier6.sql            ← credits_remaining, semester_number, student_free_add_slots
    ├── migration_tier7.sql            ← prior_credits table
    ├── migration_tier8.sql            ← locked column on student_plan_slots
    ├── migration_tier9.sql            ← archived/archive_reason, satisfies_pool,
    │                                     completed_by_student, test_equivalencies table
    ├── migration_tier10.sql           ← act_credit added to test_type and credit_type enums
    ├── migration_tier11.sql           ← remove dual_enrollment; drop zero-credit equivalency rows
    ├── test_equivalencies.sql         ← seed data for the test_equivalencies table
    ├── prototype.json                 ← course catalog source data
    ├── csc_core.json                  ← CSC Core degree plan template
    ├── csc_cybersecurity.json         ← CSC Cybersecurity concentration template
    ├── csc_dsai.json                  ← CSC Data Science & AI concentration template
    └── csc_hpc.json                   ← CSC High Performance Computing concentration template
```

**Migration naming convention:** files are named `migration_tier{N}.sql` in
`MyDegreePlan_Prototype/`. The RLS migration is a one-off named `rls_migration.sql`.
Migrations are applied manually via the Supabase Dashboard SQL Editor — there is no
automated migration runner. Each file is safe to re-run (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

---

## Database

All tables live in a single Supabase project. Connection details are in environment variables
(never hard-coded here). The schema uses integer PKs for student tables and UUID PKs for
`prior_credits`. All catalog tables have public read RLS; student tables are scoped to `auth.uid()`.

### Tables

| Table | Purpose |
|---|---|
| `courses` | Course catalog: code, name, credits, description, subject_code |
| `prerequisite_entries` | Prerequisite rules: course_code, required_code, group_index, logic (AND/OR) |
| `corequisite_entries` | Corequisite rules: same shape as prerequisite_entries |
| `concentrations` | Degree concentrations (core, cybersecurity, dsai, hpc) |
| `requirement_slots` | Per-concentration degree template: which courses/pools go in which semester |
| `student_profiles` | One row per student; anchors all student state; references `auth.users.id` |
| `student_plan_slots` | Student's plan state per template slot: selected course, locked, archived, drag overrides |
| `student_semester_notes` | Per-student, per-semester notes + `completed_by_student` toggle |
| `student_free_add_slots` | Courses the student added outside the degree template |
| `prior_credits` | Transfer credits, AP/IB/CLEP credit, dual enrollment, placement scores |
| `test_equivalencies` | Exam-to-TTU-course mappings; drives the PriorCreditWizard |

### Constrained column values

**`student_plan_slots.archive_reason`**
```
'prior_credit'   — slot removed because a prior_credit covers it
'banner_import'  — reserved for future Banner transcript import (do not implement behavior yet)
```
`archive_reason = 'manual'` is intentionally omitted. Individual per-slot manual completion
is not implemented.

**`prior_credits.credit_type`**
```
'act_placement'   — ACT/SAT score gate; credits_awarded must be 0
'ap_credit'       — AP exam credit
'transfer_credit' — external transfer course
'test_out'        — CLEP or departmental exam
'ib_credit'       — International Baccalaureate
'act_credit'      — ACT exam credit (e.g. English score 27+ → ENGL1010)
'cambridge'       — Cambridge International exam credit
```

**`test_equivalencies.test_type`**
```
'ap_credit'
'test_out'
'ib_credit'
'cambridge'
'act_credit'
```

---

## Environment Variables

### Frontend (`MyDegreePlan_Frontend/.env.local`)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project REST/realtime endpoint URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (publishable) key — safe to ship in browser bundle |

### Prototype seed script (`MyDegreePlan_Prototype/.env`)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (same project as frontend) |
| `SUPABASE_SERVICE_KEY` | Service role key — bypasses RLS; used only for seeding, never in frontend |

---

## Branch and Commit Convention

See [`README.md`](./README.md) for branch prefixes and commit types. Additional rules:
- One branch per logical concern; never commit broken code
- Run `npm run test` (from `MyDegreePlan_Frontend/`) before every commit
- `main` is always deployable

---

## Test Protocol

- **Test runner:** Vitest 4
- **Run with:** `npm run test` (from `MyDegreePlan_Frontend/`)
- **Watch mode:** `npm run test:watch`

**Test file locations:**
- `src/tests/[featureName].test.js` — primary suite (6 files)
- `src/lib/__tests__/[featureName].test.js` — collocated lib tests (2 files)

**All existing test files:**
```
src/tests/computePlanCredits.test.js
src/tests/planCompleteness.test.js
src/tests/prereqCheckerCoreq.test.js
src/tests/prereqCheckerPlacement.test.js
src/tests/transferCredits.test.js
src/tests/validatePriorCredit.test.js
src/lib/__tests__/poolResolver.test.js
src/lib/__tests__/prereqChecker.test.js
```

All existing tests must pass before any commit. New tests go in `src/tests/[featureName].test.js`.

---

## Key Business Logic Files

### `src/lib/prereqChecker.js`

Exports two pure functions.

**`checkPrereqs(courseCode, prereqMap, satisfiedCodes, priorCredits = [], courseMap = {})`**
- Returns `{ satisfied: true }` or `{ satisfied: false, missing: [...] }`
- `satisfiedCodes` — Set of course codes completed in *prior* semesters
- `priorCredits` — array of `prior_credits` rows; any with `satisfies_course_code` is treated
  as completed before the plan began (Semester 0)
- `courseMap` — full course catalog; used to detect placement/consent gates via `classifyPrereq`
- OR groups short-circuit when any one member is satisfied
- **The signature of this function must never change.** The optional parameters were added
  with defaults specifically so all existing callers remain valid.

**`checkCoreqs(courseCode, coreqMap, availableCodes)`**
- `availableCodes` — Set of codes from *same semester + prior semesters* (coreqs may be
  taken concurrently)
- Prereqs use `completedCodes` (prior only); coreqs use `availableCodes` (same + prior)

### `src/lib/transferCredits.js`

Exports three pure functions. No Supabase calls, no side effects.

**`resolveTransferCredits(priorCredits, planSlots, slots)`** → `{ [slotId]: true }`
Three strict matching rules (Bug 3 fix — do not relax these):
- **Rule 1:** A prior credit with `satisfies_course_code = 'X'` archives *only* the non-pool
  slot where `class_code = 'X'`. Never falls through to a pool slot.
- **Rule 2:** A pool slot is archived *only* when a prior credit's `satisfies_pool` equals the
  slot's `class_code`. Never automatic fallthrough. Wizard auto-populates `satisfies_pool`.
- **Rule 3:** Unmatched prior credits are valid; they appear in Prior Coursework and their
  credits count toward total degree hours. They archive nothing.
- Only credit-bearing entries (`credits_awarded > 0`) participate. Placement-only entries
  (`credits_awarded === 0`) never match.
- One prior credit archives at most one slot (first match wins; tracked via `usedPriorCreditIds`).

**`resolveTransferDetails(priorCredits, planSlots, slots)`** → `{ [slotId]: { creditType, priorCreditId } }`
Same matching logic as `resolveTransferCredits` but returns richer info for UI badge labels.

**`computePlanCredits(planSlots, priorCredits, slots, courses, freeAddSlots = [])`** → `{ totalEarned, breakdown }`
Deduplication rule: a course code contributes its credit hours exactly once regardless of how
many times it appears across `prior_credits`, `plan_slots`, and `student_free_add_slots`. Prior
credits win over plan slots, plan slots win over free-add slots (three-pass: pass 1 = prior
credits, pass 2 = plan slots, pass 3 = free-add, skip on each subsequent pass if seen).
`resolveTransferCredits` and `resolveTransferDetails` share a single private matching helper so
the Rule 1 / Rule 2 logic cannot drift between them (BUG-3).

### `src/lib/validatePriorCredit.js`

**`validatePriorCredit(creditType, courseCode, creditsAwarded, testEquivalencies, courseCatalog)`**
→ `{ valid, error, correctedCredits }`

Guards against invalid prior credit entries before every INSERT (even when the wizard is used).
- Placement types (`act_placement`): `credits_awarded` must be 0
- Scored exam types (`ap_credit`, `test_out`, `ib_credit`): validates against `test_equivalencies`;
  `credits_awarded` must match the equivalency row exactly; returns `correctedCredits` on mismatch
- Transfer types (`transfer_credit`, `dual_enrollment`): caps at catalog credit hours (or 6 if
  course not in catalog)
- `credits_awarded` on prior_credits is always read from `test_equivalencies` and is **never**
  user-editable when a `test_type` and `course_code` are selected in the wizard

### `src/lib/poolResolver.js`

Exports `POOL_COURSES`, `POOL_LABELS`, `resolvePool`, `resolveScience`, `getScienceWarnings`,
`getGenEdStatus`, `resolveFreeElective`.

Pool membership lives in code here, not in the database (keeps schema lean). `POOL_COURSES` is
the authoritative list of valid course codes for each pool type. `POOL_LABELS` is the single
source of truth for display names. `resolvePool(poolCode, courseMap)` returns filtered course
objects from the live catalog.

### `src/lib/classifyPrereq.js`

**`classifyPrereq(courseCode, prereqCode, courseMap)`** → `'placement' | 'consent' | 'completion'`

Examines the *target course's own description* for ACT/SAT keywords or consent language.
If matched, `checkPrereqs` suppresses all warnings for that course (planner cannot verify
placement scores or instructor approval). `prereqCode` parameter is included in the signature
for future use but is currently unused — do not remove it.

### `src/lib/usePlanCompleteness.js`

React hook that computes plan completeness metrics (total slots, filled slots, credits earned vs.
required). Used by `CompletionBadge` and `Dashboard`.

---

## Core Principles (read before every session)

1. **The degree plan grid shows only what a student still needs to complete.** Archived slots
   (covered by prior credits) are removed from the grid entirely.

2. **Archiving is only triggered by prior credits** (`archive_reason = 'prior_credit'`) or
   reserved for future Banner import (`archive_reason = 'banner_import'`).

3. **Manual per-course completion toggling is not implemented.** Completion is semester-level
   only: `completed_by_student` on `student_semester_notes`. When a student toggles a semester
   complete, the card collapses to a summary row. The underlying slot data is untouched.

4. **`credits_awarded` on `prior_credits` is always read from `test_equivalencies`** and is
   never user-editable when a `test_type` and `course_code` are selected in the wizard.

5. **OR logic in both `prerequisite_entries` and `corequisite_entries` must short-circuit**
   when any one member is satisfied.

6. **`checkPrereqs` uses `completedCodes` (prior semesters only) for prerequisites** and
   **`checkCoreqs` uses `availableCodes` (same semester + prior) for corequisites.**

---

## Deferred Work

See [`ROADMAP.md`](./ROADMAP.md). Do not implement roadmap items without explicit instruction.

---

## What to Do at the Start of Every Session

1. Read this file
2. Read the relevant source files before writing any code — do not assume file contents
3. Check existing migration files before writing new migrations (next tier after 9)
4. Run `npm run test` from `MyDegreePlan_Frontend/` and confirm all tests pass before making changes
5. Create a branch before starting work — never work directly on main
6. Do not assume file names or function signatures — use Glob/Grep to find them
