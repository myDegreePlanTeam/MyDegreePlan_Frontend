// "CSC1300" -> "CSC 1300", the way the catalog and the degree map print it. Shared by the printed plan and the printed audit.
export function formatCourseCode(code) {
  if (!code) return code
  return code.replace(/^([A-Z]+)(\d)/, '$1 $2')
}
