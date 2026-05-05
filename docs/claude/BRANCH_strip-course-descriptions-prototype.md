# Branch: `data/strip-course-descriptions-prototype`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Prototype/main`.
> Scope: Strip redundant prerequisite, corequisite, and ACT-score sentence preambles from
> `prototype.json` course descriptions. Re-seed Supabase after applying. Frontend unchanged.

---

## What This Branch Does

Removes the leading "Prerequisite:" / "Corequisite:" sentence preambles from
`prototype.json` course descriptions. These preambles duplicate content already
structured in `prerequisite_entries` / `corequisite_entries` and displayed in
the dedicated prereq/coreq sections of `CourseDetailModal`. After stripping,
descriptions contain only actual course-content text.

Bugs addressed (from `docs/claude/bug.md`):

1. **BUG-32 (Medium)** — Course descriptions contain redundant prerequisite,
   corequisite, and placement text. Students see the same information twice,
   with the description version being less structured and harder to read. 86 of
   126 courses in `prototype.json` are affected.

---

## Non-Goals / Out of Scope

- `coursesFile.json` — explicitly deferred (`data/strip-course-descriptions-coursesFile`).
- Frontend files — `CourseDetailModal.jsx` already guards with `{course.description && (...)}`;
  no frontend changes required.
- `seed.js` — already maps `c.description ?? null`; no changes needed.
- Schema changes — `courses.description` column is nullable; no migration needed.
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` — signatures unchanged.
- Per-sentence content editing — script applies mechanical pattern stripping only;
  human prose editing of remaining descriptions is out of scope.

---

## Critical Constraint: `classifyPrereq` Reads Descriptions

`src/lib/classifyPrereq.js` (`classifyPrereq`) examines `course.description`
for ACT/SAT score patterns (`/act math(ematics)?\s+score/i`, `/sat math/i`,
`/placement test/i`) and consent patterns (`/consent of instructor/i`, etc.)
to classify whether a prereq is a placement gate or consent gate. If those
sentences are stripped from descriptions, `classifyPrereq` returns `'completion'`
instead of `'placement'` or `'consent'`, causing false prereq warnings to appear
for every affected course.

**Rule:** Any "Prerequisite:" or "Corequisite:" sentence that contains ACT, SAT,
ACCUPLACER, "placement test", "consent of instructor", or "permission of
instructor/department" language must **not** be stripped — it is the sole source
of `classifyPrereq`'s placement/consent signal.

Nine courses in `prototype.json` are affected:
`CHEM1110`, `CSC1200`, `MATH1710`, `MATH1720`, `MATH1730`, `MATH1845`,
`MATH1904`, `MATH1910`, `MATH3070`. Their "Prerequisite:" preambles are preserved
in full.

---

## Preconditions

1. Create branch in `MyDegreePlan_Prototype/`:
   `cd MyDegreePlan_Prototype && git checkout -b data/strip-course-descriptions-prototype`
2. Confirm `classifyPrereq.js` ACT/SAT patterns at
   `MyDegreePlan_Frontend/src/lib/classifyPrereq.js:22–28` — verify the pattern list has
   not changed since the branch doc was written.
3. No Vitest suite in `MyDegreePlan_Prototype/`; test protocol is manual review of the
   preview diff only.

---

## Implementation Order

Single concern. Write script → preview diff → apply on approval → verify → SQL output → commit.

---

## Plan

### Step 1 — Write `strip_descriptions.js`

New file at `MyDegreePlan_Prototype/strip_descriptions.js`. The script:

1. Reads `./prototype.json`.
2. For each course, calls `stripPreamble(description)`:
   - ACT/consent guard: if the leading "Prerequisite[s]:" or "Corequisite[s]:" sentence
     contains any of: `ACT`, `SAT`, `ACCUPLACER`, `placement test`, `consent of instructor`,
     `instructor's consent`, `permission of` → **stop, return description unchanged**.
   - Otherwise: strip the leading "Prerequisite[s]: ... ." and "Corequisite[s]: ... ." 
     sentence(s), repeating until neither pattern matches the remaining start of string.
   - Trim. If the result is empty, return `null`.
3. Prints a summary:
   - Total courses examined
   - Courses where description changed
   - Courses where description was preserved (ACT/consent guard fired)
   - Courses where description became null/empty
4. **Writes a preview to stdout (pretty-diff style)** — for each changed course, prints
   the before and after descriptions side by side. Does not write to the file yet.
5. After printing the preview, prompts the user to confirm with `y` before writing
   (use `readline` / `process.stdin`). On any other input, exits without modifying the file.

**Strip logic sketch:**

```js
const ACT_GUARD    = /\b(ACT|SAT|ACCUPLACER|placement test)\b/i
const CONSENT_GUARD = /consent of instructor|instructor['’]?s?\s+consent|permission of (the )?(instructor|department)/i
const PREAMBLE_RE  = /^(Prerequisite[s]?|Corequisite[s]?):\s[^.]+\.\s*/i

function stripPreamble(desc) {
  if (!desc) return desc
  let text = desc.trim()
  while (true) {
    const m = PREAMBLE_RE.exec(text)
    if (!m) break
    if (ACT_GUARD.test(m[0]) || CONSENT_GUARD.test(m[0])) break
    text = text.slice(m[0].length).trim()
  }
  return text || null
}
```

The regex `[^.]+` matches up to the first period — safe for single-sentence preambles.
Multi-sentence preambles loop on each pass. Stop on guard match or no match.

### Step 2 — Run the script; review the preview

```
cd MyDegreePlan_Prototype && node strip_descriptions.js
```

