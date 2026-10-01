// build-catalog.mjs: turns the seed sources in ../MyDegreePlan_Prototype into the static catalog
// (src/data/catalog.json) that the local-first backend serves in place of a database's catalog tables.
//
//   npm run build:catalog
//
// Mirrors seed.js (see catalogLib.mjs). It differs in one way: ids are assigned here instead of by
// Postgres. Slot ids are kept stable by running the previous catalog.json through the same
// planSlotSync seed.js uses, so a plan stored in a student's browser keeps pointing at the right
// slot after the catalog is regenerated.
//
// The output is committed: Vercel builds from the frontend repo alone and cannot see the
// prototype repo. Re-run this and commit whenever the seed JSON or test_equivalencies.sql change.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEGREE_FILES, assembleCatalog } from './catalogLib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const protoDir = resolve(here, '../../MyDegreePlan_Prototype')
const outFile = resolve(here, '../src/data/catalog.json')

const readJson = name => JSON.parse(readFileSync(resolve(protoDir, name), 'utf8'))

async function main() {
  const { planSlotSync } = await import(pathToFileURL(resolve(protoDir, 'slotSync.js')).href)
  const { catalog, totals } = assembleCatalog({
    courses: readJson('prototype.json').courses,
    plans: DEGREE_FILES.map(d => ({ ...d, data: readJson(d.file) })),
    equivalencySql: readFileSync(resolve(protoDir, 'test_equivalencies.sql'), 'utf8'),
    previous: existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null,
    planSlotSync,
  })

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(catalog) + '\n')
  const t = catalog.tables
  console.log(
    `catalog.json: ${t.courses.length} courses, ${t.prerequisite_entries.length} prereq / ${t.corequisite_entries.length} coreq rows, `
    + `${t.concentrations.length} concentrations, ${t.requirement_slots.length} slots (${totals.kept} kept, `
    + `${totals.inserted} new, ${totals.removed} removed), ${t.test_equivalencies.length} equivalencies`,
  )
}

main().catch(err => { console.error(err); process.exit(1) })
