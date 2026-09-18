// planIssues.js
// Flattens the plan's warning maps into one ordered list for the Issues tab
// and the per-semester "⚠ n" flags. Pure — every input is already computed
// by DegreePlan; this only decides severity, wording, and order.
//
// Severity:
//   blocker — prerequisite / corequisite unmet (the move would be rejected
//             by the drag conflict check; registration would be refused)
//   warning — science sequence problems, under- or over-loaded terms
//   info    — junior/senior standing not yet reached

import { formatMissingForDisplay } from './poolResolver'

export const FULL_TIME_MIN = 12
export const HEAVY_LOAD_MAX = 18

const STANDING_CREDITS = { junior: 60, senior: 90 }
const SEVERITY_ORDER   = { blocker: 0, warning: 1, info: 2 }

// semesters: [{ semNum, label, credits, completed, items: [{ key, code }] }]
//   in display order. `key` is the warning-map key (slot id or `fa_<id>`).
export function buildPlanIssues({
  semesters,
  prereqWarnings   = {},
  coreqWarnings    = {},
  standingWarnings = {},
  scienceWarnings  = {},
}) {
  const issues = []

  semesters.forEach((sem, order) => {
    const where = sem.label
    const push  = issue => issues.push({ semNum: sem.semNum, order, where, ...issue })

    for (const item of sem.items) {
      const prereq = prereqWarnings[item.key]
      if (prereq?.length > 0) {
        push({
          id: `prereq:${item.key}`, key: item.key, severity: 'blocker',
          title: `${item.code} prerequisite unmet`,
          body:  `${item.code} needs ${formatMissingForDisplay(prereq)} completed in an earlier term.`,
        })
      }

      const coreq = coreqWarnings[item.key]
      if (coreq?.length > 0) {
        push({
          id: `coreq:${item.key}`, key: item.key, severity: 'blocker',
          title: `${item.code} corequisite unmet`,
          body:  `${item.code} needs ${formatMissingForDisplay(coreq)} in the same term or earlier.`,
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
            ? `${item.code} is half of a two-course sequence. Choose its partner course in another science slot.`
            : `${item.code} does not pair with the science course chosen in your other science slot.`,
        })
      }

      const standing = standingWarnings[item.key]
      if (standing) {
        const label = standing === 'senior' ? 'Senior' : 'Junior'
        push({
          id: `standing:${item.key}`, key: item.key, severity: 'info',
          title: `${label} standing required`,
          where: `${item.code} · ${sem.label}`,
          body:  `${item.code} requires ${STANDING_CREDITS[standing] ?? ''}+ credits before the term begins. `
            + 'Your plan does not reach that total by then.',
        })
      }
    }

    if (!sem.completed && sem.items.length > 0) {
      if (sem.credits < FULL_TIME_MIN) {
        push({
          id: `load-low:${sem.semNum}`, severity: 'warning',
          title: 'Below full-time enrollment',
          body:  `This term carries ${sem.credits} credits. Full-time status and most scholarships require ${FULL_TIME_MIN} or more.`,
        })
      } else if (sem.credits > HEAVY_LOAD_MAX) {
        push({
          id: `load-high:${sem.semNum}`, severity: 'warning',
          title: 'Heavy course load',
          body:  `This term carries ${sem.credits} credits. Loads above ${HEAVY_LOAD_MAX} usually need advisor approval.`,
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
