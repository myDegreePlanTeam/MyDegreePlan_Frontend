// programPicker.js
//
// What the first-run picker shows, from the programs and their plans. Pure: the component only draws it. `majorListModel` is the screen
// (search, college chips, majors grouped by college, the chosen major's concentrations in place); `pickerModel` is the grouping and the
// closed-program rule under it. `onboardingSteps` is the order of first run's four screens.

import { splitByOffering } from './catalogYears.js'
import { closedDisclosure, groupByCollege, isProgramReady, searchPrograms } from './programBrowser.js'

/**
 * @param {{ programs: Array, plans: Array, value?: string|null, showClosed?: boolean, collegeCode?: string|null, majorKey?: string|null, query?: string }} input
 *   value  the selected program's code
 * @returns {{ tree, college, major, selected, results, disclosure, selectedIsClosed, hasCollegeStep, hasConcentrationStep }}
 */
export function pickerModel({ programs, plans, value = null, showClosed = false, collegeCode = null, majorKey = null, query = '' }) {
  const { current, closed } = splitByOffering(programs, plans)
  const selected = (programs ?? []).find(p => p.code === value) ?? null
  const selectedIsClosed = !!selected && closed.includes(selected)
  const closedShown = showClosed || selectedIsClosed
  const disclosure = closedDisclosure({ closedCount: closed.length, showClosed, selectedIsClosed })
  const visible = closedShown ? [...current, ...closed] : current
  const tree = groupByCollege(visible)
  const hasCollegeStep = tree.length > 1

  // with one college the college level is skipped
  const college = tree.length === 1 ? tree[0] : tree.find(c => c.college.code === (collegeCode ?? selected?.college)) ?? null
  const major = college?.majors.find(m => m.key === (majorKey ?? (selected && college.majors.find(m2 => m2.programs.includes(selected))?.key))) ?? null
  const results = query.trim() ? searchPrograms(visible, query) : null
  return {
    tree, college, major, selected, results, disclosure, selectedIsClosed, hasCollegeStep,
    hasConcentrationStep: !!major && major.programs.length > 1,
    ready: p => isProgramReady(p),
  }
}

/**
 * The first screen of first run: the majors a student can choose, grouped by college (redesign Phase 7). Search comes first; the colleges
 * are filter chips, not a step; a major with more than one program shows its concentrations in place when it is chosen. The planner does
 * not model every major yet, so the list starts with the ones it does and "Show the rest" adds the others (they stay marked Coming soon).
 *
 * @param {{ programs: Array, plans: Array, value?: string|null, majorKey?: string|null, showClosed?: boolean, college?: string|null, showAll?: boolean, query?: string }} input
 *   value     the selected program's code;  majorKey  the major opened to choose a concentration (before a program is chosen)
 *   college   the chip chosen, or null for all;  showAll  also list the majors the planner does not support yet
 * @returns {{ colleges, groups, hiddenCount, results, selected, openMajor, disclosure, selectedIsClosed }}
 */
export function majorListModel({ programs, plans, value = null, majorKey = null, showClosed = false, college = null, showAll = false, query = '' }) {
  const m = pickerModel({ programs, plans, value, showClosed, query })
  const all = m.tree.map(c => ({ college: c.college, majors: c.majors.map(major => ({ ...major, ready: major.programs.some(isProgramReady) })) }))
  const everyMajor = all.flatMap(c => c.majors)
  const hiddenCount = everyMajor.filter(major => !major.ready).length
  const shown = all
    .map(c => ({ college: c.college, majors: showAll ? c.majors : c.majors.filter(major => major.ready) }))
    .filter(c => c.majors.length > 0)
  const colleges = shown.map(c => c.college)
  const groups = college && colleges.some(c => c.code === college) ? shown.filter(c => c.college.code === college) : shown
  const selectedMajor = m.selected ? everyMajor.find(major => major.programs.includes(m.selected)) ?? null : null
  const openMajor = everyMajor.find(major => major.key === majorKey) ?? selectedMajor
  return { colleges, groups, hiddenCount, results: m.results, selected: m.selected, openMajor, disclosure: m.disclosure, selectedIsClosed: m.selectedIsClosed }
}

/**
 * The steps of first run, in order: the major (and its concentration, on the same screen), the first semester, test scores and credits
 * already earned, and the plan to look over before it is saved.
 */
export const ONBOARDING_STEPS = ['major', 'term', 'scores-and-credits', 'ready']
export function onboardingSteps() {
  return ONBOARDING_STEPS
}

/** The step before `step` in `steps`, or the first. */
export function stepBefore(steps, step) {
  const i = steps.indexOf(step)
  return steps[Math.max(0, i - 1)]
}

/** The step after `step` in `steps`, or the last. */
export function stepAfter(steps, step) {
  const i = steps.indexOf(step)
  return steps[Math.min(steps.length - 1, i + 1)]
}
