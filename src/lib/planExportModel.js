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

import { POOL_COURSES, POOL_LABELS, SCIENCE_SEQUENCES } from './poolResolver'
import { formatTermLabel } from './semesterTerms'

// The app is scoped to TTU Computer Science (BS) only; see SESSION_PREAMBLE.
// These print in the degree-map header and move into the concentration row
// if another department is ever added.
const DEGREE = 'BS'
const MAJOR  = 'Computer Science'

// Year bands on the degree map. Semesters are paired in plan order, so a plan
// longer than eight semesters (or one with a summer term) keeps going with
// FIFTH YEAR, SIXTH YEAR… rather than being cut off.
const YEAR_LABELS = [
  'FIRST YEAR', 'SOPHOMORE YEAR', 'JUNIOR YEAR', 'SENIOR YEAR',
  'FIFTH YEAR', 'SIXTH YEAR', 'SEVENTH YEAR', 'EIGHTH YEAR',
]

// A pool gets a numbered footnote listing its options when the list is short
// enough to be useful on paper. GEN_ED and the CSC elective pools run to 20+
// courses; printing them would crowd out the plan itself.
const MAX_FOOTNOTE_OPTIONS = 6

const CREDIT_SOURCE_LABELS = {
  ap_credit:       'AP',
  transfer_credit: 'Transfer',
  test_out:        'CLEP',
  ib_credit:       'IB',
  act_credit:      'ACT',
  cambridge:       'Cambridge',
}

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

/** "CSC1300" → "CSC 1300", the way the catalog and the degree map print it. */
export function formatCourseCode(code) {
  if (!code) return code
  return code.replace(/^([A-Z]+)(\d)/, '$1 $2')
}

/**
 * Catalog year from the student's start term: Fall 2026 → "2026-2027",
 * Spring 2027 → "2026-2027". An assumption — the app does not store a catalog
 * year — resting on students following the catalog in effect when they enter.
 */
export function deriveCatalogYear(season, year) {
  if (!season || !year) return null
  const first = season === 'Fall' ? year : year - 1
  return `${first}-${first + 1}`
}

/** Footnote text for a pool, or null when the pool has no printable option list. */
function poolFootnote(poolCode) {
  const label = POOL_LABELS[poolCode] ?? poolCode
  if (poolCode === 'SCIENCE') {
    const pairs = SCIENCE_SEQUENCES.map(seq =>
      seq.courses.map(formatCourseCode).join(' and '))
    return `${label}: one two-course sequence — ${pairs.join('; or ')}.`
  }
  const options = POOL_COURSES[poolCode]
  if (!options?.length || options.length > MAX_FOOTNOTE_OPTIONS) return null
  const codes = options.map(formatCourseCode)
  const list  = codes.length === 1
    ? codes[0]
    : `${codes.slice(0, -1).join(', ')}, or ${codes[codes.length - 1]}`
  return `${label}: ${list}.`
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
        poolCode:    slot.class_code,
      }
    }
    const course = courses?.[code]
    return {
      code,
      title:       course?.name ?? null,
      credits:     course?.credits ?? slot.flex_credits ?? 3,
      kind:        'pool',
      requirement: poolLabel,
      poolCode:    slot.class_code,
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
 * @param {Object}  input.semesterCompleted  – { [semNum]: boolean } (student_semester_notes.completed_by_student)
 * @param {Object[]} input.priorCredits      – prior_credits rows, listed in the Notes box
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
  semesterCompleted = {},
  priorCredits = [],
} = {}) {
  // Course status for the legend. Completion is semester-level only (core
  // principle 3), so every course in a completed semester is "completed",
  // and the first semester not yet marked complete is "recommended" — it is
  // what the student should register for next. In Progress and Pending Credit
  // stay in the legend unused until the app tracks them.
  const recommendedSemNum = semesterNumbers.find(n => !semesterCompleted?.[n])

  // Footnote numbers, assigned in first-appearance order so the "1" a reader
  // meets first on the page is footnote 1.
  const footnoteIndex = {}
  const footnotes     = []
  function footnoteFor(poolCode) {
    if (!poolCode) return null
    if (footnoteIndex[poolCode] !== undefined) return footnoteIndex[poolCode]
    const text = poolFootnote(poolCode)
    footnoteIndex[poolCode] = text ? footnotes.push(text) : null
    return footnoteIndex[poolCode]
  }

  const semesters = semesterNumbers.map((semNum, idx) => {
    const slots    = semesterMap?.[semNum] ?? []
    const freeAdds = freeAddBySemester?.[semNum] ?? []

    // Source order is the screen's order: template slots as the grid lists
    // them, student additions after. Re-sorting would break "matches what's
    // on screen" for a student reading the two side by side.
    const rows = [
      ...slots.map(s => slotRow(s, planSlots, courses)),
      ...freeAdds.map(f => freeAddRow(f, courses)),
    ].map(r => ({ ...r, footnote: footnoteFor(r.poolCode) }))

    const status = semesterCompleted?.[semNum]
      ? 'completed'
      : semNum === recommendedSemNum ? 'recommended' : null

    return {
      semesterNumber: semNum,
      termLabel:      formatTermLabel(semesterTerms?.[semNum]) ?? null,
      ordinalLabel:   `Semester ${idx + 1}`,
      credits:        rows.reduce((sum, r) => sum + (r.credits ?? 0), 0),
      status,
      courses:        rows,
    }
  })

  // Two semesters per year band, in plan order.
  const years = []
  for (let i = 0; i < semesters.length; i += 2) {
    const n = i / 2
    years.push({
      label:     YEAR_LABELS[n] ?? `YEAR ${n + 1}`,
      semesters: semesters.slice(i, i + 2),
    })
  }

  const startLabel = profile?.start_season && profile?.start_year
    ? `${profile.start_season} ${profile.start_year}`
    : null

  // Credit-bearing prior credits only: placement rows (credits_awarded 0)
  // are what the ACT box is for.
  const priorCreditRows = (priorCredits ?? [])
    .filter(pc => (pc.credits_awarded ?? 0) > 0)
    .map(pc => {
      const code = pc.satisfies_course_code ?? null
      return {
        code,
        title:   code ? (courses?.[code]?.name ?? null) : (pc.note ?? null),
        credits: pc.credits_awarded,
        source:  CREDIT_SOURCE_LABELS[pc.credit_type] ?? pc.credit_type ?? null,
      }
    })

  return {
    concentrationName: profile?.concentrations?.name ?? null,
    totalHours:        profile?.concentrations?.total_hours ?? null,
    degree:            DEGREE,
    major:             MAJOR,
    catalogYear:       deriveCatalogYear(profile?.start_season, profile?.start_year),
    startLabel,
    graduationLabel:   formatTermLabel(graduation) ?? null,
    generatedOn:       formatLongDate(generatedAt),
    plannedCredits:    semesters.reduce((sum, s) => sum + s.credits, 0),
    actScores: {
      composite: profile?.act_composite ?? null,
      english:   profile?.act_english   ?? null,
      math:      profile?.act_math      ?? null,
      reading:   profile?.act_reading   ?? null,
      science:   profile?.act_science   ?? null,
    },
    priorCredits:      priorCreditRows,
    footnotes,
    semesters,
    years,
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
