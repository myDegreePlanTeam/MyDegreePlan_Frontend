// degreeProjection.js
//
// The finish line for the Requirements tab: when the student could finish, what sets that pace, and where their own plan
// stands against it. Pure. It turns the audit's rows into tasks for lib/termScheduler.js (the schedule itself, and the rules it
// obeys, live there) and reads the result back as words for a student.
//
//   projectDegree({ audit, slots, courses, prereqMap, coreqMap, priorCredits, freeAddSlots, semesterTerms, semesterPhase, maxHours })
//     -> null                       when the plan has no term to start from
//     -> { complete, startTerm, maxHours, graduation, plan, termsSooner, chain, chainTerms, hoursRemaining, hoursTerms,
//          limit, optimal, incomplete, blocked, blocks, schedule }
//
//   graduation   { label, term, index } the earliest finish found (index 1 = startTerm), or null when nothing is left to take
//   plan         { label, term }        where the student's own plan ends now
//   termsSooner  how many terms sooner than the plan the schedule finishes (0 when it does not); termsLater, the reverse: the plan ends
//                before the rules allow
//   underway     the term the last in-progress course is in, for a student with nothing left to schedule
//   chain        the courses that set the pace, first to last: { key, code, label, name, index, termLabel, note }; two steps in one term go together
//   limit        'prerequisites' | 'hours' | 'map': which lower bound is larger, or 'map' when the department's degree map holds the chain up
//   optimal      the schedule meets its lower bound, so no arrangement is sooner; false means one might be
//   blocked      courses the rules cannot place at all (a prerequisite that is nowhere in the plan)
//   blocks       { [blockId]: { complete, planBy, fastestBy, notable } } per block of the audit
//
// What is done or in progress (including prior credit and added courses in past or current terms) is behind the student: it
// satisfies prerequisites and counts toward standing. What is planned or still a choice is rescheduled from the first term not yet
// begun. Terms are Fall and Spring only, so summers are not used.
//
// An engineering plan follows its department's degree map: the catalog records almost no prerequisites for those courses, so a
// course never starts before the map term the plan gives it (the same floor degreeBuilder applies).

import { scheduleTerms, nthTerm, DEFAULT_MAX_HOURS } from './termScheduler.js'
import { POOL_COURSES, REQUIREMENT_POOLS, POOL_FLOORS } from './poolResolver.js'
import { planRequiresCalculusII } from './mathPlacement.js'
import { advanceTerm, formatTermLabel, isSameTerm } from './semesterTerms.js'

// How many terms `term` is from `start` (start = 1), stepping Fall to Spring to Fall. A term before `start` is 1.
function termIndexFrom(start, term) {
  if (!term) return 1
  let t = start
  for (let i = 1; i <= 40; i++) {
    if (isSameTerm(t, term)) return i
    t = advanceTerm(t)
  }
  return 1
}

function firstTermToSchedule(semesterTerms, semesterPhase) {
  const sems = Object.keys(semesterTerms ?? {}).map(Number).sort((a, b) => a - b)
  if (!sems.length) return null
  const future = sems.find(n => semesterPhase?.[n] === 'future')
  const start = future != null ? semesterTerms[future] : advanceTerm(semesterTerms[sems[sems.length - 1]])
  return start.season === 'Summer' ? advanceTerm(start) : start
}

