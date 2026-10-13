// AuditPdfDocument.jsx
// The printed degree audit: its own PDF, separate from the Degree Map. The Requirements tab as print (lib/auditExportModel.js builds the
// model from the same audit and projection the screen shows): the requirement counts and hours, the finish line, then each block of the
// degree with its groups and rows (the course, a state word and fill, where the credit comes from, the hours), and what did not count.
//
// Same rules as PlanPdfDocument: @react-pdf primitives only, Yoga layout, plain StyleSheet objects, and only imported behind a dynamic
// import() (from ExportAuditButton and AuditPdfPreview) so the renderer stays out of the main bundle.

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { shared, PURPLE, GRID, EM_DASH } from './pdfStyles'
import PdfFooter from './PdfFooter'
import PdfTitleBlock from './PdfTitleBlock'

// The audit's own status fills, the Degree Map legend's hues again. A state is always spelled out beside its fill, so a greyscale print
// still says it. A planned course has no fill: it is the quiet default.
const AUDIT_FILL = {
  done:        '#B6E6AE',
  in_progress: '#A6E4EF',
  planned:     null,
  not_placed:  '#FFE9A6',
}

const styles = { ...shared, ...StyleSheet.create({
  // ── Audit pages ──
  finishBox: {
    borderWidth: 0.75,
    borderColor: GRID,
    padding:     7,
    marginBottom: 8,
  },
  finishLead: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   12,
    color:      PURPLE,
    lineHeight: 1.25,
  },
  finishText: {
    fontSize:   8,
    lineHeight: 1.4,
    marginTop:  3,
  },
  blockBar: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    backgroundColor: PURPLE,
    paddingVertical:   3,
    paddingHorizontal: 5,
    marginTop:         6,
  },
  blockTitle: {
    color:      '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize:   9.5,
  },
  groupHead: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    backgroundColor: '#FFF4B8',
    paddingVertical:   2,
    paddingHorizontal: 5,
    marginTop:         4,
    borderBottomWidth: 0.5,
    borderBottomColor: GRID,
  },
  groupTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   8.5,
  },
  auditRow: {
    flexDirection:     'row',
    alignItems:        'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#cfcfcf',
  },
  auditStatus: {
    width:             58,
    paddingVertical:   1.5,
    paddingHorizontal: 3,
    borderRightWidth:  0.5,
    borderRightColor:  '#cfcfcf',
  },
  auditStatusText: {
    fontSize:   7.5,
    lineHeight: 1.3,
  },
  auditCourse: {
    flex:              1,
    paddingVertical:   1.5,
    paddingHorizontal: 4,
  },
  auditWhere: {
    width:             128,
    fontSize:          7.5,
    lineHeight:        1.3,
    color:             '#4a4a4a',
    paddingVertical:   1.5,
    paddingHorizontal: 3,
  },
  auditHours: {
    width:           26,
    fontSize:        8.5,
    textAlign:       'center',
    paddingVertical: 1.5,
  },
}) }

function AuditRow({ row }) {
  const fill = AUDIT_FILL[row.state] ? { backgroundColor: AUDIT_FILL[row.state] } : {}
  const tags = row.tags ?? []
  return (
    <View style={styles.auditRow} wrap={false}>
      <View style={[styles.auditStatus, fill]}>
        <Text style={styles.auditStatusText}>{row.stateLabel}</Text>
      </View>
      <View style={styles.auditCourse}>
        <Text style={styles.courseText}>
          {row.code ? <Text style={styles.courseCode}>{row.code}</Text> : null}
          {row.code && row.title ? ' ' : ''}
          {row.title ?? ''}
          {tags.length > 0 ? <Text style={styles.requirement}>{` (${tags.join('; ')})`}</Text> : null}
        </Text>
      </View>
      <Text style={styles.auditWhere}>{row.where ?? ' '}</Text>
      <Text style={styles.auditHours}>{row.hours ?? ' '}</Text>
    </View>
  )
}

// How many rows travel with a heading: a heading is never left alone at the foot of a page (minPresenceAhead does not hold it here).
const KEEP_WITH_HEADING = 2

function groupItems(group) {
  return [
    ...group.refs.map((ref, i) => <AuditRow key={`ref-${i}`} row={ref} />),
    ...group.rows.map((row, i) => <AuditRow key={i} row={row} />),
  ]
}

function GroupHead({ group }) {
  return (
    <>
      <View style={styles.groupHead}>
        <Text style={styles.groupTitle}>{group.title}</Text>
        {group.progressLabel ? <Text style={{ fontSize: 8 }}>{group.progressLabel}</Text> : null}
      </View>
      {group.note ? <Text style={[styles.noteText, { paddingHorizontal: 5, paddingVertical: 1.5 }]}>{group.note}</Text> : null}
    </>
  )
}

