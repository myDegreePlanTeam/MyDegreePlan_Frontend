// poolResolver.js
// Maps every pool code used in the degree JSONs to its list of valid course codes.
// This is the application-layer resolution we decided on during schema planning —
// pool membership lives here in code rather than in the database, keeping the
// schema lean and queries simple.
//
// Each key is a pool code that appears as class_code in requirement_slots
// where is_pool = true.
// Each value is an array of course codes valid for that slot.

export const POOL_COURSES = {

  // ── General Education ─────────────────────────────────────────────
  // Students must satisfy 6 hrs History, 6 hrs Humanities/Fine Arts,
  // and 6 hrs Social/Behavioral Science across all GEN_ED slots.
  // Validation of those sub-requirements is a future feature.
  // For now, all GEN_ED eligible courses are offered as options.
  GEN_ED: [
    // History (6 hrs — HIST2010 and HIST2020 are independent, no ordering required)
    'HIST2010',
    'HIST2020',
    // Humanities / Fine Arts
    'ART1035',
    'ART2000',
    'ART2020',
    'FLST2520',
    'FLST3520',
    'FREN2510',
    'GERM2520',
    'HIST1310',
    'HIST2210',
    'HIST2220',
    'HIST2310',
    'HIST2320',
    'MUS1030',
    'PHIL1030',
    'PHIL2250',
    'RELS2010',
    'SPAN2510',
    'SPAN2550',
    'THEA1030',
    // Social / Behavioral Science
    'AGBE2010',
    'ANTH1100',
    'ECON2010',
    'ECON2020',
    'ESS1100',
    'EXPW2015',
    'GEOG1012',
    'GEOG1130',
    'JOUR1110',
    'POLS1030',
    'PSY1030',
    'SOC1010',
    'WGS2010',
  ],

  // ── English Literature ────────────────────────────────────────────
  ENG_LIT: [
    'ENGL2130',
    'ENGL2235',
    'ENGL2330',
  ],

  // ── Natural Science sequences ─────────────────────────────────────
  // Students need 8 credit hours from one approved sequence.
  // Sequence pairing validation is a future feature.
  SCIENCE: [
    'BIOL1113',
    'BIOL1123',
    'BIOL2310',
    'CHEM1110',
    'CHEM1120',
    'GEOL1040',
    'GEOL1045',
    'PHYS2010',
    'PHYS2020',
    'PHYS2110',
    'PHYS2120',
  ],

  // ── Communications requirement ────────────────────────────────────
  // Student picks one oral communications course
  COMM_REQ: [
    'COMM2025',
    'PC2500',
  ],

  // ── Statistics requirement ────────────────────────────────────────
  MATH_STATS: [
    'MATH3070',
    'MATH3470',
  ],

  // ── CSC Core concentration electives ─────────────────────────────
  // Lower elective: one of the three concentration gateway courses
  CSC_LOWER_ELECTIVE: [
    'CSC2220',
    'CSC2570',
    'CSC2770',
  ],

  // Upper elective: any 3000-4000 level CSC course except CSC4990
  CSC_UPPER_ELECTIVE: [
    'CSC3020',
    'CSC3100',
    'CSC3220',
    'CSC3230',
    'CSC3340',
    'CSC4010',
    'CSC4040',
    'CSC4220',
    'CSC4240',
    'CSC4260',
    'CSC4400',
    'CSC4570',
    'CSC4575',
    'CSC4580',
    'CSC4585',
    'CSC4620',
    'CSC4710',
    'CSC4750',
    'CSC4760',
    'CSC4770',
    'CSC4780',
  ],

  // ── General CSC elective (Cybersecurity and DS/AI) ────────────────
  // Any 1000-4000 level CSC course
  CSC_ELECTIVE: [
    'CSC1200',
    'CSC2010',
    'CSC2220',
    'CSC2570',
    'CSC2770',
    'CSC3020',
    'CSC3100',
    'CSC3220',
    'CSC3230',
    'CSC3340',
    'CSC4010',
    'CSC4040',
    'CSC4220',
    'CSC4240',
    'CSC4260',
    'CSC4400',
    'CSC4570',
    'CSC4575',
    'CSC4580',
    'CSC4585',
    'CSC4620',
    'CSC4710',
    'CSC4750',
    'CSC4760',
    'CSC4770',
    'CSC4780',
  ],

  // ── HPC specific electives ────────────────────────────────────────
  CSC_HPC_ELECTIVE: [
    'CSC4040',
    'CSC4220',
    'CSC4400',
    'CSC4575',
    'CSC4710',
  ],

  // ── Free elective ─────────────────────────────────────────────────
  // Any university course — resolved differently in the modal
  // (open search rather than a fixed list)
  FREE_ELECTIVE: null,
}

// ── Pool slot display labels ──────────────────────────────────────────────────
// Single source of truth shared by Semester (slot row) and SlotModal (modal title).

