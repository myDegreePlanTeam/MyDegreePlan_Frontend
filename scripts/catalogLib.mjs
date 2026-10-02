// catalogLib.mjs: the pure parts of the catalog build, split out of build-catalog.mjs so Vitest can
// exercise them. Mirrors MyDegreePlan_Prototype/seed.js; see build-catalog.mjs for the why.

// Courses that the live database has but the generated course catalog (courses.json) might not: they were
// added by hand-applied migrations. MATH1000 (migration_math1000.sql) is a template slot and an
// exam-equivalency award; Coursedog lists it now, so this only fires if a rebuild ever drops it.
// local-deploy's setup does the same.
export const SUPPLEMENTAL_COURSES = [
  {
    code: 'MATH1000',
    name: 'Transitional Algebra',
    credits: 3,
    subject_code: 'MATH',
    description: 'Algebra fundamentals for students who need preparation before college-level mathematics.',
    standing_req: null,
  },
]

// seed.js: a string is an AND requirement (its own group); an inner array is an OR group.
export function flattenReqArray(courseCode, reqArray) {
  const rows = []
  reqArray.forEach((entry, groupIndex) => {
    if (Array.isArray(entry)) {
      for (const code of entry.flat()) {
        rows.push({ course_code: courseCode, required_code: code, group_index: groupIndex, logic: 'OR' })
      }
    } else {
      rows.push({ course_code: courseCode, required_code: entry, group_index: groupIndex, logic: 'AND' })
    }
  })
  return rows
}

