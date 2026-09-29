// PlanPdfDocument.jsx
// The printed degree plan, built with @react-pdf/renderer, laid out as the
// department's Degree Map: a header with catalog year / degree / major /
// concentration, then one band per year with two semesters side by side, then
// the legend, notes and test-score boxes advisors fill in during a meeting.
//
// This is React, but not the DOM. @react-pdf ships its own reconciler, so the
// only elements that exist here are its primitives — Document, Page, View,
// Text. There is no <div>, no className, and no index.css: a bare string
// outside a <Text> throws rather than rendering. Layout is Yoga (the same
// flexbox engine React Native uses), which means flexDirection defaults to
// 'column', percentages and flex work, and grid/float/position:sticky do not.
// The degree map's "table" is therefore rows of fixed-width Views, not a table.
//
// Styles come from StyleSheet.create as plain objects with no cascade and no
// inheritance beyond a handful of text properties, so anything shared is
// spelled out on each node or composed as an array: style={[a, b]}.
//
// Only imported behind a dynamic import() from ExportPlanButton — pulling it
// eagerly would put pdfkit in the main bundle for every student who never
// exports anything.

import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer'
import { formatCourseCode } from '../lib/planExportModel'

// LETTER is 612pt wide. The footer is absolutely positioned and needs a real
// width (see styles.footer), so the margin and the content width it implies
// are named rather than repeated as literals.
const PAGE_MARGIN   = 36
const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2

// TTU brand colours, as the degree-map template uses them: purple column
// header rows with white text, gold year bands.
const PURPLE = '#4F2984'
const GOLD   = '#FFDD00'
const GRID   = '#9a9a9a'

// Legend fills. The template uses Word's green / cyan / magenta / yellow
// highlighters; these are the same hues toned down so black text stays
// readable on paper and in greyscale printing.
const STATUS = {
  completed:   { label: 'Completed',      fill: '#B6E6AE' },
  inProgress:  { label: 'In Progress',    fill: '#A6E4EF' },
  pending:     { label: 'Pending Credit', fill: '#F2B8EE' },
  recommended: { label: 'Recommended',    fill: '#FFF07A' },
}

// @react-pdf hyphenates long words by default, which splits requirement
// names mid-word ("General Edu-cation"). Wrap on whole words only.
Font.registerHyphenationCallback(word => [word])

// Course column vs. credit-hours column inside each half of a year band.
const CREDIT_COL = 38

