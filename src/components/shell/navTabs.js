// The shell's destinations, in order. Sidebar.jsx (the rail on a desktop, the bottom bar on a phone) and Skeletons.jsx (the loading copy of it)
// both read this, so they cannot drift. Four destinations: the Plan check list is reached from the plan, not from here (view 'issues' in
// DegreePlan.jsx keeps the Plan tab marked).
//
// `feature` names a flag in lib/features.js: a destination that is built but not open is listed greyed and tagged, and cannot be entered.

export const NAV_TABS = [
  { id: 'plan',         label: 'Plan' },
  { id: 'requirements', label: 'Requirements', feature: 'requirements' },
  { id: 'advising',     label: 'Advising' },
  { id: 'settings',     label: 'Settings' },
]
