// The member CSV: one definition of the columns, used by BOTH the sample file
// and the parser.
//
// They were bound to drift if written twice — the sample would show a column
// the importer ignored, someone would fill it in, and the data would silently
// not arrive. Here the sample is generated FROM the column list the parser
// reads, so a column that appears in the file is a column that is imported.

import { normalizeMemberCode } from './memberCode'

export interface MemberColumn {
  /** Header text written into the sample file. */
  header: string
  /** Field on the member row. */
  field: string
  /** Extra header spellings accepted on import, lower-cased. */
  aliases?: string[]
  /** Shown in the example row. */
  example: string
}

export const MEMBER_COLUMNS: MemberColumn[] = [
  { header: 'Member Number', field: 'member_code', aliases: ['member no', 'member id', 'code', 'uc'], example: 'UC00001' },
  { header: 'Name', field: 'name', aliases: ['member name', 'full name'], example: 'Suresh Balan' },
  { header: 'Phone', field: 'phone', aliases: ['mobile', 'contact', 'phone number'], example: '9876543210' },
  { header: 'Address', field: 'address', aliases: ['addr'], example: '12 Kongu Nagar, Tiruppur 641604' },
  { header: 'PAN', field: 'pan', example: 'ABCDE1234F' },
  { header: 'Aadhaar', field: 'aadhaar', aliases: ['aadhar', 'uid'], example: '1234 5678 9012' },
  { header: 'Bank Name', field: 'bank_name', aliases: ['bank'], example: 'HDFC Bank' },
  { header: 'Bank Branch', field: 'bank_branch', aliases: ['branch'], example: 'Tiruppur' },
  { header: 'Account Name', field: 'bank_account_name', aliases: ['account holder'], example: 'Suresh Balan' },
  { header: 'Account Number', field: 'bank_account_number', aliases: ['account no', 'ac no', 'a/c no'], example: '50100123456789' },
  { header: 'IFSC', field: 'bank_ifsc', aliases: ['ifsc code'], example: 'HDFC0000123' },
  { header: 'Introduced By', field: 'referred_by_code', aliases: ['reference', 'referred by', 'introducer'], example: 'UC00002' },
  { header: 'Notes', field: 'notes', aliases: ['remarks'], example: 'Known through the Kongu Nagar group' },
]

/** A field is only imported if it appears here, so the sample cannot promise
 *  something the importer drops. */
export const IMPORTABLE_FIELDS = new Set(MEMBER_COLUMNS.map(c => c.field))

const quote = (v: string): string =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

/** The sample file. Header row, one filled example, one blank row to type into. */
export function sampleMemberCsv(): string {
  const header = MEMBER_COLUMNS.map(c => quote(c.header)).join(',')
  const example = MEMBER_COLUMNS.map(c => quote(c.example)).join(',')
  const blank = MEMBER_COLUMNS.map(() => '').join(',')
  return [header, example, blank].join('\r\n') + '\r\n'
}

/** Split one CSV line, honouring quoted fields containing commas. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

/** Map the file's headers onto fields. Unknown columns are ignored, not fatal —
 *  a spreadsheet exported from somewhere else usually carries extras. */
export function mapHeaders(headerLine: string): Record<string, number> {
  const cells = splitCsvLine(headerLine).map(h => h.toLowerCase().replace(/[_\s]+/g, ' ').trim())
  const index: Record<string, number> = {}
  cells.forEach((cell, i) => {
    for (const col of MEMBER_COLUMNS) {
      if (col.field in index) continue
      const names = [col.header.toLowerCase(), ...(col.aliases ?? [])]
      if (names.includes(cell)) { index[col.field] = i; return }
    }
  })
  // Fall back to a loose match for the one column that must be present.
  if (!('name' in index)) {
    const i = cells.findIndex(c => c.includes('name') && !c.includes('bank') && !c.includes('account'))
    if (i >= 0) index.name = i
  }
  return index
}

export interface ParsedMemberRow {
  row: number
  values: Record<string, string>
  error?: string
}

/** Parse the whole file into rows ready to send. Reports per-row problems
 *  rather than failing the file: 200 good rows should not be lost to one bad. */
export function parseMemberCsv(text: string): { rows: ParsedMemberRow[]; headers: Record<string, number> } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length)
  if (!lines.length) return { rows: [], headers: {} }
  const headers = mapHeaders(lines[0])
  const rows: ParsedMemberRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i])
    const values: Record<string, string> = {}
    for (const [field, idx] of Object.entries(headers)) {
      const v = cells[idx] ?? ''
      if (v) values[field] = v
    }
    // A row with nothing but commas is the blank line from the sample file.
    if (!Object.keys(values).length) continue
    rows.push({
      row: i + 1,
      values,
      error: values.name ? undefined : 'No name in this row',
    })
  }
  return { rows, headers }
}

