// The member CSV: one definition of the columns, used by BOTH the sample file
// and the parser.
//
// They were bound to drift if written twice — the sample would show a column
// the importer ignored, someone would fill it in, and the data would silently
// not arrive. Here the sample is generated FROM the column list the parser
// reads, so a column that appears in the file is a column that is imported.

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
