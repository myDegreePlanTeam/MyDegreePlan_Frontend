// apExamTable.test.js
//
// What an AP score earns, checked against the university's own published AP exam credit table (read 2026-10-08). Each line is what the table prints for one exam and score: the courses and the hours. A choice
// ("PHYS 2010 or 2110") is a list of alternatives, each a list of courses. The planner stores credit as rows that add to
// the ones below them (Biology 4 adds BIOL 1020 to a 3) or, for Calculus AB, replace them (a 4 earns MATH 1910 instead of
// MATH 1830), so this test is what keeps the rows and the table in step: a wrong row fails here, not in a student's plan.
//
// Not in the seed, so not here: the Art and Design exams, Environmental Science (electives with no course code), and the
// ENGL SO1B half of English Literature and Composition (no catalog course).

import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { appliesAtScore } from '../lib/examOptions'

const rows = catalog.tables.test_equivalencies.filter(r => r.test_type === 'ap_credit')

// the alternatives an exam earns at a score: [{ codes: sorted, hours }]
function earned(exam, score) {
  const at = rows.filter(r => r.test_name === exam && appliesAtScore(r, score))
  const plain = at.filter(r => !r.option_key)
  const keys = [...new Set(at.map(r => r.option_key).filter(Boolean))]
  const groups = keys.length ? keys.map(k => [...plain, ...at.filter(r => r.option_key === k)]) : [plain]
  return groups
    .map(g => ({ codes: g.map(r => r.awarded_course_code).sort(), hours: g.reduce((s, r) => s + r.credits_awarded, 0) }))
    .sort((a, b) => a.codes.join().localeCompare(b.codes.join()))
}

const one = (hours, ...codes) => [{ codes: [...codes].sort(), hours }]
const choice = (hours, ...alternatives) => alternatives
  .map(codes => ({ codes: [...codes].sort(), hours }))
  .sort((a, b) => a.codes.join().localeCompare(b.codes.join()))

// [exam, [scores that earn it], expected]
const TABLE = [
  ['Precalculus', [3, 4, 5], one(5, 'MATH1730')],
  ['Calculus AB', [3], one(3, 'MATH1830')],
  ['Calculus AB', [4, 5], one(4, 'MATH1910')],            // a 4 replaces the 3: not MATH1830 as well
  ['Calculus AB Subscore', [3, 4, 5], one(3, 'MATH1830')],
  ['Calculus BC', [3, 4, 5], one(8, 'MATH1910', 'MATH1920')],
  ['Chemistry (Non-STEM)', [3], one(4, 'CHEM1010')],
  ['Chemistry (Non-STEM)', [4, 5], one(8, 'CHEM1010', 'CHEM1020')],
  ['Chemistry (STEM)', [4], one(4, 'CHEM1110')],
  ['Chemistry (STEM)', [5], one(8, 'CHEM1110', 'CHEM1120')],
  ['Computer Science A', [3, 4, 5], one(3, 'CSC1200')],
  ['Computer Science Principles', [3, 4, 5], one(3, 'CSC1200')],
  ['Economics: Microeconomics', [3, 4, 5], one(3, 'ECON2010')],
  ['Economics: Macroeconomics', [3, 4, 5], one(3, 'ECON2020')],
  ['English Language and Composition', [3], one(3, 'ENGL1010')],
  ['English Language and Composition', [4, 5], one(6, 'ENGL1010', 'ENGL1020')],
  ['European History', [3, 4, 5], one(6, 'HIST2210', 'HIST2220')],
  ['World History Modern', [3, 4, 5], one(6, 'HIST2310', 'HIST2320')],
  ['US History', [3, 4, 5], one(6, 'HIST2010', 'HIST2020')],
  ['French Language and Culture', [3], one(6, 'FREN1010', 'FREN1020')],
  ['French Language and Culture', [4], one(9, 'FREN1010', 'FREN1020', 'FREN2010')],
  ['French Language and Culture', [5], one(12, 'FREN1010', 'FREN1020', 'FREN2010', 'FREN2020')],
  ['German Language and Culture', [3], one(6, 'GERM1010', 'GERM1020')],
  ['German Language and Culture', [4], one(9, 'GERM1010', 'GERM1020', 'GERM2010')],
  ['German Language and Culture', [5], one(12, 'GERM1010', 'GERM1020', 'GERM2010', 'GERM2020')],
  ['Spanish Language and Culture', [3], one(6, 'SPAN1010', 'SPAN1020')],
  ['Spanish Language and Culture', [4], one(9, 'SPAN1010', 'SPAN1020', 'SPAN2010')],
  ['Spanish Language and Culture', [5], one(12, 'SPAN1010', 'SPAN1020', 'SPAN2010', 'SPAN2020')],
  ['Government and Politics: US', [3, 4, 5], one(3, 'POLS1030')],
  ['Human Geography', [3, 4, 5], one(3, 'GEOG1012')],
  ['Statistics', [3, 4, 5], one(3, 'MATH1530')],
  ['Psychology', [3, 4, 5], one(3, 'PSY1030')],
  ['Physics 1: Algebra-Based', [3, 4, 5], one(4, 'PHYS2010')],
  ['Physics 2: Algebra-Based', [3, 4, 5], one(4, 'PHYS2020')],
  // credit that is one of several courses
  ['Biology', [3], choice(4, ['BIOL1010'], ['BIOL1113'])],
  ['Biology', [4, 5], choice(8, ['BIOL1010', 'BIOL1020'], ['BIOL1113', 'BIOL1123'])],
  ['Physics C: Mechanics', [3, 4, 5], choice(4, ['PHYS2010'], ['PHYS2110'])],
  ['Physics C: Electricity and Magnetism', [3, 4, 5], choice(4, ['PHYS2020'], ['PHYS2120'])],
]

describe("AP credit against the university's table", () => {
  for (const [exam, scores, expected] of TABLE) {
    for (const score of scores) {
      it(`${exam}, score ${score}`, () => {
        expect(earned(exam, score)).toEqual(expected)
      })
    }
  }

  it('a score below the lowest row earns nothing', () => {
    expect(earned('Calculus BC', 2)).toEqual([{ codes: [], hours: 0 }])
    expect(earned('Chemistry (STEM)', 3)).toEqual([{ codes: [], hours: 0 }])
  })

  it('every AP exam in the seed is in the table above, bar the ones with a known gap', () => {
    const known = new Set(TABLE.map(t => t[0]))
    const gaps = new Set(['English Literature and Composition'])   // ENGL SO1B has no catalog course
    const missing = [...new Set(rows.map(r => r.test_name))].filter(n => !known.has(n) && !gaps.has(n))
    expect(missing).toEqual([])
  })
})

describe('appliesAtScore', () => {
  it('a row applies from its min_score up, and stops at superseded_at when it has one', () => {
    const plain = { min_score: 3, superseded_at: null }
    expect([2, 3, 5].map(s => appliesAtScore(plain, s))).toEqual([false, true, true])
    const replaced = { min_score: 3, superseded_at: 4 }
    expect([2, 3, 4, 5].map(s => appliesAtScore(replaced, s))).toEqual([false, true, false, false])
    expect(appliesAtScore({ min_score: null }, 1)).toBe(true)
  })
})
