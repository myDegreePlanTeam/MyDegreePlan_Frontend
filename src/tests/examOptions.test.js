import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import { optionKeysOf, awardsForOption, chooseOption } from '../lib/examOptions'

const rows = catalog.tables.test_equivalencies
const exam = (test_name, maxScore = 9) => rows.filter(r => r.test_name === test_name && r.test_type === 'ap_credit' && r.min_score <= maxScore)

describe('the AP rows that are one of several courses (Tennessee Tech\'s exam credit table)', () => {
  it('Physics C: Mechanics is PHYS 2010 or PHYS 2110, 4 hours either way', () => {
    const r = exam('Physics C: Mechanics')
    expect(r.map(x => [x.awarded_course_code, x.option_key, x.credits_awarded])).toEqual([
      ['PHYS2010', 'phys_algebra', 4], ['PHYS2110', 'phys_calculus', 4],
    ])
  })

  it('Physics C: Electricity and Magnetism is PHYS 2020 or PHYS 2120', () => {
    expect(exam('Physics C: Electricity and Magnetism').map(x => x.awarded_course_code).sort()).toEqual(['PHYS2020', 'PHYS2120'])
  })

  it('Biology is BIOL 1010 (& 1020 at a 4) or BIOL 1113 (& 1123 at a 4)', () => {
    const three = exam('Biology', 3).map(x => x.awarded_course_code).sort()
    expect(three).toEqual(['BIOL1010', 'BIOL1113'])
    const four = exam('Biology', 4)
    expect(four.filter(x => x.option_key === 'biol_1010').map(x => x.awarded_course_code).sort()).toEqual(['BIOL1010', 'BIOL1020'])
    expect(four.filter(x => x.option_key === 'biol_1113').map(x => x.awarded_course_code).sort()).toEqual(['BIOL1113', 'BIOL1123'])
  })

  it('every course of an exam appears once per choice, and a key is only used for exams that have two or more', () => {
    const byExam = {}
    for (const r of rows.filter(x => x.option_key)) (byExam[`${r.test_type}|${r.test_name}`] ??= []).push(r)
    for (const [name, list] of Object.entries(byExam)) {
      expect(new Set(list.map(x => x.option_key)).size, name).toBeGreaterThanOrEqual(2)
      expect(new Set(list.map(x => `${x.option_key}|${x.awarded_course_code}`)).size, name).toBe(list.length)
    }
  })

  it('an exam without a choice carries no option_key', () => {
    expect(exam('Calculus AB').every(x => x.option_key === null)).toBe(true)
    expect(exam('Physics 1: Algebra-Based').every(x => x.option_key === null)).toBe(true)
  })
})

describe('optionKeysOf / awardsForOption', () => {
  const awards = [
    { awarded_course_code: 'A', option_key: null },
    { awarded_course_code: 'B', option_key: 'x' },
    { awarded_course_code: 'C', option_key: 'y' },
    { awarded_course_code: 'D', option_key: 'x' },
  ]
  it('lists the keys in order and keeps the unkeyed awards with the chosen choice', () => {
    expect(optionKeysOf(awards)).toEqual(['x', 'y'])
    expect(awardsForOption(awards, 'x').map(a => a.awarded_course_code)).toEqual(['A', 'B', 'D'])
    expect(awardsForOption(awards, 'y').map(a => a.awarded_course_code)).toEqual(['A', 'C'])
    expect(optionKeysOf([])).toEqual([])
  })
})

describe('chooseOption: the plan decides when it can', () => {
  const physics = [
    { awarded_course_code: 'PHYS2010', satisfies_pool: 'SCIENCE', option_key: 'phys_algebra' },
    { awarded_course_code: 'PHYS2110', satisfies_pool: 'SCIENCE', option_key: 'phys_calculus' },
  ]
  const biology = [
    { awarded_course_code: 'BIOL1113', satisfies_pool: 'SCIENCE', option_key: 'biol_1113' },
    { awarded_course_code: 'BIOL1010', satisfies_pool: null, option_key: 'biol_1010' },
  ]

  it('a plan that requires PHYS 2110 takes the calculus course', () => {
    const slots = [{ id: 1, class_code: 'PHYS2110', is_pool: false }, { id: 2, class_code: 'SCIENCE', is_pool: true }]
    expect(chooseOption(physics, slots)).toEqual({ key: 'phys_calculus', reason: 'required' })
  })

  it('a plan that requires PHYS 2010 takes the algebra course', () => {
    expect(chooseOption(physics, [{ id: 1, class_code: 'PHYS2010', is_pool: false }])).toEqual({ key: 'phys_algebra', reason: 'required' })
  })

  it('a plan whose science pool takes either leaves it to the student', () => {
    expect(chooseOption(physics, [{ id: 2, class_code: 'SCIENCE', is_pool: true }])).toBeNull()
  })

  it('a plan with a science pool takes the biology course the pool offers over one it does not', () => {
    expect(chooseOption(biology, [{ id: 2, class_code: 'SCIENCE', is_pool: true }])).toEqual({ key: 'biol_1113', reason: 'pool' })
  })

  it('ignores a slot a prior credit has already archived', () => {
    const slots = [{ id: 1, class_code: 'PHYS2110', is_pool: false }]
    expect(chooseOption(physics, slots, { 1: true })).toBeNull()
  })

  it('decides nothing for a plan that wants neither, or for an exam with no choice', () => {
    expect(chooseOption(physics, [{ id: 9, class_code: 'CSC1300', is_pool: false }])).toBeNull()
    expect(chooseOption([{ awarded_course_code: 'MATH1530', option_key: null }], [])).toBeNull()
  })
})
