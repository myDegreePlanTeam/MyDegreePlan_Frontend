# Branch: `feat/theme-pass`

> Active-branch context. Read after `docs/claude/CLAUDE.md`. Delete this file before merging.
> Target: `MyDegreePlan_Frontend/main`.
> Scope: coordinated theme overhaul — TTU purple recolor (feat/branding), WCAG AA contrast
> audit and fixes (BUG-38), and light/dark mode toggle (feat/dark-mode). All three land
> together to avoid re-theming three times.

---

## What This Branch Does

Replaces the current navy palette with a TTU purple–based dark and light theme, adds a
toggleable dark-mode with localStorage persistence and `prefers-color-scheme` fallback, and
resolves all WCAG 2.1 AA contrast failures from BUG-38 as part of the new palette.

Concerns addressed:

1. **BUG-38 (Medium)** — Multiple foreground/background pairings fail WCAG 2.1 AA (4.5:1
   normal text, 3:1 UI components). Resolved by establishing a contrast-clean palette rather
   than patching the existing one.
2. **feat/branding** — TTU purple as primary dark surface, replacing navy blue. Gold accent
   stays (TTU brand color). Logo/icon is **out of scope** (no design asset exists; see Open Questions).
3. **feat/dark-mode** — `data-theme` attribute on `<html>`; dark = default; light = new.
   Persist to localStorage; default via `prefers-color-scheme`.

---

## Non-Goals / Out of Scope

- **Logo / app icon** — no design asset; defer to a follow-up entry in `BRANCH_QUEUE.md`.
- **feat/grid-redesign** (Phase 3) — no structural HTML changes.
- **Schema changes** — theme preference stays in localStorage; `student_profiles.theme` deferred.
- **Package M** (`fix/drag-to-prior-coursework-flicker`, BUG-36) — separate branch.
- **No new test files** — CSS and theme init verified manually only.
- `checkPrereqs`, `computePlanCredits`, `validatePriorCredit` signatures are unchanged.

---

## Confirmed Palette Values (all open questions resolved 2026-05-02)

| Variable | Dark theme | Light theme |
|---|---|---|
| `--bg` | `#0D0717` | `#f5f2fb` |
| `--bg-mid` | `#1A1030` | `#ede8f5` |
| `--bg-light` | `#2D1E52` | `#c9bde0` |
| `--text` | `#f0ede6` (keep current) | `#1a1030` |
| `--text-muted` | `#8a9bb0` (keep current) | `#7A6B9A` |
| `--gold` | `#FFDD00` | `#FFDD00` |
| `--gold-light` | `#FFE84D` | `#FFE84D` |
| `--danger` | `#e05c5c` | `#e05c5c` |

**TTU brand:** Purple `#4F2984`, Gold `#FFDD00`.
**Toggle placement:** top-right of the dashboard header alongside "Sign Out".

---

## Preconditions

1. Create branch: `git checkout -b feat/theme-pass`.
2. Run `npm run test`. Baseline: **13 files, 266 tests**. Stop and report if it does not match.
3. Read the **Confirmed Palette Values** table above — all palette decisions are resolved.
4. Read in full before editing:
   - `src/index.css` — the 8 theme variables and `body` rule.
   - `src/pages/Auth.css` — full file; uses `--gold`, `--muted`, `--navy`, `--navy-mid`, `--navy-light`.
   - `src/App.jsx` — routing structure; this is where theme-init `useEffect` goes.
   - `src/components/Dashboard.css` focus areas:
     - Lines 636–665: `.modal-status-badge.taken/locked`
     - Lines 752–817: `.status-badge-*`, `.credit-bar-*`
     - Lines 1975–2055: `.credit-type-*`, `.slot-standing-warning`, `.slot-transfer-*`
     - Lines 2280–2400: prereq/completion sections with `#4ade80`, `#93c5fd` hardcodes

---

## Architecture: CSS Variable Theming

All theme values live in `src/index.css`. The approach uses backward-compat aliases so
Dashboard.css and Auth.css need zero variable-name edits:

