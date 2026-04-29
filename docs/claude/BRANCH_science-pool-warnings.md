# Branch: `fix/science-pool-warnings`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: pure-logic changes in `src/lib/poolResolver.js` plus test extensions
> in `src/lib/__tests__/poolResolver.test.js`. No React, no Supabase.

---

## What This Branch Does

Fixes the science-sequence resolution and warning logic in `poolResolver.js`. Four
audit bugs converge on the same code path: switching from label-equality to
sequence-membership in `getScienceWarnings`, generalizing past the
"first-two-slots / first-filled-code" assumption in both `getScienceWarnings`
and `resolveScience`, and removing a redundant entry in `SCIENCE_SEQUENCES`.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-10 (Medium)** — `getScienceWarnings` treats all Biology codes as the
   same "Biology" label. The combo `BIOL1123 + BIOL2310` (which is *not* a
   valid TTU sequence — both pair only with `BIOL1113`) currently produces no
   conflict warning because `SCIENCE_SEQUENCE_NAMES[c]` returns `'Biology'`
   for both.
2. **BUG-11 (Medium)** — `resolveScience` reads `selectedScienceCodes[0]`
   (`poolResolver.js:256`). Latent today (templates have ≤ 2 SCIENCE slots),
   but the first-filled-slot bias would silently pick one code if more were
   filled in the future.
3. **BUG-17 (Low)** — `SCIENCE_SEQUENCES` lists `GEOL1040 / GEOL1045` twice
   in opposite orderings (`poolResolver.js:239–240`). The second entry is
   unreachable because `seq.courses.includes(alreadySelected)` plus
   `seq.courses.find(c => c !== alreadySelected)` is order-independent.
4. **BUG-18 (Low)** — `getScienceWarnings` destructures only the first two
   slots (`const [slotA, slotB] = scienceSlots`, `poolResolver.js:309`).
   Latent today; future-concentration risk.

The pattern across all four: the science logic was written for the "exactly
two SCIENCE slots, label-keyed sequence detection" world. This branch
generalizes both functions to N slots and replaces label equality with
membership in `SCIENCE_SEQUENCES`.

---

## Out of Scope

Do not touch on this branch, even if noticed:

- BUG-9 (`computePlanCredits` dedup key on repeated pool selections) — audit
  marks "intentional per spec; no fix required" — also lives in
  `transferCredits.js`, wrong file.
- BUG-13 (later-completed-semester prereq satisfaction) — `DegreePlan.jsx`
  concern.
- The rest of `poolResolver.js`: `POOL_COURSES`, `POOL_LABELS`, `resolvePool`,
  `resolveSatisfiesPool`, `getGenEdStatus`, `resolveFreeElective`. The pool
  membership lists are load-bearing curriculum data — do not edit.
- Hard-blocking invalid science pairs at selection time (a roadmap item under
  "Science sequence auto-pair enforcement" in `ROADMAP.md`). This branch only
  improves the *warning*, not enforcement.
- The `SCIENCE_SEQUENCE_NAMES` label map. It is still used for the
  "incomplete" warning text ("complete your [Biology] sequence"). Don't churn
  the labels.
- Adding a third SCIENCE slot to any concentration template — purely
  defensive generalization.

---

## Preconditions

1. From `main` in `MyDegreePlan_Frontend/`, create the branch:
   `git checkout -b fix/science-pool-warnings`.
2. Run `npm run test`. Baseline: **9 files, 210 tests passed**. If it does
   not match, stop and report.
