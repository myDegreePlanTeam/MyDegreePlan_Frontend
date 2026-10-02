import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getSeasonRestriction } from '../lib/semesterRestrictions.js'

// The 2026-2027 degree maps as they reach the app: degree_plans.json, generated in the sibling MyDegreePlan_Prototype
// repo from the specs (see its degree-specs/README.md). Skipped when that repo is not checked out next to this one.

const PROTO = fileURLToPath(new URL('../../../MyDegreePlan_Prototype/', import.meta.url))
const HAVE = existsSync(`${PROTO}degree_plans.json`)
const plansFile = HAVE ? JSON.parse(readFileSync(`${PROTO}degree_plans.json`, 'utf8')) : { plans: [], programs: [] }
const plan = (program, year = '2026-2027') => plansFile.plans.find(p => p.program === program && p.catalogYear === year)

describe.skipIf(!HAVE)('2026-2027 degree maps', () => {
  it('has a plan for each of the four programs the department sent', () => {
    for (const code of ['core', 'cybersecurity', 'hpc', 'ai']) expect(plan(code), code).toBeTruthy()
  })

  it('every offering term in a plan agrees with the term restrictions the planner enforces', () => {
    const disagreements = []
    for (const p of plansFile.plans) {
      for (const s of p.slots.filter(x => x.offering)) {
        const planner = getSeasonRestriction(s.classCode)
        const wanted = s.offering.terms.length === 1 ? s.offering.terms[0] : null
        if (!wanted) continue
        if (planner?.toLowerCase() !== wanted) disagreements.push(`${p.program}/${p.catalogYear} ${s.classCode}: map says ${wanted}, planner says ${planner}`)
      }
    }
    expect(disagreements).toEqual([])
  })

  it('the AI major follows the Data Science & AI concentration and replaces CSC 4240 / 4220 with AI 3000 / 3200', () => {
    expect(plansFile.programs.find(p => p.code === 'ai').supersedes).toBe('dsai')
    const codes = plan('ai').slots.map(s => s.classCode)
    for (const c of ['AI3000', 'AI3100', 'AI3200', 'AI4200']) expect(codes).toContain(c)
    expect(codes).not.toContain('CSC4240')
    expect(codes).not.toContain('CSC4220')
  })

  it('CSC 4620 takes over CSC 4615 in place in Core, Cybersecurity and HPC', () => {
    for (const code of ['core', 'cybersecurity', 'hpc']) {
      const slot = plan(code).slots.find(s => s.classCode === 'CSC4620')
      expect(slot?.replaces, code).toBe('CSC4615')
      expect(plan(code).slots.some(s => s.classCode === 'CSC4615'), code).toBe(false)
    }
  })

  it('the department path (map semesters) puts at most 18 hours in a semester and covers 120 hours', () => {
    const pools = plansFile.pools
    const courses = new Map(JSON.parse(readFileSync(`${PROTO}courses.json`, 'utf8')).courses.map(c => [c.code, c]))
    for (const code of ['core', 'cybersecurity', 'hpc', 'ai']) {
      const bySemester = {}
      for (const s of plan(code).slots.filter(x => x.mapSemester != null)) {
        const hours = s.credits ?? pools[s.classCode] ?? courses.get(s.classCode)?.credits
        bySemester[s.mapSemester] = (bySemester[s.mapSemester] ?? 0) + hours
      }
      expect(Math.max(...Object.values(bySemester)), code).toBeLessThanOrEqual(18)
      expect(Object.values(bySemester).reduce((a, b) => a + b, 0), code).toBe(120)
    }
  })
})