```css
:root {
  /* Semantic names — dark theme (default) */
  --bg:         #0D0717;
  --bg-mid:     #1A1030;
  --bg-light:   #2D1E52;
  --text:       #f0ede6;
  --text-muted: #8a9bb0;

  /* Backward-compat aliases (Dashboard.css/Auth.css use these; keep them) */
  --navy:       var(--bg);
  --navy-mid:   var(--bg-mid);
  --navy-light: var(--bg-light);
  --white:      var(--text);
  --muted:      var(--text-muted);

  /* Gold — updated to TTU brand gold */
  --gold:       #FFDD00;
  --gold-light: #FFE84D;
  --danger:     #e05c5c;

  /* Status semantics — replaces hardcoded hex in Dashboard.css */
  --status-progress: #6b9bd2;
  --status-done:     #4caf7d;
  --status-warn:     #e8b84b;
  --status-info:     #93c5fd;
  --status-purple:   #b06bd2;
  --status-orange:   #d28c4c;
}

:root[data-theme="light"] {
  /* Only redefine the five semantic vars — aliases cascade automatically */
  --bg:         #f5f2fb;
  --bg-mid:     #ede8f5;
  --bg-light:   #c9bde0;
  --text:       #1a1030;
  --text-muted: #7A6B9A;
}
```

**rgba() tinted backgrounds:** Dashboard.css contains ~20 `rgba()` calls with hardcoded
channels for gold `(201,168,76,...)` and muted `(138,155,176,...)`. After updating `--gold`
and `--muted`, these calls will still encode old hex. Plan for Commit 3: do a targeted
find-and-replace of the channel values to match the new palette. No `color-mix()` needed —
a direct channel swap is simpler and has no compatibility risk.

---

## Implementation Order

1. Palette variables, aliases, status vars, light theme → `src/index.css`
2. Theme init + toggle → `src/App.jsx` (init effect) + toggle button in confirmed location
3. Hardcoded hex → `var(--status-*)`, rgba() channel updates, BUG-38 contrast fixes → `Dashboard.css`, `Auth.css`

---

## Plan

### Commit 1 — `src/index.css`
- Replace `:root` block with the palette from the **Confirmed Palette Values** table above.
  Dark: `--bg #0D0717`, `--bg-mid #1A1030`, `--bg-light #2D1E52`, `--text #f0ede6`, `--text-muted #8a9bb0`.
- Add backward-compat aliases (`--navy`, `--navy-mid`, `--navy-light`, `--white`, `--muted`).
- Set `--gold: #FFDD00` and `--gold-light: #FFE84D` (TTU brand gold; replaces `#c9a84c`).
- Add six `--status-*` variables using current hardcoded values (Commit 3 will audit these).
- Add `:root[data-theme="light"]` block: `--bg #f5f2fb`, `--bg-mid #ede8f5`, `--bg-light #c9bde0`, `--text #1a1030`, `--text-muted #7A6B9A`.

No changes to Dashboard.css, Auth.css, or any `.jsx` on this commit.

### Commit 2 — `src/App.jsx` + toggle button
- `useEffect` in `App`: read `localStorage.getItem('theme')` → set
  `document.documentElement.dataset.theme`; else read `window.matchMedia('(prefers-color-scheme: light)').matches`; else default `'dark'`.
- `toggleTheme`: flip `'dark'` ↔ `'light'`, write to localStorage, update `dataset.theme`.
- Toggle button in confirmed location (sun/moon icons or "Light/Dark" text label).
  No new CSS file needed — style inline or extend an existing header rule.

### Commit 3 — `src/components/Dashboard.css` + `src/pages/Auth.css`
- Replace all 16 hardcoded hex values with `var(--status-*)`:
  - `#6b9bd2` → `var(--status-progress)` (4 sites: lines 714, 759, 1987, 2022)
  - `#4caf7d` → `var(--status-done)` (5 sites: lines 720, 765, 787, 807, 1997)
  - `#b06bd2` → `var(--status-purple)` (1 site: line 2002)
  - `#d28c4c` → `var(--status-orange)` (1 site: line 2007)
  - `#4ade80` → `var(--status-done)` or `--status-success` if shade is intentionally distinct (lines 2302, 2331, 2332, 2340, 2583)
  - `#93c5fd` → `var(--status-info)` (lines 2388, 2593)
  - `#e8b84b` → `var(--status-warn)` (line 1699)
- Update rgba() gold channel `(201,168,76,...)` and muted channel `(138,155,176,...)` to
  match the new palette hex values.
- Run contrast audit via Chrome DevTools Accessibility panel on both themes; fix any failing
  pairs ≥ 4.5:1 (normal text) / ≥ 3:1 (UI components). Primary suspects from BUG-38:
  `.modal-status-badge.taken`, credit-bar label text, eyebrow text at 0.65–0.7rem.
- Auth.css: verify login/signup pages pass contrast in both themes; fix any failures.

---

## Files Expected to Change

| File | Concern | Summary |
|---|---|---|
| `src/index.css` | all three | Palette rewrite, aliases, status vars, light theme |
| `src/App.jsx` | dark-mode | Theme init effect; toggle handler |
| `src/components/Dashboard.css` | BUG-38, branding | 16+ hex replacements; rgba() channel updates |
| `src/pages/Auth.css` | branding, BUG-38 | Light-mode verification; any contrast fixes |
| Toggle button location (confirm) | dark-mode | Sun/moon or text toggle render |

