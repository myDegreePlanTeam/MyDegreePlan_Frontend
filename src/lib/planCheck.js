// planCheck.js
//
// The Plan check strip: what the plan's issues (lib/planIssues.js) mean to a student, in two groups.
//
//   picks    the course choices still to make. An unfinished pick is a to-do, not a problem: it is `info`, and only a `warning` when a later
//            course depends on it (its prerequisite is met provisionally by the empty slot). On the sample CSC Cybersecurity plan all 12
//            issues are picks, 11 info and 1 warning (Communications, which CSC 3040 needs).
//   problems everything else the planner flagged: unmet prerequisites (blockers), and advice (heavy or light terms, science sequences,
//            standing, hours over a limit).
//
// Pure: it reads the issues and builds the words; DegreePlan.jsx and shell/PlanCheckStrip.jsx draw them.

import { formatCourseCode } from './courseCodeFormat'

const isPick = issue => issue.kind === 'pick'

/**
 * @param {Array} issues  buildPlanIssues(...) output, already in severity then semester order
 * @returns {{
 *   picks: Array, pickCount: number,
 *   firstPick: object|null,            the pick to start with: the earliest one a later course depends on, else the earliest
 *   dependentPick: object|null,        the earliest pick a later course depends on (null when none does)
 *   blockers: Array, advice: Array,    the problems that are not picks, blockers first
 *   total: number,
 * }}
 */
export function summarizePlanCheck(issues = []) {
  const picks = issues.filter(isPick)
  const others = issues.filter(i => !isPick(i))
  const byTerm = (a, b) => (a.order ?? 0) - (b.order ?? 0)
  const dependentPicks = picks.filter(i => (i.dependents ?? []).length > 0).sort(byTerm)
  const earliestPick = [...picks].sort(byTerm)[0] ?? null
  return {
    picks,
    pickCount: picks.length,
    dependentPick: dependentPicks[0] ?? null,
    firstPick: dependentPicks[0] ?? earliestPick,
    blockers: others.filter(i => i.severity === 'blocker'),
    advice: others.filter(i => i.severity !== 'blocker'),
    total: issues.length,
  }
}

const plural = (n, one, many) => (n === 1 ? one : many)
const codes = list => {
  const shown = list.map(formatCourseCode)
  return shown.length <= 2 ? shown.join(' and ') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

/** "12 course picks still to make", and the sentence under it: where to start, or that nothing waits on them. Null when no pick is open. */
export function picksText(summary) {
  const n = summary.pickCount
  if (n === 0) return null
  const headline = `${n} course ${plural(n, 'pick', 'picks')} still to make`
  const dep = summary.dependentPick
  const detail = dep
    ? `Start with ${dep.label}: ${codes(dep.dependents)} ${plural(dep.dependents.length, 'depends', 'depend')} on it.`
    : `Nothing in your plan depends on ${plural(n, 'it', 'them')}.`
  return { headline, detail }
}

/**
 * The lines for real problems, blockers first: [{ tone: 'blocker' | 'advice', text, issue }]. One line per group, naming the first one
 * and how many more, so a long list does not shout.
 */
export function problemLines(summary) {
  const lines = []
  const line = (tone, list, lead) => {
    if (list.length === 0) return
    const more = list.length - 1
    lines.push({ tone, issue: list[0], text: `${lead(list.length)}: ${list[0].title}${more > 0 ? ` and ${more} more` : ''}` })
  }
  line('blocker', summary.blockers, n => `${n} ${plural(n, 'needs', 'need')} fixing`)
  line('advice', summary.advice, n => `${n} to look at`)
  return lines
}
