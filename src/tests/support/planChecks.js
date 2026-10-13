// The plan view's own prerequisite and corequisite checks (DegreePlan.jsx prereqWarnings / coreqWarnings) on a student who has just built a
// plan from the real catalog, so a test can say "this program opens with nothing out of order".
//
// planBlockers('biol_bibi', 29) -> ['BIOL3810@3 needs BIOL1113', ...]   [] when nothing is unmet

import { freshStudent, courses, prereqMap, coreqMap } from './realStudent.js'
import { checkPrereqs, checkCoreqsProvisional } from '../../lib/prereqChecker.js'
import { POOL_COURSES, isProvidingPool } from '../../lib/poolResolver.js'

export function planBlockers(code, act) {
  const s = freshStudent(code, act)
  const placed = []
  const pending = []
  for (const slot of s.slots) {
    const sem = s.assignments[slot.id]
    if (sem == null) continue
    if (!slot.is_pool) placed.push({ code: slot.class_code, sem })
    else if (isProvidingPool(slot.class_code)) pending.push({ key: slot.id, sem, codes: POOL_COURSES[slot.class_code] ?? [] })
  }
  const priorCodes = s.priorCredits.filter(pc => pc.satisfies_course_code).map(pc => pc.satisfies_course_code)
  const out = []
  for (const item of placed) {
    const done = new Set(placed.filter(p => p.sem < item.sem).map(p => p.code))
    const prereq = checkPrereqs(item.code, prereqMap, done, s.priorCredits, courses, coreqMap, pending.filter(p => p.sem < item.sem))
    if (!prereq.satisfied) out.push(`${item.code}@${item.sem} needs ${prereq.missing.join(', ')}`)
    const available = new Set([...done, ...priorCodes, ...placed.filter(p => p.sem === item.sem && p.code !== item.code).map(p => p.code)])
    const coreq = checkCoreqsProvisional(item.code, coreqMap, available, pending.filter(p => p.sem <= item.sem))
    if (!coreq.satisfied) out.push(`${item.code}@${item.sem} needs ${coreq.missing.join(', ')} in the same term or earlier`)
  }
  return out
}
