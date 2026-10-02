// build-catalog.mjs: turns the seed sources in ../MyDegreePlan_Prototype into the static catalog
// (src/data/catalog.json) that the local-first backend serves in place of a database's catalog tables.
//
//   npm run build:catalog
//
// Mirrors seed.js (see catalogLib.mjs). It differs in two ways. Ids are assigned here instead of by
// Postgres: slot ids are kept stable by running the previous catalog.json through the same
// planSlotSync seed.js uses, so a plan stored in a student's browser keeps pointing at the right
// slot after the catalog is regenerated. And the full catalog (every Tennessee Tech course, about
// 6,000) is split so a first load stays small: catalog.json carries every course's name and hours
// plus the descriptions of the courses a plan can name, and catalog.descriptions.json holds the
// rest, fetched on first need (see localClient.js).
//
// The outputs are committed: Vercel builds from the frontend repo alone and cannot see the
// prototype repo. It also writes src/data/pools.json (pool labels, hours and membership, from degree_plans.json's
// poolDefs). Re-run this and commit whenever courses.json, degree_plans.json or
// test_equivalencies.sql change (courses.json itself comes from `node catalog/build_courses.mjs`
// in the prototype repo).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assembleCatalog, parseEquivalencies } from './catalogLib.mjs'
import { listFlightFoundationsCourses } from '../src/lib/flightFoundations.js'

const here = dirname(fileURLToPath(import.meta.url))
const protoDir = resolve(here, '../../MyDegreePlan_Prototype')
const outFile = resolve(here, '../src/data/catalog.json')
const descriptionsFile = resolve(here, '../src/data/catalog.descriptions.json')
const poolsFile = resolve(here, '../src/data/pools.json')

const readJson = name => JSON.parse(readFileSync(resolve(protoDir, name), 'utf8'))

async function main() {
  const { planSlotSync } = await import(pathToFileURL(resolve(protoDir, 'slotSync.js')).href)
  const degreePlans = readJson('degree_plans.json')
  const equivalencySql = readFileSync(resolve(protoDir, 'test_equivalencies.sql'), 'utf8')
  // The courses a plan can name: template slots, pool options, exam-equivalency awards.
  const poolMembers = Object.values(degreePlans.poolDefs).flatMap(d => (d.kind === 'source' ? listFlightFoundationsCourses(d.category) : d.courses ?? []))
  const coreCodes = new Set([
    ...degreePlans.plans.flatMap(p => p.slots.map(slot => slot.classCode)),
    ...poolMembers,
    ...parseEquivalencies(equivalencySql).map(r => r.awarded_course_code),
  ])
  const { catalog, descriptions, totals } = assembleCatalog({
    courses: readJson('courses.json').courses,
    degreePlans,
    equivalencySql,
    coreCodes,
    previous: existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null,
    planSlotSync,
  })

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(catalog) + '\n')
  writeFileSync(descriptionsFile, JSON.stringify(descriptions) + '\n')
  // The pools (label, hours, resolved membership) as data for poolResolver.js; one pool a line so a change reads as a small diff.
  writeFileSync(poolsFile, `{\n${Object.entries(degreePlans.poolDefs).map(([code, def]) => `  ${JSON.stringify(code)}: ${JSON.stringify(def)}`).join(',\n')}\n}\n`)
  const t = catalog.tables
  console.log(
    `catalog.json: ${t.courses.length} courses (${Object.keys(descriptions).length} descriptions deferred), `
    + `${t.prerequisite_entries.length} prereq / ${t.corequisite_entries.length} coreq rows, `
    + `${t.concentrations.length} programs, ${t.degree_plans.length} plans, ${t.requirement_slots.length} slots (${totals.kept} kept, `
    + `${totals.inserted} new, ${totals.removed} removed), ${t.test_equivalencies.length} equivalencies`,
  )
}

main().catch(err => { console.error(err); process.exit(1) })
