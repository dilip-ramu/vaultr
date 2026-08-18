// An in-memory stand-in for the Supabase client, good enough to run the Lab's
// real lifecycle code end to end (correctness pass, item 12).
//
// It is deliberately not a general Postgres emulator. It implements exactly the
// query shapes lib/investments/lab/* uses, plus the one thing the Lab's
// correctness actually depends on: UNIQUE CONSTRAINTS. Idempotency is enforced
// by those constraints in production, so a fake that ignored them would let a
// duplicate-trade bug pass its own test.
//
// Supported: from/select/insert/update/upsert/delete, eq/in/is/not/lte/gte,
// order/limit/single/maybeSingle, and upsert with onConflict + ignoreDuplicates
// (which behaves like ON CONFLICT DO NOTHING RETURNING — it returns only the
// rows that were really inserted).

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Row = Record<string, any>

/** Unique indexes that exist in the real schema (v110-v112). */
export const UNIQUE_INDEXES: Record<string, string[][]> = {
  lab_cycle_steps: [['cycle_id', 'step_key']],
  lab_trades: [['step_id']],
  lab_decisions: [['step_id']],
  lab_positions: [['lab_id', 'symbol', 'exchange']],
  lab_nav_history: [['lab_id', 'as_of']],
  lab_benchmarks: [['lab_id', 'as_of']],
  lab_dividends: [['lab_id', 'symbol', 'exchange', 'ex_date', 'dividend_per_share']],
  lab_corporate_actions: [['lab_id', 'symbol', 'exchange', 'type', 'ex_date']],
  inv_securities: [['user_id', 'symbol', 'exchange']],
}

let seq = 0
const nextId = (prefix: string) => `${prefix}-${String(++seq).padStart(4, '0')}`
export function resetIds() { seq = 0 }

interface Filter { col: string; kind: 'eq' | 'in' | 'is' | 'notis' | 'lte' | 'gte'; val: any }

function keyOf(row: Row, cols: string[]): string | null {
  const parts: string[] = []
  for (const c of cols) {
    const v = row[c]
    if (v === null || v === undefined) return null   // NULLs compare distinct
    parts.push(String(v))
  }
  return parts.join(' ')
}

export class FakeSupabase {
  tables: Record<string, Row[]>
  writes: { table: string; op: string; rows: number }[] = []

  constructor(seed: Record<string, Row[]> = {}) {
    this.tables = {}
    for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows.map(r => ({ ...r }))
  }

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = []
    return this.tables[table]
  }

  count(table: string, where: Row = {}): number {
    return this.rows(table).filter(r => Object.entries(where).every(([k, v]) => r[k] === v)).length
  }

  from(table: string) { return new FakeQuery(this, table) }

  record(table: string, op: string, n: number) { this.writes.push({ table, op, rows: n }) }
}

class FakeQuery {
  private db: FakeSupabase
  private table: string
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private filters: Filter[] = []
  private payload: Row[] = []
  private conflictCols: string[] | null = null
  private ignoreDuplicates = false
  private wantsReturn = false
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private mode: 'many' | 'single' | 'maybe' = 'many'

  constructor(db: FakeSupabase, table: string) { this.db = db; this.table = table }