No test file changes.

Close-out docs commit:

| File | Change |
|---|---|
| `docs/claude/bug.md` | Remove BUG-38 entry; update counts (Medium 5→4, Total 10→9) |
| `docs/claude/BRANCH_QUEUE.md` | `feat/theme-pass` → Merged Branches; remove `feat/branding` + `feat/dark-mode` Phase 2 entries; add logo/icon to Deferred |
| `docs/claude/PACKAGES.md` | Package N ✅ COMPLETE; update open-bug counts |
| `docs/claude/BRANCH_theme-pass.md` | Delete this file |

---

## Test Protocol

```
cd MyDegreePlan_Frontend && npm run test
```

Baseline: **13 files, 266 tests**. No new tests added. Count must remain 266 — any change
signals accidental JS breakage.

---

## Commit Plan

```
feat(theme): TTU purple palette, semantic vars, backward-compat aliases, light-mode vars
```
Body: "Replaces navy-based :root variables with TTU-purple dark palette. Backward-compat
aliases (--navy, --navy-mid, --navy-light, --white, --muted) mean Dashboard.css and Auth.css
need zero variable-name edits. Adds --status-* semantic variables and :root[data-theme='light']
for light-mode surfaces."

```
feat(theme): dark-mode toggle, localStorage persistence, prefers-color-scheme default
```
Body: "App.jsx initialises data-theme on mount: localStorage → prefers-color-scheme →
'dark' fallback. Toggle button writes to localStorage and flips
document.documentElement.dataset.theme."

```
fix(css): replace hardcoded hex with themed vars; resolve BUG-38 contrast failures (BUG-38)
```
Body: "16 hardcoded hex substitutions in Dashboard.css (status-progress/done/warn/info/purple/
orange). rgba() gold and muted channel values updated to new palette. Contrast audit via
DevTools confirms WCAG AA in dark and light themes."

```
docs: close out feat/theme-pass
```

---

## Known Constraints

- **Do not rename** `--navy`, `--navy-mid`, `--navy-light`, `--white`, `--muted` — 234 uses
  across Dashboard.css and Auth.css. Alias them through `:root` only.
- **Auth pages must work in both themes** — test login and signup explicitly in light mode.
- **localStorage wins over `prefers-color-scheme`** — system preference is the default only
  when no localStorage key is set. Once the user toggles, localStorage governs.
- The alias approach means `--navy` etc. are still valid consumer names; do not add
  `var(--bg)` references in Dashboard.css — that would bypass light-mode overrides.
- Logo/icon work is deferred — add a `feat/branding-icon` entry to `BRANCH_QUEUE.md`
  Phase 2 during the close-out commit.

---

## Manual Verification

Boot `npm run dev`.

**Dark theme (default):**
1. App loads with TTU purple surfaces; gold accent visible on eyebrows, active states.
2. Open a pool slot modal; `.modal-status-badge.taken` text readable against badge bg.
3. Credit bar in Dashboard — green "completed" and gold "planned" bars visible on dark track.
4. Login and signup pages render correctly with updated palette.

**Light theme:**
5. Click toggle → light mode renders without page reload; all text readable.
6. Semester grid, modals, prior coursework panel render correctly in light mode.
7. Toggle back to dark; preference persists on page reload (localStorage).

**System preference:**
8. With no localStorage key, set OS/browser to `prefers-color-scheme: light` → app loads light.
9. Set localStorage `theme = 'dark'` in DevTools → reload → dark wins over system pref.

**WCAG contrast (Chrome DevTools → Accessibility → Show contrast ratio):**
10. Dark theme: check `.modal-status-badge.taken`, credit-bar labels, eyebrow text — all ≥ 4.5:1.
11. Light theme: same check — no white-on-white or purple-on-purple failures.

---

## Post-branch Checklist

- [ ] `npm run test` — 13 files, 266 tests passed.
- [ ] Manual verification scenarios 1–11 pass.
- [ ] `bug.md` — BUG-38 removed; severity counts updated.
- [ ] `BRANCH_QUEUE.md` — `feat/theme-pass` in Merged Branches; `feat/branding` and
      `feat/dark-mode` Phase 2 entries removed; `feat/branding-icon` added to Deferred.
- [ ] `PACKAGES.md` — Package N ✅ COMPLETE; open-bug counts updated.
- [ ] `BRANCH_theme-pass.md` deleted in close-out commit.
- [ ] Merge to `main` (`--ff-only`). No force-push.
