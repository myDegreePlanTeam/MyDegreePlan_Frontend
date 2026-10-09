// slotOrder.test.js
//
// A semester lists its courses alphabetical by subject, then numerical by course number, identically on web, the Windows app and
// the Docker install. (Before, it listed them by slot id, which differs between the platforms' data.)

import { describe, it, expect } from 'vitest'
import { compareClassCodes, groupSlotsBySemester, parseClassCode, sortByCourseCode } from '../lib/slotOrder'

const sorted = codes => [...codes].sort(compareClassCodes)

describe('parseClassCode', () => {
  it('splits a course code into subject letters, number and any suffix', () => {
    expect(parseClassCode('CSC1300')).toEqual({ letters: 'CSC', number: 1300, rest: '' })
    expect(parseClassCode('csc 1300l')).toEqual({ letters: 'CSC', number: 1300, rest: 'L' })
  })
  it('treats anything else (a pool label) as text', () => {
    expect(parseClassCode('Humanities & Cultural Expression')).toEqual({ letters: 'HUMANITIES & CULTURAL EXPRESSION', number: -1, rest: '' })
    expect(parseClassCode(null)).toEqual({ letters: '', number: -1, rest: '' })
  })
})

describe('compareClassCodes', () => {
  it('is alphabetical by subject, then numerical by course number', () => {
    expect(sorted(['MATH1910', 'ENGL1010', 'CSC1300', 'HIST2010', 'CSC1020'])).toEqual(['CSC1020', 'CSC1300', 'ENGL1010', 'HIST2010', 'MATH1910'])
  })

  it('compares numbers as numbers, not text (CSC 910 before CSC 1020, CSC 2000 before CSC 10000)', () => {
    expect(sorted(['CSC1020', 'CSC910', 'CSC10000', 'CSC2000'])).toEqual(['CSC910', 'CSC1020', 'CSC2000', 'CSC10000'])
  })

  it('is case- and space-insensitive: "csc 1300" sorts with "CSC1300"', () => {
    expect(compareClassCodes('csc 1300', 'CSC1300')).toBe(0)
    expect(sorted(['math 1910', 'CSC1300'])).toEqual(['CSC1300', 'math 1910'])
  })

  it('orders a lab or letter suffix after the course it belongs to', () => {
    expect(sorted(['CSC1300L', 'CSC1300', 'CSC1310'])).toEqual(['CSC1300', 'CSC1300L', 'CSC1310'])
  })

  it('sorts a pool label alphabetically among the codes', () => {
    expect(sorted(['MATH1910', 'Humanities & Cultural Expression', 'CSC1300', 'Natural Science'])).toEqual(['CSC1300', 'Humanities & Cultural Expression', 'MATH1910', 'Natural Science'])
  })

  it('puts a label before the numbered codes of the same name', () => {
    expect(sorted(['SCI1010', 'SCI'])).toEqual(['SCI', 'SCI1010'])
  })
})

describe('groupSlotsBySemester', () => {
  const slot = (id, code, semester_number = null, is_pool = false) => ({ id, class_code: code, semester_number, is_pool })
  const codeOf = s => s.class_code

  it('lists each semester in class-code order whatever order the slots (or their ids) came in', () => {
    // The ids are in the Docker install's order and the web's order on purpose: the result must not depend on either.
    const docker = [slot(134, 'CSC1020', 1), slot(135, 'CSC1300', 1), slot(136, 'MATH1910', 1), slot(137, 'ENGL1010', 1), slot(138, 'HIST2010', 1)]
    const web = [slot(223, 'ENGL1010', 1), slot(231, 'MATH1910', 1), slot(234, 'CSC1020', 1), slot(235, 'CSC1300', 1), slot(258, 'HIST2010', 1)]
    const codes = slots => groupSlotsBySemester({ slots, codeOf })[1].map(s => s.class_code)
    expect(codes(docker)).toEqual(['CSC1020', 'CSC1300', 'ENGL1010', 'HIST2010', 'MATH1910'])
    expect(codes(web)).toEqual(codes(docker))
  })

  it('uses the student\'s placement over the template\'s, leaves out archived and unplaced slots, and loses no class', () => {
    const slots = [slot(1, 'MATH1910', 1), slot(2, 'CSC1020', 1), slot(3, 'ENGL1010', 1), slot(4, 'HIST2010', null), slot(5, 'ART1000', 2)]
    const grouped = groupSlotsBySemester({ slots, semesterOverrides: { 1: 2 }, archived: { 3: 'prior_credit' }, codeOf })
    expect(grouped[1].map(s => s.class_code)).toEqual(['CSC1020'])
    expect(grouped[2].map(s => s.class_code)).toEqual(['ART1000', 'MATH1910'])
    expect(Object.values(grouped).flat()).toHaveLength(3)   // 5 slots - 1 archived - 1 unplaced
  })

  it('sorts by the code the row shows (a picked course, or the pool label), not the template key', () => {
    const slots = [slot(1, 'FF_SOCIAL', 1, true), slot(2, 'CSC1300', 1), slot(3, 'GEN_ED', 1, true)]
    const shown = { 1: 'HIST2010', 3: 'Natural Science' }   // a picked course; an unpicked pool's label
    const codes = groupSlotsBySemester({ slots, codeOf: s => shown[s.id] ?? s.class_code })[1].map(s => s.id)
    expect(codes).toEqual([2, 1, 3])   // CSC1300, HIST2010, Natural Science
  })

  it('breaks a tie by slot id, so the order never wobbles', () => {
    const slots = [slot(9, 'ENGL1010', 1), slot(3, 'ENGL1010', 1)]
    expect(groupSlotsBySemester({ slots, codeOf })[1].map(s => s.id)).toEqual([3, 9])
  })
})

describe('sortByCourseCode', () => {
  it('orders added courses the same way and does not change the input', () => {
    const rows = [{ id: 2, course_code: 'MATH1910' }, { id: 1, course_code: 'CSC1300' }]
    expect(sortByCourseCode(rows).map(r => r.course_code)).toEqual(['CSC1300', 'MATH1910'])
    expect(rows[0].course_code).toBe('MATH1910')
  })
})
