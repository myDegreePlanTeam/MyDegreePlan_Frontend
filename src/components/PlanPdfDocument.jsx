// PlanPdfDocument.jsx
// The printed degree plan, built with @react-pdf/renderer.
//
// This is React, but not the DOM. @react-pdf ships its own reconciler, so the
// only elements that exist here are its primitives — Document, Page, View,
// Text. There is no <div>, no className, and no index.css: a bare string
// outside a <Text> throws rather than rendering. Layout is Yoga (the same
// flexbox engine React Native uses), which means flexDirection defaults to
// 'column', percentages and flex work, and grid/float/position:sticky do not.
//
// Styles come from StyleSheet.create as plain objects with no cascade and no
// inheritance beyond a handful of text properties, so anything shared is
// spelled out on each node or composed as an array: style={[a, b]}.
//
// Only imported behind a dynamic import() from ExportPlanButton — pulling it
// eagerly would put pdfkit in the main bundle for every student who never
// exports anything.

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

// LETTER is 612pt wide. The footer is absolutely positioned and needs a real
// width (see styles.footer), so the margin and the content width it implies
// are named rather than repeated as literals.
const PAGE_MARGIN   = 46
const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2

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
    paddingTop:      PAGE_MARGIN,
    paddingBottom:   56,   // leaves room for the fixed footer
    paddingHorizontal: PAGE_MARGIN,
    fontFamily:      'Helvetica',
    fontSize:        10,
    color:           '#1a1a1a',
  },

  // ── Title block ──
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   20,
    letterSpacing: -0.3,
    // Explicit: the page's lineHeight 1.4 is not inherited by a node that
    // sets its own fontSize, and without it the 20pt title reserves a line
    // box shorter than its own glyphs and the subtitle rides up into it.
    lineHeight: 1.25,
  },
  subtitle: {
    fontSize:   12,
    color:      '#3d3d3d',
    lineHeight: 1.3,
    marginTop:  2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    marginTop:     10,
  },
  metaItem: {
    fontSize:     9,
    color:        '#5a5a5a',
    marginRight:  16,
  },
  metaLabel: {
    fontFamily: 'Helvetica-Bold',
    color:      '#3d3d3d',
  },
  rule: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#1a1a1a',
    marginTop:         12,
    marginBottom:      18,
  },

  // ── Semester block ──
  semester: {
    marginBottom: 14,
  },
  semesterHeader: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'baseline',
    borderBottomWidth: 1,
    borderBottomColor: '#b8b8b8',
    paddingBottom:     4,
    marginBottom:      6,
  },
  semesterTerm: {
    fontFamily: 'Helvetica-Bold',
    fontSize:   12,
  },
  semesterOrdinal: {
    fontSize:   9,
    color:      '#6b6b6b',
    marginLeft: 8,
  },
  semesterCredits: {
    fontSize: 9.5,
    color:    '#3d3d3d',
  },

  // ── Course rows ──
  row: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    paddingVertical: 2.5,
  },
  colCode: {
    width:      64,
    fontFamily: 'Helvetica-Bold',
    fontSize:   9.5,
  },
  // The two columns that can wrap carry their own line spacing, since the
  // Page can't (see the note on styles.page).
  colTitle: {
    flex:       1,
    fontSize:   9.5,
    lineHeight: 1.35,
    paddingRight: 8,
  },
  colRequirement: {
    width:      104,
    fontSize:   8.5,
    color:      '#5a5a5a',
    lineHeight: 1.35,
    paddingRight: 8,
  },
  colCredits: {
    width:     34,
    fontSize:  9.5,
    textAlign: 'right',
  },
  unselected: {
    color:      '#5a5a5a',
    fontStyle:  'italic',
  },
  emptySemester: {
    fontSize:  9,
    color:     '#6b6b6b',
    fontStyle: 'italic',
    paddingVertical: 2,
  },

  // ── Footer ──
  footer: {
    position:  'absolute',
    bottom:    24,
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
    paddingTop:     6,
  },
  footerText: {
    fontSize: 7.5,
    color:    '#6b6b6b',
  },
})

// An em dash where a value is genuinely unknown reads better in print than a
// blank cell, which looks like the generator failed.
const EM_DASH = '—'

function CourseRow({ course }) {
  const isUnfilled = course.kind === 'pool-empty'

  // A pool slot the student hasn't chosen yet must not look like a course
  // they're enrolled in, so it prints the requirement name in the code column
  // position and says so outright in the title column.
  const title = isUnfilled
    ? 'Not yet selected'
    : (course.title ?? (course.kind === 'free-add' ? 'Added by student' : EM_DASH))

  return (
    <View style={styles.row} wrap={false}>
      <Text style={styles.colCode}>{course.code ?? EM_DASH}</Text>
      <Text style={[styles.colTitle, isUnfilled ? styles.unselected : {}]}>
        {title}
      </Text>
      <Text style={styles.colRequirement}>
        {isUnfilled
          ? course.requirement
          : (course.requirement ?? (course.kind === 'free-add' ? 'Added by student' : ''))}
      </Text>
      <Text style={styles.colCredits}>
        {course.credits == null ? EM_DASH : course.credits}
      </Text>
    </View>
  )
}

function SemesterBlock({ semester }) {
  // A semester is short enough to always fit on one page, so wrap={false}
  // pushes the whole block to the next page rather than orphaning its header.
  return (
    <View style={styles.semester} wrap={false}>
      <View style={styles.semesterHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={styles.semesterTerm}>
            {semester.termLabel ?? semester.ordinalLabel}
          </Text>
          {semester.termLabel && (
            <Text style={styles.semesterOrdinal}>{semester.ordinalLabel}</Text>
          )}
        </View>
        <Text style={styles.semesterCredits}>
          {semester.credits} credit {semester.credits === 1 ? 'hour' : 'hours'}
        </Text>
      </View>

      {semester.courses.length === 0 ? (
        <Text style={styles.emptySemester}>No courses planned.</Text>
      ) : (
        semester.courses.map((course, i) => (
          <CourseRow key={`${course.code ?? course.requirement}-${i}`} course={course} />
        ))
      )}
    </View>
  )
}

export default function PlanPdfDocument({ model }) {
  const meta = [
    model.startLabel      && { label: 'Started',              value: model.startLabel },
    model.graduationLabel && { label: 'Projected graduation', value: model.graduationLabel },
    model.generatedOn     && { label: 'Generated',            value: model.generatedOn },
  ].filter(Boolean)

  return (
    <Document
      title={`Degree Plan${model.concentrationName ? ` ${EM_DASH} ${model.concentrationName}` : ''}`}
      author="MyDegreePlan"
    >
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>Degree Plan</Text>
        {model.concentrationName && (
          <Text style={styles.subtitle}>{model.concentrationName}</Text>
        )}

        <View style={styles.metaRow}>
          {meta.map(m => (
            <Text key={m.label} style={styles.metaItem}>
              <Text style={styles.metaLabel}>{m.label}: </Text>
              {m.value}
            </Text>
          ))}
        </View>

        <View style={styles.rule} />

        {model.semesters.map(semester => (
          <SemesterBlock key={semester.semesterNumber} semester={semester} />
        ))}

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