// test_equivalencies.sql lists one tuple per row:
//   ('ap_credit', 'Biology', 3, 'BIOL1113', 4, NULL),
export function parseEquivalencies(sql) {
  const tuple = /^\s*\(\s*'([^']*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(\d+|NULL)\s*,\s*'([^']*)'\s*,\s*(\d+)\s*,\s*(NULL|'[^']*')\s*\)\s*[,;]?\s*(?:--.*)?$/
  const rows = []
  let lines = 0
  for (const line of sql.split(/\r?\n/)) {
    if (!/^\s*\(\s*'/.test(line)) continue
    lines++
    const m = line.match(tuple)
    if (!m) throw new Error(`test_equivalencies.sql: cannot parse row: ${line.trim()}`)
    rows.push({
      test_type: m[1],
      test_name: m[2].replace(/''/g, "'"),
      min_score: m[3] === 'NULL' ? null : Number(m[3]),
      awarded_course_code: m[4],
      credits_awarded: Number(m[5]),
      satisfies_pool: m[6] === 'NULL' ? null : m[6].slice(1, -1),
    })
  }
  if (rows.length !== lines) throw new Error('test_equivalencies.sql: row count mismatch')
  return rows.map((r, i) => ({ id: i + 1, ...r }))
}

const withIds = rows => rows.map((r, i) => ({ id: i + 1, ...r }))

/**
 * @param {object} input
 * @param {Array}  input.courses        courses.json `courses` (the generated full catalog)
 * @param {Set<string>|null} [input.coreCodes]  courses whose description ships in catalog.json itself:
 *                                      the ones templates, pools and exam equivalencies name. Every other
 *                                      description goes to `descriptions`, loaded on demand. null embeds all.
 * @param {object} input.degreePlans    degree_plans.json: { programs, pools, plans } (see the prototype repo's
 *                                      degree-specs/). A slot is a pool when its code is a key of `pools`.
 * @param {string} input.equivalencySql contents of test_equivalencies.sql
 * @param {object|null} input.previous  the previous catalog.json, used to keep ids stable
 * @param {Function} input.planSlotSync the prototype repo's slotSync planner (the one seed.js uses)
 * @returns {{ catalog: object, descriptions: object, totals: object }}
 */
export function assembleCatalog({ courses, degreePlans, equivalencySql, previous, planSlotSync, coreCodes = null }) {
  const { programs, pools, plans } = degreePlans
  const prevSlots = previous?.tables.requirement_slots ?? []
  const prevConcentrations = previous?.tables.concentrations ?? []
  const prevDegreePlans = previous?.tables.degree_plans ?? []

  // Null columns are left out (the engine fills them: see CATALOG_COLUMN_DEFAULTS in localClient.js), and
  // descriptions outside the core ride in a separate lazily loaded file.
  const descriptions = {}
  const courseRows = courses.map(c => {
    const row = { code: c.code, name: c.name, credits: c.credits, subject_code: c.subjectCode ?? null }
    if (c.creditsMax != null) row.credits_max = c.creditsMax
    if (c.standing) row.standing_req = c.standing
    if (c.requisiteText) row.requisite_text = c.requisiteText
    if (!coreCodes || coreCodes.has(c.code)) row.description = c.description ?? null
    else if (c.description) descriptions[c.code] = c.description
    return row
  })
  for (const extra of SUPPLEMENTAL_COURSES) {
    if (!courseRows.some(c => c.code === extra.code)) courseRows.push(extra)
  }
  const prereqRows = courses.flatMap(c => (c.prerequisites?.length ? flattenReqArray(c.code, c.prerequisites) : []))
  const coreqRows = courses.flatMap(c => (c.corequisites?.length ? flattenReqArray(c.code, c.corequisites) : []))

  // Program ids are stable: reuse the previous id for a code, else the next free one. A program row is a major or
  // a concentration of one (the table keeps its original name; see local-deploy's baseline schema).
  const latestHours = code => plans.filter(plan => plan.program === code).at(-1)?.hours ?? null
  const concentrations = []
  let nextConcId = Math.max(0, ...prevConcentrations.map(c => c.id)) + 1
  for (const program of programs) {
    const prior = prevConcentrations.find(c => c.code === program.code)
    concentrations.push({
      id: prior?.id ?? nextConcId++,
      code: program.code,
      name: program.name,
      total_hours: latestHours(program.code),
      kind: program.kind,
      degree: program.degree,
      major_name: program.majorName,
      department: program.department,
      supersedes: program.supersedes,
      last_catalog_year: program.lastCatalogYear,
      description: program.description,
      college: program.college ?? null,
      major_code: program.majorCode ?? null,
      is_base: program.isBase ?? false,
      aliases: (program.aliases ?? []).join(', ') || null,
    })
  }
  const concId = Object.fromEntries(concentrations.map(c => [c.code, c.id]))

  // The plan index: one row per program per catalog year. Ids stable on (program, year).
  const degree_plans = []
  let nextPlanId = Math.max(0, ...prevDegreePlans.map(p => p.id)) + 1
  for (const plan of plans) {
    const concentration_id = concId[plan.program]
    const prior = prevDegreePlans.find(p => p.concentration_id === concentration_id && p.catalog_year === plan.catalogYear)
    degree_plans.push({
      id: prior?.id ?? nextPlanId++,
      concentration_id,
      catalog_year: plan.catalogYear,
      gened_program: plan.genedProgram,
      total_hours: plan.hours,
      covers_earlier: plan.coversEarlier,
    })
  }

  // Slots. A slot keeps its id by key; rows from a catalog built before keys existed (slot_key and catalog_year
  // missing) are adopted by course code and position, the way seed.js adopts them in Postgres.
  const slots = []
  let nextSlotId = Math.max(0, ...prevSlots.map(s => s.id)) + 1
  const totals = { kept: 0, inserted: 0, removed: 0 }
  for (const plan of plans) {
    const concentration_id = concId[plan.program]
    const desired = plan.slots.map(slot => ({
      concentration_id,
      semester_number: null,
      slot_order: null,
      class_code: slot.classCode,
      is_pool: Object.hasOwn(pools, slot.classCode),
      flex_credits: slot.credits ?? null,
      gened_program: plan.genedProgram,
      catalog_year: plan.catalogYear,
      slot_key: slot.key,
      map_semester: slot.mapSemester ?? null,
      replaces: slot.replaces ?? null, // a matching hint for planSlotSync (a renamed slot keeps its row); never stored
    }))
    const existing = prevSlots.filter(s => s.concentration_id === concentration_id
      && s.gened_program === plan.genedProgram
      && (s.catalog_year == null || s.catalog_year === plan.catalogYear))
    const { update, insert, remove, kept } = planSlotSync(existing, desired)
    const dropped = new Set(remove)
    const changes = new Map(update.map(u => [u.id, u.changes]))
    for (const row of existing) {
      if (!dropped.has(row.id)) slots.push({ ...row, ...changes.get(row.id) })
    }
    for (const row of insert) slots.push({ id: nextSlotId++, ...row })
    totals.kept += kept; totals.inserted += insert.length; totals.removed += remove.length
  }
  slots.sort((a, b) => a.id - b.id)

  return {
    totals,
    descriptions,
    catalog: {
      format: 1,
      tables: {
        courses: courseRows,
        prerequisite_entries: withIds(prereqRows),
        corequisite_entries: withIds(coreqRows),
        concentrations,
        degree_plans,
        requirement_slots: slots,
        test_equivalencies: parseEquivalencies(equivalencySql),
      },
    },
  }
}