Review every before/after pair. Confirm:
- The nine ACT/consent-guarded courses are listed as preserved.
- No content-description text was accidentally removed.
- Empty-result courses (if any) are reasonable (i.e. the original was only a prereq sentence).

Type `y` to apply when satisfied. The file is rewritten in place.

### Step 3 — Verify the output

```
node -e "
  const d = JSON.parse(require('fs').readFileSync('./prototype.json','utf8'));
  const withDesc = d.courses.filter(c => c.description);
  const nullDesc  = d.courses.filter(c => !c.description);
  console.log('have description:', withDesc.length);
  console.log('null description:', nullDesc.length);
  const stillHasPrereq = withDesc.filter(c => /^Prerequisite/i.test(c.description));
  console.log('still starts with Prerequisite:', stillHasPrereq.length);
  stillHasPrereq.forEach(c => console.log(' ', c.code, c.description.slice(0,80)));
"
```

Expected: `still starts with Prerequisite` count is exactly the nine guarded courses (all
containing ACT/consent language). If any non-guarded course still starts with "Prerequisite:",
investigate and fix the script before committing.

### Step 4 — Output the re-seed SQL

Print to terminal (do not execute):

```sql
-- Re-seed course descriptions after stripping redundant prereq preambles (BUG-32).
-- Run via Supabase Dashboard > SQL Editor.
-- This is safe to run multiple times (UPSERT on conflict: code).

-- Option A: Re-run seed.js (preferred — syncs all fields).
-- cd MyDegreePlan_Prototype && node seed.js

-- Option B: Apply description changes only (if full re-seed is not desired).
-- Paste the generated UPDATE statements from strip_descriptions.js --sql-only mode,
-- or run the full seed.
```

The simplest re-seed path is `node seed.js` from `MyDegreePlan_Prototype/` with valid
`.env` credentials. Instruct the user to run this after the commit, not before.

---

## Files Expected to Change

| File | Change |
|---|---|
| `MyDegreePlan_Prototype/prototype.json` | Description fields stripped for ~77 courses; 9 ACT/consent-guarded courses unchanged; ~0–5 nulled |
| `MyDegreePlan_Prototype/strip_descriptions.js` | New one-off script; keep in repo as a record |

Close-out docs commit (in `MyDegreePlan_Frontend/`):

| File | Change |
|---|---|
| `docs/claude/bug.md` | Remove BUG-32 entry; update counts (Medium 4→3, Total 8→7) |
| `docs/claude/BRANCH_QUEUE.md` | `data/strip-course-descriptions-prototype` → Merged Branches |
| `docs/claude/BRANCH_strip-course-descriptions-prototype.md` | Delete this file |

---

## Test Protocol

`MyDegreePlan_Prototype/` has no Vitest suite. Verification is the Step 3 node command
above. The pass criterion is: zero non-guarded courses start with "Prerequisite" after
stripping.

Frontend tests are unaffected — run `cd MyDegreePlan_Frontend && npm run test` as a
regression check after re-seeding if desired. Baseline: **13 files, 266 tests**.

---

## Commit Plan

Commit 1 (in `MyDegreePlan_Prototype/`):
```
chore(data): strip redundant prereq/coreq preambles from prototype.json descriptions (BUG-32)
```
Body: "Removes leading 'Prerequisite: ...' and 'Corequisite: ...' sentence preambles from
course descriptions in prototype.json. Sentences containing ACT/SAT/ACCUPLACER/consent
language are preserved (classifyPrereq.js reads them for placement/consent classification).
strip_descriptions.js is the one-off script used; kept for reference."

Commit 2 (in `MyDegreePlan_Frontend/`):
```
docs: close out data/strip-course-descriptions-prototype (BUG-32)
```

---

## Known Constraints

- **`classifyPrereq.js` reads descriptions** — nine courses' prereq preambles must be
  preserved. See Critical Constraint section above.
- **`courses.description` is nullable** — the DB accepts null; `CourseDetailModal`
  guards the render. Empty-after-strip results should become `null`, not `""`.
- **Re-seed required** — `prototype.json` is only the source; Supabase still has old text
  until `node seed.js` is run by the user after the commit.
- **`coursesFile.json` is deferred** — do not touch it in this branch.

---

## Manual Verification

After re-seeding, open the app with `npm run dev` in `MyDegreePlan_Frontend/`.

1. Click any non-ACT course slot (e.g. CHEM1120 after stripping). Open `CourseDetailModal`.
   Confirm: Description section shows only course-content text with no "Prerequisite:" prefix.
   The Prerequisites section below still shows the structured prereq list.

2. Click a course with an ACT-guarded description (e.g. CSC1200 or MATH1910).
   Confirm: Description section still shows the full original text including the
   "Prerequisite: ACT..." sentence (guard preserved it). No false prereq warning banner.

3. Confirm `classifyPrereq` still works: select CSC1200 in a semester. No prereq warning
   should appear (ACT math gate → suppressed).

4. If any course's description became null: confirm the Description section is absent from
   its `CourseDetailModal` (the `{course.description && (...)}` guard hides it cleanly).

---

## Post-branch Checklist

- [ ] Step 3 verification passes: 0 non-guarded courses start with "Prerequisite".
- [ ] User has run `node seed.js` from `MyDegreePlan_Prototype/` to update Supabase.
- [ ] Manual verification scenarios 1–4 pass.
- [ ] `docs/claude/bug.md` — BUG-32 removed; severity counts updated (Medium 4→3, Total 8→7).
- [ ] `docs/claude/BRANCH_QUEUE.md` — branch moved to Merged Branches with today's date.
- [ ] `docs/claude/BRANCH_strip-course-descriptions-prototype.md` deleted in close-out commit.
- [ ] Merge to `main` in `MyDegreePlan_Prototype/`. Do not force-push.
