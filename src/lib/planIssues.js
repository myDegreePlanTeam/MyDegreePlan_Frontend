// planIssues.js
// Flattens the plan's warning maps into one ordered list for the Plan check list
// and the per-semester "⚠ n" flags. Pure — every input is already computed
// by DegreePlan; this only decides severity, wording, and order.
//
// Severity:
//   blocker — prerequisite / corequisite unmet (the move would be rejected
//             by the drag conflict check; registration would be refused)
//   warning — science sequence problems, under- or over-loaded terms, and a
//             pool slot left empty that another course's prerequisite leans on
//   info    — junior/senior standing not yet reached, and any other pool slot
//             the student hasn't chosen a course for yet (an open pick)
//
// Wording (plans/PLAN_redesign.md, "Wording"): "semester", "pick", "hours", course codes with a space, and each
// message says what is wrong, why, and what to do next. Never "slot", "credits" or "term" in a title or a body.

import { formatMissingForDisplay } from './poolResolver'
import { formatCourseCode, spaceCourseCodes } from './courseCodeFormat'

export const FULL_TIME_MIN = 12
// The undergraduate catalog ("Student Course Load"): the maximum load for a student in good standing is
// 20 hours; more needs the major department chair's and the dean's approval. (Probation caps it at 16, not tracked here.)
export const HEAVY_LOAD_MAX = 20

const STANDING_CREDITS = { junior: 60, senior: 90 }
const SEVERITY_ORDER   = { blocker: 0, warning: 1, info: 2 }

const hoursText = n => `${n} ${n === 1 ? 'hour' : 'hours'}`
const needsText = missing => spaceCourseCodes(formatMissingForDisplay(missing))
const codeList  = list => {
  const shown = list.map(formatCourseCode)
  return shown.length <= 2 ? shown.join(' and ') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
}

// semesters: [{ semNum, label, credits, completed, items: [{ key, code }] }]
//   in display order. `key` is the warning-map key (slot id or `fa_<id>`).
// incompleteSlots: { [slotKey]: { label, dependents: [courseCode, ...] } } —
//   pool slots with no course chosen yet. `dependents` are courses whose
//   prerequisites are provisionally met by that slot.
export function buildPlanIssues({
  semesters,
  incompleteSlots  = {},
  prereqWarnings   = {},
  coreqWarnings    = {},
  standingWarnings = {},
  scienceWarnings  = {},
  poolLimitWarnings = {},
}) {
  const issues = []

  semesters.forEach((sem, order) => {
    const where = sem.label
    const push  = issue => issues.push({ semNum: sem.semNum, order, where, ...issue })

    for (const item of sem.items) {
      const code = formatCourseCode(item.code)   // a pick's `code` is its label ("Humanities"), which this leaves alone
      const prereq = prereqWarnings[item.key]
      if (prereq?.length > 0) {
        push({
          id: `prereq:${item.key}`, key: item.key, severity: 'blocker',
          title: `${code} is missing a prerequisite`,
          body:  `${code} needs ${needsText(prereq)} in an earlier semester. Move ${code} to a later semester, or take what it needs sooner.`,
        })
      }

      const coreq = coreqWarnings[item.key]
      if (coreq?.length > 0) {
        push({
          id: `coreq:${item.key}`, key: item.key, severity: 'blocker',
          title: `${code} is missing a corequisite`,
          body:  `${code} needs ${needsText(coreq)} in the same semester or an earlier one. Move one of them so they line up.`,
        })
      }

      const incomplete = incompleteSlots[item.key]
      if (incomplete) {
        const dependents = incomplete.dependents ?? []
        push({
          id: `incomplete:${item.key}`, key: item.key,
          // `kind`, `label` and `dependents` are for lib/planCheck.js, which groups the picks still to make
          kind: 'pick', label: incomplete.label, dependents,
          severity: dependents.length > 0 ? 'warning' : 'info',
          title: `Pick a course for ${incomplete.label}`,
          body:  [
            sem.completed ? 'This semester is over, so pick the course you took.' : null,
            dependents.length > 0
              ? `${codeList(dependents)} ${dependents.length === 1 ? 'depends' : 'depend'} on this pick to meet ${dependents.length === 1 ? 'its' : 'their'} prerequisite, so make it first.`
              : (sem.completed ? null : 'Nothing else in your plan depends on this pick.'),
          ].filter(Boolean).join(' '),
        })
      }

      const science = scienceWarnings[item.key]
      if (science) {
        push({
          id: `science:${item.key}`, key: item.key, severity: 'warning',
          title: science.type === 'incomplete'
            ? `Complete your ${science.sequenceName} sequence`
            : 'Science sequence conflict',
          body: science.type === 'incomplete'
            ? `${code} is half of a two-course sequence. Pick its partner as your other science course.`
            : `${code} does not pair with your other science course. Pick two courses from the same sequence.`,
        })
      }

      for (const limit of poolLimitWarnings[item.key] ?? []) {
        push({
          id: `pool-limit:${item.key}:${limit.label}`, key: item.key, severity: 'warning',
          title: `Too many hours of ${limit.label.toLowerCase()}`,
          where: `${code} · ${sem.label}`,
          body:  `${hoursText(limit.hours)} are chosen and at most ${limit.maxHours} count. ${limit.why} Pick a different course for one of them.`,
        })
      }

      const standing = standingWarnings[item.key]
      if (standing) {
        const label = standing === 'senior' ? 'Senior' : 'Junior'
        push({
          id: `standing:${item.key}`, key: item.key, severity: 'info',
          title: `${code} needs ${label.toLowerCase()} standing`,
          where: `${code} · ${sem.label}`,
          body:  `${code} needs ${STANDING_CREDITS[standing] ?? ''} hours earned before the semester starts, and your plan has fewer by then. `
            + `Move ${code} to a later semester, or move other courses earlier.`,
        })
      }
    }

    if (!sem.completed && sem.items.length > 0) {
      if (sem.credits < FULL_TIME_MIN) {
        push({
          id: `load-low:${sem.semNum}`, severity: 'warning',
          title: 'Below full-time enrollment',
          body:  `This semester has ${hoursText(sem.credits)}. Full-time status and most scholarships need ${FULL_TIME_MIN} or more, so add a course or move one here.`,
        })
      } else if (sem.credits > HEAVY_LOAD_MAX) {
        push({
          id: `load-high:${sem.semNum}`, severity: 'warning',
          title: 'Heavy course load',
          body:  `This semester has ${hoursText(sem.credits)}. More than ${HEAVY_LOAD_MAX} needs approval from your department chair and your dean, so move a course to another semester or ask for the approval.`,
        })
      }
    }
  })

  return issues.sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.order - b.order
  )
}

// { [semNum]: count } for the semester card flags.
export function countIssuesBySemester(issues) {
  const counts = {}
  for (const issue of issues) counts[issue.semNum] = (counts[issue.semNum] ?? 0) + 1
  return counts
}
