// plannerCatalog.js
//
// Which catalog rows the planner needs for one plan. The catalog holds every Tennessee Tech course
// (thousands), but a plan only ever looks up its own template's courses and the pools' options:
//   - degreeBuilder reads courseMap / prereqMap / coreqMap for each slot's class_code, and walks the
//     prerequisites of every pool option (poolDepth, poolEarliest);
//   - DegreePlan reads the same, plus whatever the student added.
// Loading whole tables instead is wrong on the Docker stack, whose API returns at most 1000 rows per
// request (PGRST_DB_MAX_ROWS): the builder would silently get a truncated catalog.

import { POOL_COURSES } from './poolResolver'

/**
 * @param {Array<{class_code: string, is_pool: boolean}>} slots  a plan's requirement_slots
 * @param {string[]} extraCodes  e.g. the student's free-add courses
 * @returns {string[]} every course code the plan can refer to, once each
 */
export function plannerCodes(slots, extraCodes = []) {
  const fixed = (slots ?? []).filter(s => !s.is_pool).map(s => s.class_code)
  const pooled = Object.values(POOL_COURSES).filter(list => list !== null).flat()
  return [...new Set([...fixed, ...pooled, ...extraCodes])]
}

const REQUIREMENT_COLUMNS = 'course_code, group_index, logic, required_code'

/**
 * One course with its requirement rows: what a student-added course needs before it can be checked
 * (the page loads this for the plan's courses up front, but a course picked from the search box is new).
 * @returns {Promise<{ course: object|null, prereqs: Array, coreqs: Array, error: object|null }>}
 */
export async function fetchCourseDetail(db, code, columns = 'code, name, credits, subject_code, standing_req, description') {
  const [courseRes, prereqRes, coreqRes] = await Promise.all([
    db.from('courses').select(columns).eq('code', code),
    db.from('prerequisite_entries').select(REQUIREMENT_COLUMNS).eq('course_code', code),
    db.from('corequisite_entries').select(REQUIREMENT_COLUMNS).eq('course_code', code),
  ])
  return {
    course: courseRes.data?.[0] ?? null,
    prereqs: prereqRes.data ?? [],
    coreqs: coreqRes.data ?? [],
    error: courseRes.error ?? prereqRes.error ?? coreqRes.error ?? null,
  }
}

/**
 * Loads the courses and requirement rows the degree builder needs for `slots`.
 * @returns {Promise<{ courses: Array, prereqs: Array, coreqs: Array, error: object|null }>}
 */
export async function fetchPlannerCatalog(db, slots, { courseColumns = 'code, credits, standing_req', extraCodes = [] } = {}) {
  const codes = plannerCodes(slots, extraCodes)
  const [coursesRes, prereqRes, coreqRes] = await Promise.all([
    db.from('courses').select(courseColumns).in('code', codes),
    db.from('prerequisite_entries').select(REQUIREMENT_COLUMNS).in('course_code', codes),
    db.from('corequisite_entries').select(REQUIREMENT_COLUMNS).in('course_code', codes),
  ])
  return {
    courses: coursesRes.data ?? [],
    prereqs: prereqRes.data ?? [],
    coreqs: coreqRes.data ?? [],
    error: coursesRes.error ?? prereqRes.error ?? coreqRes.error ?? null,
  }
}
