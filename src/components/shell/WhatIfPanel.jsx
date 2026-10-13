import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/dataClient'
import { academicYearOf } from '../../lib/catalogYears'
import { selectWithOptional } from '../../lib/dbErrors'
import { termForDate } from '../../lib/semesterTerms'
import { addableMajors, addableMinors, newProgramRow } from '../../lib/addProgram'
import { describeDelay } from '../../lib/whatIf'
import { minorRows } from '../../lib/whatIfLoader'

const TOP = 5

/**
 * "What if I added...": try a secondary major or a minor without adding it, and see what it would do to the finish; and "which minor am I
 * closest to completing?". Nothing here writes anything: `evaluate(row)` and `rank(rows)` read the plan and the catalog and compute
 * (lib/whatIf.js); only the "Add it" button calls `onAdd(row)`, the same handler the add dialog uses.
 *
 * Props: profile, addedPrograms (lib/studentPrograms.js, non-primary), evaluate(row) -> result | null, rank(rows) -> { ranked, notRanked },
 * onAdd(row)
 */
export default function WhatIfPanel({ profile, addedPrograms, evaluate, rank, onAdd }) {
  const [programs, setPrograms] = useState([])
  const [plans, setPlans] = useState([])
  const [loadError, setLoadError] = useState(null)
  const [role, setRole] = useState('minor')
  const [selectedId, setSelectedId] = useState('')
  const [outcome, setOutcome] = useState({ key: null, result: null, failed: false })
  const [ranking, setRanking] = useState({ status: 'idle', data: null })
  const today = useMemo(() => termForDate(new Date()), [])

  useEffect(() => {
    Promise.all([
      selectWithOptional(
        columns => db.from('concentrations').select(columns).order('id', { ascending: true }),
        'id, code, name, total_hours',
        ['kind', 'degree', 'major_name', 'department', 'last_catalog_year', 'major_code', 'college', 'is_base', 'aliases'],
      ),
      db.from('degree_plans').select('id, concentration_id, catalog_year, gened_program, total_hours, covers_earlier'),
    ]).then(([programsRes, plansRes]) => {
      const failure = programsRes.error ?? plansRes.error
      if (failure) setLoadError(failure.message)
      else { setPrograms(programsRes.data); setPlans(plansRes.data) }
    })
  }, [])

  const termYear = academicYearOf(today.season, today.year)
  const primary = programs.find(p => p.id === profile.concentration_id) ?? null
  const options = role === 'minor'
    ? addableMinors(programs, plans, termYear, { added: addedPrograms })
    : addableMajors(programs, plans, termYear, { primary, added: addedPrograms })
  const chosen = options.find(p => String(p.id) === String(selectedId)) ?? null
  const position = 1 + Math.max(0, ...addedPrograms.map(p => p.position ?? 0))
  const row = chosen ? newProgramRow({ studentId: profile.id, program: chosen, plans, season: today.season, year: today.year, position, role }) : null

  const key = row ? `${role}:${row.concentration_id}:${row.catalog_year}` : null
  useEffect(() => {
    if (!key) return
    let live = true
    evaluate(row)
      .then(result => { if (live) setOutcome({ key, result, failed: !result }) })
      .catch(() => { if (live) setOutcome({ key, result: null, failed: true }) })
    return () => { live = false }
    // `row` is derived from `key`; evaluating again for the same key would only repeat the work
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const result = key && outcome.key === key ? outcome.result : null
  const failed = key && outcome.key === key && outcome.failed
  const delay = result ? describeDelay(result) : null

  async function findClosest() {
    setRanking({ status: 'working', data: null })
    try {
      const minors = addableMinors(programs, plans, termYear, { added: addedPrograms })
      const rows = minorRows(minors, { studentId: profile.id, season: today.season, year: today.year, plans })
      setRanking({ status: 'done', data: await rank(rows) })
    } catch {
      setRanking({ status: 'error', data: null })
    }
  }

  const chooseMinor = id => { setRole('minor'); setSelectedId(String(id)) }

  return (
    <div className="ds-card ds-whatif" aria-labelledby="whatif-title">
      <div className="ds-setting">
        <span className="ds-setting-text">
          <span className="ds-setting-label" id="whatif-title">What if I added…</span>
          <span className="ds-setting-desc">See what a secondary major or a minor would do to your finish before you add it. Nothing is saved.</span>
        </span>
      </div>
      {loadError && <p className="ds-modal-text" role="alert" style={{ color: 'var(--danger)', padding: '0 22px' }}>{loadError}</p>}
      <div className="ds-whatif-controls">
        <select className="ds-act-input" style={{ textAlign: 'left' }} aria-label="Secondary major or minor" value={role} onChange={e => { setRole(e.target.value); setSelectedId('') }}>
          <option value="minor">A minor</option>
          <option value="major">A secondary major</option>
        </select>
        <select className="ds-act-input" style={{ textAlign: 'left', flex: 1 }} aria-label="Program to try" value={chosen ? String(chosen.id) : ''} onChange={e => setSelectedId(e.target.value)}>
          <option value="">Choose a {role === 'minor' ? 'minor' : 'secondary major'}</option>
          {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {chosen && !result && !failed && <p className="ds-whatif-line" role="status">Working it out…</p>}
      {failed && <p className="ds-whatif-line ds-whatif-unknown" role="status">Could not work this out right now.</p>}
      {delay && (
        <div className={`ds-whatif-line ds-whatif-${delay.state}`} role="status">
          <p>{delay.sentence}</p>
          {delay.detail && <p className="ds-whatif-detail">{delay.detail}</p>}
          <p className="ds-whatif-detail">An estimate: it follows the same prerequisites, offering terms and hours limits as your plan, and does not see seats or the schedule of classes.</p>
          <button className="ds-btn-primary" style={{ minHeight: 36 }} onClick={() => onAdd(row)}>Add {chosen.name}</button>
        </div>
      )}

      <div className="ds-setting" style={{ borderTop: '1px solid var(--ds-hairline)' }}>
        <span className="ds-setting-text">
          <span className="ds-setting-label">Which minor am I closest to completing?</span>
          <span className="ds-setting-desc">Ranked by the hours you would still need, from the plan you have now.</span>
        </span>
        <button className="ds-btn-ghost" style={{ minHeight: 36, color: 'var(--gold)' }} onClick={findClosest} disabled={ranking.status === 'working' || programs.length === 0}>
          {ranking.status === 'working' ? 'Working…' : 'Find out'}
        </button>
      </div>
      {ranking.status === 'error' && <p className="ds-whatif-line ds-whatif-unknown" role="status">Could not rank the minors right now.</p>}
      {ranking.status === 'done' && (
        <div className="ds-whatif-line" role="status">
          <ol className="ds-whatif-rank">
            {ranking.data.ranked.slice(0, TOP).map(({ candidate, result: r }) => (
              <li key={candidate.programId}>
                <button className="ds-whatif-pick" onClick={() => chooseMinor(candidate.programId)}>{candidate.name}</button>
                {' '}
                {r.hoursNeeded === 0 ? 'your plan already covers it' : `${r.hoursNeeded} of ${candidate.totalHours ?? 15} hours still needed`}
                {r.delayTerms > 0 ? `, adds ${r.delayTerms} semester${r.delayTerms === 1 ? '' : 's'}` : ''}
              </li>
            ))}
          </ol>
          <p className="ds-whatif-detail">
            {ranking.data.notRanked.length} other minor{ranking.data.notRanked.length === 1 ? '' : 's'} are not ranked: the planner does not model {ranking.data.notRanked.length === 1 ? 'its' : 'their'} requirements, so no number is claimed.
          </p>
        </div>
      )}
    </div>
  )
}
