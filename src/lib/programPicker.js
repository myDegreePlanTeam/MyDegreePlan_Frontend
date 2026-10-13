// programPicker.js
//
// What the onboarding picker shows at each of its steps (college, major, concentration), from the programs and their plans. Pure: the
// component only draws it. The steps are separate screens, like the rest of onboarding; this decides which of them a student sees:
//   - the college step only when there is more than one college to choose from,
//   - the concentration step only when the chosen major has more than one program (a base program and concentrations, or several concentrations).
// A search on the first step skips the rest: its result is a whole program.

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
 * The steps of onboarding in order, for what the student has chosen so far. The concentration step appears once a major with
 * more than one program is chosen; until then it is not counted.
 * @returns {string[]}  of 'college' | 'major' | 'concentration' | 'term' | 'scores' | 'credits'
 */
export function onboardingSteps({ hasCollegeStep, hasConcentrationStep }) {
  return [...(hasCollegeStep ? ['college'] : []), 'major', ...(hasConcentrationStep ? ['concentration'] : []), 'term', 'scores', 'credits']
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
