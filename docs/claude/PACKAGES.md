# Bug Package Handoff Queue

> Paste this into a fresh Claude Code session, then say which package to start.
> Or just reference this file by path. Either works — every package below is
> self-contained enough to begin work directly.

---

## Repo state at handoff (2026-04-29)

- Last commit on `main`: `29b662e` (BUG-42 + BUG-43 logged from dev walkthrough)
- `origin/main` synced
- **16 open bugs** — 0 Critical, 1 High, 9 Medium, 6 Low
- 0 active branches

> **2026-04-30 update:** Package J merged. **15 open bugs** — 0 Critical,
> 1 High, 8 Medium, 6 Low. Recommended next: Package I.

> **2026-04-30 update (2):** Package I merged. **14 open bugs** — 0 Critical,
> 1 High, 7 Medium, 6 Low. Recommended next: Package K.

> **2026-04-30 update (3):** Package K merged. **13 open bugs** — 0 Critical,
> 1 High, 6 Medium, 6 Low. Recommended next: Package L.

> **2026-05-02 update:** `fix/prereq-display` merged. BUG-31 (MATH1910 prereq display omits ACT Math 27+ OR gate) is fixed by conditioning the placement short-circuit in `checkPrereqs` on the presence of a matching `act_placement` prior credit. Without one, normal prereq group evaluation runs and emits the standard missing-course warning. Tests grew 262 → 266 (4 new cases in `src/tests/prereqCheckerPlacement.test.js`; 4 existing placement tests updated to match new behavior). **12 open bugs** — 0 Critical, 1 High, 5 Medium, 6 Low. Recommended next: Package L.

> **2026-05-02 update (2):** Package L merged. `fix/semester-card-css-polish` — BUG-40 (`flex:1` on `.slot-info`/`.modal-course-info`, `slot-code-row gap` corrected) and BUG-41 (semester header gap widened, `.semester-credits` elevated to white `font-weight:500` with a scoped border separator) fixed. CSS-only; 5 rule edits in `Dashboard.css`. Tests held at 266. **10 open bugs** — 0 Critical, 1 High, 5 Medium, 4 Low. Recommended next: Package M.

---

## Standing procedure (every package)

Before code:

1. Read `MyDegreePlan_Frontend/CLAUDE.md` and `docs/claude/SESSION_PREAMBLE.md`
   in full.
2. Read `docs/claude/PROMPT_write-branch-prompt.md` — the meta-prompt for
   generating the per-branch planning artifacts. Apply it for the chosen
   package: produces `BRANCH_<name>.md` + `PROMPT_<name>.md` + one docs commit
   on `main`.
3. Then create the branch, confirm baseline tests, implement per the branch
   doc's Plan section, close-out (remove bug entry, update `BRANCH_QUEUE.md`,
   delete the branch and prompt docs), merge `--ff-only`, push.

Standing rules (per `SESSION_PREAMBLE.md`):

- Scope discipline: do not fix bugs not listed in the chosen package.
- Tests must pass at every commit boundary.
- Prefer minimal diff; reuse existing CSS / helpers wherever possible.

---

## Available packages

Each row is a candidate branch. Pick one and apply the standing procedure.

### Package I — `fix/prereq-pool-name-display` ✅ COMPLETE (merged 2026-04-30)
- **Bug:** BUG-37 (Medium) — fixed
- **Files:** `src/lib/poolResolver.js` (new `formatMissingForDisplay`
  helper), `src/components/SlotModal.jsx` (1 site), `src/components/Semester.jsx`
  (6 sites)
- **Why:** Freshmen don't know course codes. When a missing prereq is
  satisfiable by any course in a pool (e.g. CSC3040 needs COMM2025 *or*
  PC2500, both COMM_REQ pool members), display "Communications class" — not
  the raw codes.