// `lead` is whatever heads the group on this page (a block's bar, for its first group), kept with the group's first rows.
function AuditGroup({ group, lead = null }) {
  const items = groupItems(group)
  return (
    <View>
      <View wrap={false}>
        {lead}
        <GroupHead group={group} />
        {items.slice(0, KEEP_WITH_HEADING)}
      </View>
      {items.slice(KEEP_WITH_HEADING)}
    </View>
  )
}

function AuditBlock({ block }) {
  const head = (
    <View>
      <View style={styles.blockBar}>
        <Text style={styles.blockTitle}>{block.title}</Text>
        {block.countLabel ? <Text style={[styles.blockTitle, { fontSize: 8.5 }]}>{block.countLabel}</Text> : null}
      </View>
      {block.datesLine ? <Text style={[styles.noteText, { marginTop: 2 }]}>{block.datesLine}</Text> : null}
      {block.summary ? <Text style={[styles.noteText, { marginTop: 2 }]}>{block.summary}</Text> : null}
      {block.exemptLine ? <Text style={[styles.noteText, { marginTop: 1 }]}>{block.exemptLine}</Text> : null}
    </View>
  )
  const [first, ...rest] = block.groups
  return (
    <View>
      {first ? <AuditGroup group={first} lead={head} /> : head}
      {rest.map(group => <AuditGroup key={group.title} group={group} />)}
    </View>
  )
}

export default function AuditPdfDocument({ model }) {
  const audit = model.audit
  const { finish, requirements: r } = audit

  return (
    <Document
      title={`Degree Audit${model.concentrationName ? ` ${EM_DASH} ${model.concentrationName}` : ''}`}
      author="MyDegreePlan"
    >
      <Page size="LETTER" style={styles.page}>
        <PdfTitleBlock
          title="Degree Audit"
          catalogYear={model.catalogYear}
          degree={model.degree}
          major={model.major}
          concentration={model.concentration}
        />

        <Text style={styles.intro}>
          Every requirement of the degree program, read from the student's plan and prior credit in MyDegreePlan{model.generatedOn ? ` on ${model.generatedOn}` : ''}.
          A course in a past term counts as done, one in the current term as in progress, and one in a later term as planned. A course counts
          once, toward one requirement. It provides general direction; confirm with an advisor.
        </Text>

        <View style={styles.finishBox} wrap={false}>
          <Text style={styles.noteText}>
            <Text style={styles.courseCode}>{`${r.done + r.inProgress + r.planned} of ${r.total} requirements are done or placed in the plan`}</Text>
            {`: ${r.done} done, ${r.inProgress} in progress, ${r.planned} planned, ${r.open} still open. `}
            {audit.hoursLine}
          </Text>
        </View>

        {finish ? (
          <View style={styles.finishBox}>
            <Text style={styles.finishLead}>{`${finish.lead}${finish.graduationLabel ?? ''}`}</Text>
            {finish.detail ? <Text style={styles.finishText}>{finish.detail}</Text> : null}
            {finish.pace ? <Text style={styles.finishText}>{finish.pace}</Text> : null}
            {finish.chainText ? <Text style={[styles.finishText, { fontFamily: 'Helvetica-Bold' }]}>{finish.chainText}</Text> : null}
            {finish.blocked.map((line, i) => (
              <Text key={i} style={styles.finishText}>{`Cannot be placed: ${line}.`}</Text>
            ))}
            {finish.fine ? <Text style={[styles.finishText, { color: '#4a4a4a', fontSize: 7 }]}>{finish.fine}</Text> : null}
          </View>
        ) : null}

        {audit.blocks.map(block => <AuditBlock key={block.id} block={block} />)}

        <View wrap={false}>
          <View style={styles.blockBar}>
            <Text style={styles.blockTitle}>Not counted toward a requirement</Text>
            {audit.notCounted.length > 0 ? <Text style={[styles.blockTitle, { fontSize: 8.5 }]}>{`${audit.notCounted.length} ${audit.notCounted.length === 1 ? 'item' : 'items'}`}</Text> : null}
          </View>
          {audit.notCounted.length === 0 ? (
            <Text style={[styles.noteText, { marginTop: 3 }]}>Everything in the plan counts toward a requirement.</Text>
          ) : (
            audit.notCounted.map((item, i) => (
              <View key={i} style={styles.auditRow} wrap={false}>
                <View style={styles.auditCourse}>
                  <Text style={styles.courseText}>
                    <Text style={styles.courseCode}>{item.label}</Text>
                    {item.hours ? ` (${item.hours} hrs)` : ''}
                    <Text style={styles.requirement}>{` ${EM_DASH} ${item.reason}`}</Text>
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <PdfFooter />
      </Page>
    </Document>
  )
}
