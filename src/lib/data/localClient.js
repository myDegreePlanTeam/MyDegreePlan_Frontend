// localClient.js: a small stand-in for the slice of the supabase-js client this app uses, backed by
// the static catalog and a per-device store instead of Postgres.
//
//   const client = createLocalClient({ loadCatalog, storage })
//   client.from('student_plan_slots').select('...').eq('student_id', 1)   // same chain, same
//   client.auth.getSession()                                              // { data, error } shape
//
// It is not a general PostgREST emulator. It implements exactly what the components call (filters,
// order/limit, single, a to-one embed, insert/update/upsert/delete) plus the Postgres behaviour the
// app leans on: identity ids, column defaults, unique constraints for upsert, ON DELETE CASCADE
// from student_profiles, and the PGRST116 / 23505 error codes. Nothing here touches the network.
//
// Catalog tables are read-only and come from catalog.json. Student tables live in memory and are
// written through to `storage` after every mutation. There is one implicit user per device.

export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001'

export const CATALOG_TABLES = [
  'courses', 'prerequisite_entries', 'corequisite_entries',
  'concentrations', 'requirement_slots', 'test_equivalencies',
]

// Columns a catalog row may leave out, to keep catalog.json small; a read sees them as null, as Postgres would.
const CATALOG_COLUMN_DEFAULTS = {
  courses: { credits_max: null, standing_req: null, requisite_text: null },
}

const now = () => new Date().toISOString()

// pk: column holding the generated id ('uuid' ids are random). unique: constraints beyond the pk.
// defaults: column defaults from the schema, applied on insert when the column is absent.
export const STUDENT_TABLES = {
  student_profiles: {
    pk: 'id', unique: [['user_id']],
    defaults: { concentration_id: null, start_season: null, start_year: null, student_type: null,
      act_math: null, act_english: null, act_science: null, act_reading: null, act_composite: null,
      gened_program: 'legacy', created_at: now },
  },
  student_plan_slots: {
    pk: 'id', unique: [['student_id', 'requirement_slot_id']],
    defaults: { selected_course_code: null, status: 'planned', semester_number: null, credits_remaining: 0,
      locked: false, archived: false, archive_reason: null, position_source: null },
  },
  student_semester_notes: {
    pk: 'id', unique: [['student_id', 'concentration_id', 'semester_number']],
    defaults: { note_text: '', updated_at: now, completed_by_student: false, term_season: null, term_year: null },
  },
  student_free_add_slots: {
    pk: 'id', unique: [],
    defaults: { status: 'planned', fills_slot_id: null, created_at: now },
  },
  prior_credits: {
    pk: 'id', uuid: true, unique: [],
    defaults: { satisfies_course_code: null, note: null, credits_awarded: 0, satisfies_pool: null, created_at: now },
  },
}

// Rows removed together with a student_profiles row (ON DELETE CASCADE).
const CASCADE_FROM_PROFILE = [
  ['student_plan_slots', 'student_id'], ['student_semester_notes', 'student_id'],
  ['student_free_add_slots', 'student_id'], ['prior_credits', 'plan_id'],
]

// Embeddable to-one relations: { [table]: { [embedName]: { table, fk } } }, joined on the target's id.
const RELATIONS = {
  student_profiles: { concentrations: { table: 'concentrations', fk: 'concentration_id' } },
}

// ── Filters ────────────────────────────────────────────────────────────────────

function same(a, b) {
  if (a == null || b == null) return false
  return a === b || String(a) === String(b)
}

function compare(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const x = String(a), y = String(b)
  return x < y ? -1 : x > y ? 1 : 0
}

