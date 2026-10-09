# Platform parity

MyDegreePlan reaches students three ways: the **web** site (Vercel), the **Windows app** (MyDegreePlan_Desktop, Electron) and the **Docker**
install (MyDegreePlan_Deploy). All three run **one Frontend bundle**, so they should offer the same features and say the same things. This
folder is how that stays true. There are five layers, from cheapest to most thorough.

| Layer | What it catches | Where | Runs |
|---|---|---|---|
| **Wording guards** | wording that is only true on one platform ("this browser" in the desktop app), "concentration" where it means "degree program", a hard-coded institution name | `src/tests/terminology.test.js`, `src/tests/platform.test.js` | every `npm test`, and CI |
| **Platform-branch registry** | a file that starts to behave differently per platform without anyone deciding it should | `parity/platform-branches.json` + `src/tests/platformBranches.test.js` | every `npm test`, and CI |
| **Cross-platform run** | anything a student can see or do that differs between platforms: screens, text, the built plan, the PDF | `parity/run.mjs` | CI (web + desktop on every relevant PR; all three nightly in the Deploy repo) |
| **Drift watchdog** | a user-facing change on `main` that has not reached a platform that only updates on release | `parity/watch.mjs` | nightly, red when it has waited more than a week |
| **Build identity** | which Frontend commit a given build is (`dist/version.json`; `build.json` on desktop releases) | `vite.config.js` | every build |

## The rule

A platform may differ from the others only where it is **registered**:

- A **word** that differs (where the plan lives, how to reload) goes in `src/lib/platform.js`. The cross-platform run neutralises exactly those words, so
  "this browser" vs "this computer" is fine and any other difference in the same sentence is not.
- A **feature** that exists on some platforms only (accounts on Docker, each platform's update UI) is registered in `platform-branches.json` under `features`
  and, if it shows up in the UI's text, in `expected-differences.json` as a rule that names the feature. A rule that names an unregistered feature fails.
- A **file** that branches on the platform or backend (`isLocalBackend`, `mdpDesktop`, `__MDP_CONFIG__`, `platformWords` ...) must be listed in
  `platform-branches.json` with a reason. Adding one without listing it fails `platformBranches.test.js`; so does leaving a stale entry.

## Run it

```bash
npm run build                                    # the run serves dist/
cd parity && npm install && npx playwright install chromium     # once
node run.mjs                                     # web + desktop (needs ../MyDegreePlan_Desktop with npm install done)
node run.mjs --targets web,desktop,docker        # docker needs MDP_DOCKER_URL=http://127.0.0.1:8080, a running install
node run.mjs --dist <folder>                     # check another build, e.g. an older one
npm test                                         # the comparison and drift logic, no browser
node watch.mjs                                   # the drift report (public GitHub data; set GITHUB_TOKEN to avoid rate limits)
```

Every launch uses its own throwaway profile; the Docker leg is never started by the runner (a developer machine may hold a real install: start a
stack of your own, or let the Deploy repo's "Platform parity" workflow do it). Exit code 0 = in sync, 1 = they differ, 2 = the run could not finish.
The report is in `parity/out/report.md`; `parity/out/<platform>.json` hold each platform's fingerprints, and a failed step leaves `<platform>-failure.png`.

## How it was checked

The cross-platform run was pointed at the Frontend as it was before the wording fix: it failed on the desktop app saying "this browser", "another phone" and
"clearing this site's data", and passes on the fix. A desktop-only line added to an already-registered file passed the static registry test and failed the run.
Layers one and two are cheap and run everywhere; layer three is what catches the rest, which is why it exists.

## When a run fails

1. Read `parity/out/report.md`: it lists, per screen and region, the lines only on one platform.
2. If the difference is wrong, fix it (usually: a word belongs in `platform.js`, or a branch crept in).
3. If it is intended, register it (see "The rule"), with a reason. Never loosen a rule's `match` to make a run pass.

## Known differences (real, decided to live with for now)

`expected-differences.json` has a `knownIssues` list: a difference somebody has decided not to fix yet. It is printed at the top of every report (a "KNOWN DIFFERENCE"
section with the reason and the date) and never fails the run, so it cannot be forgotten; deleting the entry makes the run fail on it again. A known issue covers
only the kind and platforms it names: the first, `plan-order`, tolerates the same courses listed in a different order within a semester, and never excuses a
different set of courses.

**Today's entry, found by the first Docker run:** Docker lists a semester's courses in the degree-spec order (`CSC1020, CSC1300, MATH1910, ENGL1010, HIST2010`),
while web and the Windows app list them `ENGL1010, MATH1910, CSC1020, CSC1300, HIST2010`. A semester lists its courses by `requirement_slots.id`; Docker's ids come
from seeding the spec (spec order), while `catalog.json` keeps older ids that slots carried over from the retired hosted database. The courses are identical. The
spec order is the department's published map, so web and desktop (and the PDF they print) are the ones that deviate. Fixing it means populating `slot_order` from
the spec in the catalog generator, which changes what every web and desktop student sees, so it needs a decision.

## When Docker is retired

Delete the `docker` target from `lib/targets.mjs`, the `accounts` and Docker-only entries from both registries, `lib/platform.js`'s `docker` words, the Deploy repo's
"Platform parity" workflow, and the Docker line from `watch.mjs`. The wording and registry tests will tell you what is left.