export const POOL_LABELS = {
  GEN_ED:             'General Education',
  ENG_LIT:            'English Literature',
  SCIENCE:            'Natural Science',
  COMM_REQ:           'Communications',
  MATH_STATS:         'Statistics',
  CSC_LOWER_ELECTIVE: 'CSC Lower Elective',
  CSC_UPPER_ELECTIVE: 'CSC Upper Elective',
  CSC_ELECTIVE:       'CSC Elective',
  CSC_HPC_ELECTIVE:   'HPC Elective',
  FREE_ELECTIVE:      'Free Elective',
}

// ── Helper function ───────────────────────────────────────────────────────────
// Given a pool code and the full course catalog (as the courseMap object
// from DegreePlan), returns an array of course objects valid for that slot.
// Returns null for FREE_ELECTIVE — the modal handles that case separately.

export function resolvePool(poolCode, courseMap) {
  // FREE_ELECTIVE — return null to signal open resolution
  // (handled separately in SlotModal with suggestions)
  if (poolCode === 'FREE_ELECTIVE') return null

  const codes = POOL_COURSES[poolCode]
  if (!codes) return []

  return codes
    .filter(code => courseMap[code])
    .map(code => courseMap[code])
}

// ── resolveScience ────────────────────────────────────────────────────────────

const SCIENCE_SEQUENCES = [
  { courses: ['CHEM1110', 'CHEM1120'] },
  { courses: ['PHYS2010', 'PHYS2020'] },
  { courses: ['PHYS2110', 'PHYS2120'] },
  { courses: ['GEOL1040', 'GEOL1045'] },
  { courses: ['GEOL1045', 'GEOL1040'] },
  { courses: ['BIOL1123', 'BIOL1113'] },
  { courses: ['BIOL2310', 'BIOL1113'] },
]

export function resolveScience(planSlots, slots, courseMap) {
  const scienceSlotIds = slots
    .filter(s => s.is_pool && s.class_code === 'SCIENCE')
    .map(s => s.id)

  const selectedScienceCodes = scienceSlotIds
    .map(id => planSlots[id])
    .filter(Boolean)

  if (selectedScienceCodes.length === 0) return { mode: 'normal' }

  const alreadySelected = selectedScienceCodes[0]

  // BIOL1113 special case — narrow to the two options
  if (alreadySelected === 'BIOL1113') {
    return {
      mode: 'narrow',
      courses: ['BIOL1123', 'BIOL2310']
        .filter(code => courseMap[code])
        .map(code => courseMap[code]),
    }
  }

  // Find sequence and auto-fill partner
  for (const seq of SCIENCE_SEQUENCES) {
    if (!seq.courses.includes(alreadySelected)) continue
    const partner = seq.courses.find(c => c !== alreadySelected)
    if (!partner || !courseMap[partner]) continue
    return { mode: 'autofill', course: courseMap[partner] }
  }

  return { mode: 'normal' }
}

// ── getScienceWarnings ────────────────────────────────────────────────────────
// Given the current planSlots and the full slots list, returns a map of
// { [slotId]: { type: 'incomplete'|'conflict', sequenceName?: string } }
// describing any science-sequence problems that should be shown on the degree
// plan grid (not in the modal).
//
// Rules:
//   • Both empty         → no warnings
//   • One filled, one empty → warn on the empty slot: must complete the sequence
//   • Both filled, same sequence → no warnings (plan is valid)
//   • Both filled, different sequences → conflict warning on BOTH slots

const SCIENCE_SEQUENCE_NAMES = {
  'CHEM1110': 'Chemistry',
  'CHEM1120': 'Chemistry',
  'PHYS2010': 'Physics (Algebra)',
  'PHYS2020': 'Physics (Algebra)',
  'PHYS2110': 'Physics (Calculus)',
  'PHYS2120': 'Physics (Calculus)',
  'GEOL1040': 'Geology',
  'GEOL1045': 'Geology',
  'BIOL1113': 'Biology',
  'BIOL1123': 'Biology',
  'BIOL2310': 'Biology',
}

export function getScienceWarnings(planSlots, slots) {
  const scienceSlots = slots.filter(s => s.is_pool && s.class_code === 'SCIENCE')
  if (scienceSlots.length < 2) return {}

  const [slotA, slotB] = scienceSlots
  const codeA = planSlots[slotA.id]
  const codeB = planSlots[slotB.id]

  if (!codeA && !codeB) return {}

  const seqA = codeA ? SCIENCE_SEQUENCE_NAMES[codeA] : null
  const seqB = codeB ? SCIENCE_SEQUENCE_NAMES[codeB] : null

  // Both filled — check if they're from the same sequence
  if (codeA && codeB) {
    if (seqA && seqB && seqA !== seqB) {
      return {
        [slotA.id]: { type: 'conflict' },
        [slotB.id]: { type: 'conflict' },
      }
    }
    return {}
  }

  // One filled, one empty — warn on the empty slot
  if (codeA && !codeB && seqA) {
    return { [slotB.id]: { type: 'incomplete', sequenceName: seqA } }
  }
  if (!codeA && codeB && seqB) {
    return { [slotA.id]: { type: 'incomplete', sequenceName: seqB } }
  }

  return {}
}

