// compare.mjs: decides whether the platforms' fingerprints are allowed to differ the way they do. Pure (no browser), so it is unit
// tested (parity/test/compare.test.mjs).
//
// The first platform is the baseline (web). For every other platform and every screen, each region's lines are compared with the
// baseline's after two normalisations:
//   1. words that legitimately differ by platform (lib/platform.js) become tokens, so "this browser" and "this computer" match;
//   2. lines covered by a rule in expected-differences.json (accounts on Docker, ...) are dropped, on the platforms the rule names.
// Whatever is left is an UNEXPECTED difference. Facts (the plan's courses, the PDF, which platform it really was) are compared too.
import { platformWords } from '../../src/lib/platform.js'

export const REGIONS = ['sidebar', 'main', 'modal', 'page']

export function normalizeLines(lines, platform) {
  const words = Object.entries(platformWords(platform)).filter(([key]) => key !== 'label').sort((a, b) => b[1].length - a[1].length)
  return lines.map(line => {
    let out = line
    for (const [key, value] of words) out = out.split(value).join(`{{${key}}}`)
    return out.replace(/Last saved \d{1,2}:\d{2}\s?[AP]M/, 'Last saved {{time}}')
  })
}

const appliesTo = (rule, platform, screen, region) =>
  (!rule.platforms || rule.platforms.includes(platform)) &&
  (!rule.screens || rule.screens.includes(screen)) &&
  (!rule.regions || rule.regions.includes(region))

function filtered(lines, platform, screen, region, rules) {
  const live = rules.filter(rule => rule.match && appliesTo(rule, platform, screen, region)).map(rule => new RegExp(rule.match))
  return normalizeLines(lines, platform).filter(line => !live.some(pattern => pattern.test(line)))
}

// Lines in `a` that are not in `b`, counting repeats.
function onlyIn(a, b) {
  const left = new Map()
  for (const line of b) left.set(line, (left.get(line) ?? 0) + 1)
  return a.filter(line => { const n = left.get(line) ?? 0; if (n > 0) { left.set(line, n - 1); return false } return true })
}

