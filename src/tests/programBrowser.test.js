import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import catalog from '../data/catalog.json'
import colleges from '../data/colleges.json'
import { groupByCollege, majorKeyOf, programPath, searchPrograms, termUnavailableNote, OTHER_COLLEGE } from '../lib/programBrowser'

// Programs as the picker gets them: concentrations rows. A small world with two colleges, a major whose concentrations are all
// required (Biology), a major with a base program and optional concentrations (Computer Science), and one with neither.
const world = [
  { id: 1, code: 'core', name: 'CSC Core', major_name: 'Computer Science', degree: 'B.S.', department: 'CSC', college: 'engineering', major_code: 'computer_science', is_base: true, aliases: 'CS, comp sci' },
  { id: 2, code: 'cyber', name: 'CSC Cybersecurity', major_name: 'Computer Science', degree: 'B.S.', department: 'CSC', college: 'engineering', major_code: 'computer_science', is_base: false, aliases: 'infosec' },
  { id: 3, code: 'hpc', name: 'CSC High Performance Computing', major_name: 'Computer Science', degree: 'B.S.', department: 'CSC', college: 'engineering', major_code: 'computer_science', is_base: false, aliases: 'HPC' },
  { id: 4, code: 'bio_zool', name: 'Zoology', major_name: 'Biology', degree: 'B.S.', department: 'BIOL', college: 'cas', major_code: 'biology', is_base: false, aliases: null },
  { id: 5, code: 'bio_bot', name: 'Botany', major_name: 'Biology', degree: 'B.S.', department: 'BIOL', college: 'cas', major_code: 'biology', is_base: false, aliases: null },
  { id: 6, code: 'hist_ba', name: 'History', major_name: 'History', degree: 'B.A.', department: 'HIST', college: 'cas', major_code: 'history_ba', is_base: true, aliases: null },
  { id: 7, code: 'hist_bs', name: 'History', major_name: 'History', degree: 'B.S.', department: 'HIST', college: 'cas', major_code: 'history_bs', is_base: true, aliases: null },
]

describe('groupByCollege', () => {
  const tree = groupByCollege(world)

  it('lists colleges in the college list order and majors alphabetically', () => {
    expect(tree.map(c => c.college.code)).toEqual(['cas', 'engineering'])   // alphabetical by name, the file's order
    expect(tree[0].majors.map(m => `${m.majorName} ${m.degree}`)).toEqual(['Biology B.S.', 'History B.A.', 'History B.S.'])
  })

  it('a major used by two degrees is two majors', () => {
    expect(tree[0].majors.filter(m => m.majorName === 'History').map(m => m.key)).toEqual(['history_ba', 'history_bs'])
  })

  it('a major with a base program offers it first; one without requires a concentration', () => {
    const cs = tree[1].majors[0]
    expect(cs.base.code).toBe('core')
    expect(cs.programs.map(p => p.code)).toEqual(['core', 'cyber', 'hpc'])
    expect(cs.concentrationRequired).toBe(false)
    const bio = tree[0].majors[0]
    expect(bio.base).toBeNull()
    expect(bio.programs.map(p => p.code)).toEqual(['bio_bot', 'bio_zool'])   // alphabetical
    expect(bio.concentrationRequired).toBe(true)
  })

  it('a program that is the whole major is its own base', () => {
    const hist = tree[0].majors[1]
    expect(hist.programs.map(p => p.code)).toEqual(['hist_ba'])
    expect(hist.concentrations).toEqual([])
    expect(hist.concentrationRequired).toBe(false)
    // even when the database does not say is_base
    const lone = groupByCollege([{ ...world[5], is_base: false }])[0].majors[0]
    expect(lone.base.code).toBe('hist_ba')
  })

  it('a database without the new columns still groups by major name, under "Other programs"', () => {
    const newColumns = ['college', 'major_code', 'is_base', 'aliases']
    const old = world.map(p => Object.fromEntries(Object.entries(p).filter(([k]) => !newColumns.includes(k))))
    const grouped = groupByCollege(old)
    expect(grouped).toHaveLength(1)
    expect(grouped[0].college).toEqual(OTHER_COLLEGE)
    expect(grouped[0].majors.map(m => m.majorName)).toEqual(['Biology', 'Computer Science', 'History'])   // both History degrees: one major without a major_code
    expect(majorKeyOf(old[0])).toBe('computer_science')
  })

  it('a college that is not in the list does not lose its programs', () => {
    const grouped = groupByCollege([{ ...world[0], college: 'atlantis' }])
    expect(grouped[0].college.code).toBe('other')
  })

  it('handles no programs', () => {
    expect(groupByCollege([])).toEqual([])
    expect(groupByCollege(null)).toEqual([])
  })
})