export function projectDegree({
  audit, slots = [], courses = {}, prereqMap = {}, coreqMap = {}, priorCredits = [], freeAddSlots = [],
  semesterTerms = {}, semesterPhase = {}, maxHours = DEFAULT_MAX_HOURS,
}) {
  const start = firstTermToSchedule(semesterTerms, semesterPhase)
  if (!start || !audit) return null

  const rows = audit.blocks.flatMap(b => b.rows)
  const slotById = new Map(slots.map(s => [s.id, s]))
  const followsMap = planRequiresCalculusII(slots)

  // Behind the student: done, in progress, and added courses in a past or current term
  const satisfied = new Set()
  for (const pc of priorCredits) if ((pc.credits_awarded ?? 0) > 0 && pc.satisfies_course_code) satisfied.add(pc.satisfies_course_code)
  for (const row of rows) if ((row.state === 'done' || row.state === 'in_progress') && row.code) satisfied.add(row.code)
  for (const fa of freeAddSlots) {
    const phase = semesterPhase[fa.semester_number]
    if (phase === 'past' || phase === 'current') satisfied.add(fa.course_code)
  }
  const creditsBefore = audit.summary.done + audit.summary.inProgress

  // Ahead of the student: every planned course and every open choice
  const rowOf = new Map()
  const tasks = []
  for (const row of rows) {
    if (row.state !== 'planned' && row.state !== 'not_placed') continue
    const slot = slotById.get(row.slotId)
    const openChoice = !row.code
    const mapTerm = followsMap && Number.isInteger(slot?.map_semester) ? semesterTerms[slot.map_semester] : null
    const id = String(row.key)
    rowOf.set(id, row)
    tasks.push({
      id,
      code: row.code ?? null,
      hours: row.hours,
      pool: openChoice
        ? { codes: POOL_COURSES[row.poolCode] ?? null, gates: REQUIREMENT_POOLS.has(row.poolCode) }
        : null,
      floor: mapTerm ? termIndexFrom(start, mapTerm) : 1,
      after: openChoice && POOL_FLOORS[row.poolCode] ? [POOL_FLOORS[row.poolCode]] : [],
    })
  }

  const result = scheduleTerms({
    tasks, startTerm: start, satisfied, creditsBefore, maxHours, ctx: { prereqMap, coreqMap, courseMap: courses, priorCredits },
  })

  const nameOf = code => courses[code]?.name ?? null
  const labelOf = row => row?.code ?? row?.poolLabel ?? row?.label ?? null
  const entry = id => {
    const row = rowOf.get(id)
    return {
      key: row?.key ?? id, code: row?.code ?? null, poolCode: row?.poolCode ?? null, semNum: row?.semNum ?? null,
      label: labelOf(row), name: row?.code ? nameOf(row.code) : null,
    }
  }

  // Where the student's own plan ends: the latest term holding anything not yet done
  const open = rows.filter(r => r.state !== 'done' && r.semNum != null)
  const lastSem = open.reduce((max, r) => Math.max(max, r.semNum), 0)
  const planTerm = lastSem ? semesterTerms[lastSem] : null

  const graduationTerm = result.termCount > 0 ? nthTerm(result.startTerm, result.termCount) : null
  const planIndex = planTerm ? termIndexFrom(result.startTerm, planTerm) : 0
  // Signed: how far the plan's end is from the schedule's. A plan that ends BEFORE the rules allow (a course ahead of its
  // prerequisite, too many hours in a term) is later by the difference; the Issues tab says which course.
  const termsSooner = graduationTerm && planTerm ? Math.max(0, planIndex - result.termCount) : 0
  const termsLater = graduationTerm && planTerm ? Math.max(0, result.termCount - planIndex) : 0
  const underway = rows.filter(r => r.state === 'in_progress' && r.term).map(r => r.term).pop() ?? null

  // Per block: when the plan completes it, and the soonest the schedule could
  const blocks = {}
  for (const block of audit.blocks) {
    const mine = block.rows.filter(r => r.state !== 'done')
    const sem = mine.filter(r => r.semNum != null).reduce((max, r) => Math.max(max, r.semNum), 0)
    const indexes = mine.map(r => result.termOf.get(String(r.key))).filter(Number.isInteger)
    const placedAll = mine.every(r => r.state === 'in_progress' || result.termOf.has(String(r.key)))
    const latest = indexes.length ? Math.max(...indexes) : 0
    const underway = mine.filter(r => r.state === 'in_progress').map(r => r.term).filter(Boolean)
    const planBy = sem ? formatTermLabel(semesterTerms[sem]) : null
    const fastestBy = !mine.length || !placedAll ? null : latest ? formatTermLabel(nthTerm(result.startTerm, latest)) : (underway[0] ?? null)
    blocks[block.id] = {
      complete: mine.length === 0,
      planBy,
      fastestBy,
      // worth a line on the block: it differs from the plan's own finish, or the schedule could do it sooner
      notable: !!planBy && (planBy !== formatTermLabel(planTerm) || (!!fastestBy && fastestBy !== planBy)),
    }
  }

  const complete = tasks.length === 0
  // 'map' when the chain is held up by the department's degree map (engineering), else whichever bound is larger
  const limit = result.chain.some(step => step.waitsFor === 'map') && result.lowerBound.prerequisites >= result.lowerBound.hours
    ? 'map'
    : result.lowerBound.prerequisites >= result.lowerBound.hours ? 'prerequisites' : 'hours'

  return {
    complete,
    startTerm: result.startTerm,
    maxHours,
    graduation: graduationTerm ? { label: formatTermLabel(graduationTerm), term: graduationTerm, index: result.termCount } : null,
    plan: planTerm ? { label: formatTermLabel(planTerm), term: planTerm, index: planIndex } : null,
    termsSooner,
    termsLater,
    underway,
    chain: result.chain.map(step => ({ ...entry(step.id), index: step.index, termLabel: step.label, note: step.note })),
    chainTerms: result.lowerBound.prerequisites,
    hoursRemaining: tasks.reduce((sum, t) => sum + t.hours, 0),
    hoursTerms: result.lowerBound.hours,
    limit,
    optimal: result.optimal,
    incomplete: result.blocked.length > 0,
    blocked: result.blocked.map(b => ({ ...entry(b.id), missing: b.missing, reason: b.reason })),
    blocks,
    schedule: result.terms.map(t => ({
      index: t.index, term: t.term, termLabel: t.label, hours: t.hours,
      items: t.tasks.map(task => ({ ...entry(task.id), hours: task.hours })),
    })),
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The finish line in words, for the Requirements tab and the printed audit alike.
 * @returns {null | { complete, lead, graduationLabel, detail, pace, chain, blocked, fine }}
 *   lead + graduationLabel   "Earliest finish: " and the term (graduationLabel is null when there is none to show)
 *   detail   hours to go, the plan's own end beside it, and a note when a different arrangement might be sooner
 *   pace     { label, text } what sets the pace (null with no schedule)
 *   chain    the steps, [{ key, code, label, name, termLabel, note }]
 *   blocked  [{ key, code, label, text }] courses no rule can place
 */
export function describeFinish(p) {
  if (!p) return null
  const none = { chain: [], blocked: [], fine: null, pace: null, detail: null, graduationLabel: null }
  if (p.complete) {
    return { ...none, complete: true, lead: p.underway ? `You finish at the end of ${p.underway}` : 'Every requirement is done' }
  }

  const { graduation, plan, termsSooner, termsLater, hoursRemaining, hoursTerms, maxHours, chainTerms, limit, optimal, blocked } = p
  const compare = termsSooner > 0
    ? `Your plan finishes ${plan.label}. This schedule is ${plural(termsSooner, 'term')} sooner.`
    : termsLater > 0
      ? `Your plan finishes ${plan?.label}, ${plural(termsLater, 'term')} before these rules allow. The Issues tab shows which courses are out of order.`
      : plan ? `Your plan finishes ${plan.label} too: it is already as fast as these rules allow.` : null
  const detail = `${hoursRemaining} hours to go, at up to ${maxHours} hours a term in Fall and Spring.`
    + (compare ? ` ${compare}` : '')
    + (!optimal && !blocked.length && graduation ? ' This is the fastest arrangement found; a different one might save a term.' : '')

  const pace = graduation
    ? {
        label: limit === 'map' ? "the department's degree map" : limit === 'prerequisites' ? 'prerequisites' : 'hours',
        text: limit === 'map'
          ? `The department schedules these courses no earlier than the terms below, ${plural(chainTerms, 'term')} from now.`
          : limit === 'prerequisites'
            ? `These courses must come in order, ${plural(chainTerms, 'term')} in all.`
            : `${hoursRemaining} hours at ${maxHours} a term is ${plural(hoursTerms, 'term')}; the prerequisites alone would take ${plural(chainTerms, 'term')}.`,
      }
    : null

  return {
    complete: false,
    lead: graduation ? 'Earliest finish: ' : 'No finish can be worked out yet',
    graduationLabel: graduation?.label ?? null,
    detail,
    pace,
    chain: graduation ? p.chain : [],
    blocked: blocked.map(b => ({
      key: b.key, code: b.code, label: b.label,
      text: b.missing.length ? `needs ${b.missing.join(', ')}, which is not in your plan` : 'no term works for it',
    })),
    fine: 'An estimate: it follows the prerequisites, corequisites, offering seasons and standing rules your plan is checked against, and does not see seats or the schedule of classes. Summers are not used.',
  }
}

/** The line under a block's title when its dates are worth saying (they differ from the plan's own finish), else null. */
export function describeBlockDates(dates) {
  if (!dates?.notable || dates.complete) return null
  return `Your plan completes this by ${dates.planBy}${dates.fastestBy && dates.fastestBy !== dates.planBy ? `; the soonest it could be done is ${dates.fastestBy}` : ''}.`
}
