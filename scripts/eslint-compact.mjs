// eslint-compact.mjs: a terse ESLint formatter. One line per problem (file:line:col, severity, rule, the first line of the
// message) and one summary line; a clean run prints "lint ok". The default formatter prints the whole React Compiler
// explanation for every set-state-in-effect finding (about 1.5 KB each), which is all that was ever read into a session.
//
//   npx eslint . -f ./scripts/eslint-compact.mjs      (npm run lint does this)
import { relative } from 'node:path'

export default function compact(results, data = {}) {
  const cwd = data.cwd ?? process.cwd()
  const lines = []
  let errors = 0
  let warnings = 0
  let files = 0
  for (const r of results) {
    files += 1
    errors += r.errorCount
    warnings += r.warningCount
    const file = relative(cwd, r.filePath).split('\\').join('/')
    for (const m of r.messages) {
      const first = String(m.message).split('\n')[0].replace(/\s+/g, ' ').trim()
      const text = first.length > 140 ? first.slice(0, 137) + '...' : first
      lines.push(`${file}:${m.line ?? 0}:${m.column ?? 0} ${m.severity === 2 ? 'error' : 'warn'} ${m.ruleId ?? 'parse'} ${text}`)
    }
  }
  if (!lines.length) return `lint ok (${files} files)`
  lines.push(`${errors} error(s), ${warnings} warning(s)`)
  return lines.join('\n')
}
