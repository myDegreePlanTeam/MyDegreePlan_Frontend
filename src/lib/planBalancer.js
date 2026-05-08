import { SCIENCE_SEQUENCES } from './poolResolver.js'
import { checkPrereqs, checkCoreqs } from './prereqChecker.js'

// Ordered lowest-to-highest placement level. The balancer uses this to determine
// whether a student is cleared to take a given math course in an earlier semester.
// act_placement entries in priorCredits set satisfies_course_code to one of these.
const MATH_SEQUENCE = [
  'MATH1000',  // ACT ≤18 — lowest gate
  'MATH1710',  // ACT 19-24
  'MATH1720',  // MATH1710 with C+ path
  'MATH1730',  // ACT 25-26 (combined 1710+1720)
  'MATH1904',  // ACT 27-28
  'MATH1910',  // ACT 29+ — cleared for Calculus I
  'MATH1920',  // Calculus II (old sequence only)
  'MATH2010',  // Linear Algebra
  'MATH3070',  // Statistics option A
  'MATH3470',  // Statistics option B
]

// Returns the index into MATH_SEQUENCE that the student is cleared to START at,
// based on their act_placement prior credits. Returns -1 if no math placement
// entry is found (student has no recorded placement — do not move any math slot).
function getMathPlacementLevel(priorCredits) {
  const placements = (priorCredits ?? []).filter(pc => pc.credit_type === 'act_placement')
  let highestIndex = -1
  for (const pc of placements) {
    const idx = MATH_SEQUENCE.indexOf(pc.satisfies_course_code)
    if (idx > highestIndex) highestIndex = idx
  }
  return highestIndex
}

/**
 * balancePlan({ slots, planSlots, planSemesterOverrides, planArchived,
 *               priorCredits, courses, prereqMap, coreqMap })
 *
 * Returns { [slotId]: newSemesterNumber } — only slots whose semester changes.
 * Pure function: no side effects, no Supabase calls.
 *
 * Two-pass algorithm:
 *   Pass 1: fill semesters below 12 credits by pulling from the adjacent next semester.
 *   Pass 2: fill semesters below 15 credits, pulling from the adjacent next semester.
 *
 * Each move respects prereqs, coreqs, science sequence pair integrity, and the
 * ACT/SAT math placement chain defined by MATH_SEQUENCE above.
 */