// ── GEN_ED sub-requirement categories ────────────────────────────────────────
// Each category requires at least 6 credit hours.
// Course codes here must exactly match those listed in POOL_COURSES.GEN_ED above.

// Note: HIST2010 and HIST2020 are independent — no ordering required between them.
const GEN_ED_CATEGORIES = {
  History: [
    'HIST2010',
    'HIST2020',
  ],
  Humanities: [
    'ART1035',
    'ART2000',
    'ART2020',
    'FLST2520',
    'FLST3520',
    'FREN2510',
    'GERM2520',
    'HIST1310',
    'HIST2210',
    'HIST2220',
    'HIST2310',
    'HIST2320',
    'MUS1030',
    'PHIL1030',
    'PHIL2250',
    'RELS2010',
    'SPAN2510',
    'SPAN2550',
    'THEA1030',
  ],
  Social: [
    'AGBE2010',
    'ANTH1100',
    'ECON2010',
    'ECON2020',
    'ESS1100',
    'EXPW2015',
    'GEOG1012',
    'GEOG1130',
    'JOUR1110',
    'POLS1030',
    'PSY1030',
    'SOC1010',
    'WGS2010',
  ],
}

// ── getGenEdStatus ────────────────────────────────────────────────────────────
// Returns an array of three objects — one per sub-category — describing how
// many credit hours the student has filled toward the 6-hr minimum and whether
// they are at risk of being unable to meet a sub-requirement.
//
// "At risk" means the total credits still needed across all three categories
// exceeds the capacity of the remaining empty GEN_ED slots.  When the overall
// plan becomes infeasible every unsatisfied category is flagged.
//
// Shape: [{ category, label, filled, required, satisfied, atRisk }, ...]

const GEN_ED_CATEGORY_LABELS = {
  History:   'History',
  Humanities: 'Humanities & Arts',
  Social:    'Social Science',
}

export function getGenEdStatus(planSlots, slots, courseMap) {
  const genEdSlots  = slots.filter(s => s.is_pool && s.class_code === 'GEN_ED')
  const emptySlots  = genEdSlots.filter(s => !planSlots[s.id]).length

  // Build a reverse lookup: courseCode → category
  const codeToCategory = {}
  for (const [cat, codes] of Object.entries(GEN_ED_CATEGORIES)) {
    for (const code of codes) codeToCategory[code] = cat
  }

  // Sum credits per category from filled GEN_ED slots
  const creditsByCategory = { History: 0, Humanities: 0, Social: 0 }
  for (const slot of genEdSlots) {
    const code = planSlots[slot.id]
    if (!code) continue
    const cat = codeToCategory[code]
    if (cat) {
      creditsByCategory[cat] += courseMap[code]?.credits ?? 3
    }
  }

  const REQUIRED = 6

  // Total credits still needed across all categories
  const totalShortfall = Object.values(creditsByCategory).reduce((sum, filled) => {
    return sum + Math.max(0, REQUIRED - filled)
  }, 0)

  // If the remaining empty slots can't cover the combined shortfall, every
  // unsatisfied category is at risk.
  const overallAtRisk = totalShortfall > emptySlots * 3

  return ['History', 'Humanities', 'Social'].map(cat => {
    const filled    = creditsByCategory[cat]
    const satisfied = filled >= REQUIRED
    const atRisk    = !satisfied && overallAtRisk
    return {
      category:  cat,
      label:     GEN_ED_CATEGORY_LABELS[cat],
      filled,
      required:  REQUIRED,
      satisfied,
      atRisk,
    }
  })
}

// ── resolveFreeElective ───────────────────────────────────────────────────────

export function resolveFreeElective(courseMap, slots, planSlots) {
  const planSubjectCodes = new Set()

  slots
    .filter(s => !s.is_pool)
    .forEach(s => {
      const course = courseMap[s.class_code]
      if (course) planSubjectCodes.add(course.subject_code)
    })

  Object.values(planSlots).forEach(code => {
    const course = courseMap[code]
    if (course) planSubjectCodes.add(course.subject_code)
  })

  const allCourses = Object.values(courseMap)

  const suggested = allCourses
    .filter(c => planSubjectCodes.has(c.subject_code))
    .sort((a, b) => a.code.localeCompare(b.code))

  const other = allCourses
    .filter(c => !planSubjectCodes.has(c.subject_code))
    .sort((a, b) => a.code.localeCompare(b.code))

  return { suggested, other }
}