  select(_cols?: string) { this.wantsReturn = true; return this }
  insert(payload: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this }
  update(patch: Row) { this.op = 'update'; this.payload = [patch]; return this }
  upsert(payload: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = 'upsert'
    this.payload = Array.isArray(payload) ? payload : [payload]
    this.conflictCols = opts?.onConflict ? opts.onConflict.split(',').map(s => s.trim()) : null
    this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates)
    return this
  }
  delete() { this.op = 'delete'; return this }

  eq(col: string, val: any) { this.filters.push({ col, kind: 'eq', val }); return this }
  in(col: string, val: any[]) { this.filters.push({ col, kind: 'in', val }); return this }
  is(col: string, val: any) { this.filters.push({ col, kind: 'is', val }); return this }
  not(col: string, _op: string, val: any) { this.filters.push({ col, kind: 'notis', val }); return this }
  lte(col: string, val: any) { this.filters.push({ col, kind: 'lte', val }); return this }
  gte(col: string, val: any) { this.filters.push({ col, kind: 'gte', val }); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orderCol = col; this.orderAsc = opts?.ascending !== false; return this }
  limit(n: number) { this.limitN = n; return this }
  single() { this.mode = 'single'; this.wantsReturn = true; return this }
  maybeSingle() { this.mode = 'maybe'; this.wantsReturn = true; return this }

  private matches(row: Row): boolean {
    return this.filters.every(f => {
      const v = row[f.col]
      if (f.kind === 'eq') return v === f.val
      if (f.kind === 'in') return (f.val as any[]).includes(v)
      if (f.kind === 'is') return f.val === null ? (v === null || v === undefined) : v === f.val
      if (f.kind === 'notis') return f.val === null ? (v !== null && v !== undefined) : v !== f.val
      if (f.kind === 'lte') return v <= f.val
      return v >= f.val
    })
  }

  private uniqueHit(row: Row): Row | null {
    for (const cols of (UNIQUE_INDEXES[this.table] ?? [])) {
      const k = keyOf(row, cols)
      if (k == null) continue
      const hit = this.db.rows(this.table).find(r => keyOf(r, cols) === k)
      if (hit) return hit
    }
    return null
  }

  private finish(rows: Row[]) {
    let out = rows
    if (this.orderCol) {
      const c = this.orderCol
      out = [...out].sort((a, b) => {
        const av = a[c], bv = b[c]
        if (av === bv) return 0
        return (av < bv ? -1 : 1) * (this.orderAsc ? 1 : -1)
      })
    }
    if (this.limitN != null) out = out.slice(0, this.limitN)
    if (this.mode === 'single') {
      if (out.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
      return { data: { ...out[0] }, error: null }
    }
    if (this.mode === 'maybe') return { data: out[0] ? { ...out[0] } : null, error: null }
    return { data: out.map(r => ({ ...r })), error: null }
  }

  then(resolve: (v: any) => any, reject?: (e: any) => any) {
    try {
      return Promise.resolve(this.exec()).then(resolve, reject)
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e)
    }
  }

  private exec() {
    const store = this.db.rows(this.table)

    if (this.op === 'select') return this.finish(store.filter(r => this.matches(r)))

    if (this.op === 'insert') {
      const created: Row[] = []
      for (const p of this.payload) {
        const row = { id: nextId(this.table), ...p }
        if (this.uniqueHit(row)) {
          return { data: null, error: { message: `duplicate key value violates unique constraint on ${this.table}`, code: '23505' } }
        }
        store.push(row)
        created.push(row)
      }
      this.db.record(this.table, 'insert', created.length)
      return this.wantsReturn ? this.finish(created) : { data: null, error: null }
    }

    if (this.op === 'upsert') {
      const created: Row[] = []
      for (const p of this.payload) {
        const cols = this.conflictCols ?? (UNIQUE_INDEXES[this.table]?.[0] ?? [])
        const k = keyOf(p, cols)
        const existing = k == null ? null : store.find(r => keyOf(r, cols) === k)
        if (existing) {
          if (this.ignoreDuplicates) continue          // ON CONFLICT DO NOTHING
          Object.assign(existing, p)
          continue
        }
        const row = { id: nextId(this.table), ...p }
        store.push(row)
        created.push(row)
      }
      this.db.record(this.table, 'upsert', created.length)
      return this.wantsReturn ? this.finish(created) : { data: null, error: null }
    }

    if (this.op === 'update') {
      const hit = store.filter(r => this.matches(r))
      for (const r of hit) Object.assign(r, this.payload[0])
      this.db.record(this.table, 'update', hit.length)
      return this.wantsReturn ? this.finish(hit) : { data: null, error: null }
    }

    const doomed = store.filter(r => this.matches(r))
    this.db.tables[this.table] = store.filter(r => !this.matches(r))
    this.db.record(this.table, 'delete', doomed.length)
    return this.wantsReturn ? this.finish(doomed) : { data: null, error: null }
  }
}

/** The Lab code takes a SupabaseClient; the fake satisfies the subset it calls. */
export function asClient(db: FakeSupabase): any { return db }