// Helvetica is one of the three fonts baked into the PDF format itself
// (with Times-Roman and Courier). Anything else means Font.register and a
// network fetch at generation time, which would make the download fail
// offline for the sake of a typeface.
const styles = StyleSheet.create({
  // Do NOT put lineHeight on the Page. A lineHeight here is inherited by the
  // absolutely-positioned `fixed` footer and silently drops it from the
  // output entirely — no error, no warning, the whole node is just missing
  // from the PDF. Verified against @react-pdf/renderer 4.9.0 by bisecting
  // the page style: padding, fontFamily and color are all safe; lineHeight
  // alone kills it. Line spacing therefore lives on the text styles that
  // actually wrap.
  page: {
    paddingTop:        30,
    paddingBottom:     44,   // leaves room for the fixed footer
    paddingHorizontal: PAGE_MARGIN,
    fontFamily:        'Helvetica',
    fontSize:          9,
    color:             '#1a1a1a',
  },

  // ── Title block ──
  titleRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   22,
    color:      PURPLE,
    // Explicit, and not inherited from the Page (see above): without it the
    // 22pt title reserves a line box shorter than its own glyphs.
    lineHeight: 1.2,
  },
  titleRule: {
    height:          3,
    backgroundColor: GOLD,
    width:           150,
    marginTop:       2,
  },
  identity: {
    width: 210,
  },
  identityLine: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    marginBottom:  6,
  },
  identityLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   9,
    width:      58,
  },
  // A fill-in line: the app doesn't store the student's name or T-Number,
  // so they are written in by hand.
  blankLine: {
    flex:              1,
    borderBottomWidth: 0.75,
    borderBottomColor: '#1a1a1a',
    height:            10,
  },
  degreeRow: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    marginTop:      8,
  },
  degreeItem: {
    fontSize:    9,
    marginRight: 18,
  },
  degreeLabel: {
    fontFamily: 'Helvetica-Bold',
  },
  intro: {
    fontSize:   7.5,
    color:      '#4a4a4a',
    lineHeight: 1.35,
    marginTop:  5,
    marginBottom: 8,
  },

  // ── Year band table ──
  yearBlock: {
    borderWidth:  0.75,
    borderColor:  GRID,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection:   'row',
    backgroundColor: PURPLE,
  },
  headerCell: {
    color:      '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize:   8.5,
    paddingVertical:   2.5,
    paddingHorizontal: 4,
  },
  yearBand: {
    backgroundColor: GOLD,
    paddingVertical: 2.5,
    borderTopWidth:    0.75,
    borderTopColor:    GRID,
    borderBottomWidth: 0.75,
    borderBottomColor: GRID,
  },
  yearLabel: {
    fontFamily:    'Helvetica-Bold',
    fontSize:      9,
    textAlign:     'center',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
  },
  half: {
    flex:          1,
    flexDirection: 'row',
  },
  // The vertical rule between the two semesters of a year.
  leftHalf: {
    borderRightWidth: 0.75,
    borderRightColor: GRID,
  },
  semesterLine: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    paddingVertical:   2.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.75,
    borderBottomColor: GRID,
  },
  semesterTerm: {
    fontSize: 8.5,
  },
  semesterBold: {
    fontFamily: 'Helvetica-Bold',
  },
  courseCell: {
    flex:              1,
    paddingVertical:   1.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#cfcfcf',
    borderRightWidth:  0.5,
    borderRightColor:  '#cfcfcf',
  },
  creditCell: {
    width:           CREDIT_COL,
    paddingVertical: 1.5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#cfcfcf',
  },
  courseText: {
    fontSize:   8.5,
    lineHeight: 1.3,
  },
  courseCode: {
    fontFamily: 'Helvetica-Bold',
  },
  requirement: {
    color: '#5a5a5a',
  },
  creditText: {
    fontSize:  8.5,
    textAlign: 'center',
    lineHeight: 1.3,
  },
  footnoteMark: {
    fontSize:      6,
    verticalAlign: 'super',
  },
  emptySemester: {
    fontSize:  8,
    color:     '#6b6b6b',
    fontStyle: 'italic',
  },

  // ── Bottom boxes ──
  boxTitle: {
    fontFamily:   'Helvetica-Bold',
    fontSize:     8.5,
    marginBottom: 3,
  },
  noteText: {
    fontSize:   7.5,
    lineHeight: 1.35,
  },
  boxRow: {
    flexDirection: 'row',
  },
  box: {
    borderWidth: 0.75,
    borderColor: GRID,
    padding:     6,
    marginRight: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  2.5,
  },
  swatch: {
    width:       10,
    height:      8,
    marginRight: 4,
    borderWidth: 0.5,
    borderColor: '#8a8a8a',
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems:    'flex-end',
    marginBottom:  2.5,
  },
  scoreLabel: {
    fontSize: 8,
    width:    14,
  },
  scoreValue: {
    fontSize: 8,
    width:    26,
    borderBottomWidth: 0.5,
    borderBottomColor: '#1a1a1a',
    textAlign: 'center',
  },

  // ── Footer ──
  footer: {
    position:  'absolute',
    bottom:    20,
    left:      PAGE_MARGIN,
    // An explicit width, not left+right. Yoga resolves an absolutely
    // positioned box from left+right in the DOM, but here that pair leaves
    // the node zero-width and it renders nothing at all — the footer was
    // silently absent from the PDF until this became a fixed width.
    width:     CONTENT_WIDTH,
    flexDirection:  'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#c4c4c4',
    paddingTop:     5,
  },
  footerText: {
    fontSize: 7,
    color:    '#6b6b6b',
  },
})

// An em dash where a value is genuinely unknown reads better in print than a
// blank cell, which looks like the generator failed.
const EM_DASH = '—'