- **Resolution:** Added pure display helper `formatMissingForDisplay` to
  `poolResolver.js` that parses the existing `(A or B or C)` OR-group
  strings emitted by `checkPrereqs`/`checkCoreqs` and collapses pool members
  to `POOL_LABELS` values when ≥2 codes from the same pool appear. Routed
  the seven `missing.join(', ')` consumer sites through it. `checkPrereqs`/
  `checkCoreqs` signatures and return shapes are unchanged. Tests grew
  246 → 257 (11 new cases). Open-question handling: mixed pool + individual
  in one OR collapses pool members and keeps individual code; single pool
  member alone never collapses.

### Package J — `fix/pool-archive-filled-slots` ✅ COMPLETE (merged 2026-04-30)
- **Bug:** BUG-42 (Medium) — fixed
- **Files:** `src/lib/transferCredits.js` (`matchPriorCreditsToSlots`),
  `src/components/DegreePlan.jsx` (`syncArchivedSlots`)
- **Why:** A prior credit covering a pool (e.g. AP Chem STEM with
  `satisfies_pool='SCIENCE'`) doesn't archive a SCIENCE pool slot the student
  has already filled with a course. Slot stays visible; student must clear
  manually.
- **Repro:** fill both SCIENCE slots with CHEM1110/CHEM1120, add AP Chem STEM
  score 5, observe both slots stay visible instead of archiving.
- **Diff size:** Small. Likely a 1-line tweak in the matcher (Rule 2 should
  match filled pool slots) plus a sanity-check pass on `syncArchivedSlots`.
- **Resolution:** Removed the `if (planSlotsMap[slot.id]) continue` guard
  from Rule 2 in `matchPriorCreditsToSlots`. Two existing tests asserting the
  prior contract were flipped; one new BUG-42 regression test added (245 →
  246). Drag-handler comment in `DegreePlan.jsx` refreshed.

### Package K — `fix/gen-ed-sub-pool-surfacing` ✅ COMPLETE (merged 2026-04-30)
- **Bug:** BUG-43 (Medium) — fixed
- **Files:** `src/components/SlotModal.jsx` (GEN_ED render path),
  `src/components/PriorCreditWizard.jsx` (Step 4 award detail line),
  `src/lib/poolResolver.js` (new `getGenEdSubCategory` helper +
  `GEN_ED_CATEGORIES` export), `src/components/Dashboard.css` (new
  `.modal-section-satisfied` rule)
- **Why:** Today GEN_ED is a flat list; the planner already knows the
  History / Humanities & Arts / Social Science split internally but never
  surfaces it. (a) Modal should group by sub-category and grey out
  satisfied sub-pools. (b) Wizard Step 4 should name the specific sub-pool
  a credit fills, not just "GEN_ED."
- **Out of scope:** splitting `requirement_slots` into named sub-pools — that
  is deferred under the existing `ROADMAP.md` entry "GEN_ED sub-requirement
  enforcement."
- **Diff size:** Medium. Pure UI; data and helpers exist already.
- **Resolution:** Exported `GEN_ED_CATEGORIES`; added `getGenEdSubCategory`
  helper. SlotModal renders three sub-sections when `slot.class_code ===
  'GEN_ED'` and search is empty; satisfied sub-pools dim via the new CSS
  rule (selection still allowed — soft greying). Wizard Step 4 shows
  "Also satisfies: General Education — History sub-pool" for GEN_ED
  awards and POOL_LABELS-formatted text for other pools. Tests grew
  257 → 262 (5 new cases).

### Package L — `fix/semester-card-css-polish` ✅ COMPLETE (merged 2026-05-02)
- **Bugs:** BUG-40 (Low) + BUG-41 (Low) — fixed
- **Files:** `src/components/Dashboard.css` only (5 rule edits)
- **Why:** Course names indent inconsistently across slot/modal row variants;
  semester-card header crowds title + credits + controls.
