// features.js
//
// Features that are built but not yet open to students. A feature listed `false` shows as "Coming soon" where it would appear
// and cannot be used: its sidebar tab is greyed out and tagged, nothing is computed for it, and nothing it produces (the degree
// audit PDF) is offered. Flipping a flag to `true` opens the whole feature at once; nothing else needs to change.
//
// This is the one place to look for what is held back, the way READY_DEPARTMENTS (lib/programBrowser.js) is for programs.

export const FEATURES = {
  // The Requirements tab, the degree audit and its PDF: major, general education and electives with what counts toward each,
  // the earliest finish and what sets the pace.
  requirements: false,
  // A second major or a minor on the plan (Settings > Second major, Minors). The plan view already reads the ones a student has; this opens
  // adding and removing them. Held back until the what-if and its delay warning exist and the three platforms are checked
  // (PLAN_double-major-minor.md, Phases 7 and 8).
  additionalPrograms: false,
}

/**
 * Whether a feature is open to students. No name (a tab that is always on) is open. A name is open only when its flag is exactly
 * `true`, so a misspelt or unlisted name stays closed rather than quietly opening something held back. `features` is injectable so
 * a test can open or close one without touching the real flags.
 */
export function isFeatureOpen(name, features = FEATURES) {
  if (!name) return true
  return features[name] === true
}
