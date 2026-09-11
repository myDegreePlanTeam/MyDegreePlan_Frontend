import { describe, it, expect } from 'vitest'
import { buildDegreePlan } from '../lib/degreeBuilder'

// ── Fixture: CSC Core concentration, from the live catalog (2026-09-11) ─────
// Flat template (no semester hints) exactly as seeded, including every
// math-chain course; the algorithm archives the ones a student doesn't need.

const CORE_SLOTS = [
  'ENGL1010', 'ENGL1020', 'MATH1000', 'MATH1710', 'MATH1720', 'MATH1730',
  'MATH1904', 'MATH1906', 'MATH1910', 'MATH1920', 'MATH2010', 'CSC1020',
  'CSC1300', 'CSC1310', 'CSC2310', 'CSC2510', 'CSC2400', 'CSC2700',
  'CSC3300', 'CSC3410', 'CSC3710', 'CSC3040', 'CSC4320', 'CSC4100',
  'CSC4610', 'CSC4200', 'CSC4615', 'ENG_LIT', 'COMM_REQ', 'MATH_STATS',
  'GEN_ED', 'GEN_ED', 'GEN_ED', 'GEN_ED', 'GEN_ED', 'SCIENCE',
  'SCIENCE', 'CSC_LOWER_ELECTIVE', 'CSC_LOWER_ELECTIVE', 'CSC_UPPER_ELECTIVE', 'CSC_UPPER_ELECTIVE', 'CSC_UPPER_ELECTIVE',
  ['FREE_ELECTIVE', 5],
]

const COURSES = {
  CSC1020: { credits: 1 }, CSC1300: { credits: 4 },
  CSC1310: { credits: 4 }, CSC2310: { credits: 4 },
  CSC2400: { credits: 3 }, CSC2510: { credits: 3 },
  CSC2700: { credits: 3 }, CSC3040: { credits: 3, standing_req: 'junior' },
  CSC3300: { credits: 3 }, CSC3410: { credits: 3 },
  CSC3710: { credits: 3 }, CSC4100: { credits: 3 },
  CSC4200: { credits: 3 }, CSC4320: { credits: 3 },
  CSC4610: { credits: 3, standing_req: 'senior' }, CSC4615: { credits: 2 },
  ENGL1010: { credits: 3 }, ENGL1020: { credits: 3 },
  MATH1000: { credits: 3 }, MATH1710: { credits: 3 },
  MATH1720: { credits: 3 }, MATH1730: { credits: 5 },
  MATH1904: { credits: 3 }, MATH1906: { credits: 3 },
  MATH1910: { credits: 4 }, MATH1920: { credits: 4 },
  MATH2010: { credits: 3 },
}

const PREREQS = {
  CSC1300: { 0: { logic: 'OR', codes: ['CSC1200', 'MATH1845', 'MATH1910'] } },
  CSC1310: { 0: { logic: 'AND', codes: ['CSC1300'] }, 1: { logic: 'AND', codes: ['MATH1910'] } },
  CSC2310: { 0: { logic: 'AND', codes: ['CSC1310'] } },
  CSC2400: { 0: { logic: 'AND', codes: ['CSC1310'] } },
  CSC2510: { 0: { logic: 'AND', codes: ['CSC1310'] } },
  CSC2700: { 0: { logic: 'AND', codes: ['MATH1910'] } },
  CSC3040: { 0: { logic: 'OR', codes: ['COMM2025', 'PC2500'] }, 1: { logic: 'AND', codes: ['CSC1310'] } },
  CSC3300: { 0: { logic: 'AND', codes: ['CSC1310'] }, 1: { logic: 'OR', codes: ['CSC2700', 'ECE2140', 'MATH2610', 'MATH3400'] } },
  CSC3410: { 0: { logic: 'AND', codes: ['CSC1310'] } },
  CSC3710: { 0: { logic: 'AND', codes: ['CSC2700'] }, 1: { logic: 'AND', codes: ['CSC1310'] } },
  CSC4100: { 0: { logic: 'AND', codes: ['CSC1310'] }, 1: { logic: 'OR', codes: ['CSC3410', 'ECE3130'] } },
  CSC4200: { 0: { logic: 'AND', codes: ['CSC2400'] } },
  CSC4320: { 0: { logic: 'OR', codes: ['CSC3410', 'ECE3130'] } },
  CSC4610: { 0: { logic: 'AND', codes: ['CSC2310'] }, 1: { logic: 'AND', codes: ['CSC2400'] }, 2: { logic: 'AND', codes: ['CSC2510'] }, 3: { logic: 'AND', codes: ['CSC3040'] }, 4: { logic: 'AND', codes: ['CSC3300'] } },
  CSC4615: { 0: { logic: 'AND', codes: ['CSC4610'] } },
  ENGL1020: { 0: { logic: 'AND', codes: ['ENGL1010'] } },
  MATH1710: { 0: { logic: 'AND', codes: ['MATH1000'] } },
  MATH1720: { 0: { logic: 'AND', codes: ['MATH1710'] } },
  MATH1904: { 0: { logic: 'OR', codes: ['MATH1730', 'MATH1720'] } },
  MATH1906: { 0: { logic: 'AND', codes: ['MATH1904'] } },
  MATH1910: { 0: { logic: 'OR', codes: ['MATH1730', 'MATH1720'] } },
  MATH1920: { 0: { logic: 'AND', codes: ['MATH1910'] } },
  MATH2010: { 0: { logic: 'AND', codes: ['MATH1910'] } },
}

