# PLAN: Replace the Docker install with an Electron desktop app

Status (2026-10-09): `MyDegreePlan_Desktop` exists locally (git initialised, nothing committed or pushed). Done: phase 0 (smoke check passes),
phase 1 (hardened shell and fuses), phase 2 (unsigned Windows NSIS installer built; installed per-user, smoke-tested, uninstalled with data kept;
release and CI workflows written but not yet run on GitHub) and the main-process half of phase 3 (electron-updater, optional updates, tested with fakes).
Not done: the Frontend update card, a real update between two published releases, an app icon, manual in-window checks, signing, and the Docker removal
(phases 5-6). Numbers below were counted from the working tree on that date
(`wc -l` over tracked files); they are approximate and exclude lockfiles.

## Why this is cheap: the app is already local-first

The Vercel build already runs with no server: the static catalog plus the student's plan in IndexedDB
(`lib/data/localClient.js`, `lib/data/storage.js`). The Docker stack is a second, heavier implementation of the same thing
(Postgres + GoTrue + PostgREST + nginx + an updater with the Docker socket). Electron does not need a new data layer. It
hosts the same `dist/` bundle with the local backend, and adds an installer and an updater. `db.planData` export / import
already exists on both backends, and the backup file format is the same, which is the migration path for existing Docker students.

## Decisions to make before starting (blockers, not details)

1. **Code signing and platforms (decided 2026-10-09: Windows x64 only, unsigned for now).** Signing is deferred, not dropped.
   - Windows: an unsigned installer triggers SmartScreen on first run; options later are an OV/EV certificate or Azure Trusted Signing (check that the
     account type is eligible). Lead time for identity vetting: days to weeks. Until then the update check's integrity rests on the SHA-512 in
     `latest.yml` over HTTPS from GitHub, not on a signature.
   - macOS (later): Apple Developer Program (about $99/yr) and notarization. An unsigned Mac app is blocked by Gatekeeper and cannot auto-update.
   - Linux (later): no signing needed (AppImage + deb).
2. **Origin.** IndexedDB is keyed by origin. Pick `app://mdp` (a registered privileged custom scheme) once and **never change it**:
   changing the scheme, host or (for http) the port orphans every student's data. Do not serve on `http://127.0.0.1:<random port>`.
3. **Repo home (decided 2026-10-09).** A new sibling repo, `MDP/MyDegreePlan_Desktop`, built alongside the Docker install. The Deploy repo
   is left alone until the Electron app is ready; then the Docker code is removed in one replacement step (phases 5 and 6).
4. **Required updates (decided 2026-10-09: none for now).** Docker releases had `min_sequence` (block older installs); electron-updater has no
   such concept, and updates are always optional. If it is wanted later: a small custom field in the release that the main process checks.
5. **Deprecation (decided 2026-10-09).** No user depends on the Docker install, so there is no deprecation window and no bridge release
   (the old phase 4 is dropped). Docker is removed in a single replacement once the Electron app is ready.

## Phases

Branches follow the workspace rules (one concern per branch, `start_branch.sh`, open the cited PR first). The only shared-file
hot spot is `dataClient.js` / `App.jsx` / `Sidebar.jsx` (phases 5 and 7): merge those back to back.

### Phase 0 - Spike (1-2 days, no commitment)
Electron main process loads the existing `dist/` through the `app://mdp` protocol (serve files, fall back to `index.html` for
unknown paths because the app uses `BrowserRouter`). No Frontend change. Verify: onboarding, plan build, drag-and-drop,
restart keeps the plan, lazy catalog chunks (3.2 MB + 0.9 MB), PDF export (`@react-pdf` blob/worker under the CSP), Import/Export.
Exit criterion: a person can install nothing but this and finish onboarding.

### Phase 1 - Hardened shell (the `MyDegreePlan_Desktop` repo)
`main.js` (~150 lines), `preload.js` (~30). `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, no remote content,
deny all navigation and `window.open` except an allowlisted `openExternal`, permission handler denies everything, a session-level
`webRequest` filter that cancels every request that is not `app://`, the same CSP as today's nginx header, Electron Fuses flipped
(`RunAsNode` off, `EnableNodeCliInspectArguments` off, asar integrity on). Preload exposes only `window.mdpDesktop = { version, updates }`.

### Phase 2 - Packaging and CI
electron-builder: Windows NSIS **per-user** (no admin rights), macOS dmg + zip (arm64 and x64), Linux AppImage + deb.
New `desktop.yml` workflow (replaces `release.yml`): test job (Frontend tests), matrix build on windows / macos / ubuntu runners,
sign, publish to a GitHub Release with `latest.yml`. Keep the `release` environment with a required reviewer; pin third-party actions by SHA;
add build provenance attestation. A tag is the version; `preflight.sh` shrinks to "sources on origin/main, version free, tests pass in a fresh clone".

### Phase 3 - Updates
`electron-updater` against GitHub Releases (differential download via blockmaps; checks at start and every ~6 h, as today).
Reuse `UpdateBanner.jsx` / `.css` and the card copy; replace `useAppUpdate.js` and `updateStatus.js` (they talk to `/_mdp/update`) with
a thin hook over `window.mdpDesktop.updates`. Keep: Later, auto-install toggle, rollback is not available (electron-updater has none), so
the release gate (phase 2) and a "download previous version" note carry that risk. Windows installs update without prompting for admin.

### Phase 4 - (dropped) Bridge release for Docker students
Not needed: no one depends on the Docker install. If an install turns up later, its owner exports from Settings and imports in the desktop app.

