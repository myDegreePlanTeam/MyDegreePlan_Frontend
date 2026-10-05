// programDetails.js
//
// The student's program as the profile loads it carries only id, code, name and total_hours. A printed degree map and the
// Settings row also need what kind of program it is, its degree, its major and its college. They are read here, apart from
// the profile's join, so an install whose schema lacks a column (the Docker setup step has not re-run) still loads the
// profile: selectWithOptional drops a column the database does not have.

import { selectWithOptional } from './dbErrors'

export const PROGRAM_DETAIL_COLUMNS = ['kind', 'degree', 'major_name', 'department', 'college', 'major_code', 'is_base']

/** The profile with its `concentrations` row completed. Any failure leaves the profile as it was: this only adds detail. */
export async function withProgramDetails(client, profile) {
  const program = profile?.concentrations
  if (!program?.id) return profile
  try {
    const { data } = await selectWithOptional(
      columns => client.from('concentrations').select(columns).eq('id', program.id),
      'id',
      PROGRAM_DETAIL_COLUMNS,
    )
    const row = data?.[0]
    return row ? { ...profile, concentrations: { ...program, ...row } } : profile
  } catch {
    return profile
  }
}