const COREQS = {
  CSC1300: { 0: { logic: 'OR', codes: ['MATH1845', 'MATH1910'] } },
  CSC1310: { 0: { logic: 'AND', codes: ['MATH1910'] } },
}

// Mirrors POOL_CREDIT_ESTIMATES in degreeBuilder.js (credits for unfilled pools).
const POOL_ESTIMATES = { SCIENCE: 4 }
const POOL_CODES = new Set(['GEN_ED', 'ENG_LIT', 'SCIENCE', 'COMM_REQ', 'MATH_STATS',
  'CSC_LOWER_ELECTIVE', 'CSC_UPPER_ELECTIVE', 'FREE_ELECTIVE'])

function makeSlots(entries) {
  return entries.map((entry, i) => {
    const [class_code, flex_credits = null] = Array.isArray(entry) ? entry : [entry]
    return { id: i + 1, class_code, is_pool: POOL_CODES.has(class_code), flex_credits }
  })
}

function credits(slot, courses) {
  if (slot.flex_credits) return slot.flex_credits
  if (slot.is_pool) return POOL_ESTIMATES[slot.class_code] ?? 3
  return courses[slot.class_code]?.credits ?? 3
}

// Runs the algorithm and derives what the tests assert on.
function plan(profile = {}, { priorCredits = [], slotEntries = CORE_SLOTS,
  courses = COURSES, prereqs = PREREQS, coreqs = COREQS } = {}) {
  const slots = makeSlots(slotEntries)
  const { assignments, archived } = buildDegreePlan({
    slots, courseMap: courses, prereqMap: prereqs, coreqMap: coreqs, priorCredits,
    studentProfile: { student_type: 'incoming_freshman', act_math: 29, start_season: 'Fall', ...profile },
  })
  const active = slots.filter(s => !archived[s.id])
  const loads  = {}
  for (const s of active) loads[assignments[s.id]] = (loads[assignments[s.id]] ?? 0) + credits(s, courses)
  const semOf = code => assignments[active.find(s => s.class_code === code)?.id]
  const priorHours = priorCredits.reduce((sum, pc) => sum + (pc.credits_awarded ?? 0), 0)
  const creditsBefore = sem => priorHours + Object.entries(loads)
    .filter(([s]) => Number(s) < sem).reduce((sum, [, c]) => sum + c, 0)
  const maxSem = Math.max(...Object.keys(loads).map(Number))
  return { slots, assignments, archived, active, loads, semOf, creditsBefore, maxSem }
}

// ── Placement completeness and plan length ───────────────────────────────────

describe('buildDegreePlan — placement', () => {
  it('assigns a semester to every non-archived slot', () => {
    const { active, assignments } = plan()
    for (const s of active) expect(assignments[s.id], s.class_code).toBeGreaterThanOrEqual(1)
  })

  it('fits a standard freshman plan in 8 semesters', () => {
    expect(plan().maxSem).toBeLessThanOrEqual(8)
  })

  it('leaves no empty semester inside the plan', () => {
    const { loads, maxSem } = plan()
    for (let s = 1; s <= maxSem; s++) expect(loads[s], `semester ${s}`).toBeGreaterThan(0)
  })

  it('never exceeds 18 credits in a semester', () => {
    for (const act_math of [15, 20, 25, 29]) {
      const { loads } = plan({ act_math })
      for (const [sem, load] of Object.entries(loads)) {
        expect(load, `ACT ${act_math}, semester ${sem}`).toBeLessThanOrEqual(18)
      }
    }
  })

  it('caps a Summer first semester at 9 credits', () => {
    expect(plan({ start_season: 'Summer' }).loads[1]).toBeLessThanOrEqual(9)
  })
})

// ── Standing requirements (regression: courses pushed to semester 91+) ──────

