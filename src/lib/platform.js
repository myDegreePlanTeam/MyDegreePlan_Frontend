// platform.js: which of the three ways the app reaches a student this page load is running in, and the few words that differ.
//
//   'web'      the hosted site (Vercel): the plan lives in this browser
//   'desktop'  the Windows app (MyDegreePlan_Desktop): the same bundle in its own window, the plan lives on this computer
//   'docker'   the self-hosted Docker install: the plan lives in that install's database, behind a login
//
// The three share one build, so a platform difference is either a feature (a login, an update card) or a word. Words belong here,
// in one place, so a message never tells a desktop student to "refresh the page" or says their plan is in "this browser".
// A new platform branch elsewhere must be registered in parity/platform-branches.json (src/tests/platformBranches.test.js).
//
// Pure: no window, no imports. lib/dataClient.js calls platformOf once and exports the result.

export const PLATFORMS = ['web', 'desktop', 'docker']

export function platformOf({ backend, win } = {}) {
  if (win?.mdpDesktop?.isDesktop) return 'desktop'
  return backend === 'remote' ? 'docker' : 'web'
}

const WORDS = {
  web: {
    label: 'Web',
    where: 'this browser',
    eraseLabel: 'Erase all data on this device',
    storedMeta: 'Stored only in this browser',
    backupText: "Your plan never leaves this device, so it does not follow you to another phone or computer, and clearing this site's data deletes it. Export a copy to keep it safe or to load it somewhere else.",
    notPersistent: 'This browser is not letting the planner save (private browsing?). Your plan will be lost when you close this tab. Export it before you leave.',
    reloadHint: 'Please refresh the page.',
    errorReload: 'try reloading the page to get back on track.',
    reloadButton: 'Reload page',
  },
  desktop: {
    label: 'Windows app',
    where: 'this computer',
    eraseLabel: 'Erase all data on this device',
    storedMeta: 'Stored only on this computer',
    backupText: 'Your plan never leaves this computer, so it does not follow you to another one. Export a copy to keep it safe or to load it somewhere else.',
    notPersistent: 'MyDegreePlan could not save to this computer. Your plan will be lost when you close the app. Export it before you leave.',
    reloadHint: 'Please close and reopen MyDegreePlan.',
    errorReload: 'try reloading to get back on track.',
    reloadButton: 'Reload',
  },
  docker: {
    label: 'Docker install',
    where: 'this install',
    eraseLabel: 'Erase my plan',
    storedMeta: 'Stored in this install',
    backupText: 'Export your plan to a file, or import one made here, in the web version or in the desktop app. An import replaces the plan in this account.',
    notPersistent: 'This browser is not letting the planner save. Your plan will be lost when you close this tab. Export it before you leave.',
    reloadHint: 'Please refresh the page.',
    errorReload: 'try reloading the page to get back on track.',
    reloadButton: 'Reload page',
  },
}

export function platformWords(platform) {
  return WORDS[platform] ?? WORDS.web
}
