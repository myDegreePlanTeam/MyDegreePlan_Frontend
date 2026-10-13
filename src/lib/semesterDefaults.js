// semesterDefaults.js
//
// Which semesters of the plan are open until the student opens or closes one (redesign Phase 3b). The plan leads with what is next: the first
// semester that is not over, and the one after it, are open; everything else is one line (past semesters, which are done, and later ones, which
// are far off). A choice the student makes is kept in DegreePlan's `semesterExpanded` and always wins over this.
//
// Pure: phases come from lib/termPhase.js `semesterPhases`.

import { phaseOfSemester } from './termPhase'

/**
 * @param {number[]} semNums  the plan's semester numbers, in order
 * @param {Object} phases     semesterPhases(...)
 * @returns {Object}          { [semNum]: boolean }: true for the semesters that start open
 */
export function defaultOpenSemesters(semNums, phases) {
  const open = {}
  for (const n of semNums) open[n] = false
  const first = semNums.findIndex(n => phaseOfSemester(phases, n) !== 'past')
  if (first === -1) return open
  open[semNums[first]] = true
  if (first + 1 < semNums.length) open[semNums[first + 1]] = true
  return open
}