export function balancePlan({
  slots,
  planSlots,
  planSemesterOverrides,
  planArchived,
  priorCredits,
  courses,
  prereqMap,
  coreqMap,
}) {
  // ── Build slot index ────────────────────────────────────────────────
  const slotById = new Map()
  for (const slot of slots) slotById.set(slot.id, slot)

  // Returns the effective course code for a slot (null for unfilled pool slots).
  function courseCodeOf(slot) {
    return slot.is_pool ? (planSlots[slot.id] ?? null) : slot.class_code
  }

  // ── Build assignments: Map<slotId, semNum> ──────────────────────────
  // Only non-archived, non-empty requirement slots.
  const assignments = new Map()
  for (const slot of slots) {
    if (planArchived[slot.id]) continue
    if (!courseCodeOf(slot)) continue  // unfilled pool slot — skip
    const semNum = planSemesterOverrides[slot.id] ?? slot.semester_number
    assignments.set(slot.id, semNum)
  }

  // ── Build semCredits and semCourses ─────────────────────────────────
  const semCredits = new Map()  // semNum → total credits
  const semCourses = new Map()  // semNum → Set<courseCode>
  for (const [slotId, semNum] of assignments) {
    const slot   = slotById.get(slotId)
    const code   = courseCodeOf(slot)
    const credits = courses[code]?.credits ?? 0
    semCredits.set(semNum, (semCredits.get(semNum) ?? 0) + credits)
    if (!semCourses.has(semNum)) semCourses.set(semNum, new Set())
    semCourses.get(semNum).add(code)
  }

  // ── Build allCodes: cumulative codes in sems ≤ N ────────────────────
  // allCodes[N] = Set of every course code present in semesters 1..N.
  const semNums  = [...new Set([...assignments.values()])].sort((a, b) => a - b)
  const allCodes = new Map()
  let cumulative = new Set()
  for (const n of semNums) {
    for (const c of (semCourses.get(n) ?? [])) cumulative.add(c)
    allCodes.set(n, new Set(cumulative))
  }

  const mathLevel = getMathPlacementLevel(priorCredits)

  // Returns all course codes in semesters strictly before semNum.
  function getCumulativeBefore(semNum) {
    let bestKey = null
    for (const k of allCodes.keys()) {
      if (k < semNum && (bestKey === null || k > bestKey)) bestKey = k
    }
    return bestKey !== null ? allCodes.get(bestKey) : new Set()
  }

  // ── Pass runner ─────────────────────────────────────────────────────
  function runPass(targetCredits) {
    const moved = new Set()  // slot ids already moved in this pass — don't revisit
    const sortedSems = [...new Set([...assignments.values()])].sort((a, b) => a - b)

    for (const semNum of sortedSems) {
      if ((semCredits.get(semNum) ?? 0) >= targetCredits) continue

      const nextSem = semNum + 1

      // Keep pulling from nextSem until semNum reaches target or no eligible candidate.
      let keepPulling = true
      while (keepPulling && (semCredits.get(semNum) ?? 0) < targetCredits) {
        keepPulling = false

        // Rebuild candidate list each iteration (assignments may have changed).
        const candidates = []
        for (const [sid, s] of assignments) {
          if (s !== nextSem || moved.has(sid)) continue
          candidates.push(slotById.get(sid))
        }
        if (candidates.length === 0) break

        const priorSatisfied  = getCumulativeBefore(semNum)
        const currentAvailable = allCodes.get(semNum) ?? new Set()

        for (const slot of candidates) {
          if (moved.has(slot.id)) continue
          if ((semCredits.get(semNum) ?? 0) >= targetCredits) break

          const code = courseCodeOf(slot)
          if (!code) continue

          // ── Check 2: Math placement gate ──────────────────────────
          const mathIdx = MATH_SEQUENCE.indexOf(code)
          if (mathIdx !== -1) {
            // This course is in the math chain.
            if (mathLevel === -1) continue  // no placement recorded — skip all math chain courses
            if (mathIdx > mathLevel) continue  // student not cleared for this level
          }

          // ── Check 3: Prereqs (strictly prior semesters) ───────────
          const prereqResult = checkPrereqs(code, prereqMap, priorSatisfied, priorCredits, courses)
          if (!prereqResult.satisfied) continue

          // ── Check 4: Coreqs (same semester + prior) ───────────────
          const coreqResult = checkCoreqs(code, coreqMap, currentAvailable)
          if (!coreqResult.satisfied) continue

          // ── Check 5: Science pair integrity ───────────────────────
          // A pair = two slots both in nextSem whose codes appear together
          // in a SCIENCE_SEQUENCES entry.  Both move or neither moves.
          let pairSlot = null
          for (const seq of SCIENCE_SEQUENCES) {
            if (!seq.courses.includes(code)) continue
            const partnerCode = seq.courses.find(c => c !== code)
            for (const [pid, ps] of assignments) {
              if (ps !== nextSem || moved.has(pid)) continue
              if (courseCodeOf(slotById.get(pid)) === partnerCode) {
                pairSlot = slotById.get(pid)
                break
              }
            }
            if (pairSlot) break
          }

          if (pairSlot) {
            // This slot is part of a pair — verify the partner is also eligible.
            const partnerCode = courseCodeOf(pairSlot)

            // Partner math gate
            const pMathIdx = MATH_SEQUENCE.indexOf(partnerCode)
            if (pMathIdx !== -1 && (mathLevel === -1 || pMathIdx > mathLevel)) continue

            // Partner prereqs
            const pPrereq = checkPrereqs(partnerCode, prereqMap, priorSatisfied, priorCredits, courses)
            if (!pPrereq.satisfied) continue

            // Partner coreqs
            const pCoreq = checkCoreqs(partnerCode, coreqMap, currentAvailable)
            if (!pCoreq.satisfied) continue

            // Both eligible — move the pair together.
            for (const ps of [slot, pairSlot]) {
              const c  = courseCodeOf(ps)
              const cr = courses[c]?.credits ?? 0
              assignments.set(ps.id, semNum)
              semCredits.set(nextSem, (semCredits.get(nextSem) ?? 0) - cr)
              semCredits.set(semNum,  (semCredits.get(semNum)  ?? 0) + cr)
              semCourses.get(nextSem)?.delete(c)
              if (!semCourses.has(semNum)) semCourses.set(semNum, new Set())
              semCourses.get(semNum).add(c)
              if (!allCodes.has(semNum)) allCodes.set(semNum, new Set())
              allCodes.get(semNum).add(c)
              moved.add(ps.id)
            }
            keepPulling = true
            break
          }

          // ── Non-paired move ────────────────────────────────────────
          const cr = courses[code]?.credits ?? 0
          assignments.set(slot.id, semNum)
          semCredits.set(nextSem, (semCredits.get(nextSem) ?? 0) - cr)
          semCredits.set(semNum,  (semCredits.get(semNum)  ?? 0) + cr)
          semCourses.get(nextSem)?.delete(code)
          if (!semCourses.has(semNum)) semCourses.set(semNum, new Set())
          semCourses.get(semNum).add(code)
          if (!allCodes.has(semNum)) allCodes.set(semNum, new Set())
          allCodes.get(semNum).add(code)
          moved.add(slot.id)
          keepPulling = true
          break
        }
      }
    }
  }

  runPass(12)
  runPass(15)

  // ── Return only slots whose semester changed ────────────────────────
  const result = {}
  for (const [slotId, newSem] of assignments) {
    const slot     = slotById.get(slotId)
    const original = planSemesterOverrides[slotId] ?? slot.semester_number
    if (newSem !== original) result[slotId] = newSem
  }
  return result
}
