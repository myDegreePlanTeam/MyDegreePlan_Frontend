import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/dataClient'
import { academicYearOf, degreeTitle, planForYear } from '../../lib/catalogYears'
import { describeDelay } from '../../lib/whatIf'
import { selectWithOptional } from '../../lib/dbErrors'
import { groupByCollege, searchPrograms } from '../../lib/programBrowser'
import { termForDate } from '../../lib/semesterTerms'
import {
  ENTRY_SEASONS, OVERLAP_NOTE, MINOR_OVERLAP_NOTE, NOT_MODELLED_NOTE, addableMajors, addableMinors, minorTranscriptNotice, newProgramRow,
} from '../../lib/addProgram'

/**
 * "Add a second major" / "Add a minor": pick a degree program, say which term the student starts it, read the notes, confirm.
 * `onAdd(row)` receives the student_programs row to write (lib/addProgram.js). Programs already in the plan, another concentration
 * of the student's own major (for a second major), and programs with no plan for the declared term are not offered. A minor the planner
 * does not model (it has no slots) is offered with the catalog's own wording and a note that nothing in the plan is checked against it.
 *
 * `evaluate(row)` (optional) works out what adding it would do to the finish (lib/whatIf.js); the answer is shown before the student confirms,
 * as a warning and never a block.
 *
 * Props: profile, role ('major' | 'minor'), addedPrograms (lib/studentPrograms.js, the non-primary ones), evaluate, onAdd, onClose, adding, error
 */
