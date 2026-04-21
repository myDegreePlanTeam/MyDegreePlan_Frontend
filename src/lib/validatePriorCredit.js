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
// validatePriorCredit(creditType, courseCode, creditsAwarded,
//                     testEquivalencies, courseCatalog, userScore = null)
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
//                        [{ test_type, awarded_course_code, credits_awarded,
//                          min_score, ... }]
//   courseCatalog      — map of { [courseCode]: { credits, ... } }
//   userScore          — optional. Student's actual exam score. When provided
//                        AND creditType is a scored exam, only equivalency
//                        rows with min_score <= userScore qualify. Legacy
//                        callers that don't know the score pass null (the
//                        default) and get the pre-BUG-8 behavior.
//
// Rules:
//   1. Placement-only types (act_placement) must have credits_awarded = 0.
//   2. For scored exam types (ap_credit, test_out, ib_credit, act_credit, cambridge):
//      test_equivalencies must have a row where test_type = creditType
//      AND awarded_course_code = courseCode.
//      credits_awarded must match the equivalency row exactly
//      (correctedCredits is returned when it mismatches).
//      When userScore is non-null, the row must additionally satisfy
//      min_score <= userScore (BUG-8: prevents AP-3 students from claiming
//      credit gated behind an AP-5 row via direct INSERT).
//   3. For transfer_credit:
//      courseCode must exist in courseCatalog — otherwise the entry is rejected
//      (BUG-20: prevents data corruption from freeform course-code entry).
//      credits_awarded is capped at the catalog course credit hours.
//   4. courseCode is required for all non-placement types.

const PLACEMENT_TYPES = new Set(['act_placement'])
const SCORED_EXAM_TYPES = new Set(['ap_credit', 'test_out', 'ib_credit', 'act_credit', 'cambridge'])
const TRANSFER_TYPES = new Set(['transfer_credit'])

/**
 * @param {string}      creditType
 * @param {string|null} courseCode
 * @param {number}      creditsAwarded
 * @param {Array}       testEquivalencies  – test_equivalencies rows
 * @param {Object}      courseCatalog      – { [code]: { credits, ... } }
 * @param {number|null} userScore          – optional exam score for score-gating
 * @returns {{ valid: boolean, error: string|null, correctedCredits: number|null }}
 */
export function validatePriorCredit(
  creditType,
  courseCode,
  creditsAwarded,
  testEquivalencies = [],
  courseCatalog     = {},
  userScore         = null
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
    const allRows = (testEquivalencies ?? []).filter(
      row => row.test_type === creditType && row.awarded_course_code === courseCode
    )

    if (allRows.length === 0) {
      return {
        valid: false,
        error: `No ${creditType} equivalency found for course ${courseCode}. ` +
               `This exam type may not award credit for this course.`,
        correctedCredits: null,
      }
    }

    // BUG-8: when the caller knows the student's score, reject equivalency
    // rows whose min_score exceeds it so AP-3 students can't claim an
    // AP-5-only award by bypassing the wizard.  Legacy callers pass null
    // and retain the pre-BUG-8 behavior of accepting any matching row.
    const rows = userScore == null
      ? allRows
      : allRows.filter(r => r.min_score == null || r.min_score <= userScore)

    if (rows.length === 0) {
      return {
        valid: false,
        error: `A score of ${userScore} does not qualify for ${courseCode} ` +
               `via ${creditType}. Check the minimum required score.`,
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

  // ── Rule 3: transfer_credit — course must exist in catalog ───────────
  if (TRANSFER_TYPES.has(creditType)) {
    const catalogCourse = (courseCatalog ?? {})[courseCode]

    if (!catalogCourse) {
      return {
        valid:            false,
        error:            `We don't recognize course code "${courseCode}". ` +
                          `Please check the TTU catalog or contact your advisor.`,
        correctedCredits: null,
      }
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
