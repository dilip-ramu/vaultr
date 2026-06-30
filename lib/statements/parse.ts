// Parser for bank-statement CSVs (one account at a time).
// Designed to be forgiving with header names — different banks call columns
// different things. Reads either a single signed Amount column or separate
// Credit/Debit columns.

export interface ParsedRow {
  date: string                // YYYY-MM-DD
  description: string
  amount: number              // always positive
  type: 'income' | 'expense'  // income = credit (money in), expense = debit
}

export interface ParseResult {
  rows: ParsedRow[]
  warnings: string[]          // soft messages (skipped rows, etc.)
  headers: string[]
}

// ── CSV parsing (RFC4180-ish, quoted fields with embedded commas) ────────────

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else {
        cur += c
      }
    } else {
      if (c === ',') { out.push(cur); cur = '' }
      else if (c === '"' && cur === '') inQuote = true
      else cur += c
    }
  }
  out.push(cur)
  return out.map(s => s.trim())
}

export function parseCsvText(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  return lines.map(parseCsvLine)
}

// ── Header detection ─────────────────────────────────────────────────────────

const DATE_RE   = /^(date|txn\s*date|transaction\s*date|posting\s*date|value\s*date|booking\s*date|narration\s*date)$/i
const DESC_RE   = /^(description|narration|details|particulars|transaction|remarks?|memo|reference|narration\s*details)$/i
const AMT_RE    = /^(amount|txn\s*amount|transaction\s*amount|value)$/i
const DEBIT_RE  = /^(debit|dr|withdrawal( amount)?|money\s*out|out|paid\s*out|withdrawals|withdrawal\s*amt|debit\s*amt)$/i
const CREDIT_RE = /^(credit|cr|deposit( amount)?|money\s*in|in|paid\s*in|deposits|deposit\s*amt|credit\s*amt)$/i

function findColumn(headers: string[], re: RegExp): number {
  for (let i = 0; i < headers.length; i++) if (re.test(headers[i].trim())) return i
  return -1
}

// ── Date parsing ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Returns YYYY-MM-DD or null. Accepts: 2024-08-03, 03/08/2024, 03-08-24,
 *  3 Aug 2024, 03-Aug-2024, Aug 3, 2024. dd/mm assumed (Indian default). */
export function parseDate(s: string): string | null {
  const v = s.trim()
  if (!v) return null
  // YYYY-MM-DD
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  // dd/mm/yyyy or dd-mm-yyyy (assume DMY)
  const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dmy) {
    let y = dmy[3]
    if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y
    const mo = dmy[2].padStart(2, '0')
    const d  = dmy[1].padStart(2, '0')
    return `${y}-${mo}-${d}`
  }
  // dd-Mon-yyyy / dd Mon yyyy
  const dMon = v.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[a-z]*[\s\-,]+(\d{2,4})$/)
  if (dMon) {
    const mo = MONTHS[dMon[2].toLowerCase()]
    if (mo) {
      let y = dMon[3]
      if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y
      return `${y}-${String(mo).padStart(2, '0')}-${dMon[1].padStart(2, '0')}`
    }
  }
  // Mon dd, yyyy
  const monD = v.match(/^([A-Za-z]{3})[a-z]*[\s,]+(\d{1,2}),?\s+(\d{2,4})$/)
  if (monD) {
    const mo = MONTHS[monD[1].toLowerCase()]
    if (mo) {
      let y = monD[3]
      if (y.length === 2) y = (Number(y) > 50 ? '19' : '20') + y
      return `${y}-${String(mo).padStart(2, '0')}-${monD[2].padStart(2, '0')}`
    }
  }
  return null
}

function parseAmount(s: string | undefined): number | null {
  if (!s) return null
  const cleaned = s.replace(/[₹$€£¥,\s]/g, '').replace(/\((.*)\)/, '-$1')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function parseStatement(csvText: string): ParseResult {
  const all = parseCsvText(csvText)
  if (all.length === 0) return { rows: [], warnings: ['Empty file'], headers: [] }

  // Find the header row — first row that contains at least one recognised column.
  let headerIdx = 0
  let headers: string[] = []
  for (let i = 0; i < Math.min(all.length, 10); i++) {
    const cells = all[i]
    if (findColumn(cells, DATE_RE) !== -1 &&
        (findColumn(cells, AMT_RE) !== -1 || findColumn(cells, DEBIT_RE) !== -1 || findColumn(cells, CREDIT_RE) !== -1)) {
      headerIdx = i
      headers = cells
      break
    }
  }
  if (headers.length === 0) {
    return { rows: [], warnings: ['Could not find header row. Need columns for Date and Amount (or Debit/Credit).'], headers: [] }
  }

  const dateCol   = findColumn(headers, DATE_RE)
  const descCol   = findColumn(headers, DESC_RE)
  const amtCol    = findColumn(headers, AMT_RE)
  const debitCol  = findColumn(headers, DEBIT_RE)
  const creditCol = findColumn(headers, CREDIT_RE)

  const rows: ParsedRow[] = []
  const warnings: string[] = []
  for (let i = headerIdx + 1; i < all.length; i++) {
    const r = all[i]
    if (r.every(c => !c)) continue                  // blank row
    const rawDate = r[dateCol]
    const date = rawDate ? parseDate(rawDate) : null
    if (!date) {
      // Probably a totals / "opening balance" row — skip silently
      continue
    }
    const desc = descCol !== -1 ? (r[descCol] || '').trim() : ''

    // Resolve amount + direction
    let signed: number | null = null
    if (amtCol !== -1) {
      signed = parseAmount(r[amtCol])
    }
    if (signed == null && (debitCol !== -1 || creditCol !== -1)) {
      const dr = debitCol  !== -1 ? parseAmount(r[debitCol])  : null
      const cr = creditCol !== -1 ? parseAmount(r[creditCol]) : null
      if (cr && cr !== 0) signed =  Math.abs(cr)
      else if (dr && dr !== 0) signed = -Math.abs(dr)
    }
    if (signed == null || signed === 0) {
      warnings.push(`Row ${i + 1}: no amount found — skipped`)
      continue
    }

    rows.push({
      date,
      description: desc || '(no description)',
      amount: Math.abs(signed),
      type: signed > 0 ? 'income' : 'expense',
    })
  }

  return { rows, warnings, headers }
}

/** Filter rows that should NOT be imported because the user already has
 *  Vaultr entries from that date onwards. cutoffDate is inclusive — rows
 *  strictly before it are kept. */
export function applyCutoff(rows: ParsedRow[], cutoffDate: string | null): { kept: ParsedRow[]; skipped: number } {
  if (!cutoffDate) return { kept: rows, skipped: 0 }
  const kept = rows.filter(r => r.date < cutoffDate)
  return { kept, skipped: rows.length - kept.length }
}