export default function AddProgramModal({ profile, role = 'major', addedPrograms, evaluate = null, onAdd, onClose, adding, error }) {
  const isMinor = role === 'minor'
  const [programs, setPrograms] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  // whether the chosen minor has requirements the planner models, with the minor and plan year it was found for
  const [slotCheck, setSlotCheck] = useState({ key: null, value: null })
  const today = useMemo(() => termForDate(new Date()), [])
  const [season, setSeason] = useState(today.season)
  const [year, setYear] = useState(today.year)

  useEffect(() => {
    Promise.all([
      selectWithOptional(
        columns => db.from('concentrations').select(columns).order('id', { ascending: true }),
        'id, code, name, total_hours',
        ['kind', 'degree', 'major_name', 'department', 'supersedes', 'last_catalog_year', 'description', 'college', 'major_code', 'is_base', 'aliases'],
      ),
      db.from('degree_plans').select('id, concentration_id, catalog_year, gened_program, total_hours, covers_earlier'),
    ]).then(([programsRes, plansRes]) => {
      const failure = programsRes.error ?? plansRes.error
      if (failure) setFetchError(failure.message)
      else { setPrograms(programsRes.data); setPlans(plansRes.data) }
      setLoading(false)
    })
  }, [])

  const termYear = academicYearOf(season, year)
  const primary = programs.find(p => p.id === profile.concentration_id) ?? null
  const options = isMinor
    ? addableMinors(programs, plans, termYear, { added: addedPrograms })
    : addableMajors(programs, plans, termYear, { primary, added: addedPrograms })
  const tree = isMinor ? [] : groupByCollege(query.trim() ? searchPrograms(options, query) : options)
  const minorList = isMinor ? (query.trim() ? options.filter(p => `${p.name} ${p.aliases ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())) : options) : []
  const chosen = options.find(p => p.id === selected?.id) ?? null
  const planYear = chosen ? planForYear(plans, chosen.id, termYear)?.catalog_year : null
  const position = 1 + Math.max(0, ...addedPrograms.map(p => p.position ?? 0))
  const row = chosen ? newProgramRow({ studentId: profile.id, program: chosen, plans, season, year, position, role }) : null
  const years = Array.from({ length: 6 }, (_, i) => today.year - 1 + i)
  const minorsAlready = addedPrograms.filter(p => p.role === 'minor').length
  const transcriptNotice = isMinor && chosen ? minorTranscriptNotice(minorsAlready) : null
  const noun = isMinor ? 'minor' : 'second major'

  // does the chosen minor have slots in the plan it would follow? A tier 3 minor has none. null until it is known.
  const checkKey = isMinor && chosen && planYear ? `${chosen.id}:${planYear}` : null
  const modelled = checkKey && slotCheck.key === checkKey ? slotCheck.value : null
  useEffect(() => {
    if (!checkKey) return
    let live = true
    const [id, catalogYear] = checkKey.split(':')
    db.from('requirement_slots').select('id').eq('concentration_id', Number(id)).eq('catalog_year', catalogYear).limit(1)
      .then(({ data }) => { if (live) setSlotCheck({ key: checkKey, value: (data ?? []).length > 0 }) })
    return () => { live = false }
  }, [checkKey])

  // what adding it would do to the finish; null until known (or when it cannot be worked out)
  const effectKey = evaluate && row ? `${role}:${row.concentration_id}:${row.catalog_year}` : null
  const [effect, setEffect] = useState({ key: null, result: null })
  useEffect(() => {
    if (!effectKey) return
    let live = true
    evaluate(row).then(result => { if (live) setEffect({ key: effectKey, result }) }).catch(() => { if (live) setEffect({ key: effectKey, result: null }) })
    return () => { live = false }
    // `row` is derived from `effectKey`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectKey])
  const delay = effectKey && effect.key === effectKey && effect.result ? describeDelay(effect.result) : null

  return (
    <div className="ds-modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !adding) onClose() }}>
      <div className="ds-modal" role="dialog" aria-modal="true" aria-labelledby="add-program-title">
        <div className="ds-modal-head">
          <p className="ds-eyebrow">Degree programs</p>
          <h3 className="ds-modal-title" id="add-program-title">{isMinor ? 'Add a minor' : 'Add a second major'}</h3>
          <p className="ds-sub" style={{ fontSize: 11, lineHeight: 1.6 }}>
            Your plan keeps its current degree program and adds the courses {isMinor ? 'this minor' : 'this one'} needs.
          </p>
        </div>
        <div className="ds-modal-body">
          <p className="ds-eyebrow" style={{ margin: '0 0 6px' }}>Starting</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select className="ds-act-input" style={{ textAlign: 'left' }} aria-label={`Year you start the ${noun}`} value={year} onChange={e => { setYear(Number(e.target.value)); setSelected(null) }} disabled={adding}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="ds-act-input" style={{ textAlign: 'left' }} aria-label={`Semester you start the ${noun}`} value={season} onChange={e => { setSeason(e.target.value); setSelected(null) }} disabled={adding}>
              {ENTRY_SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {loading ? (
            <p className="ds-modal-text">Loading programs…</p>
          ) : fetchError ? (
            <p className="ds-modal-text" style={{ color: 'var(--danger)' }}>{fetchError}</p>
          ) : (
            <>
              {options.length > 10 && (
                <input
                  type="search"
                  className="ds-act-input"
                  style={{ width: '100%', margin: '0 0 6px', textAlign: 'left' }}
                  placeholder={isMinor ? 'Search minors' : 'Search majors'}
                  aria-label={isMinor ? 'Search minors' : 'Search majors'}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              )}
              {(isMinor ? minorList.length === 0 : tree.length === 0) && (
                <p className="ds-modal-text">{query.trim() ? `No program matches “${query.trim()}”.` : `No other ${noun} can be added for that term yet.`}</p>
              )}
              {isMinor && minorList.map(c => (
                <button key={c.id} className={`ds-option${chosen?.id === c.id ? ' ds-option-selected' : ''}`} onClick={() => setSelected(c)} disabled={adding}>
                  <span className="ds-option-mark" aria-hidden="true">{chosen?.id === c.id ? '●' : '○'}</span>
                  <span className="ds-option-text"><span className="ds-setting-label">{c.name}</span></span>
                  <span className="ds-option-meta">{c.total_hours} hrs</span>
                </button>
              ))}
              {tree.map(({ college, majors }) => (
                <div key={college.code}>
                  {tree.length > 1 && <p className="ds-eyebrow" style={{ margin: '14px 0 2px' }}>{college.short}</p>}
                  {majors.map(major => (
                    <div key={major.key}>
                      {(tree.length > 1 || majors.length > 1) && <p className="ds-eyebrow" style={{ margin: '10px 0 4px' }}>{degreeTitle(major)}</p>}
                      {major.programs.map(c => (
                        <button key={c.id} className={`ds-option${chosen?.id === c.id ? ' ds-option-selected' : ''}`} onClick={() => setSelected(c)} disabled={adding}>
                          <span className="ds-option-mark" aria-hidden="true">{chosen?.id === c.id ? '●' : '○'}</span>
                          <span className="ds-option-text"><span className="ds-setting-label">{c.name}</span></span>
                          <span className="ds-option-meta">{c.total_hours} hrs</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
          {chosen && !(isMinor && modelled === false) && <p className="ds-modal-warn">{isMinor ? MINOR_OVERLAP_NOTE : OVERLAP_NOTE}</p>}
          {isMinor && chosen && modelled === false && (
            <p className="ds-modal-warn">
              {NOT_MODELLED_NOTE}
              {chosen.description && <><br /><br />{chosen.description.replace(/^Not modelled here:[^.]*\.\s*/, '')}</>}
            </p>
          )}
          {transcriptNotice && <p className="ds-modal-warn" role="note">{transcriptNotice}</p>}
          {effectKey && !delay && <p className="ds-modal-text" role="status">Working out what this does to your finish…</p>}
          {delay && (
            <p className={`ds-modal-warn ds-whatif-${delay.state}`} role="status">
              {delay.sentence}
              {delay.detail && <><br />{delay.detail}</>}
            </p>
          )}
          {error && <p className="ds-modal-text" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>
        <div className="ds-modal-foot">
          <button className="ds-btn-ghost" onClick={onClose} disabled={adding}>Cancel</button>
          <button className="ds-btn-primary" onClick={() => row && onAdd(row)} disabled={!row || adding}>
            {adding ? 'Adding…' : chosen ? `Add ${chosen.name}` : `Choose a ${noun}`}
          </button>
        </div>
      </div>
    </div>
  )
}
