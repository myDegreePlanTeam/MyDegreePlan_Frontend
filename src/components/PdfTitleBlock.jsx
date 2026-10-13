// PdfTitleBlock.jsx
// The top of both printed documents: the title with its gold rule, the Name / Student ID lines the app does not store (written in by
// hand), and the catalog year / degree / major / concentration the plan follows.

import { View, Text } from '@react-pdf/renderer'
import { shared as styles, EM_DASH } from './pdfStyles'

export default function PdfTitleBlock({ title, catalogYear, degree, major, concentration, alsoPrograms = [] }) {
  // with a secondary major on the plan, the one this heading names is the primary major
  const hasSecondaryMajor = alsoPrograms.some(p => p.role === 'Secondary major')
  return (
    <>
      <View style={styles.titleRow}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.titleRule} />
        </View>
        <View style={styles.identity}>
          <View style={styles.identityLine}>
            <Text style={styles.identityLabel}>Name:</Text>
            <View style={styles.blankLine} />
          </View>
          <View style={styles.identityLine}>
            <Text style={styles.identityLabel}>Student ID:</Text>
            <View style={styles.blankLine} />
          </View>
        </View>
      </View>

      <View style={styles.degreeRow}>
        {[
          ['CATALOG YEAR', catalogYear],
          ['Degree',       degree],
          [hasSecondaryMajor ? 'PRIMARY MAJOR' : 'MAJOR', major],
          ['Concentration', concentration],
        ].map(([label, value]) => (
          <Text key={label} style={styles.degreeItem}>
            <Text style={styles.degreeLabel}>{label}: </Text>
            {value ?? EM_DASH}
          </Text>
        ))}
      </View>
      {alsoPrograms.length > 0 && (
        <View style={styles.degreeRow}>
          {alsoPrograms.map(p => (
            <Text key={`${p.role}-${p.text}`} style={styles.degreeItem}>
              <Text style={styles.degreeLabel}>{p.role}: </Text>
              {p.text}
            </Text>
          ))}
        </View>
      )}
    </>
  )
}