- **Resolution:** Added `flex: 1` to `.slot-info` and `.modal-course-info`
  so long names truncate within their column. Fixed `.slot-code-row gap: 0`
  to `0.4rem` matching `.slot-free-add-top`. Raised `.semester-header-right`
  gap `0.5rem → 0.75rem`; `.semester-credits` gets `font-weight: 500` and
  `var(--white)`; a `border-right` separator scoped to
  `.semester-header-right .semester-credits` visually divides credit count
  from action controls without affecting the collapsed-row view. No JS changes,
  no test changes; count held at 266.

### Package M — `fix/drag-to-prior-coursework-flicker`
- **Bug:** BUG-36 (Low)
- **Files:** `src/components/DegreePlan.jsx` (`handleDragEnd`,
  `prior_credit` drag branch), possibly `src/components/Semester.jsx`
- **Why:** Dragging a course → Prior Coursework snaps the slot back to its
  original semester briefly before disappearing. Likely an optimistic-state
  ordering issue around `syncArchivedSlots`.
- **Preflight:** profile with React devtools first to confirm root cause
  before applying — the audit suspects it could be a CSS transition timing
  issue rather than a React state issue.
- **Diff size:** Small once the cause is confirmed.

### Package N — `fix/site-contrast-pass`
- **Bug:** BUG-38 (Medium)
- **Files:** `src/components/Dashboard.css`, `src/index.css`
  (theme variables), `src/pages/Auth.css`
- **Why:** Multiple foreground/background pairings fail WCAG 2.1 AA contrast.
- **Recommendation:** **Hold** until paired with `feat/branding` (TTU purple)
  and `feat/dark-mode`. Re-theme once with a coordinated palette, not three
  times. Both are queued in `BRANCH_QUEUE.md` Phase 2.

---

## Already queued (own branches; need their own kickoff)

Documented in `BRANCH_QUEUE.md` under **Queued Branches** — when you pick one,
generate planning artifacts via the meta-prompt:

- `data/strip-course-descriptions-prototype` — BUG-32 (strip redundant prereq
  text from `prototype.json`). Data task, scripted strip + re-seed.

---

## Deferred — do not pull in unless explicitly chosen

| Bug | Why deferred |
|---|---|
| BUG-22 (High) | Large feature — full prior-coursework onboarding for transfer students. Belongs in its own initiative, not a bug-fix branch. |
| BUG-9 (Medium) | Audit marks "no fix required" — intentional dedup behavior. Could fold a UI-side duplicate-pool-rejection into Package C follow-up if desired. |
| BUG-14 (Medium) | Conflates with the `usePlanCompleteness` "earned vs planned" gap. Best handled when a free-elective resolver lands. |
| BUG-33 (Medium) | Coordinate with the future `fix/mark-complete-behavior` branch (Phase 2 in `BRANCH_QUEUE.md`). |
| BUG-19 (Low) | Documented API debt in `classifyPrereq` (unused `prereqCode` parameter). Per `CLAUDE.md`, leave until placement-classification feature is decided. |
| BUG-15, BUG-16 (Low) | Two-branch `chore/remove-stale-dual-enrollment` cleanup. Need a product call: tighten the schema constraint or close as docs-only since `CLAUDE.md` is already correct. |

---

## Recommended near-term sequence

**~~J~~ → ~~I~~ → ~~K~~ → ~~L~~ → M**, hold **N** for the coordinated theme pass.

Rationale:
- **J** first because it's a real correctness bug with a small bounded fix.
- **I** next — high freshman-facing payoff.
- **K** rounds out the prior-credit / pool surface work.
- **L** is opportunistic CSS polish; can slip if grid-redesign is imminent.
- **M** needs profiling to confirm cause; do it whenever the visual flicker
  becomes annoying.
- **N** waits for the theme pass with branding + dark mode.

---

## Final note

After all five "Now-tier" packages clear, the bug count drops to ~10 and the
remaining work is predominantly Phase 2 / 3 features in `BRANCH_QUEUE.md`. At
that point a fresh planning conversation about Phase 2 scoping is the right
next step rather than another bug-fix sequence.
