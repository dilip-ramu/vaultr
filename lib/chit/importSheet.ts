// Connecting a spreadsheet's columns to our fields.
//
// WHY THIS REPLACED THE CSV IMPORTER
//
// The old one read the header row, matched it against a list of names and
// aliases, and imported. When the match failed — a column called "Mobile No.",
// a title row above the headers, a sheet exported from somebody else's
// software — it either dropped the column silently or refused the file with
// "no Name column". Nothing on screen said which columns it had understood,
// so the only way to find out was to import and look at the damage.
//
// So the matching stops being a secret. The app guesses, shows the guess, and
// lets it be changed. A guess that can be seen and corrected is worth more
// than a cleverer guess that cannot.
//
// Pure: a grid of strings in, a mapping and rows out. The xlsx reading lives
// in the component, because that is the only part that needs a library.

import { MEMBER_COLUMNS, type ParsedMemberRow } from './memberCsv'

/**
 * One spreadsheet cell as text.
 *
 * NOT the cell's displayed text. Asking the spreadsheet how it would SHOW a
 * value turns a 14-digit bank account number into "5.01001E+13", because that
 * is what Excel shows for a long number in the General format. The account
 * number is then imported wrong and nobody notices until a payment fails.
 *
 * So the raw value is taken and converted here. JavaScript only reaches for
 * exponent notation above 1e21, which no account number is.
 *
 * (A number beyond 15 digits has already lost precision inside the .xlsx
 * itself — a spreadsheet stores them as doubles. Nothing can recover that
 * here; the fix is to format the column as Text before typing it.)
 */
export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return Number.isInteger(value) ? value.toFixed(0) : String(value)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** field name → which column of the file it comes from. null = not imported. */
export type ColumnMapping = Record<string, number | null>

/** How many rows from the top to consider when looking for the header. */
const HEADER_SEARCH_DEPTH = 15

const norm = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Every spelling we accept for a field, normalised. */
function namesFor(field: string): string[] {
  const col = MEMBER_COLUMNS.find(c => c.field === field)
  if (!col) return []
  return [col.header, ...(col.aliases ?? [])].map(norm)
}

/**
 * Which row holds the headers.
 *
 * Spreadsheets that come from a person rather than a program often start with
 * a title ("UNYRA CAPITAL — MEMBER LIST"), a blank line, then the headers.
 * Assuming row 1 reads that title as column names and maps nothing.
 *
 * The row that matches the most known column names wins. Ties go to the
 * earlier row, and a sheet where nothing matches falls back to the first row
 * that has more than one non-empty cell — there is still a mapping screen
 * after this, so a wrong guess costs a click, not the import.
 */
function bestHeaderRow(rows: readonly (readonly string[])[]): { row: number; score: number } {
  const known = new Set(MEMBER_COLUMNS.flatMap(c => namesFor(c.field)))
  let best = -1
  let bestScore = 0
  const depth = Math.min(rows.length, HEADER_SEARCH_DEPTH)

  for (let i = 0; i < depth; i++) {
    const cells = rows[i] ?? []
    let score = 0
    for (const cell of cells) {
      const n = norm(cell)
      if (n && known.has(n)) score++
    }
    if (score > bestScore) { bestScore = score; best = i }
  }
  return { row: best, score: bestScore }
}

export function detectHeaderRow(rows: readonly (readonly string[])[]): number {
  const { row } = bestHeaderRow(rows)
  if (row >= 0) return row

  const depth = Math.min(rows.length, HEADER_SEARCH_DEPTH)
  for (let i = 0; i < depth; i++) {
    if ((rows[i] ?? []).filter(c => String(c ?? '').trim()).length > 1) return i
  }
  return 0
}

/**
 * Which sheet of a workbook to open on.
 *
 * NOT the first one with something in it — that rule opened a workbook on its
 * cover sheet, which has a title in A1 and nothing to import, and the mapping
 * screen then showed no columns at all.
 *
 * The sheet that LOOKS like a member list wins: the one whose best header row
 * matches the most known column names. Ties go to the earliest, and a
 * workbook where nothing looks like a list falls back to the first sheet with
 * more than one row of content.
 */
