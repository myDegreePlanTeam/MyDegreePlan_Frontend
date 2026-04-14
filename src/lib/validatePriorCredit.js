// validatePriorCredit.js
//
// Backend safety net for prior credit entries.
// Called before every INSERT into prior_credits, even when the guided wizard
// is used.  Because the wizard structures input from test_equivalencies data,
// this function should rarely fire in practice — but it catches direct API
// calls and any unexpected wizard state.
//
// Pure function: no Supabase calls, no side effects.
//
// validatePriorCredit(creditType, courseCode, creditsAwarded, testEquivalencies, courseCatalog)
//   → { valid: boolean, error: string | null, correctedCredits: number | null }
//
// Parameters:
//   creditType         — matches prior_credits.credit_type
//                        ('ap_credit', 'act_credit', 'cambridge', 'test_out',
//                         'ib_credit', 'transfer_credit', 'act_placement')
//   courseCode         — prior_credits.satisfies_course_code (may be null for
//                        placement-only entries)
//   creditsAwarded     — prior_credits.credits_awarded
//   testEquivalencies  — array of test_equivalencies rows:
//                        [{ test_type, awarded_course_code, credits_awarded, ... }]
//   courseCatalog      — map of { [courseCode]: { credits, ... } }
//
// Rules:
//   1. Placement-only types (act_placement) must have credits_awarded = 0.
//   2. For scored exam types (ap_credit, test_out, ib_credit, act_credit, cambridge):
//      test_equivalencies must have a row where test_type = creditType
//      AND awarded_course_code = courseCode.
//      credits_awarded must match the equivalency row exactly
//      (correctedCredits is returned when it mismatches).
//   3. For transfer_credit:
//      courseCode is looked up in courseCatalog.
//      credits_awarded is capped at the catalog course credit hours.
//      If courseCode is not in catalog: cap at 6 and include an advisor note.
//   4. courseCode is required for all non-placement types.

const PLACEMENT_TYPES = new Set(['act_placement'])
const SCORED_EXAM_TYPES = new Set(['ap_credit', 'test_out', 'ib_credit', 'act_credit', 'cambridge'])
const TRANSFER_TYPES = new Set(['transfer_credit'])
const TRANSFER_CAP_WITHOUT_CATALOG = 6

/**
 * @param {string}      creditType
 * @param {string|null} courseCode
 * @param {number}      creditsAwarded
 * @param {Array}       testEquivalencies  – test_equivalencies rows
 * @param {Object}      courseCatalog      – { [code]: { credits, ... } }
 * @returns {{ valid: boolean, error: string|null, correctedCredits: number|null }}
 */
export function validatePriorCredit(
  creditType,
  courseCode,
  creditsAwarded,
  testEquivalencies = [],
  courseCatalog     = {}
) {
  // ── Rule 1: placement-only types ─────────────────────────────────────
  if (PLACEMENT_TYPES.has(creditType)) {
    if (creditsAwarded !== 0) {
      return {
        valid:            false,
        error:            'Placement scores do not award credit hours. Set credits_awarded to 0.',
        correctedCredits: 0,
      }
    }
    return { valid: true, error: null, correctedCredits: null }
  }

  // ── Rule 4: courseCode required for non-placement types ──────────────
  if (!courseCode || !courseCode.trim()) {
    return {
      valid:            false,
      error:            'A course code is required for this credit type.',
      correctedCredits: null,
    }
  }

  // ── Rule 2: scored exam types — validate against test_equivalencies ───
  if (SCORED_EXAM_TYPES.has(creditType)) {
    const rows = (testEquivalencies ?? []).filter(
      row => row.test_type === creditType && row.awarded_course_code === courseCode
    )

    if (rows.length === 0) {
      return {
        valid: false,
        error: `No ${creditType} equivalency found for course ${courseCode}. ` +
               `This exam type may not award credit for this course.`,
        correctedCredits: null,
      }
    }

    // Use the first matching row's credits_awarded as the authoritative value
    const expected = rows[0].credits_awarded
    if (creditsAwarded !== expected) {
      return {
        valid:            false,
        error:            `Credits awarded must be ${expected} for ${courseCode} via ${creditType}. ` +
                          `The value has been corrected.`,
        correctedCredits: expected,
      }
    }

    return { valid: true, error: null, correctedCredits: null }
  }

  // ── Rule 3: transfer_credit — cap at catalog credit hours ────────────
  if (TRANSFER_TYPES.has(creditType)) {
    const catalogCourse = (courseCatalog ?? {})[courseCode]

    if (!catalogCourse) {
      // Course not in catalog — cap at 6 with advisor note
      if (creditsAwarded > TRANSFER_CAP_WITHOUT_CATALOG) {
        return {
          valid:            false,
          error:            `Course ${courseCode} is not in the TTU catalog. ` +
                            `Credits awarded are capped at ${TRANSFER_CAP_WITHOUT_CATALOG}. ` +
                            `Please consult an advisor if this course awards more.`,
          correctedCredits: TRANSFER_CAP_WITHOUT_CATALOG,
        }
      }
      return { valid: true, error: null, correctedCredits: null }
    }

    const catalogCredits = catalogCourse.credits ?? 0
    if (creditsAwarded > catalogCredits) {
      return {
        valid:            false,
        error:            `Credits awarded (${creditsAwarded}) exceeds the catalog credit hours ` +
                          `for ${courseCode} (${catalogCredits}). The value has been corrected.`,
        correctedCredits: catalogCredits,
      }
    }

    return { valid: true, error: null, correctedCredits: null }
  }

  // Unknown credit type (should not reach here if DB constraint is in place)
  return {
    valid:            false,
    error:            `Unknown credit type: ${creditType}`,
    correctedCredits: null,
  }
}