describe('searchPrograms', () => {
  it('matches by the start of any word of the name, major, aliases, degree, department or college', () => {
    const codes = q => searchPrograms(world, q).map(p => p.code)
    expect(codes('cyber')).toEqual(['cyber'])
    expect(codes('cybersec')).toEqual(['cyber'])
    expect(codes('infosec')).toEqual(['cyber'])
    expect(codes('CS')).toEqual(['core', 'cyber', 'hpc'])                  // the alias, then CSC names
    expect(codes('hpc')).toEqual(['hpc'])
    expect(codes('zool')).toEqual(['bio_zool'])
    expect(codes('biolog')).toEqual(['bio_bot', 'bio_zool'])               // the major name
    expect(codes('arts sciences').sort()).toEqual(['bio_bot', 'bio_zool', 'hist_ba', 'hist_bs'])   // the college
  })

  it('every word has to match, and an empty query matches nothing', () => {
    expect(searchPrograms(world, 'cyber botany')).toEqual([])
    expect(searchPrograms(world, '')).toEqual([])
    expect(searchPrograms(world, '   ')).toEqual([])
    expect(searchPrograms(world, '$$')).toEqual([])
  })

  it('a name match ranks above a college or degree match', () => {
    const rows = [
      { id: 1, code: 'a', name: 'Engineering Physics', major_name: 'Physics', college: 'cas' },
      { id: 2, code: 'b', name: 'Nuclear', major_name: 'Nuclear', college: 'engineering' },
    ]
    expect(searchPrograms(rows, 'engineering').map(p => p.code)).toEqual(['a', 'b'])
  })
})

describe('programPath', () => {
  it('writes college › major › program, leaving out a program that is the major', () => {
    expect(programPath(world[1])).toBe('Engineering › Computer Science › CSC Cybersecurity')
    expect(programPath(world[5])).toBe('Arts & Sciences › History')
    expect(programPath(null)).toBeNull()
  })
})

describe('termUnavailableNote', () => {
  const plans = [{ id: 1, concentration_id: 10, catalog_year: '2026-2027' }]
  it('says why a returning student has no plan, and why a new student has none in a closed program', () => {
    const me = { id: 10, code: 'me', name: 'Mechanical Engineering' }
    expect(termUnavailableNote('returning', me, plans).text).toMatch(/begin with the 2026-2027 catalog/)
    const dsai = { id: 11, code: 'dsai', name: 'Data Science & AI', last_catalog_year: '2025-2026' }
    const ai = { id: 12, code: 'ai', name: 'Artificial Intelligence', supersedes: 'dsai' }
    const note = termUnavailableNote('incoming_freshman', dsai, [{ id: 2, concentration_id: 11, catalog_year: '2025-2026' }], [dsai, ai])
    expect(note.text).toMatch(/closed to new students after the 2025-2026 catalog; Artificial Intelligence replaces it/)
    expect(note.replacement).toBe(ai)
    expect(termUnavailableNote('transfer', me, []).text).toMatch(/no degree plan yet/)
  })
})