### Phase 5 - Frontend simplification (once the Electron app is ready)
Delete the remote backend and accounts; the app always uses the local backend. Collapse `isLocalBackend` branches in `Sidebar.jsx`,
`DeviceDataCard.jsx`, `dataClient.js`; remove the `@supabase/supabase-js` dependency and its dynamic chunk (`remoteClient`, 185 KB);
remove the Login / Signup routes and session gating in `App.jsx`; drop the "retry the read without the column" fallbacks that exist only
for installs whose SQL step has not re-run (check each: `fetchFreeAddSlots`, `dbErrors.js`). Schema evolution then lives only in
`STUDENT_TABLES` defaults; IndexedDB `DB_VERSION` is 1 with one key-value store, so adding a column needs no IndexedDB upgrade.

### Phase 6 - Deploy and Prototype cleanup
Delete from Deploy: `db/`, `setup/`, `web/`, `updater/`, `docker-compose.yml`, `mdp.ps1`, `mdp.cmd`, `mdp.sh`, `release-tools/`
(except what the new workflow keeps), `.mdp-active-compose.yml`, `.env*`, `release.yml`. In Prototype: `seed.js` (371 lines; only the
remote backend used it). `slotSync.js` stays (the degree builder uses it). Optionally delete the historical `migration_tier*.sql`
and `rls_migration.sql` at the same time (not counted below). Adapt `tools/release_status.sh` (+ its test) to the new workflow;
delete `tools/test_mdp_ps1_paths.mjs`.

### Phase 7 - Docs, memory, site
Rewrite the Deploy README (install, updates, "what private means", signing key / cert handling). Update `docs/claude/CLAUDE.md` (the
"Data backends" and "Docker stack and releases" sections, the stack line, the `remote` row, the env-var table) and `REFERENCE.md`; run
`docsReferences.test.js`. Update the memory entries that describe the Docker/update pipeline. Add the OS-detecting download buttons
on `MyDegreePlan_Site`.

### Phase 8 - Verification matrix (before announcing)
Clean Windows 11 VM (no Docker, no admin): install, onboard, restart, update from N to N+1, uninstall (data is kept, or removed - decide
and tell the student). Mac arm64 and Intel if supported. SmartScreen / Gatekeeper behaviour with the real certificate. PDF export.
Offline use. Import of a Docker backup. A corrupted or truncated update download. Run the app with the network disabled and confirm
the only outbound traffic is the update check (the filter in phase 1 should make this provable).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Certificates take weeks | Start vetting now; ship Windows-only first |
| Origin changed later orphans data | Fix `app://mdp` in phase 0; test in CI that the origin string is unchanged |
| Chromium goes stale (the app now bundles a browser) | Dependabot for `electron`; release at least after every Electron security update; document the cadence |
| Misconfigured Electron turns an XSS into code execution | Hardening checklist in phase 1 as tests (assert `webPreferences`, fuses); no remote content ever loaded |
| No rollback on a bad update | The release workflow gate and a smoke test on the built installers; keep previous installers on the Release page |
| IndexedDB is the only copy of the plan | Unchanged from today's web version; add a periodic auto-export reminder (separate item, not part of this migration) |
| Loss of multi-account support | One person per OS login profile; documented |

## Estimated code removed

Counted from tracked files. "Added" is my estimate of the replacement.

| Area | Removed (lines) | Added (lines) |
|---|---|---|
| Deploy: `updater/` (src + tests) | 1,367 | |
| Deploy: `setup/` (baseline SQL 306, Dockerfile, run.sh) | 371 | |
| Deploy: `web/` (nginx, entrypoint, Dockerfile) | 148 | |
| Deploy: `db/` | 16 | |
| Deploy: `docker-compose.yml` | 193 | |
| Deploy: `mdp.ps1` / `mdp.sh` / `mdp.cmd` | 602 | |
| Deploy: `release-tools/` (signing, image pinning, compose gen, verify) | 469 | ~60 (preflight) |
| Deploy: workflows (`release.yml` 289, `ci.yml` 30) | 319 | ~150 |
| Deploy: README | 169 | ~80 |
| Deploy: Electron main, preload, builder config, updater glue, tests | | ~400 |
| Frontend: remote backend (`remoteClient`, `remoteBackup`, `backend`) + tests | 281 | |
| Frontend: Login, Signup | 198 | |
| Frontend: update UI (`useAppUpdate`, `updateStatus`, `UpdateBanner` js+css, test) | 575 | ~150 |
| Frontend: branches in Sidebar / DeviceDataCard / dataClient / App / Dashboard | ~60 | |
| Prototype: `seed.js` | 371 | |
| **Total** | **~5,140** | **~840** |

Net about **4,300 lines fewer (roughly 80% of the Docker-related footprint)**. The workspace tooling under `local-deploy/tools/`
(3,909 lines) is not affected apart from two small files. Not counted: lockfile churn (`@supabase/supabase-js` and its dependencies
leave the Frontend; `electron`, `electron-builder`, `electron-updater` enter the Deploy repo), the doc rewrites, and the optional deletion of the historical
migration SQL files. Beyond lines: four custom container images, four third-party images pinned by digest, multi-arch image builds,
and the Docker socket all disappear.

## Effort

Roughly 8-12 working days of development spread over the phases, plus calendar time for certificate vetting (the real critical path)
(there is no bridge window any more). Phase 0 (a 1-2 day spike) is the cheapest way to confirm the plan before committing.