function CourseCell({ course, status }) {
  const fill = status ? { backgroundColor: STATUS[status].fill } : {}

  // An empty cell keeps the grid lines continuous when one semester of the
  // pair has more courses than the other.
  if (!course) {
    return (
      <>
        <View style={[styles.courseCell, fill]}><Text style={styles.courseText}> </Text></View>
        <View style={[styles.creditCell, fill]}><Text style={styles.creditText}> </Text></View>
      </>
    )
  }

  const mark = course.footnote
    ? <Text style={styles.footnoteMark}>{course.footnote}</Text>
    : null

  let body
  if (course.kind === 'pool-empty') {
    // An unchosen pool slot prints as the requirement, as the degree map
    // does ("Humanities/Fine Arts Elective"), never as a course.
    body = <Text style={styles.courseText}>{course.requirement}{mark}</Text>
  } else {
    const title = course.title ?? (course.kind === 'free-add' ? 'Added by student' : null)
    body = (
      <Text style={styles.courseText}>
        <Text style={styles.courseCode}>{formatCourseCode(course.code) ?? EM_DASH}</Text>
        {title ? ` ${title}` : ''}
        {course.kind === 'pool' && (
          <Text style={styles.requirement}>{` (${course.requirement})`}</Text>
        )}
        {mark}
      </Text>
    )
  }

  return (
    <>
      <View style={[styles.courseCell, fill]}>{body}</View>
      <View style={[styles.creditCell, fill]}>
        <Text style={styles.creditText}>{course.credits == null ? EM_DASH : course.credits}</Text>
      </View>
    </>
  )
}

function SemesterLine({ semester }) {
  if (!semester) return <View style={styles.semesterLine}><Text style={styles.semesterTerm}> </Text></View>
  return (
    <View style={styles.semesterLine}>
      <Text style={styles.semesterTerm}>
        <Text style={styles.semesterBold}>Semester: </Text>
        {semester.termLabel ?? semester.ordinalLabel}
      </Text>
      <Text style={styles.semesterTerm}>
        <Text style={styles.semesterBold}>Total Credit Hours: </Text>
        {semester.credits}
      </Text>
    </View>
  )
}

function YearBlock({ year }) {
  const [left, right] = year.semesters
  const rowCount = Math.max(left?.courses.length ?? 0, right?.courses.length ?? 0)

  // A year band is short enough to always fit on one page, so wrap={false}
  // pushes the whole band to the next page rather than splitting a semester.
  return (
    <View style={styles.yearBlock} wrap={false}>
      <View style={styles.headerRow}>
        {[0, 1].map(i => (
          <View key={i} style={[styles.half, i === 0 ? { borderRightWidth: 0.75, borderRightColor: '#ffffff' } : {}]}>
            <Text style={[styles.headerCell, { flex: 1 }]}>Course</Text>
            <Text style={[styles.headerCell, { width: CREDIT_COL, textAlign: 'center', paddingHorizontal: 0 }]}>Cr. Hrs.</Text>
          </View>
        ))}
      </View>

      <View style={styles.yearBand}>
        <Text style={styles.yearLabel}>{year.label}</Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.half, styles.leftHalf, { flexDirection: 'column' }]}>
          <SemesterLine semester={left} />
        </View>
        <View style={[styles.half, { flexDirection: 'column' }]}>
          <SemesterLine semester={right} />
        </View>
      </View>

      {rowCount === 0 ? (
        <View style={styles.row}>
          <View style={[styles.half, styles.leftHalf, styles.courseCell]}>
            <Text style={styles.emptySemester}>No courses planned.</Text>
          </View>
          <View style={[styles.half, styles.courseCell]}>
            <Text style={styles.emptySemester}>{right ? 'No courses planned.' : ' '}</Text>
          </View>
        </View>
      ) : (
        Array.from({ length: rowCount }, (_, i) => (
          <View key={i} style={styles.row}>
            <View style={[styles.half, styles.leftHalf]}>
              <CourseCell course={left?.courses[i]} status={left?.status} />
            </View>
            <View style={styles.half}>
              <CourseCell course={right?.courses[i]} status={right?.status} />
            </View>
          </View>
        ))
      )}
    </View>
  )
}

