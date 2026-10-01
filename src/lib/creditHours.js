// creditHours.js
//
// About 550 catalog courses carry a range of credit hours (a 1-4 hour topics course, a 1-18 hour elective
// placeholder). A course's `credits` is its minimum and `credits_max` the top; the student says how many
// hours they will take, kept between the two.
//
// Where the choice lives: student_free_add_slots.credits for an added course and
// student_plan_slots.selected_credits for a pool pick. A course is in a plan at most once, so the choice
// is applied by overlaying it on the course map (applyChosenHours): every consumer that reads
// courses[code].credits (semester totals, standing, the PDF, transfer dedupe) then sees the student's hours
// without knowing about ranges.

/** { min, max, variable } for a course row; a fixed-credit course has min === max. */
export function creditRange(course) {
  const min = Number(course?.minCredits ?? course?.credits ?? 0)
  const max = course?.credits_max != null ? Number(course.credits_max) : min
  return { min, max: Math.max(min, max), variable: max > min }
}

export const isVariableCredit = course => creditRange(course).variable

/** "3" for a fixed course, "1–4" for a range. */
export function formatCredits(course) {
  const { min, max, variable } = creditRange(course)
  return variable ? `${min}–${max}` : `${min}`
}

/** An error message, or null when `hours` is a whole number inside the course's range. */
export function validateHours(course, hours) {
  const { min, max, variable } = creditRange(course)
  if (!variable) return null
  const n = Number(hours)
  if (hours === '' || hours == null || !Number.isInteger(n)) return `Enter a whole number of hours from ${min} to ${max}.`
  if (n < min || n > max) return `This course carries ${min} to ${max} credit hours.`
  return null
}

/** `hours` clamped into the course's range; the minimum when it is not a number. */
export function clampHours(course, hours) {
  const { min, max } = creditRange(course)
  const n = Math.trunc(Number(hours))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/**
 * A copy of `courses` with the student's chosen hours applied.
 * @param {Object} courses  { [code]: course }
 * @param {object} chosen
 * @param {Array}  chosen.freeAdds            student_free_add_slots rows ({ course_code, credits })
 * @param {Object} chosen.planSlots           { [slotId]: selected course code }
 * @param {Object} chosen.planSelectedCredits { [slotId]: hours } from student_plan_slots.selected_credits
 * A choice for a course that is not variable, or outside its range, is ignored.
 */
export function applyChosenHours(courses, { freeAdds = [], planSlots = {}, planSelectedCredits = {} } = {}) {
  const choices = {}
  for (const fa of freeAdds) if (fa?.credits != null) choices[fa.course_code] = fa.credits
  for (const [slotId, hours] of Object.entries(planSelectedCredits)) {
    const code = planSlots[slotId]
    if (code && hours != null) choices[code] = hours
  }
  const out = { ...courses }
  for (const [code, hours] of Object.entries(choices)) {
    const course = courses[code]
    if (!course || validateHours(course, hours) !== null || !isVariableCredit(course)) continue
    out[code] = { ...course, minCredits: creditRange(course).min, credits: Number(hours) }
  }
  return out
}
