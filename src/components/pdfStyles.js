// pdfStyles.js
// What the printed documents share: the page geometry, the brand colours and the styles of the page, the title block, the body text and
// the footer. The Degree Map (PlanPdfDocument.jsx) and the Degree Audit (AuditPdfDocument.jsx) are two documents that look like one family,
// so they are built from the same pieces. Only imported behind a dynamic import() from a document component, like the documents themselves.

import { StyleSheet, Font } from '@react-pdf/renderer'

// LETTER is 612pt wide. The footer is absolutely positioned and needs a real
// width (see styles.footer), so the margin and the content width it implies
// are named rather than repeated as literals.
export const PAGE_MARGIN   = 36
export const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2

// Brand colours, as the degree-map template uses them: purple column
// header rows with white text, gold year bands.
export const PURPLE = '#4F2984'
export const GOLD   = '#FFDD00'
export const GRID   = '#9a9a9a'

// An em dash where a value is genuinely unknown reads better in print than a
// blank cell, which looks like the generator failed.
export const EM_DASH = '—'

// @react-pdf hyphenates long words by default, which splits requirement
// names mid-word ("General Edu-cation"). Wrap on whole words only.
Font.registerHyphenationCallback(word => [word])

// Helvetica is one of the three fonts baked into the PDF format itself
// (with Times-Roman and Courier). Anything else means Font.register and a
// network fetch at generation time, which would make the download fail
// offline for the sake of a typeface.
export const shared = StyleSheet.create({

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
  // A fill-in line: the app doesn't store the student's name or student ID,
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
  noteText: {
    fontSize:   7.5,
    lineHeight: 1.35,
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