function likeToRegExp(pattern) {
  const source = String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${source}$`, 'is')
}

function test(op, value, arg) {
  switch (op) {
    case 'eq': return same(value, arg)
    case 'neq': return value != null && arg != null && !same(value, arg)
    case 'gt': return value != null && arg != null && compare(value, arg) > 0
    case 'gte': return value != null && arg != null && compare(value, arg) >= 0
    case 'lt': return value != null && arg != null && compare(value, arg) < 0
    case 'lte': return value != null && arg != null && compare(value, arg) <= 0
    case 'in': return value != null && (Array.isArray(arg) ? arg : parseList(arg)).some(a => same(value, a))
    case 'is': return arg === null || arg === 'null' ? value == null : (arg === true || arg === 'true' ? value === true : value === false)
    case 'like': return value != null && likeToRegExp(arg).test(String(value))
    case 'ilike': return value != null && likeToRegExp(arg).test(String(value))
    default: throw new Error(`localClient: unsupported filter operator "${op}"`)
  }
}

function parseList(text) {
  return String(text).replace(/^\(|\)$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''))
}

// Split on commas that are outside double quotes and parentheses.
function splitTopLevel(text) {
  const parts = []
  let depth = 0, quoted = false, start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '(') depth++
    else if (!quoted && ch === ')') depth--
    else if (!quoted && depth === 0 && ch === ',') { parts.push(text.slice(start, i)); start = i + 1 }
  }
  parts.push(text.slice(start))
  return parts.map(p => p.trim()).filter(Boolean)
}

// PostgREST or=(...) body: `code.ilike."%x%",name.ilike."%x%"` -> predicate.
function parseOr(text) {
  const clauses = splitTopLevel(text).map(part => {
    const m = part.match(/^([a-z_0-9]+)\.(not\.)?([a-z]+)\.([\s\S]*)$/i)
    if (!m) throw new Error(`localClient: cannot parse or() clause "${part}"`)
    const [, column, negated, op, raw] = m
    const arg = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
    return row => (negated ? !test(op, row[column], arg) : test(op, row[column], arg))
  })
  return row => clauses.some(c => c(row))
}

// ── select list ────────────────────────────────────────────────────────────────

// 'id, name, concentrations ( id, code )' -> { star, columns: [...], embeds: [{ name, select }] }
function parseSelect(text) {
  const out = { star: false, columns: [], embeds: [] }
  for (const part of splitTopLevel(text)) {
    const m = part.match(/^([a-z_0-9]+)\s*\(([\s\S]*)\)$/i)
    if (m) out.embeds.push({ name: m[1], select: parseSelect(m[2]) })
    else if (part === '*') out.star = true
    else out.columns.push(part)
  }
  return out
}

function project(row, sel, table, db) {
  const out = {}
  if (sel.star || (sel.columns.length === 0 && sel.embeds.length === 0)) Object.assign(out, row)
  for (const col of sel.columns) out[col] = row[col] ?? null
  for (const { name, select } of sel.embeds) {
    const rel = RELATIONS[table]?.[name]
    if (!rel) throw new Error(`localClient: no relationship "${name}" on ${table}`)
    const target = row[rel.fk] == null ? null : db.rows(rel.table).find(r => same(r.id, row[rel.fk]))
    out[name] = target ? project(target, select, rel.table, db) : null
  }
  return out
}

// ── errors ─────────────────────────────────────────────────────────────────────

const pgError = (code, message, details = null) => ({ code, message, details, hint: null })

// ── query builder ──────────────────────────────────────────────────────────────

class Query {
  constructor(db, table) {
    this.db = db
    this.table = table
    this.op = null
    this.filters = []
    this.orders = []
    this.limitTo = null
    this.singleMode = null    // 'one' | 'maybe'
    this.rangeFrom = 0
    this.selectText = '*'
    this.returning = null
    this.payload = null
    this.onConflict = null
  }

  select(columns = '*') {
    if (this.op === null) { this.op = 'select'; this.selectText = columns }
    else this.returning = columns
    return this
  }
  insert(values) { this.op = 'insert'; this.payload = values; return this }
  update(values) { this.op = 'update'; this.payload = values; return this }
  upsert(values, options = {}) { this.op = 'upsert'; this.payload = values; this.onConflict = options.onConflict ?? null; return this }
  delete() { this.op = 'delete'; return this }

  eq(col, v) { return this.#add(col, 'eq', v) }
  neq(col, v) { return this.#add(col, 'neq', v) }
  gt(col, v) { return this.#add(col, 'gt', v) }
  gte(col, v) { return this.#add(col, 'gte', v) }
  lt(col, v) { return this.#add(col, 'lt', v) }
  lte(col, v) { return this.#add(col, 'lte', v) }
  in(col, values) { return this.#add(col, 'in', values) }
  is(col, v) { return this.#add(col, 'is', v) }
  like(col, v) { return this.#add(col, 'like', v) }
  ilike(col, v) { return this.#add(col, 'ilike', v) }
  filter(col, op, v) { return this.#add(col, op, v) }
  not(col, op, v) { this.filters.push(row => !test(op, row[col], v)); return this }
  or(text) { this.filters.push(parseOr(text)); return this }
  match(obj) { for (const [k, v] of Object.entries(obj)) this.#add(k, 'eq', v); return this }
  #add(col, op, arg) { this.filters.push(row => test(op, row[col], arg)); return this }

  order(column, { ascending = true } = {}) { this.orders.push({ column, ascending }); return this }
  limit(n) { this.limitTo = n; return this }
  range(from, to) { this.rangeFrom = from; this.limitTo = to - from + 1; return this }
  single() { this.singleMode = 'one'; return this }
  maybeSingle() { this.singleMode = 'maybe'; return this }

  then(resolve, reject) { return this.#run().then(resolve, reject) }
  catch(reject) { return this.#run().catch(reject) }
  finally(fn) { return this.#run().finally(fn) }

  async #run() {
    try {
      await this.db.ready
      const { rows, error, returnedNothing } = await this.#execute()
      if (error) return { data: null, error, count: null, status: 400, statusText: 'Bad Request' }
      // Like PostgREST, a write without .select() returns no body.
      if (returnedNothing) return { data: null, error: null, count: null, status: 204, statusText: 'No Content' }
      return this.#shape(rows)
    } catch (err) {
      return { data: null, error: pgError('LOCAL', err?.message ?? String(err)), count: null, status: 500, statusText: 'Error' }
    }
  }

  #shape(rows) {
    if (this.singleMode) {
      if (rows.length === 1) return { data: rows[0], error: null, count: null, status: 200, statusText: 'OK' }
      if (rows.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count: null, status: 200, statusText: 'OK' }
      return {
        data: null,
        error: pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned',
          `The result contains ${rows.length} rows`),
        count: null, status: 406, statusText: 'Not Acceptable',
      }
    }
    return { data: rows, error: null, count: null, status: this.op === 'select' ? 200 : 201, statusText: 'OK' }
  }

  #matching() {
    const all = this.db.rows(this.table)
    return all.filter(row => this.filters.every(f => f(row)))
  }

  #sorted(rows) {
    if (this.orders.length === 0) return rows
    return [...rows].sort((a, b) => {
      for (const { column, ascending } of this.orders) {
        const x = a[column] ?? null, y = b[column] ?? null
        if (x === y) continue
        // Postgres: NULLS LAST for ASC, NULLS FIRST for DESC.
        if (x === null) return ascending ? 1 : -1
        if (y === null) return ascending ? -1 : 1
        const c = compare(x, y)
        if (c !== 0) return ascending ? c : -c
      }
      return 0
    })
  }

  async #execute() {
    const { db, table } = this
    if (this.op === 'select' || this.op === null) {
      let rows = this.#sorted(this.#matching())
      if (this.rangeFrom) rows = rows.slice(this.rangeFrom)
      if (this.limitTo != null) rows = rows.slice(0, this.limitTo)
      const sel = parseSelect(this.selectText)
      const wantsDescription = sel.star || sel.columns.includes('description') || (sel.columns.length === 0 && sel.embeds.length === 0)
      if (table === 'courses' && wantsDescription && rows.some(r => !('description' in r))) await db.hydrateDescriptions()
      return { rows: rows.map(r => project(r, sel, table, db)) }
    }

    if (!STUDENT_TABLES[table]) {
      return { error: pgError('42501', `permission denied for table ${table}`, 'The local catalog is read-only') }
    }

    let written
    if (this.op === 'insert') {
      const result = db.insert(table, toArray(this.payload))
      if (result.error) return result
      written = result.rows
    } else if (this.op === 'upsert') {
      const result = db.upsert(table, toArray(this.payload), this.onConflict)
      if (result.error) return result
      written = result.rows
    } else if (this.op === 'update') {
      const result = db.update(table, this.#matching(), this.payload)
      if (result.error) return result
      written = result.rows
    } else if (this.op === 'delete') {
      written = db.remove(table, this.#matching())
    } else {
      throw new Error(`localClient: unsupported operation "${this.op}"`)
    }

    await db.persist()
    if (this.returning === null) return { rows: [], returnedNothing: true }
    const sel = parseSelect(this.returning)
    return { rows: this.#sorted(written).map(r => project(r, sel, table, db)) }
  }
}

// crypto.randomUUID needs a secure context; a phone opening the dev server over plain http lacks it.
function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const toArray = v => (Array.isArray(v) ? v : [v])

// ── the "database" ─────────────────────────────────────────────────────────────

class LocalDb {
  constructor({ loadCatalog, loadDescriptions, storage }) {
    this.storage = storage
    this.loadDescriptions = loadDescriptions ?? null
    this.descriptionsReady = null
    this.tables = {}
    this.counters = {}
    this.dirty = new Set()
    this.ready = this.#init(loadCatalog)
  }

  async #init(loadCatalog) {
    const [catalog, saved] = await Promise.all([loadCatalog(), this.storage.load()])
    for (const name of CATALOG_TABLES) this.tables[name] = catalog.tables[name] ?? []
    for (const [name, defaults] of Object.entries(CATALOG_COLUMN_DEFAULTS)) {
      for (const row of this.tables[name]) {
        for (const [col, value] of Object.entries(defaults)) if (!(col in row)) row[col] = value
      }
    }
    for (const name of Object.keys(STUDENT_TABLES)) this.tables[name] = saved.tables?.[name] ?? []
    this.counters = { ...(saved.meta?.counters ?? {}) }
    // A counter must never fall behind the rows it numbers (covers imports and older saves).
    for (const [name, spec] of Object.entries(STUDENT_TABLES)) {
      if (spec.uuid) continue
      const max = this.tables[name].reduce((m, r) => Math.max(m, Number(r[spec.pk]) || 0), 0)
      this.counters[name] = Math.max(this.counters[name] ?? 0, max)
    }
  }

  // Most course descriptions are not in catalog.json (see build-catalog.mjs); they arrive in a separate
  // file. Load it once, the first time a query asks for a description a row does not have, and fill them all.
  hydrateDescriptions() {
    this.descriptionsReady ??= (async () => {
      const lazy = this.loadDescriptions ? await this.loadDescriptions() : {}
      for (const row of this.tables.courses) if (!('description' in row)) row.description = lazy[row.code] ?? null
    })().catch(err => { this.descriptionsReady = null; throw err })
    return this.descriptionsReady
  }

  rows(table) {
    const rows = this.tables[table]
    if (!rows) throw new Error(`relation "${table}" does not exist`)
    return rows
  }

  #newRow(table, input) {
    const spec = STUDENT_TABLES[table]
    const row = {}
    for (const [col, def] of Object.entries(spec.defaults)) row[col] = typeof def === 'function' ? def() : def
    Object.assign(row, input)
    if (spec.uuid) row[spec.pk] = row[spec.pk] ?? uuid()
    else row[spec.pk] = row[spec.pk] ?? (this.counters[table] = (this.counters[table] ?? 0) + 1)
    return row
  }

  #conflict(table, row, ignore) {
    const spec = STUDENT_TABLES[table]
    for (const cols of [[spec.pk], ...spec.unique]) {
      if (cols.some(c => row[c] == null)) continue
      const hit = this.rows(table).find(r => r !== ignore && cols.every(c => same(r[c], row[c])))
      if (hit) return cols
    }
    return null
  }

  #check(table, row) {
    if (table === 'student_plan_slots' && row.requirement_slot_id == null) return pgError('23502', 'null value in column "requirement_slot_id" violates not-null constraint')
    if (table === 'student_plan_slots' && row.student_id == null) return pgError('23502', 'null value in column "student_id" violates not-null constraint')
    if (table === 'prior_credits' && (row.plan_id == null || row.credit_type == null)) return pgError('23502', 'null value in a required prior_credits column violates not-null constraint')
    if (table === 'student_free_add_slots' && (row.student_id == null || row.course_code == null || row.semester_number == null)) return pgError('23502', 'null value in a required student_free_add_slots column violates not-null constraint')
    if (table === 'student_free_add_slots' && !['planned', 'in_progress', 'completed'].includes(row.status)) return pgError('23514', 'new row for relation "student_free_add_slots" violates check constraint')
    if (table === 'student_semester_notes' && (row.student_id == null || row.concentration_id == null || row.semester_number == null)) return pgError('23502', 'null value in a required student_semester_notes column violates not-null constraint')
    if (table === 'student_profiles' && row.user_id == null) return pgError('23502', 'null value in column "user_id" violates not-null constraint')
    return null
  }

  insert(table, inputs) {
    const staged = []
    for (const input of inputs) {
      const row = this.#newRow(table, input)
      const bad = this.#check(table, row)
      if (bad) return { error: bad }
      const dupCols = this.#conflict(table, row) ?? staged.map(s => this.#conflictAmong(table, s, row)).find(Boolean)
      if (dupCols) return { error: pgError('23505', `duplicate key value violates unique constraint on (${dupCols.join(', ')})`) }
      staged.push(row)
    }
    this.rows(table).push(...staged)
    this.dirty.add(table)
    return { rows: staged }
  }

  #conflictAmong(table, existing, row) {
    const spec = STUDENT_TABLES[table]
    for (const cols of [[spec.pk], ...spec.unique]) {
      if (cols.every(c => row[c] != null && same(existing[c], row[c]))) return cols
    }
    return null
  }

  upsert(table, inputs, onConflict) {
    const spec = STUDENT_TABLES[table]
    const cols = onConflict ? onConflict.split(',').map(c => c.trim()).filter(Boolean) : [spec.pk]
    const written = []
    for (const input of inputs) {
      const existing = cols.every(c => input[c] != null)
        ? this.rows(table).find(r => cols.every(c => same(r[c], input[c])))
        : undefined
      if (existing) {
        const merged = { ...existing, ...input }
        const bad = this.#check(table, merged)
        if (bad) return { error: bad }
        const dupCols = this.#conflict(table, merged, existing)
        if (dupCols) return { error: pgError('23505', `duplicate key value violates unique constraint on (${dupCols.join(', ')})`) }
        Object.assign(existing, merged)
        written.push(existing)
      } else {
        const result = this.insert(table, [input])
        if (result.error) return result
        written.push(...result.rows)
      }
    }
    this.dirty.add(table)
    return { rows: written }
  }

  update(table, targets, patch) {
    for (const row of targets) {
      const next = { ...row, ...patch }
      const bad = this.#check(table, next)
      if (bad) return { error: bad }
      const dupCols = this.#conflict(table, next, row)
      if (dupCols) return { error: pgError('23505', `duplicate key value violates unique constraint on (${dupCols.join(', ')})`) }
    }
    for (const row of targets) Object.assign(row, patch)
    if (targets.length) this.dirty.add(table)
    return { rows: targets }
  }

  remove(table, targets) {
    if (targets.length === 0) return []
    const gone = new Set(targets)
    this.tables[table] = this.rows(table).filter(r => !gone.has(r))
    this.dirty.add(table)
    if (table === 'student_profiles') {
      for (const { id } of targets) {
        for (const [child, fk] of CASCADE_FROM_PROFILE) {
          const before = this.rows(child).length
          this.tables[child] = this.rows(child).filter(r => !same(r[fk], id))
          if (this.tables[child].length !== before) this.dirty.add(child)
        }
      }
    }
    return targets
  }

  async persist() {
    const names = [...this.dirty]
    this.dirty.clear()
    await this.storage.save(Object.fromEntries(names.map(n => [n, this.tables[n]])), { counters: this.counters })
  }

  // Backup / restore ---------------------------------------------------------

  snapshot() {
    return Object.fromEntries(Object.keys(STUDENT_TABLES).map(n => [n, this.tables[n]]))
  }

  async replaceAll(tables) {
    await this.ready
    for (const name of Object.keys(STUDENT_TABLES)) this.tables[name] = tables[name] ?? []
    for (const [name, spec] of Object.entries(STUDENT_TABLES)) {
      if (spec.uuid) continue
      const max = this.tables[name].reduce((m, r) => Math.max(m, Number(r[spec.pk]) || 0), 0)
      this.counters[name] = Math.max(this.counters[name] ?? 0, max)
    }
    for (const name of Object.keys(STUDENT_TABLES)) this.dirty.add(name)
    await this.persist()
  }
}

// ── public ─────────────────────────────────────────────────────────────────────

export function createLocalClient({ loadCatalog, loadDescriptions, storage, userId = LOCAL_USER_ID }) {
  const db = new LocalDb({ loadCatalog, loadDescriptions, storage })
  const session = { access_token: null, user: { id: userId, email: null } }

  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    // The session never changes, so there is nothing to subscribe to.
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { session, user: session.user }, error: null }),
    signUp: async () => ({ data: { session, user: session.user }, error: null }),
    signOut: async () => ({ error: null }),
  }

  return {
    from: table => new Query(db, table),
    auth,
    // Per-device data management, used by Settings. Absent on the Supabase-backed client.
    local: {
      // A getter: IndexedDB can turn out to be unavailable only after the first load.
      get persistent() { return storage.persistent !== false },
      exportData: async () => { await db.ready; return db.snapshot() },
      importData: tables => db.replaceAll(tables),
      eraseAll: async () => { await db.ready; await db.replaceAll({}); for (const k of Object.keys(db.counters)) db.counters[k] = 0; await db.persist() },
    },
  }
}