export function bestSheet(grids: readonly (readonly (readonly string[])[])[]): number {
  let best = -1
  let bestScore = 0
  grids.forEach((g, i) => {
    const { score } = bestHeaderRow(g)
    if (score > bestScore) { bestScore = score; best = i }
  })
  if (best >= 0) return best

  const i = grids.findIndex(g => g.filter(r => r.some(c => String(c ?? '').trim())).length > 1)
  return i >= 0 ? i : 0
}

/** The header cells, with empty ones named so a dropdown can show something. */
export function headerLabels(rows: readonly (readonly string[])[], headerRow: number): string[] {
  const cells = rows[headerRow] ?? []
  const width = Math.max(cells.length, ...rows.map(r => r.length), 0)
  const out: string[] = []
  for (let i = 0; i < width; i++) {
    const raw = String(cells[i] ?? '').trim()
    out.push(raw || `Column ${columnLetter(i)}`)
  }
  return out
}

/** 0 → A, 25 → Z, 26 → AA. What the spreadsheet itself calls the column. */
export function columnLetter(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/**
 * The opening guess.
 *
 * Exact name or alias first, across every field, before any loose matching —
 * otherwise a column called "Account Name" can be claimed by `name` on a
 * "contains name" rule before `bank_account_name` ever gets a look.
 *
 * One file column is never given to two fields. Two fields quietly sharing a
 * column is the kind of thing nobody notices until the bank details are the
 * member's name.
 */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const taken = new Set<number>()
  const normalised = headers.map(norm)

  for (const col of MEMBER_COLUMNS) mapping[col.field] = null

  // Pass 1 — exact header or alias.
  for (const col of MEMBER_COLUMNS) {
    const names = namesFor(col.field)
    const i = normalised.findIndex((h, idx) => h && !taken.has(idx) && names.includes(h))
    if (i >= 0) { mapping[col.field] = i; taken.add(i) }
  }

  // Pass 2 — the header CONTAINS a known spelling ("mobile no", "member name").
  for (const col of MEMBER_COLUMNS) {
    if (mapping[col.field] !== null) continue
    const names = namesFor(col.field)
    const i = normalised.findIndex((h, idx) =>
      h && !taken.has(idx) && names.some(n => n && (h.includes(n) || n.includes(h))))
    if (i >= 0) { mapping[col.field] = i; taken.add(i) }
  }

  return mapping
}

/** Up to `limit` example values from a column, for the mapping screen. */
export function sampleValues(
  rows: readonly (readonly string[])[], headerRow: number, column: number | null, limit = 3,
): string[] {
  if (column === null) return []
  const out: string[] = []
  for (let i = headerRow + 1; i < rows.length && out.length < limit; i++) {
    const v = String(rows[i]?.[column] ?? '').trim()
    if (v) out.push(v)
  }
  return out
}

/** Fields that must be mapped before the import can run. */
export const REQUIRED_FIELDS = ['name'] as const

export function missingRequired(mapping: ColumnMapping): string[] {
  return REQUIRED_FIELDS.filter(f => mapping[f] === null || mapping[f] === undefined)
    .map(f => MEMBER_COLUMNS.find(c => c.field === f)?.header ?? f)
}

/**
 * Turn the grid into rows, using the mapping as it now stands.
 *
 * `row` is the number the spreadsheet itself shows, so a problem can be found
 * by scrolling to that row rather than counting from the header.
 */
export function applyMapping(
  rows: readonly (readonly string[])[], headerRow: number, mapping: ColumnMapping,
): ParsedMemberRow[] {
  const out: ParsedMemberRow[] = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const cells = rows[i] ?? []
    const values: Record<string, string> = {}
    for (const [field, col] of Object.entries(mapping)) {
      if (col === null || col === undefined) continue
      const v = String(cells[col] ?? '').trim()
      if (v) values[field] = v
    }
    // Nothing mapped on this line — a spacer row, or the blank row people
    // leave under a list. Not a problem to report, just not a member.
    if (!Object.keys(values).length) continue
    out.push({
      row: i + 1,
      values,
      error: values.name ? undefined : 'No name in this row',
    })
  }
  return out
}

/** What the review step counts up. */
export interface ImportTally {
  total: number
  ready: number
  problems: number
}

export function tally(rows: readonly ParsedMemberRow[]): ImportTally {
  const problems = rows.filter(r => r.error).length
  return { total: rows.length, ready: rows.length - problems, problems }
}