describe('buildDegreePlan — standing requirements', () => {
  it('keeps junior/senior courses inside an 8-semester plan', () => {
    const { semOf } = plan()
    expect(semOf('CSC3040')).toBeLessThanOrEqual(8)
    expect(semOf('CSC4610')).toBeLessThanOrEqual(8)
  })

  it('gives CSC3040 (junior) at least 60 hours before its semester', () => {
    const { semOf, creditsBefore } = plan()
    expect(creditsBefore(semOf('CSC3040'))).toBeGreaterThanOrEqual(60)
  })

  it('gives CSC4610 (senior) at least 90 hours before its semester', () => {
    const { semOf, creditsBefore } = plan()
    expect(creditsBefore(semOf('CSC4610'))).toBeGreaterThanOrEqual(90)
  })

  it('counts prior-credit hours toward standing', () => {
    const transfer = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`, credit_type: 'transfer_credit', satisfies_course_code: `XFER${i}`, credits_awarded: 3,
    }))
    const withPrior = plan({ student_type: 'transfer' }, { priorCredits: transfer })
    expect(withPrior.semOf('CSC3040')).toBeLessThan(plan().semOf('CSC3040'))
    expect(withPrior.creditsBefore(withPrior.semOf('CSC3040'))).toBeGreaterThanOrEqual(60)
  })

  it('does not run away when a threshold is unreachable', () => {
    // 7 credits total — junior standing can never be met.
    const { semOf } = plan({}, { slotEntries: ['CSC1300', 'CSC1310', 'CSC3040'] })
    expect(semOf('CSC3040')).toBeLessThanOrEqual(20)
  })
})

// ── Ordering ─────────────────────────────────────────────────────────────────

describe('buildDegreePlan — ordering', () => {
  it('places prerequisites in strictly earlier semesters', () => {
    const { semOf } = plan()
    expect(semOf('CSC1300')).toBeLessThan(semOf('CSC1310'))
    expect(semOf('CSC1310')).toBeLessThan(semOf('CSC2400'))
    expect(semOf('CSC2400')).toBeLessThan(semOf('CSC4200'))
    expect(semOf('MATH1910')).toBeLessThan(semOf('MATH2010'))
    expect(semOf('CSC3040')).toBeLessThan(semOf('CSC4610'))
    expect(semOf('CSC3300')).toBeLessThan(semOf('CSC4610'))
    expect(semOf('ENGL1010')).toBeLessThan(semOf('ENGL1020'))
  })

  it('allows a corequisite in the same semester', () => {
    const { semOf } = plan()
    expect(semOf('MATH1910')).toBeLessThanOrEqual(semOf('CSC1300'))
  })

  it('moves a course later with its corequisite when standing pushes the coreq', () => {
    // CSC4585 (Cybersecurity): prereq CSC2400, coreq CSC4610.
    const { semOf } = plan({}, {
      slotEntries: [...CORE_SLOTS, 'CSC4585'],
      courses: { ...COURSES, CSC4585: { credits: 3 } },
      prereqs: { ...PREREQS, CSC4585: { 0: { logic: 'AND', codes: ['CSC2400'] } } },
      coreqs:  { ...COREQS,  CSC4585: { 0: { logic: 'AND', codes: ['CSC4610'] } } },
    })
    expect(semOf('CSC4585')).toBeGreaterThanOrEqual(semOf('CSC4610'))
  })

  it('pins CSC4615 to the final semester', () => {
    for (const act_math of [15, 20, 29]) {
      const { semOf, maxSem } = plan({ act_math })
      expect(semOf('CSC4615'), `ACT ${act_math}`).toBe(maxSem)
    }
  })

  it('places the two SCIENCE slots in consecutive semesters', () => {
    const { active, assignments } = plan()
    const [a, b] = active.filter(s => s.class_code === 'SCIENCE').map(s => assignments[s.id]).sort((x, y) => x - y)
    expect(b).toBe(a + 1)
  })
})

// ── Math chain archiving ─────────────────────────────────────────────────────

describe('buildDegreePlan — math chain', () => {
  const activeMath = r => r.active.map(s => s.class_code).filter(c => /^MATH\d/.test(c))

  it('ACT 29 new student: MATH1910 → MATH2010, everything else not_applicable', () => {
    const r = plan()
    expect(activeMath(r).sort()).toEqual(['MATH1910', 'MATH2010'])
    const mathSlot = code => r.slots.find(s => s.class_code === code).id
    expect(r.archived[mathSlot('MATH1000')]).toBe('not_applicable')
    expect(r.archived[mathSlot('MATH1920')]).toBe('not_applicable')
  })

  it('ACT 20 new student: starts at MATH1710 and sequences the chain', () => {
    const r = plan({ act_math: 20 })
    expect(activeMath(r).sort()).toEqual(['MATH1710', 'MATH1720', 'MATH1910', 'MATH2010'])
    expect(r.semOf('MATH1710')).toBeLessThan(r.semOf('MATH1720'))
    expect(r.semOf('MATH1720')).toBeLessThan(r.semOf('MATH1910'))
  })

  it('returning student keeps MATH1920', () => {
    expect(activeMath(plan({ student_type: 'returning' }))).toContain('MATH1920')
  })

  it('missing ACT score defaults to the MATH1910 chain', () => {
    expect(activeMath(plan({ act_math: undefined })).sort()).toEqual(['MATH1910', 'MATH2010'])
  })

  it('archives a slot covered by a credit-bearing prior credit as prior_credit', () => {
    const r = plan({}, { priorCredits: [
      { id: 'ap1', credit_type: 'ap_credit', satisfies_course_code: 'CSC1300', credits_awarded: 4 },
    ] })
    expect(r.archived[r.slots.find(s => s.class_code === 'CSC1300').id]).toBe('prior_credit')
  })
})