export function compareRuns(runs, { rules = [], presence = [], knownFeatures = null, knownIssues = [] } = {}) {
  const problems = []
  const warnings = []   // known, registered differences: reported on every run, never failing it (see expected-differences.json)
  const [baseline, ...others] = runs

  // The rules themselves must point at a real, registered feature (so "expected" cannot become a dumping ground).
  if (knownFeatures) {
    for (const rule of [...rules, ...presence]) {
      if (rule.feature && !knownFeatures.includes(rule.feature)) problems.push({ kind: 'rule', message: `rule names the feature "${rule.feature}", which is not in parity/platform-branches.json` })
    }
  }

  for (const run of runs) {
    const expected = { web: { desktopBridge: false, dockerConfig: false }, desktop: { desktopBridge: true, dockerConfig: false }, docker: { desktopBridge: false, dockerConfig: true } }[run.target]
    for (const key of ['desktopBridge', 'dockerConfig']) {
      if (expected && run.facts.signals[key] !== expected[key]) problems.push({ kind: 'platform', target: run.target, message: `${run.target} was not the platform it should be: ${key} is ${run.facts.signals[key]}` })
    }
    if (run.facts.pdf?.header !== '%PDF-' || !(run.facts.pdf?.pages >= 1) || !run.facts.pdf?.bigEnough) {
      problems.push({ kind: 'pdf', target: run.target, message: `the PDF preview did not produce a real PDF: ${JSON.stringify(run.facts.pdf)}` })
    }
  }

  for (const run of others) {
    // Same plan, course for course, semester for semester (this is what proves local and remote storage agree).
    // The SET of courses in each semester must match. The ORDER within a semester is compared too, but a difference in order alone can be
    // registered as a known issue (it is a product decision which order is right) and is then reported without failing the run.
    const sets = plan => JSON.stringify(plan.map(sem => ({ semester: sem.semester, courses: [...sem.courses].sort() })))
    if (sets(baseline.facts.plan) !== sets(run.facts.plan)) {
      problems.push({ kind: 'plan', target: run.target, message: `the built plan has different courses than ${baseline.target}`, baseline: baseline.facts.plan, actual: run.facts.plan })
    } else if (JSON.stringify(baseline.facts.plan) !== JSON.stringify(run.facts.plan)) {
      const index = baseline.facts.plan.findIndex((sem, i) => JSON.stringify(sem) !== JSON.stringify(run.facts.plan[i]))
      const known = knownIssues.find(issue => issue.kind === 'plan-order' && issue.platforms.includes(run.target))
      const detail = { kind: 'plan-order', target: run.target, message: `the same courses, in a different order within a semester, than ${baseline.target} (first: ${baseline.facts.plan[index]?.semester})`, [`${baseline.target} order`]: baseline.facts.plan[index]?.courses, [`${run.target} order`]: run.facts.plan[index]?.courses }
      if (known) warnings.push({ ...detail, why: known.why, since: known.since })
      else problems.push(detail)
    }
    if (baseline.facts.pdf?.pages !== run.facts.pdf?.pages) problems.push({ kind: 'pdf', target: run.target, message: `the PDF has ${run.facts.pdf?.pages} pages, ${baseline.target}'s has ${baseline.facts.pdf?.pages}` })

    const screens = new Set([...Object.keys(baseline.screens), ...Object.keys(run.screens)])
    for (const screen of screens) {
      const inBase = screen in baseline.screens
      const inRun = screen in run.screens
      if (inBase !== inRun) {
        const covered = rules.some(rule => rule.screen === screen && (rule.platforms ?? []).includes(inRun ? run.target : baseline.target))
        if (!covered) problems.push({ kind: 'screen', target: run.target, screen, message: `the "${screen}" screen exists on ${inRun ? run.target : baseline.target} only` })
        continue
      }
      for (const region of REGIONS) {
        const left = filtered(baseline.screens[screen][region] ?? [], baseline.target, screen, region, rules)
        const right = filtered(run.screens[screen][region] ?? [], run.target, screen, region, rules)
        const onlyBaseline = onlyIn(left, right)
        const onlyTarget = onlyIn(right, left)
        if (onlyBaseline.length || onlyTarget.length) problems.push({ kind: 'text', target: run.target, screen, region, [`only on ${baseline.target}`]: onlyBaseline, [`only on ${run.target}`]: onlyTarget, message: `${screen} / ${region} differs from ${baseline.target}` })
      }
    }
  }

  // A feature that should exist on some platforms and not others must really be that way round.
  for (const check of presence) {
    for (const run of runs) {
      const lines = run.screens[check.screen]?.[check.region] ?? []
      const has = lines.some(line => new RegExp(check.text).test(line))
      const should = check.presentOn.includes(run.target)
      if (has !== should) problems.push({ kind: 'presence', target: run.target, screen: check.screen, message: `${check.feature}: "${check.text}" ${has ? 'is' : 'is not'} on ${run.target} but ${should ? 'should be' : 'should not be'} (${check.feature} is on ${check.presentOn.join(', ')} only)` })
    }
  }

  return { ok: problems.length === 0, problems, warnings }
}

export function formatReport(result, runs) {
  const lines = [`# Platform parity: ${result.ok ? 'PASS' : 'FAIL'}${result.ok && (result.warnings ?? []).length ? ` (${result.warnings.length} known difference${result.warnings.length === 1 ? '' : 's'})` : ''}`, '', `Platforms compared: ${runs.map(run => run.target).join(', ')} (baseline: ${runs[0].target}); screens: ${Object.keys(runs[0].screens).length}`, '']
  if (result.ok) lines.push('Every platform showed the same screens, text, plan and PDF, apart from the differences registered in parity/.')
  for (const warning of result.warnings ?? []) {
    lines.push('', `## KNOWN DIFFERENCE (does not fail the run) - ${warning.kind} (${warning.target}), since ${warning.since ?? 'unknown'}`, '', warning.message, '', `Why it is allowed: ${warning.why}`)
    for (const [key, value] of Object.entries(warning)) if (/ order$/.test(key) && value) lines.push('', `${key}: ${value.join(', ')}`)
  }
  if ((result.warnings ?? []).length) lines.push('')
  for (const problem of result.problems) {
    lines.push(`## ${problem.kind}${problem.target ? ` (${problem.target})` : ''}${problem.screen ? `: ${problem.screen}` : ''}`, '', problem.message)
    for (const [key, value] of Object.entries(problem)) {
      if (key.startsWith('only on ') && value.length) lines.push('', `${key}:`, ...value.map(line => `  - ${line}`))
    }
    lines.push('')
  }
  return lines.join('\n')
}
