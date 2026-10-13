import { describe, it, expect } from 'vitest'
import { evaluateAddition, describeDelay, rankMinors, termNumberFromStart, FOUR_YEARS_TERMS } from '../lib/whatIf.js'
import { whatIfStudent, whatIfCandidate } from './support/whatIfBase.js'
import { T } from './support/realStudent.js'

const base = whatIfStudent('core', 29)

describe('termNumberFromStart', () => {
  const profile = { start_season: 'Fall', start_year: 2026 }
  it('counts Fall and Spring terms from the first one', () => {
    expect(termNumberFromStart(profile, { season: 'Fall', year: 2026 })).toBe(1)
    expect(termNumberFromStart(profile, { season: 'Spring', year: 2027 })).toBe(2)
    expect(termNumberFromStart(profile, { season: 'Spring', year: 2030 })).toBe(FOUR_YEARS_TERMS)
    expect(termNumberFromStart(profile, { season: 'Fall', year: 2030 })).toBe(9)
  })
  it('starts a Summer starter at the Fall that follows', () => {
    expect(termNumberFromStart({ start_season: 'Summer', start_year: 2026 }, { season: 'Fall', year: 2026 })).toBe(1)
  })
  it('is null when it cannot be told', () => {
    expect(termNumberFromStart({}, { season: 'Fall', year: 2026 })).toBeNull()
    expect(termNumberFromStart(profile, null)).toBeNull()
  })
})

describe('evaluateAddition, for a Computer Science Core student who starts in Fall 2026', () => {
  it('says a minor their courses already cover costs nothing: the Computer Science Minor', () => {
    const r = evaluateAddition({ base, candidate: whatIfCandidate('minor_computer_science', 'minor') })
    expect(r).toMatchObject({ addedHours: 0, newRequiredCourses: 0, sharedCourses: 3, hoursNeeded: 0, delayTerms: 0, pastFourYears: false, finishKnown: true })
    expect(r.withAddition.label).toBe(r.base.label)
    expect(describeDelay(r).state).toBe('none')
  })

  it('counts what a minor adds and what it needs: the Mathematics Minor adds 5 hours (10 less the 5 free elective hours)', () => {
    const r = evaluateAddition({ base, candidate: whatIfCandidate('minor_mathematics', 'minor') })
    expect(r).toMatchObject({ addedHours: 5, newRequiredCourses: 2, sharedCourses: 2, hoursNeeded: 10, delayTerms: 0 })
    expect(describeDelay(r).state).toBe('none')
  })

  it('warns that a secondary major pushes the finish past four years, with the dates: Mechanical Engineering', () => {
    const r = evaluateAddition({ base, candidate: whatIfCandidate('me', 'major') })
    expect(r.addedHours).toBe(98)
    expect(r.delayTerms).toBeGreaterThan(0)
    expect(r.pastFourYears).toBe(true)
    expect(r.alreadyPastFourYears).toBe(false)
    const d = describeDelay(r)
    expect(d.state).toBe('past_four_years')
    expect(d.sentence).toContain(r.base.label)
    expect(d.sentence).toContain(r.withAddition.label)
    expect(d.sentence).toMatch(/\d semesters? past four years/)
    expect(d.detail).toMatch(/98 hours more than your plan has now/)
  })

  it('matches what really adding the program gives: the finish of the merged plan, as the plan view lists it', () => {
    // 218 hours over 13 terms: the plan view's header for Computer Science Core with Mechanical Engineering
    const r = evaluateAddition({ base, candidate: whatIfCandidate('me', 'major') })
    expect(r.withAddition.fromStart).toBe(13)
    expect(r.withAddition.label).toBe('Fall 2032')
  })

  it('adds nothing for a minor the planner does not model: Aquatics', () => {
    const r = evaluateAddition({ base, candidate: whatIfCandidate('minor_aquatics', 'minor') })
    expect(r).toMatchObject({ addedHours: 0, newRequiredCourses: 0, delayTerms: 0 })
  })

  it('changes nothing it is given', () => {
    const baseJson = JSON.stringify(base)
    const candidate = whatIfCandidate('me', 'major')
    const candidateJson = JSON.stringify(candidate)
    evaluateAddition({ base, candidate })
    expect(JSON.stringify(base)).toBe(baseJson)
    expect(JSON.stringify(candidate)).toBe(candidateJson)
  })

  it('works the same for a student with a secondary major already', () => {
    const me = whatIfCandidate('me', 'major')
    const withMe = { ...base, added: [me] }
    const r = evaluateAddition({ base: withMe, candidate: whatIfCandidate('minor_physics', 'minor') })
    expect(r.finishKnown).toBe(true)
    expect(r.base.fromStart).toBe(13)
  })
})

