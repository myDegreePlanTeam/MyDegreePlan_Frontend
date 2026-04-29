# Branch: `fix/wizard-step3-cleanup`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: one ternary block in `PriorCreditWizard.jsx`. No tests, no schema, no
> CSS, no helper edits.

---

## What This Branch Does

Closes the premature credit-disclosure on Step 3 of the prior-credit wizard.
Today the score-selection step renders each score option with a secondary line
that spells out the credit-hour outcome ("Awards N credit hours toward CODE"
or "Qualifies for placement into CODE — no credit hours awarded"). Per the
intended wizard model, Step 3 is for picking a score; Step 4 is where the
student sees what they'll receive and confirms.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-39 (Low)** — `PriorCreditWizard` Step 3 prematurely shows credit-hour
   award before the confirmation step.

The fix removes the `wizard-score-detail` ternary block entirely. Step 4
(`PriorCreditWizard.jsx:480–544`) already presents both credit-bearing and
placement-only awards in clear cards — no Step 4 work is needed.

---

## Out of Scope

Do not touch on this branch:

- The Step 4 `wizard-confirm` rendering. It is the intended disclosure surface
  and is correct as-is.
- The `scoreOptions` computation (`PriorCreditWizard.jsx:142–149`). After this
  fix, the `totalCredits`, `awardedCodes`, and `isPlacementOnly` fields on each
  option are unread. Leave the computation alone — touching it is scope creep
  and the cost is a few microseconds per render.
- The `wizard-step-hint` paragraph above the list ("Select the score you
  received on..."). It already asks for the score correctly.
- The "Score X+" formatting (`wizard-score-num`). The "+" indicates "or higher"
  per the cumulative model and is meaningful — keep it.
- The Step 2 / Step 1 surfaces. Out of scope for this branch.
- BUG-35 (AP Chemistry STEM/non-STEM merge) — separate branch.
- BUG-37 (pool-name prereq display) — separate branch.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/wizard-step3-cleanup`.
2. Run `npm run test`. Baseline: **11 files, 245 tests passed**. If it does not
   match, stop and report.
3. Read in full before editing:
   - `src/components/PriorCreditWizard.jsx` lines 445–478 (the Step 3 render).
   - `src/components/PriorCreditWizard.jsx` lines 480–544 (Step 4 — confirms
     both credit-bearing and placement-only paths are already covered).
   - `src/components/PriorCreditWizard.jsx` lines 126–152 (the `scoreOptions`
     loader — leave it alone).

---

## Implementation Order

Single bug, single edit. One commit.

---

## Plan

### `src/components/PriorCreditWizard.jsx` Step 3 render (L456–476)

Replace the body of the `scoreOptions.map` button. Before:

```jsx
{scoreOptions.map(opt => (
  <button
    key={opt.score}
    className="wizard-score-btn"
    onClick={() => handleScoreSelect(opt.score)}
  >
    <span className="wizard-score-num">Score {opt.score}+</span>
    {opt.isPlacementOnly ? (
      <span className="wizard-score-detail">
        Qualifies for placement into {opt.awardedCodes.join(', ')} — no credit hours awarded
      </span>
    ) : (
      <span className="wizard-score-detail">
        Awards {opt.totalCredits} credit hour{opt.totalCredits !== 1 ? 's' : ''}
        {opt.awardedCodes.length > 0
          ? ` toward ${opt.awardedCodes.join(', ')}`
          : ''}
      </span>
    )}
  </button>
))}
```

After:

```jsx
{scoreOptions.map(opt => (
  <button
    key={opt.score}
    className="wizard-score-btn"
    onClick={() => handleScoreSelect(opt.score)}
  >
    <span className="wizard-score-num">Score {opt.score}+</span>
  </button>
))}
```

That's the entire change. The placement-only and credit-bearing outcomes are
already presented at Step 4 (`PriorCreditWizard.jsx:509–530`) with richer
wording and slot-context — Step 3 doesn't need to duplicate.

### CSS

No CSS rule exists for `.wizard-score-detail` (verified via grep across
`src/`). Nothing to delete.

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/components/PriorCreditWizard.jsx` | 39 | Drop the `wizard-score-detail` ternary |
| `docs/claude/bug.md` | — | Remove BUG-39 entry on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move into Merged Branches table on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **11 files, 245 tests
passed**. After fix: same count (no test additions; the wizard has no test
coverage today and adding it for one render edit is scope creep).

Manual verification (below) is the bar.

---

## Commit Plan

One implementation commit, one close-out commit:

```
fix: scope wizard Step 3 to score selection only (BUG-39)

docs: close out fix/wizard-step3-cleanup (BUG-39)
```

---

## Known Constraints

- The `scoreOptions` data shape is preserved. Step 4 still uses cumulative
  award computation via the separate `loadAwards` effect (L154–217), so this
  fix does not affect the confirmation summary.
- No new strings; no localization concerns.

---

## Manual Verification

Boot `npm run dev` from `MyDegreePlan_Frontend/`.

1. **AP credit path (credit-bearing).**
   - Open the prior-credit wizard. Choose AP Credit (or any non-placement
     credit type), pick AP Calculus AB on Step 2.
   - **Step 3, before fix:** each score button shows "Score 3+" with a sub-
     line "Awards 3 credit hours toward MATH1830" (or similar).
   - **Step 3, after fix:** each button shows only "Score 5+" / "Score 4+" /
     etc. — no credit-hours sub-line.
   - Pick a score, advance to Step 4. The credit-hour breakdown still appears
     in the confirmation card. Apply works as before.

2. **ACT placement path (placement-only).**
   - Pick ACT Credit / ACT Math on Step 2.
   - **Step 3, before fix:** each score button shows "Score 27+" with
     "Qualifies for placement into MATH1910 — no credit hours awarded".
   - **Step 3, after fix:** "Score 27+" only.
   - Step 4 still says "This qualifies you for placement into MATH1910 —
     no credit hours are awarded." Apply works as before.

3. **Regression — Step 4 unchanged.**
   - In both paths above, Step 4's award cards still render correctly with
     the credit-hour pill, the "removes from Semester N" hint when
     applicable, and the satisfies-pool note.

---

## Post-branch Checklist

- [ ] `npm run test` reports 11 files, 245 tests passed.
- [ ] Manual verification scenarios 1–3 pass.
- [ ] `docs/claude/bug.md` — BUG-39 entry removed; severity counts updated
      (Low 7 → 6, Total 16 → 15). Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches table
      with today's date.
- [ ] `docs/claude/BRANCH_wizard-step3-cleanup.md` deleted in the close-out
      commit.
- [ ] `docs/claude/PROMPT_wizard-step3-cleanup.md` deleted in the close-out
      commit (per the new convention from the 2026-04-29 docs cleanup).
- [ ] Merge to `main`. Do not force-push.