describe('the generated college list and the real programs', () => {
  const programs = catalog.tables.concentrations

  it('lists the eight undergraduate colleges, alphabetically, each with a name, short name and url', () => {
    expect(colleges).toHaveLength(8)
    expect(colleges.map(c => c.short)).toEqual([...colleges.map(c => c.short)].sort((a, b) => a.localeCompare(b)))
    for (const c of colleges) expect(Object.keys(c).sort()).toEqual(['code', 'name', 'short', 'url'])
  })

  it('every program is in a college of the list and in a major, and a major has at most one base program', () => {
    for (const p of programs) {
      expect(colleges.some(c => c.code === p.college), `${p.code}: college ${p.college}`).toBe(true)
      expect(p.major_code, p.code).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(typeof p.is_base, p.code).toBe('boolean')
    }
    const tree = groupByCollege(programs)
    for (const { majors } of tree) for (const m of majors) expect(m.programs.filter(p => p.is_base).length, m.key).toBeLessThanOrEqual(1)
  })

  it('puts the programs under Arts and Sciences, Business and Engineering so far, with the majors each college has', () => {
    const tree = groupByCollege(programs)
    expect(tree.map(c => c.college.code)).toEqual(['cas', 'business', 'engineering'])
    const [cas, business, engineering] = tree
    const titles = c => c.majors.map(m => degreeTitleOf(m))
    for (const major of ['Biochemistry, B.S.', 'Biology, B.S.', 'Chemistry, B.S.', 'English, B.A.', 'Mathematics, B.S.', 'Physics, B.S.', 'Political Science, B.S.', 'Sociology, B.S.']) {
      expect(titles(cas), major).toContain(major)
    }
    expect(titles(business)).toEqual([
      'Accounting, B.S.B.A.', 'Business AI & Analytics, B.S.B.A.', 'Business Information and Technology, B.S.B.A.', 'Business Management, B.S.B.A.',
      'Economics, B.S.', 'Finance, B.S.B.A.', 'Marketing, B.S.B.A.',
    ])
    expect(titles(engineering)).toEqual([
      'Artificial Intelligence, B.S.', 'Chemical Engineering, B.S.CH.E.', 'Civil Engineering, B.S.C.E.', 'Computer Engineering, B.S.CMP.E.',
      'Computer Science, B.S.', 'Electrical Engineering, B.S.E.E.', 'Engineering Technology, B.S.E.T.', 'General Engineering, B.S.E.',
      'Mechanical Engineering, B.S.M.E.', 'Nuclear Engineering, B.S.N.E.',
    ])
  })

  it('a major with its own map offers it first, one that needs a concentration does not', () => {
    const tree = groupByCollege(programs)
    const find = (college, key) => tree.find(c => c.college.code === college).majors.find(m => m.key === key)
    const me = find('engineering', 'mechanical_engineering')
    expect(me.base.code).toBe('me')
    expect(me.concentrations.map(p => p.code)).toEqual(['me_aero', 'me_mechatronics', 'me_vehicle'])
    const mgmt = find('business', 'business_management')
    expect(mgmt.base).toBeNull()
    expect(mgmt.concentrationRequired).toBe(true)
    expect(mgmt.concentrations.map(p => p.name)).toEqual(['General Management', 'Human Resource Management', 'Operations and Supply Chain Management'])
    const et = find('engineering', 'engineering_technology')
    expect(et.concentrationRequired).toBe(true)
    expect(et.concentrations).toHaveLength(3)
  })

  it('keeps the Artificial Intelligence degree (Engineering) apart from Business AI & Analytics (Business)', () => {
    const ai = programs.find(p => p.code === 'ai')
    const bai = programs.find(p => p.code === 'bai_bsba')
    expect([ai.college, ai.major_code]).toEqual(['engineering', 'artificial_intelligence'])
    expect([bai.college, bai.major_code]).toEqual(['business', 'business_ai_and_analytics'])
    expect(searchPrograms(programs, 'artificial intelligence').map(p => p.code)).toEqual(['ai'])
  })

  // src/data/colleges.json is written by `npm run build:catalog` from the Prototype's degree-specs/colleges.json (through degree_plans.json)
  const PROTO = fileURLToPath(new URL('../../../MyDegreePlan_Prototype/', import.meta.url))
  it.skipIf(!existsSync(`${PROTO}degree_plans.json`))('the committed college list is the one the Prototype generates', () => {
    const generated = JSON.parse(readFileSync(`${PROTO}degree_plans.json`, 'utf8')).colleges.map(({ code, name, short, url }) => ({ code, name, short, url }))
    expect(colleges).toEqual(generated)
  })

  it('search finds a program by the words a student uses', () => {
    expect(searchPrograms(programs, 'cs')[0].code).toBe('core')
    expect(searchPrograms(programs, 'aerospace').map(p => p.code)).toEqual(['me_aero'])
    expect(searchPrograms(programs, 'nuclear').map(p => p.code)).toEqual(['ne'])
    expect(searchPrograms(programs, 'robotics').map(p => p.code)).toEqual(['me_mechatronics'])
  })
})

const degreeTitleOf = m => [m.majorName, m.degree].filter(Boolean).join(', ')
