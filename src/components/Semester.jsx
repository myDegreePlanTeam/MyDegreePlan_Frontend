import { Fragment, useState, useEffect } from 'react'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { useDragEnabled } from '../lib/dragEnabled'
import { POOL_LABELS, formatMissingForDisplay } from '../lib/poolResolver'
import { calculateCredits } from '../lib/semesterCredits'
import { formatCourseCode } from '../lib/courseCodeFormat'
import { codesText } from '../lib/planCheck'
import StatusChip from './shell/StatusChip'
import { hoursText } from '../lib/hoursText'

// Maps prior_credit.credit_type to a short label shown on transfer-filled slots
const CREDIT_TYPE_LABELS = {
  ap_credit:       'AP',
  transfer_credit: 'Transfer',
  test_out:        'CLEP',
  ib_credit:       'IB',
  act_placement:   'ACT',
  act_credit:      'ACT',
  cambridge:       'Cambridge',
}


// One semester card on the plan (redesign Phase 3b). The header says where the semester stands (Now, In progress, Planned, Done) and how many
// hours it holds; a row says nothing about status unless it is an exception (blocked, needs attention) or an open pick. Clicking a row selects
// it (the course panel opens); rows drag between cards. A semester that is not open is one line.
//
// `flags` is lib/planCheck.js flagsBySemester for this semester: the picks still to make, whether a later course depends on one, and how many
// real problems it has. `pickNeeds` is { [slotId]: courseCodes } for an open pick a later course depends on.
export default function Semester({
  semesterNumber,
  slots,
  freeAddSlots       = [],
  courseMap,
  planSlots          = {},
  allFreeAddSlots    = freeAddSlots,
  // { [slotId]: hours } — Free Elective hours no course covers yet; each becomes
  // a "choose a course" row under its slot (see poolRemainder.js)
  remainders         = {},
  onSelectSlot,
  onSelectFreeAdd,
  onSelectRemainder,
  selectedKey        = null,
  onAddCourse,
  scienceWarnings    = {},
  poolLimitWarnings  = {},
  prereqWarnings     = {},
  coreqWarnings      = {},
  standingWarnings   = {},
  transferFilled     = {},
  transferDetails    = {},
  // { [slotId]: string[] } the programs a course serves (when the plan follows several); { [slotId]: true } courses a program filter dims
  programTags        = {},
  dimmed             = {},
  pickNeeds          = {},
  flags              = null,
  note               = '',
  onNoteSave,
  isExpanded         = true,
  onToggleExpand,
  isPast                     = false,
  termLabel                 = null,
  isCurrent                  = false,
  isGraduation               = false,
  issueCount                 = 0,
  onDelete                   = null,
}) {
  const dragEnabled = useDragEnabled()
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: semesterNumber, disabled: !dragEnabled })

  const totalCr         = calculateCredits(slots, freeAddSlots, courseMap, planSlots, allFreeAddSlots)
  const hasUnfilledPool = slots.some(s => s.is_pool && (!planSlots[s.id] || remainders[s.id] > 0))
  const isEmpty         = slots.length === 0 && freeAddSlots.length === 0

  const [noteOpen, setNoteOpen] = useState(false)
  const [noteText, setNoteText] = useState(note)
  useEffect(() => { setNoteText(note) }, [note])

  function handleNoteBlur() {
    if (noteText === note) return
    onNoteSave(semesterNumber, noteText)
  }

  const name = termLabel ?? `Semester ${semesterNumber}`

  // A past semester is done when nothing in it is flagged (an unchosen pool course or a broken requisite is not "passed")
  const isDone = isPast && issueCount === 0 && !hasUnfilledPool
  const status = isDone ? 'done' : isCurrent ? 'progress' : isPast ? null : 'planned'
  // Planned is the default for a later semester, so it is said only on an open card; an open or finished one always names its state
  const showStatus = status && (status !== 'planned' || isExpanded)

  const cardClass = [
    'ds-sem',
    isExpanded && 'ds-sem-open',
    isCurrent && 'ds-sem-current',
    isDone && 'ds-sem-done',
    isOver && 'ds-sem-over',
  ].filter(Boolean).join(' ')

  const picks = flags?.picks ?? 0

  return (
    <div className={cardClass} ref={setDropRef}>
      <button
        className="ds-sem-head"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${name}`}
      >
        <svg className="ds-sem-chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={isExpanded ? 'M5 8l5 5 5-5' : 'M8 5l5 5-5 5'} />
        </svg>
        <span className="ds-sem-name">{name}</span>
        {isCurrent && <span className="ds-sem-mark ds-sem-now">Now</span>}
        {showStatus && <StatusChip tone={status} />}
        {isGraduation && <span className="ds-sem-mark ds-sem-grad">Graduation</span>}
        {flags?.blocked > 0 && <StatusChip tone="blocked" />}
        {flags?.blocked === 0 && flags?.advice > 0 && <StatusChip tone="attention" />}
        {picks > 0 && (
          <span className={`ds-sem-picks${flags.needed ? ' ds-sem-picks-needed' : ''}`}>
            {picks} {picks === 1 ? 'pick' : 'picks'} to make{flags.needed ? `, needed for ${codesText(flags.needed)}` : ''}
          </span>
        )}
        <span className="ds-sem-spacer" />
        {note && <span className="ds-sem-note-dot" title="This semester has a note" aria-label="This semester has a note">✎</span>}
        <span className="ds-sem-cr">{hoursText(totalCr)}</span>
      </button>

      {isExpanded && (
        <div className="ds-sem-body">
          {noteOpen && (
            <div className="ds-sem-noteedit">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onBlur={handleNoteBlur}
                placeholder="Add a note for this semester..."
                aria-label={`Note for ${name}`}
                rows={2}
                autoFocus
              />
            </div>
          )}

          {isEmpty && (
            <p className="ds-sem-empty">No courses yet. Add one, or drag a course here.</p>
          )}

          {slots.map(slot => (
            <Fragment key={slot.id}>
              <SlotRow
                slot={slot}
                course={courseMap[slot.class_code]}
                selectedCode={planSlots[slot.id]}
                selectedCourse={planSlots[slot.id] ? courseMap[planSlots[slot.id]] : null}
                openCredits={slot.is_pool && !planSlots[slot.id] ? remainders[slot.id] : undefined}
                isSelected={selectedKey === slot.id}
                onSelect={() => onSelectSlot(slot)}
                scienceWarning={scienceWarnings[slot.id]}
                poolLimitWarning={poolLimitWarnings[slot.id]}
                prereqMissing={prereqWarnings[slot.id]}
                coreqMissing={coreqWarnings[slot.id]}
                standingWarning={standingWarnings[slot.id]}
                isTransferFilled={!!transferFilled[slot.id]}
                programTags={programTags[slot.id]}
                isDimmed={!!dimmed[slot.id]}
                needs={pickNeeds[slot.id]}
                transferLabel={
                  CREDIT_TYPE_LABELS[transferDetails[slot.id]?.creditType] ?? 'Transfer'
                }
              />
              {planSlots[slot.id] && remainders[slot.id] > 0 && (
                <RemainderRow
                  slot={slot}
                  hours={remainders[slot.id]}
                  isSelected={selectedKey === `rem_${slot.id}`}
                  onSelect={() => onSelectRemainder(slot)}
                />
              )}
            </Fragment>
          ))}

          {freeAddSlots.map(fa => (
            <FreeAddRow
              key={fa.id}
              freeAdd={fa}
              course={courseMap[fa.course_code]}
              isSelected={selectedKey === `fa_${fa.id}`}
              onSelect={() => onSelectFreeAdd(fa)}
              prereqMissing={prereqWarnings[`fa_${fa.id}`]}
              coreqMissing={coreqWarnings[`fa_${fa.id}`]}
            />
          ))}

          <div className="ds-sem-foot">
            <button onClick={onAddCourse}>Add course</button>
            <button
              className="ds-sem-foot-note"
              onClick={() => setNoteOpen(o => !o)}
              aria-expanded={noteOpen}
            >
              {note ? 'Edit note' : 'Add a note'}
            </button>
            {isEmpty && onDelete && <button onClick={onDelete}>Remove semester</button>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Row presentation ──────────────────────────────────────────────────────────
// What a row says beyond its course: nothing for an ordinary course; for an exception a chip and the reason; for an open pick a "Pick a course"
// look. Prerequisite and corequisite problems are Blocked; science, hours-limit and standing problems need attention. Problems outrank an
// empty pick so one is never hidden behind it.
//   -> { chip: 'blocked' | 'attention' | null, tone: 'blocked' | 'attention' | 'info' | null, note: string | null, pick: boolean }
function describeRow({ prereqMissing, coreqMissing, scienceWarning, poolLimitWarning, standingWarning, fallbackNote, isEmptyPool, needs }) {
  if (prereqMissing?.length > 0) {
    return { chip: 'blocked', tone: 'blocked', note: `Needs ${formatMissingForDisplay(prereqMissing)} in an earlier term`, pick: false }
  }
  if (coreqMissing?.length > 0) {
    return { chip: 'blocked', tone: 'blocked', note: `Take with ${formatMissingForDisplay(coreqMissing)}`, pick: false }
  }
  if (scienceWarning) {
    return {
      chip: 'attention', tone: 'attention', pick: false,
      note: scienceWarning.type === 'incomplete'
        ? `Complete your ${scienceWarning.sequenceName} sequence`
        : 'Science sequence conflict',
    }
  }
  if (poolLimitWarning?.length > 0) {
    const w = poolLimitWarning[0]
    return { chip: 'attention', tone: 'attention', note: `${w.hours} hours of ${w.label.toLowerCase()}; at most ${w.maxHours} count`, pick: false }
  }
  if (standingWarning) {
    return { chip: null, tone: 'info', note: `${standingWarning === 'senior' ? 'Senior' : 'Junior'} standing required`, pick: false }
  }
  if (isEmptyPool) {
    return { chip: null, tone: needs?.length ? 'attention' : null, note: needs?.length ? `${codesText(needs)} ${needs.length === 1 ? 'needs' : 'need'} this first` : fallbackNote, pick: true }
  }
  return { chip: null, tone: null, note: null, pick: false }
}

function useRowDrag(id, type) {
  const enabled = useDragEnabled()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type, slotId: id },
    disabled: !enabled,
  })
  // Not draggable (a phone): no drag listeners, and no "draggable" role or instructions for a screen reader
  return { dragProps: enabled ? { ref: setNodeRef, ...listeners, ...attributes } : { ref: setNodeRef }, isDragging }
}

// `code` is a course code (shown in the code face) or, for an open pick, the requirement's name; `name` is the course's title.
function Row({ dragProps, isDragging, isSelected, onSelect, view, code, codeIsPick, name, tag, hours, programTags, isDimmed }) {
  return (
    <div
      {...dragProps}
      role="button"
      tabIndex={0}
      className={[
        'ds-row',
        isSelected && 'ds-row-selected',
        isDragging && 'ds-row-dragging',
        isDimmed && 'ds-row-dim',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      <span className="ds-row-text">
        <span className="ds-row-main">
          <span className={`ds-row-code${codeIsPick ? ' ds-row-code-pool' : ''}`}>{codeIsPick ? code : formatCourseCode(code)}</span>
          {name && <span className="ds-row-name">{name}</span>}
        </span>
        {view.note && <span className={`ds-row-note${view.tone ? ` ds-row-note-${view.tone}` : ''}`}>{view.note}</span>}
      </span>
      {tag && <span className="ds-row-tag">{tag}</span>}
      {programTags?.length > 0 && (
        <span className="ds-row-progs" aria-label={`Counts toward ${programTags.join(' and ')}`}>
          {programTags.map(label => <span key={label} className="ds-row-prog">{label}</span>)}
        </span>
      )}
      {view.chip && <StatusChip tone={view.chip} />}
      {view.pick && <span className="ds-row-pick">Pick a course</span>}
      <span className="ds-row-cr">{hours}</span>
    </div>
  )
}

function SlotRow({
  slot, course, selectedCode, selectedCourse, openCredits,
  isSelected, onSelect,
  scienceWarning, poolLimitWarning, prereqMissing, coreqMissing, standingWarning,
  isTransferFilled, transferLabel, programTags, isDimmed, needs,
}) {
  const { dragProps, isDragging } = useRowDrag(slot.id, 'requirement_slot')

  if (slot.is_pool) {
    const filled = !!selectedCode
    const view = describeRow({
      prereqMissing, coreqMissing, scienceWarning, poolLimitWarning, standingWarning,
      fallbackNote: isTransferFilled && !filled ? `Satisfied by ${transferLabel} credit` : null,
      isEmptyPool: !filled && !isTransferFilled, needs,
    })
    return (
      <Row
        dragProps={dragProps} isDragging={isDragging}
        isSelected={isSelected} onSelect={onSelect} view={view}
        code={filled ? selectedCode : (POOL_LABELS[slot.class_code] ?? slot.class_code)}
        codeIsPick={!filled}
        name={filled ? (selectedCourse?.name ?? 'Selected') : null}
        hours={hoursText(selectedCourse?.credits ?? openCredits ?? slot.flex_credits ?? 3)}
        programTags={programTags} isDimmed={isDimmed}
      />
    )
  }

  if (!course) {
    return (
      <div className="ds-row" aria-disabled="true">
        <span className="ds-row-text">
          <span className="ds-row-main"><span className="ds-row-code">{formatCourseCode(slot.class_code)}</span></span>
          <span className="ds-row-note">Course not found in catalog</span>
        </span>
        <span className="ds-row-cr">{hoursText(null)}</span>
      </div>
    )
  }

  const view = describeRow({ prereqMissing, coreqMissing, scienceWarning, standingWarning })
  return (
    <Row
      dragProps={dragProps} isDragging={isDragging}
      isSelected={isSelected} onSelect={onSelect} view={view}
      code={course.code} name={course.name}
      tag={isTransferFilled ? transferLabel : null}
      hours={hoursText(course.credits)}
      programTags={programTags} isDimmed={isDimmed}
    />
  )
}

// The hours a Free Elective's chosen courses leave open, as another choice. It
// is derived from the slot (not stored), so it has nothing to drag.
function RemainderRow({ slot, hours, isSelected, onSelect }) {
  const view = { chip: null, tone: null, note: `${hours} ${hours === 1 ? 'hour' : 'hours'} left to fill`, pick: true }
  return (
    <Row
      dragProps={{}} isDragging={false}
      isSelected={isSelected} onSelect={onSelect} view={view}
      code={POOL_LABELS[slot.class_code] ?? slot.class_code}
      codeIsPick
      hours={hoursText(hours)}
    />
  )
}

function FreeAddRow({ freeAdd, course, isSelected, onSelect, prereqMissing, coreqMissing }) {
  const { dragProps, isDragging } = useRowDrag(freeAdd.id, 'free_add')
  const view = describeRow({ prereqMissing, coreqMissing })
  return (
    <Row
      dragProps={dragProps} isDragging={isDragging}
      isSelected={isSelected} onSelect={onSelect} view={view}
      code={freeAdd.course_code} name={course?.name ?? null}
      tag={freeAdd.fills_slot_id != null ? 'Elective' : 'Added'}
      hours={hoursText(course?.credits ?? null)}
    />
  )
}
