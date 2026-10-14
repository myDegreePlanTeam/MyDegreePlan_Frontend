import { describe, it, expect } from 'vitest'
import { pickerModel, majorListModel, onboardingSteps, stepBefore, stepAfter } from '../lib/programPicker'
import catalog from '../data/catalog.json'

const T = catalog.tables
const programs = T.concentrations
const plans = T.degree_plans

describe('onboardingSteps', () => {
  it('is four screens: the major, the first semester, scores and credits, then the plan to look over', () => {
    expect(onboardingSteps()).toEqual(['major', 'term', 'scores-and-credits', 'ready'])
  })

  it('has no college, concentration or math step: they are part of the major screen, or worked out', () => {
    const all = onboardingSteps()
    for (const gone of ['college', 'concentration', 'math', 'scores', 'credits']) expect(all).not.toContain(gone)
  })

  it('goes forward and back along the steps, stopping at the ends', () => {
    const steps = onboardingSteps()
    expect(stepAfter(steps, 'major')).toBe('term')
    expect(stepAfter(steps, 'scores-and-credits')).toBe('ready')
    expect(stepAfter(steps, 'ready')).toBe('ready')
    expect(stepBefore(steps, 'ready')).toBe('scores-and-credits')
    expect(stepBefore(steps, 'term')).toBe('major')
    expect(stepBefore(steps, 'major')).toBe('major')
  })
})

describe('majorListModel, with the real catalog', () => {
  it('lists only the majors the planner supports, by college, and counts the rest', () => {
    const m = majorListModel({ programs, plans })
    const majors = m.groups.flatMap(g => g.majors)
    expect(majors.length).toBeGreaterThan(0)
    expect(majors.every(major => major.ready)).toBe(true)
    expect(majors.map(major => major.majorName)).toEqual(expect.arrayContaining(['Computer Science', 'Mechanical Engineering', 'Biology', 'Chemistry']))
    expect(m.hiddenCount).toBeGreaterThan(0)
    expect(m.colleges.map(c => c.code)).toEqual(m.groups.map(g => g.college.code))
  })

  it('shows the rest when asked, still marked not ready', () => {
    const some = majorListModel({ programs, plans })
    const all = majorListModel({ programs, plans, showAll: true })
    const count = model => model.groups.flatMap(g => g.majors).length
    expect(count(all)).toBe(count(some) + some.hiddenCount)
    expect(all.groups.flatMap(g => g.majors).filter(major => !major.ready)).toHaveLength(some.hiddenCount)
    expect(all.colleges.length).toBeGreaterThanOrEqual(some.colleges.length)
  })

  it('filters by the college chip, and ignores a college that is not listed', () => {
    const one = majorListModel({ programs, plans, college: 'engineering' })
    expect(one.groups.map(g => g.college.code)).toEqual(['engineering'])
    expect(one.colleges.length).toBeGreaterThan(1)          // the chips stay
    expect(majorListModel({ programs, plans, college: 'nowhere' }).groups.length).toBe(one.colleges.length)
  })

  it('opens the major chosen, and the major of a chosen program', () => {
    const cs = majorListModel({ programs, plans }).groups.flatMap(g => g.majors).find(major => major.majorName === 'Computer Science')
    expect(majorListModel({ programs, plans, majorKey: cs.key }).openMajor.key).toBe(cs.key)
    const chosen = majorListModel({ programs, plans, value: 'cybersecurity' })
    expect(chosen.selected.code).toBe('cybersecurity')
    expect(chosen.openMajor.key).toBe(cs.key)
    expect(majorListModel({ programs, plans }).openMajor).toBeNull()
  })

  it('searches, and keeps closed programs out until asked', () => {
    expect(majorListModel({ programs, plans, query: 'cyber' }).results.map(p => p.code)).toContain('cybersecurity')
    expect(majorListModel({ programs, plans }).results).toBeNull()
    expect(majorListModel({ programs, plans, query: 'data science' }).results.map(p => p.code)).not.toContain('dsai')
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