// ── Matching a CSV row against members that already exist ───────────────────
//
// Two jobs, both of which go wrong quietly if done casually.
//
// SKIPPING DUPLICATES. A member number in the file that already belongs to
// someone is not an error in the file — it is a row you have already imported.
// Re-importing last month's spreadsheet should add the new people and leave the
// rest alone, not create a second Suresh or refuse the whole file.
//
// RESOLVING "INTRODUCED BY". The column may hold a member number or a name,
// because whoever fills the sheet writes whichever they know. A number is
// unambiguous. A name is not: chit registers are full of repeated names, and
// picking the first match would attach the introduction to the wrong person
// silently. So a name that matches two members is reported and left unlinked —
// an empty field you can see beats a link you cannot check.

export interface KnownMember {
  id: string
  name: string
  member_code?: string | null
}

/** Names are compared with case and spacing ignored, initials and all. */
export function normalizeName(raw: string | null | undefined): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export interface MemberIndex {
  byCode: Map<string, string>
  /** name → the single member with it, or AMBIGUOUS when several share it. */
  byName: Map<string, string | typeof AMBIGUOUS>
}

export const AMBIGUOUS = Symbol('ambiguous')

export function buildMemberIndex(members: KnownMember[]): MemberIndex {
  const byCode = new Map<string, string>()
  const byName = new Map<string, string | typeof AMBIGUOUS>()
  for (const m of members) {
    const code = normalizeMemberCode(m.member_code)
    if (code) byCode.set(code, m.id)
    const name = normalizeName(m.name)
    if (!name) continue
    byName.set(name, byName.has(name) ? AMBIGUOUS : m.id)
  }
  return { byCode, byName }
}

/** Does this row's member number already belong to somebody? */
export function existingCodeOwner(
  values: Record<string, string>, index: MemberIndex,
): string | null {
  const code = normalizeMemberCode(values.member_code)
  if (!code) return null
  return index.byCode.get(code) ?? null
}

export type ReferenceResolution =
  | { kind: 'none' }
  | { kind: 'matched'; memberId: string; by: 'code' | 'name' }
  | { kind: 'ambiguous'; reason: string }
  | { kind: 'missing'; reason: string }
  | { kind: 'self'; reason: string }

/**
 * Work out who "Introduced By" points at. Number first, then name — a number is
 * the stronger claim, so a sheet carrying both kinds resolves the certain ones
 * the certain way.
 */
export function resolveReference(
  raw: string | null | undefined, index: MemberIndex, selfId?: string | null,
): ReferenceResolution {
  const value = String(raw ?? '').trim()
  if (!value) return { kind: 'none' }

  const asCode = normalizeMemberCode(value)
  if (asCode && index.byCode.has(asCode)) {
    const id = index.byCode.get(asCode)!
    if (id === selfId) return { kind: 'self', reason: `${value} is the same member` }
    return { kind: 'matched', memberId: id, by: 'code' }
  }

  const hit = index.byName.get(normalizeName(value))
  if (hit === AMBIGUOUS) {
    return {
      kind: 'ambiguous',
      reason: `more than one member is called "${value}" — use their member number instead`,
    }
  }
  if (typeof hit === 'string') {
    if (hit === selfId) return { kind: 'self', reason: `${value} is the same member` }
    return { kind: 'matched', memberId: hit, by: 'name' }
  }

  return { kind: 'missing', reason: `no member matches "${value}"` }
}

// ── Importing straight into a group ─────────────────────────────────────────
//
// Adding people to a chit usually starts from a list someone already has. Most
// of those names are on the register; a few are not. Making the user add the
// new ones on another page first, then come back and tick them, is work the app
// can do itself.
//
// The matching rule is the same one used for "Introduced By", and for the same
// reason: a member NUMBER is certain, a name is not. A row whose name matches
// two existing members is reported rather than guessed at — attaching the wrong
// person to a chit means billing them for it.

export type GroupRowPlan =
  | { kind: 'existing'; memberId: string; matchedBy: 'code' | 'name'; label: string }
  | { kind: 'create'; values: Record<string, string>; label: string }
  | { kind: 'problem'; reason: string; label: string }

/**
 * Decide, for each parsed row, whether it is somebody we already have or
 * somebody to create. PURE — the caller does the writing.
 */
export function planGroupImport(
  rows: ParsedMemberRow[], index: MemberIndex,
): GroupRowPlan[] {
  return rows.map(r => {
    const label = `Row ${r.row}${r.values.name ? ` (${r.values.name})` : ''}`
    if (r.error) return { kind: 'problem', reason: r.error, label }

    // A member number in the file is a direct claim about who this is.
    const code = normalizeMemberCode(r.values.member_code)
    if (code) {
      const hit = index.byCode.get(code)
      if (hit) return { kind: 'existing', memberId: hit, matchedBy: 'code', label }
      // A number nobody holds: this is a new member who already has a number
      // on paper. Keep it rather than issuing a different one.
      return { kind: 'create', values: r.values, label }
    }

    const byName = index.byName.get(normalizeName(r.values.name))
    if (byName === AMBIGUOUS) {
      return {
        kind: 'problem', label,
        reason: `more than one member is called "${r.values.name}" — add their member number to the file`,
      }
    }
    if (typeof byName === 'string') return { kind: 'existing', memberId: byName, matchedBy: 'name', label }

    return { kind: 'create', values: r.values, label }
  })
}