function ScoreBox({ title, scores, last = false }) {
  return (
    <View style={[styles.box, { width: 72 }, last ? { marginRight: 0 } : {}]}>
      <Text style={styles.boxTitle}>{title}</Text>
      {scores.map(([label, value]) => (
        <View key={label} style={styles.scoreLine}>
          <Text style={styles.scoreLabel}>{label}:</Text>
          <Text style={styles.scoreValue}>{value ?? ' '}</Text>
        </View>
      ))}
    </View>
  )
}

export default function PlanPdfDocument({ model }) {
  const act = model.actScores ?? {}
  const priorCredits = model.priorCredits ?? []
  const footnotes    = model.footnotes ?? []
  const years        = model.years ?? []

  return (
    <Document
      title={`Degree Map${model.concentrationName ? ` ${EM_DASH} ${model.concentrationName}` : ''}`}
      author="MyDegreePlan"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Degree Map</Text>
            <View style={styles.titleRule} />
          </View>
          <View style={styles.identity}>
            <View style={styles.identityLine}>
              <Text style={styles.identityLabel}>Name:</Text>
              <View style={styles.blankLine} />
            </View>
            <View style={styles.identityLine}>
              <Text style={styles.identityLabel}>T-Number:</Text>
              <View style={styles.blankLine} />
            </View>
          </View>
        </View>

        <View style={styles.degreeRow}>
          {[
            ['CATALOG YEAR', model.catalogYear],
            ['Degree',       model.degree],
            ['MAJOR',        model.major],
            ['Concentration', model.concentrationName],
          ].map(([label, value]) => (
            <Text key={label} style={styles.degreeItem}>
              <Text style={styles.degreeLabel}>{label}: </Text>
              {value ?? EM_DASH}
            </Text>
          ))}
        </View>

        <Text style={styles.intro}>
          This map shows one path to completing the degree, built from the student's
          plan in MyDegreePlan{model.generatedOn ? ` on ${model.generatedOn}` : ''}.
          It provides general direction; confirm course choices and sequencing with an advisor.
          {model.graduationLabel ? ` Projected graduation: ${model.graduationLabel}.` : ''}
        </Text>

        {years.length === 0 ? (
          <Text style={styles.emptySemester}>No semesters planned.</Text>
        ) : (
          years.map(year => <YearBlock key={year.label} year={year} />)
        )}

        {/* One row, as on the paper form: the Notes box takes the free width
            and leaves room below the footnotes for the advisor to write. */}
        <View style={[styles.boxRow, { marginTop: 2 }]} wrap={false}>
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={styles.boxTitle}>Notes:</Text>
            {footnotes.map((text, i) => (
              <Text key={i} style={styles.noteText}>{`${i + 1}. ${text}`}</Text>
            ))}
            {priorCredits.length > 0 && (
              <Text style={[styles.noteText, { marginTop: footnotes.length ? 3 : 0 }]}>
                <Text style={styles.courseCode}>Prior credit (not shown above): </Text>
                {priorCredits.map(pc => [
                  pc.code ? formatCourseCode(pc.code) : (pc.title ?? EM_DASH),
                  pc.source ? ` (${pc.source}, ${pc.credits} cr)` : ` (${pc.credits} cr)`,
                ].join('')).join('; ')}
              </Text>
            )}
          </View>

          <View style={[styles.box, { width: 92 }]}>
            <Text style={styles.boxTitle}>Legend:</Text>
            {Object.values(STATUS).map(s => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: s.fill }]} />
                <Text style={{ fontSize: 8 }}>{s.label}</Text>
              </View>
            ))}
          </View>

          <ScoreBox title="ACT Scores" scores={[
            ['C', act.composite], ['E', act.english], ['M', act.math],
            ['R', act.reading],   ['S', act.science],
          ]} />

          {/* DSPW scores are not stored by the app; the advisor fills these in. */}
          <ScoreBox title="DSPW Scores" scores={[['E', null], ['M', null], ['R', null], ['S', null]]} last />
        </View>

        {/* `fixed` repeats this on every page; `render` gets per-page state.
            The disclaimer is not decoration — this document must never be
            mistaken for an official academic record. */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Generated by MyDegreePlan. Unofficial planning document {EM_DASH} not an academic record.
          </Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