describe('describeDelay', () => {
  const result = (over = {}) => ({
    candidate: { name: 'the Physics Minor', role: 'minor' }, addedHours: 6, sharedCourses: 1, finishKnown: true, delayTerms: 0, pastFourYears: false,
    alreadyPastFourYears: false, optimal: true, incomplete: false,
    base: { label: 'Spring 2030', fromStart: 8 }, withAddition: { label: 'Spring 2030', fromStart: 8 }, ...over,
  })

  it('has three states and never blocks: none, later, past four years', () => {
    expect(describeDelay(result()).state).toBe('none')
    const later = describeDelay(result({ delayTerms: 1, withAddition: { label: 'Fall 2030', fromStart: 9 } }))
    expect(later.state).toBe('later')
    expect(later.sentence).toContain('from Spring 2030 to Fall 2030 (1 more semester)')
    const past = describeDelay(result({ delayTerms: 2, pastFourYears: true, withAddition: { label: 'Spring 2031', fromStart: 10 } }))
    expect(past.state).toBe('past_four_years')
    expect(past.sentence).toContain('2 semesters past four years')
  })

  it('says so when the plan is already past four years and the addition changes nothing', () => {
    const d = describeDelay(result({ pastFourYears: true, alreadyPastFourYears: true, base: { label: 'Fall 2031', fromStart: 11 }, withAddition: { label: 'Fall 2031', fromStart: 11 } }))
    expect(d.state).toBe('past_four_years')
    expect(d.sentence).toContain('already 3 semesters past four years')
    expect(d.sentence).toContain('does not move it')
  })

  it('says "about" when the schedule might not be the fastest, and not when it is', () => {
    const exact = describeDelay(result({ delayTerms: 1, withAddition: { label: 'Fall 2030', fromStart: 9 } })).sentence
    const estimate = describeDelay(result({ delayTerms: 1, optimal: false, withAddition: { label: 'Fall 2030', fromStart: 9 } })).sentence
    expect(exact).not.toContain('about')
    expect(estimate).toContain('to about Fall 2030')
  })

  it('names a secondary major, says when no finish can be worked out, and is empty for nothing', () => {
    expect(describeDelay(result({ candidate: { name: 'Mathematics', role: 'major' } })).detail).toMatch(/^This secondary major adds 6 hours/)
    expect(describeDelay(result({ finishKnown: false, incomplete: true })).state).toBe('unknown')
    expect(describeDelay(null)).toEqual({ state: 'unknown', sentence: '', detail: null })
  })
})

describe('rankMinors: the minors the student is closest to completing', () => {
  const minors = T.concentrations.filter(c => c.kind === 'minor')
  const candidates = minors.map(m => whatIfCandidate(m.code, 'minor'))
  const { ranked, notRanked } = rankMinors({ base, candidates })

  it('ranks the minors the planner models and sets the others apart without a number', () => {
    expect(ranked.length + notRanked.length).toBe(minors.length)
    expect(ranked.length).toBe(29)
    expect(notRanked.every(c => c.slots.length === 0)).toBe(true)
  })

  it('puts the minor the plan already covers first and orders by the hours still needed', () => {
    expect(ranked[0].candidate.name).toBe('Computer Science Minor')
    expect(ranked[0].result.hoursNeeded).toBe(0)
    const hours = ranked.map(r => r.result.hoursNeeded)
    expect(hours).toEqual([...hours].sort((a, b) => a - b))
    const names = ranked.map(r => r.candidate.name)
    expect(names.indexOf('Mathematics Minor')).toBeLessThan(names.indexOf('Physics Minor'))   // 10 hours against 15
  })

  it('is stable: the same plan gives the same order', () => {
    expect(rankMinors({ base, candidates }).ranked.map(r => r.candidate.programId)).toEqual(ranked.map(r => r.candidate.programId))
  })
})