3. Read in full before editing:
   - `src/lib/poolResolver.js` lines 233–338 (`SCIENCE_SEQUENCES`,
     `resolveScience`, `SCIENCE_SEQUENCE_NAMES`, `getScienceWarnings`).
   - `src/lib/__tests__/poolResolver.test.js` lines 115–249
     (existing `resolveScience` tests; no `getScienceWarnings` coverage today).
   - `src/components/SlotModal.jsx` lines 46–73 (sole `resolveScience`
     caller; passes `otherPlanSlots` with the active slot stripped — confirms
     the caller's contract).
   - `src/components/DegreePlan.jsx` line 337 (sole `getScienceWarnings`
     caller, inside a `useMemo`).

---

## Implementation Order

Ordered smallest-to-largest. Each commit must leave `npm run test` green.

1. **BUG-17** — delete the redundant reversed `GEOL1040/GEOL1045` entry in
   `SCIENCE_SEQUENCES`. Existing tests for both autofill directions
   (`poolResolver.test.js:179, 185`) prove order-independence — they should
   still pass. Pure deletion, no logic change.
2. **BUG-10** — replace the label-equality conflict check in
   `getScienceWarnings` with sequence membership. New `getScienceWarnings`
   tests added in the same commit.
3. **BUG-18** — generalize `getScienceWarnings` from
   `const [slotA, slotB] = scienceSlots` to a pairwise iteration. Add a
   defensive test with 3 synthetic SCIENCE slots.
4. **BUG-11** — generalize `resolveScience` from `selectedScienceCodes[0]`
   to a multi-code-aware lookup. Add tests for the 2-already-selected cases.

---

## Plan

### Step 1 — BUG-17: drop the duplicate GEOL entry

`src/lib/poolResolver.js:235–243`. Delete line 240:

```js
{ courses: ['GEOL1045', 'GEOL1040'] },
```

The remaining entry on line 239 covers both directions because the iteration
is `seq.courses.includes(alreadySelected)` + `seq.courses.find(c => c !== alreadySelected)`.
No test changes needed; existing tests at `poolResolver.test.js:179, 185`
already verify both directions.

### Step 2 — BUG-10: sequence-membership conflict check

`src/lib/poolResolver.js:305–338`. Replace the two-filled branch's
condition. Before:

```js
if (codeA && codeB) {
  if (seqA && seqB && seqA !== seqB) {
    return {
      [slotA.id]: { type: 'conflict' },
      [slotB.id]: { type: 'conflict' },
    }
  }
  return {}
}
```

After:

```js
if (codeA && codeB) {
  const known = c => Object.prototype.hasOwnProperty.call(SCIENCE_SEQUENCE_NAMES, c)
  if (known(codeA) && known(codeB)) {
    const validPair = SCIENCE_SEQUENCES.some(
      s => s.courses.includes(codeA) && s.courses.includes(codeB)
    )
    if (!validPair) {
      return {
        [slotA.id]: { type: 'conflict' },
        [slotB.id]: { type: 'conflict' },
      }
    }
  }
  return {}
}
```

The `known` guard preserves today's behavior for unknown/synthetic codes
(no false-positive conflict warnings). The "incomplete" branch and its label
text continue to use `SCIENCE_SEQUENCE_NAMES` — unchanged.

New tests in `poolResolver.test.js` (new `describe('getScienceWarnings')` block):
- Both empty → `{}`
- One filled, one empty → incomplete on empty slot with sequence label
- `BIOL1113 + BIOL1123` → no conflict (valid pair, regression for BUG-10)
- `BIOL1113 + BIOL2310` → no conflict (valid pair, regression for BUG-10)
- **`BIOL1123 + BIOL2310` → conflict on both** (the BUG-10 case)
- `CHEM1110 + PHYS2010` → conflict on both (cross-sequence)
- `CHEM1110 + CHEM1120` → no conflict (valid pair)

### Step 3 — BUG-18: pairwise iteration

`src/lib/poolResolver.js:305–338`. Replace the destructure with a nested
loop over slot pairs. Skeleton (final form is the body of `getScienceWarnings`):

```js
export function getScienceWarnings(planSlots, slots) {
  const scienceSlots = slots.filter(s => s.is_pool && s.class_code === 'SCIENCE')
  if (scienceSlots.length < 2) return {}

  const warnings = {}
  const known = c => Object.prototype.hasOwnProperty.call(SCIENCE_SEQUENCE_NAMES, c)

  for (let i = 0; i < scienceSlots.length; i++) {
    for (let j = i + 1; j < scienceSlots.length; j++) {
      const slotA = scienceSlots[i]
      const slotB = scienceSlots[j]
      const codeA = planSlots[slotA.id]
      const codeB = planSlots[slotB.id]

      if (codeA && codeB) {
        if (known(codeA) && known(codeB)) {
          const validPair = SCIENCE_SEQUENCES.some(
            s => s.courses.includes(codeA) && s.courses.includes(codeB)
          )
          if (!validPair) {
            warnings[slotA.id] = { type: 'conflict' }
            warnings[slotB.id] = { type: 'conflict' }
          }
        }
        continue
      }

      if (codeA && !codeB && !warnings[slotB.id]) {
        const seqName = SCIENCE_SEQUENCE_NAMES[codeA]
        if (seqName) warnings[slotB.id] = { type: 'incomplete', sequenceName: seqName }
      } else if (!codeA && codeB && !warnings[slotA.id]) {
        const seqName = SCIENCE_SEQUENCE_NAMES[codeB]
        if (seqName) warnings[slotA.id] = { type: 'incomplete', sequenceName: seqName }
      }
    }
  }

  return warnings
}
```

The 2-slot case reduces to today's behavior: one inner-loop iteration with
`(slotA, slotB) = (scienceSlots[0], scienceSlots[1])`. The `!warnings[id]`
guard prevents an "incomplete" warning from being overwritten when multiple
pairs yield the same empty slot.

New tests in `getScienceWarnings` describe block:
- 3 SCIENCE slots, all empty → `{}`
- 3 SCIENCE slots, one filled (CHEM1110) → incomplete on each of the 2 empty slots
- 3 SCIENCE slots, two filled (CHEM1110 + BIOL1123) → conflict on both filled
  slots; empty slot gets one incomplete warning (first match wins per `!warnings[id]`)

### Step 4 — BUG-11: multi-code-aware `resolveScience`

`src/lib/poolResolver.js:245–277`. Replace the body. Before:

```js
const alreadySelected = selectedScienceCodes[0]

if (alreadySelected === 'BIOL1113') { /* narrow */ }

for (const seq of SCIENCE_SEQUENCES) {
  if (!seq.courses.includes(alreadySelected)) continue
  const partner = seq.courses.find(c => c !== alreadySelected)
  if (!partner || !courseMap[partner]) continue
  return { mode: 'autofill', course: courseMap[partner] }
}

return { mode: 'normal' }
```

After:

```js
// BIOL1113 narrows to its two valid partners — but only if neither partner
// is already among the selected codes
if (selectedScienceCodes.includes('BIOL1113')) {
  const remainingPartners = ['BIOL1123', 'BIOL2310']
    .filter(c => !selectedScienceCodes.includes(c))
  if (remainingPartners.length > 0) {
    return {
      mode: 'narrow',
      courses: remainingPartners
        .filter(c => courseMap[c])
        .map(c => courseMap[c]),
    }
  }
  // BIOL1113 + a partner already filled → sequence covered, fall through
}

// Find a sequence that contains every already-selected code.
// If found, return the missing partner (autofill); if no missing partner
// (sequence already complete), fall through to normal.
for (const seq of SCIENCE_SEQUENCES) {
  const allInSeq = selectedScienceCodes.every(c => seq.courses.includes(c))
  if (!allInSeq) continue
  const missing = seq.courses.find(c => !selectedScienceCodes.includes(c))
  if (missing && courseMap[missing]) {
    return { mode: 'autofill', course: courseMap[missing] }
  }
  // Sequence fully covered or partner missing from courseMap — fall through
  break
}

return { mode: 'normal' }
```

Behavior matrix (verified against existing tests):

| Already selected | Mode | Notes |
|---|---|---|
| `[]` | `normal` | unchanged |
| `['CHEM1110']` | `autofill: CHEM1120` | finds seq `[CHEM1110, CHEM1120]`, missing CHEM1120 |
| `['CHEM1120']` | `autofill: CHEM1110` | symmetric |
| `['BIOL1113']` | `narrow: [BIOL1123, BIOL2310]` | BIOL1113 special case |
| `['BIOL1123']` | `autofill: BIOL1113` | seq `[BIOL1123, BIOL1113]`, missing BIOL1113 |
| `['BIOL2310']` | `autofill: BIOL1113` | seq `[BIOL2310, BIOL1113]`, missing BIOL1113 |
| `['FAKE9999']` | `normal` | no seq covers it |
| `['BIOL1113', 'BIOL1123']` | `normal` | sequence complete (BUG-11 new) |
| `['CHEM1110', 'PHYS2010']` | `normal` | no single seq covers both (BUG-11 new) |

All existing tests at `poolResolver.test.js:130–248` continue to pass under
this logic (verified case-by-case against the matrix above).

New tests:
- `['BIOL1113', 'BIOL1123']` → normal (sequence complete)
- `['BIOL1113', 'BIOL2310']` → normal (sequence complete)
- `['CHEM1110', 'PHYS2010']` → normal (no shared sequence; no first-slot bias)

---

## Files Expected to Change

| File | Bugs | Summary |
|---|---|---|
| `src/lib/poolResolver.js` | 10, 11, 17, 18 | One delete (BUG-17), two function bodies rewritten |
| `src/lib/__tests__/poolResolver.test.js` | 10, 11, 18 | New `describe('getScienceWarnings')`; 3 new `resolveScience` cases |
| `docs/claude/bug.md` | — | Remove BUG-10, 11, 17, 18 entries on close-out |
| `docs/claude/BRANCH_QUEUE.md` | — | Move into Merged Branches table on close-out |

---

## Test Protocol

`cd MyDegreePlan_Frontend && npm run test`. Baseline: **9 files, 210 tests
passed**. After fix: 9 files with new test count (~ 220, exact count to be
recorded in the close-out commit).

Pure-logic file with full test coverage already in place — every fix here
is provable by tests, no manual UI verification required for correctness
(but see Manual Verification for product-level sanity check).

---

## Commit Plan

Four commits, one per bug, in implementation order. Each must leave tests
green.

```
fix: drop duplicate reversed GEOL sequence entry in SCIENCE_SEQUENCES (BUG-17)

fix: detect invalid science pairs by sequence membership, not label (BUG-10)

fix: pairwise iteration for getScienceWarnings beyond the first two slots (BUG-18)

fix: multi-code-aware resolveScience; remove first-slot bias (BUG-11)
```

Each commit body should reference the BUG-N audit entry and the function
edited.

---

## Known Constraints

- `resolveScience` and `getScienceWarnings` exported signatures must not
  change — `SlotModal.jsx:53` and `DegreePlan.jsx:337` are the only callers
  and both pass the existing argument shape.
- `SCIENCE_SEQUENCES` and `SCIENCE_SEQUENCE_NAMES` shapes are internal to
  the module — extending entries is fine, restructuring them is scope creep.
- Today's CSC concentration templates have exactly 2 SCIENCE slots each.
  BUG-11 and BUG-18 are defensive only; do not assert anywhere that
  `scienceSlots.length === 2`.

---

## Manual Verification

The fix is pure-logic and fully covered by tests. Optional UI sanity check
in `npm run dev`:

1. Open a Core or Cybersecurity plan.
2. In one SCIENCE slot pick `BIOL1123`. In the other SCIENCE slot pick
   `BIOL2310`.
3. **Before fix:** no warning on either slot.
4. **After fix:** both slots show a "conflict" warning (mismatched sequence —
   neither pair contains both codes in `SCIENCE_SEQUENCES`).
5. Reset, then pick `BIOL1113` in slot 1 and `BIOL1123` in slot 2 — no
   warning on either (regression check; this is a valid pair).

---

## Post-branch Checklist

- [ ] `npm run test` green; record the new test count in the close-out commit.
- [ ] Optional manual verification scenario above.
- [ ] `docs/claude/bug.md` — remove BUG-10, BUG-11, BUG-17, BUG-18 entries;
      update severity counts (Medium 11 → 9, Low 5 → 3, Total 17 → 13).
      Do not renumber remaining bugs.
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved into Merged Branches table
      with today's date.
- [ ] `docs/claude/BRANCH_science-pool-warnings.md` deleted in the close-out
      commit.
- [ ] Merge to `main`. Do not force-push.
