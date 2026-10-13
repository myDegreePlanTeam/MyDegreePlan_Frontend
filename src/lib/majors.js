// majors.js
//
// The majors a student is enrolled in, and changing which one is the primary. Pure.
//
// A student has one PRIMARY major (the program on student_profiles.concentration_id: general education, the catalog year and the plan's
// total come from it) and any number of SECONDARY majors (rows of student_programs with role 'major'). A minor is a different thing and is
// not a major. Making a secondary major the primary swaps the two: the new primary moves onto the profile, and the old one becomes a
// secondary row. Both stay in the plan; what the student already picked and placed is carried to the cards that change owners, so
// nothing they did is lost (inheritedRows).
//
//   enrolledMajors({ profile, programs, info })            -> [{ programId, name, primary, rowId, catalogYear }]   primary first
//   majorsHeading(majors)                                  -> 'Your major' | 'Your majors'
//   swapPrimary({ profile, row })                          -> { profileFields, rowFields, notesFrom, notesTo }     what to write
//   mergeInOrder({ sets, primaryId, courses, planSlots })  -> mergePrograms' result with `primaryId` as the primary
//   inheritedRows({ before, after, savedRows, slotsById, studentId }) -> student_plan_slots rows to write

import { mergePrograms } from './programMerge.js'

export function enrolledMajors({ programs = [], info = {} }) {
  return programs
    .filter(p => p.primary || p.role !== 'minor')
    .map(p => ({ programId: p.programId, name: info[p.programId]?.name ?? 'Major', primary: !!p.primary, rowId: p.id ?? null, catalogYear: p.catalogYear }))
}

/** "Your major" for one, "Your majors" for more than one: the plural only when there really are several. */
export const majorsHeading = majors => (majors.length > 1 ? 'Your majors' : 'Your major')

/**
 * What to write to make the secondary major in `row` (a programs entry from lib/studentPrograms.js, with `id` and `programId`) the primary:
 * the profile takes its program, plan year and general-education program; its student_programs row takes the old primary's, with the
 * student's own start term as the term it was entered. The semester notes filed under the old primary move to the new one.
 */
export function swapPrimary({ profile, row }) {
  return {
    profileFields: { concentration_id: row.programId, catalog_year: row.catalogYear, gened_program: row.genedProgram },
    rowFields: {
      concentration_id: profile.concentration_id,
      catalog_year: profile.catalog_year ?? null,
      gened_program: profile.gened_program ?? 'legacy',
      entry_season: profile.start_season ?? null,
      entry_year: profile.start_year != null && profile.start_year !== '' ? Number(profile.start_year) : null,
    },
    notesFrom: profile.concentration_id,
    notesTo: row.programId,
  }
}

/**
 * The plan's slots merged with `primaryId` as the primary program and every other program added to it, in the order they were.
 * @param {{ sets: Array<{ program: object, slots: Array }>, primaryId: number, courses: object, planSlots: object, totals?: object }} input
 *   sets    each program's own slot rows (programSlots.fetchProgramSlotSets), in any order
 *   totals  { [programId]: total hours }
 */
export function mergeInOrder({ sets, primaryId, courses = {}, planSlots = {}, totals = {} }) {
  const primary = sets.find(s => String(s.program.programId) === String(primaryId)) ?? sets[0]
  const added = sets.filter(s => s !== primary)
  return mergePrograms(
    { programId: primary.program.programId, slots: primary.slots, genedProgram: primary.program.genedProgram, totalHours: totals[primary.program.programId] },
    added.map(({ program, slots }) => ({ programId: program.programId, role: program.role, slots, genedProgram: program.genedProgram, totalHours: totals[program.programId] })),
    { courses, planSlots },
  )
}

/**
 * The student_plan_slots rows a swap must write so nothing the student did is lost. A slot that was hidden behind another program's card
 * (a shadow: it has no row of its own) and is visible after the swap takes that card's state: where it sits, what was picked for it,
 * whether prior credit covers it. Slots that already have a row are left as they are.
 * @param {{ before: object, after: object, savedRows: Array, slotsById: Map, studentId: number }} input
 *   before / after  mergePrograms results for the old and the new primary
 *   savedRows       the student's student_plan_slots rows
 *   slotsById       slot id -> requirement_slots row (class_code)
 */
export function inheritedRows({ before, after, savedRows, slotsById, studentId }) {
  const saved = new Map(savedRows.map(r => [String(r.requirement_slot_id), r]))
  const visibleBefore = new Set(before.slots.map(s => String(s.id)))
  const rows = []
  for (const slot of after.slots) {
    const id = String(slot.id)
    if (visibleBefore.has(id) || saved.has(id)) continue
    const targetId = before.shadowOf?.[slot.id] ?? before.shadowOf?.[id]
    const target = targetId != null ? saved.get(String(targetId)) : null
    if (!target) continue
    const fixedCode = slotsById.get(Number(targetId))?.is_pool === false ? slotsById.get(Number(targetId)).class_code : null
    rows.push({
      student_id: studentId,
      requirement_slot_id: slot.id,
      // a pool that a fixed course satisfied is picked with that course; a pool that was paired with a pool takes its pick
      selected_course_code: slot.is_pool ? (fixedCode ?? target.selected_course_code ?? null) : slot.class_code,
      status: target.status ?? 'planned',
      semester_number: target.semester_number ?? null,
      credits_remaining: target.credits_remaining ?? 0,
      archived: !!target.archived,
      archive_reason: target.archive_reason ?? null,
      position_source: target.position_source ?? null,
      // only when there is something to say: a database that predates the column cannot take it
      ...(target.selected_credits != null ? { selected_credits: target.selected_credits } : {}),
    })
  }
  return rows
}
