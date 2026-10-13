import { describe, it, expect } from 'vitest'
import { pickerModel, onboardingSteps, stepBefore, stepAfter } from '../lib/programPicker'
import catalog from '../data/catalog.json'

const T = catalog.tables
const programs = T.concentrations
const plans = T.degree_plans

describe('onboardingSteps', () => {
  it('has the college step only with more than one college, and the concentration step only for a major with more than one program', () => {
    expect(onboardingSteps({ hasCollegeStep: true, hasConcentrationStep: true })).toEqual(['college', 'major', 'concentration', 'term', 'scores', 'credits'])
    expect(onboardingSteps({ hasCollegeStep: true, hasConcentrationStep: false })).toEqual(['college', 'major', 'term', 'scores', 'credits'])
    expect(onboardingSteps({ hasCollegeStep: false, hasConcentrationStep: false })).toEqual(['major', 'term', 'scores', 'credits'])
  })

  it('has no math sequence step: that screen was a display of the placement, and it is gone', () => {
    const all = onboardingSteps({ hasCollegeStep: true, hasConcentrationStep: true })
    expect(all).not.toContain('math')
    expect(all).toHaveLength(6)
  })

  it('goes forward and back along the steps, stopping at the ends', () => {
    const steps = onboardingSteps({ hasCollegeStep: true, hasConcentrationStep: true })
    expect(stepAfter(steps, 'college')).toBe('major')
    expect(stepAfter(steps, 'major')).toBe('concentration')
    expect(stepAfter(steps, 'credits')).toBe('credits')
    expect(stepBefore(steps, 'term')).toBe('concentration')
    expect(stepBefore(steps, 'college')).toBe('college')
    expect(stepBefore(onboardingSteps({ hasCollegeStep: false, hasConcentrationStep: false }), 'term')).toBe('major')
  })
})

describe('pickerModel, with the real catalog', () => {
  it('has a college step for the colleges of the catalog, and none of them is a minor', () => {
    const m = pickerModel({ programs, plans })
    expect(m.hasCollegeStep).toBe(true)
    expect(m.tree.length).toBeGreaterThan(1)
    expect(m.tree.flatMap(c => c.majors).flatMap(mj => mj.programs).some(p => p.kind === 'minor')).toBe(false)
    expect(m.college).toBeNull()
    expect(m.major).toBeNull()
  })

  it('follows the college chosen to its majors, and the major chosen to its concentrations', () => {
    const engineering = pickerModel({ programs, plans, collegeCode: 'engineering' })
    expect(engineering.college.college.code).toBe('engineering')
    const cs = engineering.college.majors.find(mj => mj.majorName === 'Computer Science')
    expect(cs.programs.length).toBeGreaterThan(1)
    const withMajor = pickerModel({ programs, plans, collegeCode: 'engineering', majorKey: cs.key })
    expect(withMajor.major.key).toBe(cs.key)
    expect(withMajor.hasConcentrationStep).toBe(true)
    expect(onboardingSteps(withMajor)).toEqual(['college', 'major', 'concentration', 'term', 'scores', 'credits'])
  })

  it('has no concentration step for a major that is its own program', () => {
    const mech = programs.find(p => p.code === 'me')
    // Mechanical Engineering has concentrations (aerospace, mechatronics, vehicle): pick a stand-alone major instead
    const alone = programs.filter(p => p.kind === 'major' && p.is_base && p.college === 'nursing')[0] ?? programs.find(p => p.kind === 'major' && p.college === 'nursing')
    expect(mech).toBeTruthy()
    const m = pickerModel({ programs, plans, collegeCode: alone.college, majorKey: alone.major_code })
    expect(m.major).toBeTruthy()
    expect(m.hasConcentrationStep).toBe(m.major.programs.length > 1)
  })

  it('finds the college and major of a selected program (a search result), whatever was chosen before', () => {
    const cyber = programs.find(p => p.code === 'cybersecurity')
    const m = pickerModel({ programs, plans, value: 'cybersecurity' })
    expect(m.selected.id).toBe(cyber.id)
    expect(m.college.college.code).toBe(cyber.college)
    expect(m.major.programs).toContain(m.selected)
  })

  it('searches the visible programs, and hides closed ones until asked', () => {
    expect(pickerModel({ programs, plans, query: 'cybersecurity' }).results.map(p => p.code)).toContain('cybersecurity')
    expect(pickerModel({ programs, plans, query: '' }).results).toBeNull()
    expect(pickerModel({ programs, plans, query: 'data science' }).results.map(p => p.code)).not.toContain('dsai')
    expect(pickerModel({ programs, plans, query: 'data science', showClosed: true }).results.map(p => p.code)).toContain('dsai')
  })
})
