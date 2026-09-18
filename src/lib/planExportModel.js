// planExportModel.js
// Shapes live DegreePlan state into a flat, print-ready model for the PDF
// export.  Pure: no Supabase calls, no React, no @react-pdf imports — the
// document component renders this, and the tests assert against it without
// ever producing a PDF.
//
// The exported document is read cold by an advisor who has never seen the
// app, so every row has to carry its own context.  On screen a pool slot can
// say "PHIL1030" and rely on its position in a card the student recognises;
// in print it says "PHIL1030 — Introduction to Philosophy" with "General
// Education" beside it, because nothing else on the page explains why a
// philosophy course is in a computer science degree.

import { POOL_LABELS } from './poolResolver'
import { formatTermLabel } from './semesterTerms'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Built by hand rather than toLocaleDateString: the label has to be identical
// in Node (tests) and in every browser, regardless of ICU data or locale.
function formatLongDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

// ── Course rows ───────────────────────────────────────────────────────────────

/**
 * One requirement slot as a printable row.
 *
 * Mirrors Semester.jsx's SlotRow: a pool slot shows its selected course when
 * one is chosen and the pool's display label when it isn't, and credits fall
 * back to flex_credits (then 3) exactly as the card does, so the PDF's per-
 * semester totals match the "15 cr" on screen.
 */
function slotRow(slot, planSlots, courses) {
  const poolLabel = POOL_LABELS[slot.class_code] ?? slot.class_code

  if (slot.is_pool) {
    const code = planSlots?.[slot.id]
    if (!code) {
      return {
        code:        null,
        title:       poolLabel,
        credits:     slot.flex_credits ?? 3,
        kind:        'pool-empty',
        requirement: poolLabel,
      }
    }
    const course = courses?.[code]
    return {
      code,
      title:       course?.name ?? null,
      credits:     course?.credits ?? slot.flex_credits ?? 3,
      kind:        'pool',
      requirement: poolLabel,
    }
  }

  const course = courses?.[slot.class_code]
  return {
    code:        slot.class_code,
    title:       course?.name ?? null,
    credits:     course?.credits ?? null,
    kind:        'required',
    requirement: null,
  }
}

/** One student-added course (student_free_add_slots) as a printable row. */
function freeAddRow(freeAdd, courses) {
  const course = courses?.[freeAdd.course_code]
  return {
    code:        freeAdd.course_code,
    title:       course?.name ?? null,
    credits:     course?.credits ?? null,
    kind:        'free-add',
    requirement: null,
  }
}

// ── buildPlanExportModel ──────────────────────────────────────────────────────

/**
 * Builds the printable model from the state DegreePlan already holds.
 *
 * Takes the grid's derived values rather than raw rows so the PDF cannot
 * disagree with the screen: `semesterMap` has already had archived slots
 * removed, and `semesterNumbers` is already the sorted, deduped list the grid
 * maps over.
 *
 * @param {Object}  input
 * @param {number[]} input.semesterNumbers   – sorted semester numbers (allSemesterNumbers)
 * @param {Object}  input.semesterMap        – { [semNum]: requirement_slots[] }, archived excluded
 * @param {Object}  input.freeAddBySemester  – { [semNum]: student_free_add_slots[] }
 * @param {Object}  input.planSlots          – { [slotId]: selectedCourseCode }
 * @param {Object}  input.courses            – { [courseCode]: { name, credits } }
 * @param {Object}  input.semesterTerms      – { [semNum]: { season, year } }
 * @param {Object}  input.profile            – student_profiles row (+ joined concentrations)
 * @param {Object}  input.graduation         – { season, year } | null
 * @param {Date}    input.generatedAt        – stamped on the document
 * @returns {Object} print-ready model
 */
export function buildPlanExportModel({
  semesterNumbers = [],
  semesterMap = {},
  freeAddBySemester = {},
  planSlots = {},
  courses = {},
  semesterTerms = {},
  profile = null,
  graduation = null,
  generatedAt = new Date(),
} = {}) {
  const semesters = semesterNumbers.map((semNum, idx) => {
    const slots    = semesterMap?.[semNum] ?? []
    const freeAdds = freeAddBySemester?.[semNum] ?? []

    // Source order is the screen's order: template slots as the grid lists
    // them, student additions after. Re-sorting would break "matches what's
    // on screen" for a student reading the two side by side.
    const rows = [
      ...slots.map(s => slotRow(s, planSlots, courses)),
      ...freeAdds.map(f => freeAddRow(f, courses)),
    ]

    return {
      semesterNumber: semNum,
      termLabel:      formatTermLabel(semesterTerms?.[semNum]) ?? null,
      ordinalLabel:   `Semester ${idx + 1}`,
      credits:        rows.reduce((sum, r) => sum + (r.credits ?? 0), 0),
      courses:        rows,
    }
  })

  const startLabel = profile?.start_season && profile?.start_year
    ? `${profile.start_season} ${profile.start_year}`
    : null

  return {
    concentrationName: profile?.concentrations?.name ?? null,
    totalHours:        profile?.concentrations?.total_hours ?? null,
    startLabel,
    graduationLabel:   formatTermLabel(graduation) ?? null,
    generatedOn:       formatLongDate(generatedAt),
    plannedCredits:    semesters.reduce((sum, s) => sum + s.credits, 0),
    semesters,
  }
}

// ── buildPlanExportFilename ───────────────────────────────────────────────────

/**
 * Download filename: "degree-plan-data-science-and-ai-2026-09-17.pdf".
 * Lowercase and hyphenated so it survives every filesystem a student might
 * hand it to.
 */
export function buildPlanExportFilename(model, date = new Date()) {
  const slug = (model?.concentrationName ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  const stamp = Number.isNaN(date?.getTime?.())
    ? null
    : [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ].join('-')

  return ['degree-plan', slug, stamp].filter(Boolean).join('-') + '.pdf'
}
