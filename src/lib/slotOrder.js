// slotOrder.js: the order a semester lists its courses in, the same on every platform.
//
// By class code: alphabetical by the subject letters, then numerical by the course number (CSC 1020, CSC 1300, ENGL 1010, HIST 2010,
// MATH 1910). "Class code" is what the row shows: the course's code, the code of the course a student picked for a pool slot, or the
// pool's label while nothing is picked ("Humanities & Cultural Expression"), which sorts alphabetically like any other text.
//
// A semester used to list its courses by requirement_slots.id, which is not the same on every platform (the Docker install numbers
// slots in the degree spec's order; the web and Windows app keep older ids), so the same plan showed its courses in a different
// order depending on where it ran. The order is irrelevant to the plan, so it is made one fixed, readable rule.

const CODE = /^([A-Za-z]+)\s*(\d+)\s*([A-Za-z]*)$/

// "CSC1300" -> { letters: 'CSC', number: 1300, rest: '' }; anything else (a label) sorts as text, before any numbered code of that name.
export function parseClassCode(code) {
  const text = String(code ?? '').trim()
  const match = CODE.exec(text)
  if (!match) return { letters: text.toUpperCase(), number: -1, rest: '' }
  return { letters: match[1].toUpperCase(), number: Number(match[2]), rest: match[3].toUpperCase() }
}

export function compareClassCodes(a, b) {
  const x = parseClassCode(a)
  const y = parseClassCode(b)
  if (x.letters !== y.letters) return x.letters < y.letters ? -1 : 1
  if (x.number !== y.number) return x.number - y.number
  if (x.rest !== y.rest) return x.rest < y.rest ? -1 : 1
  return 0
}

/**
 * Groups placed slots by semester, each semester in class-code order.
 * @param {object[]} slots              requirement_slots rows
 * @param {object}   semesterOverrides  { [slotId]: semester } the student's placement, which wins over the template's
 * @param {object}   archived           { [slotId]: reason } slots covered by prior credit (left out)
 * @param {(slot: object) => string} codeOf  the code the row shows
 * @returns {{ [semester: number]: object[] }}
 */
export function groupSlotsBySemester({ slots, semesterOverrides = {}, archived = {}, codeOf }) {
  const bySemester = {}
  for (const slot of slots) {
    if (archived[slot.id]) continue
    const semester = semesterOverrides[slot.id] ?? slot.semester_number
    if (semester == null) continue   // the algorithm has not placed this slot yet
    ;(bySemester[semester] ??= []).push(slot)
  }
  for (const list of Object.values(bySemester)) list.sort((a, b) => compareClassCodes(codeOf(a), codeOf(b)) || a.id - b.id)
  return bySemester
}

// Courses a student added outside the template, in a semester: the same rule, by course code.
export function sortByCourseCode(rows) {
  return [...rows].sort((a, b) => compareClassCodes(a.course_code, b.course_code) || (a.id ?? 0) - (b.id ?? 0))
}
