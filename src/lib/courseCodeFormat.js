// "CSC1300" -> "CSC 1300", the way the catalog and the degree map print it. Shared by the printed plan and the printed audit.
export function formatCourseCode(code) {
  if (!code) return code
  return code.replace(/^([A-Z]+)(\d)/, '$1 $2')
}

// The same for every course code inside a sentence or a list ("CSC1300, (COMM2025 or PC2500)"): what a screen prints after
// formatMissingForDisplay, whose own output stays unspaced because code compares it.
export function spaceCourseCodes(text) {
  if (!text) return text
  return text.replace(/\b([A-Z]{2,5})([0-9]{4}[A-Z]?)\b/g, '$1 $2')
}
