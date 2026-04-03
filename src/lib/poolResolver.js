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
    // History (required 6 hrs — HIST2010 must precede HIST2020)
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

// ── Helper function ───────────────────────────────────────────────────────────
// Given a pool code and the full course catalog (as the courseMap object
// from DegreePlan), returns an array of course objects valid for that slot.
// Returns null for FREE_ELECTIVE — the modal handles that case separately.

export function resolvePool(poolCode, courseMap) {
  const codes = POOL_COURSES[poolCode]

  // FREE_ELECTIVE has null codes — signal the modal to show open search
  if (codes === null) return null

  // Filter courseMap to only courses in this pool, preserving pool order
  return codes
    .filter(code => courseMap[code])
    .map(code => courseMap[code])
}