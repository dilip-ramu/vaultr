import type { RawCSVRow } from '../types'

// ── Column detection ─────────────────────────────────────────

const REFERENCE_ALIASES = /^(awb(\s*no\.?)?|reference|ref|id)$/i
const COST_ALIASES      = /^(total\s*cost|cost|amount|total\s*amount)$/i
const PCS_ALIASES       = /^(total\s*pcs|pcs|total\s*pieces|pieces)$/i
const DATE_ALIASES      = /^(date|shipment\s*date|ship\s*date|dispatch\s*date|awb\s*date)$/i
const CLIENT_ALIASES    = /^(client(\s*name)?|consignee|shipper|customer(\s*name)?)$/i
const SKIP_ALIASES      = /^(s\.?\s*no\.?|sr\.?\s*no\.?|#|sl\.?\s*no\.?)$/i  // row counters, ignored

export function detectColumns(headers: string[]): {
  referenceCol: number
  totalCostCol: number
  totalPcsCol: number
  dateCol: number
  clientCol: number
  supplierCols: Array<{ name: string; index: number }>
  errors: string[]
} {
  let referenceCol = -1
  let totalCostCol = -1
  let totalPcsCol  = -1
  let dateCol      = -1
  let clientCol    = -1
  const supplierCols: Array<{ name: string; index: number }> = []
  const errors: string[] = []

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim()
    if (!h || SKIP_ALIASES.test(h)) {
      // serial number column — ignore entirely
    } else if (dateCol === -1 && DATE_ALIASES.test(h)) {
      dateCol = i
    } else if (referenceCol === -1 && REFERENCE_ALIASES.test(h)) {
      referenceCol = i
    } else if (clientCol === -1 && CLIENT_ALIASES.test(h)) {
      clientCol = i
    } else if (totalCostCol === -1 && COST_ALIASES.test(h)) {
      totalCostCol = i
    } else if (totalPcsCol === -1 && PCS_ALIASES.test(h)) {
      totalPcsCol = i
    } else {
      supplierCols.push({ name: h, index: i })
    }
  }

  if (referenceCol === -1) errors.push('Could not identify a reference column (expected: AWB No., Reference, Ref, or ID)')
  if (totalCostCol === -1) errors.push('Could not identify a cost column (expected: Total Cost, Cost, Amount, or Total Amount)')
  if (totalPcsCol  === -1) errors.push('Could not identify a pieces column (expected: Total PCS, PCS, Total Pieces, or Pieces)')

  return { referenceCol, totalCostCol, totalPcsCol, dateCol, clientCol, supplierCols, errors }
}

// ── CSV tokeniser ────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  fields.push(cur)
  return fields
}

// ── Main parser ──────────────────────────────────────────────

export function parseCSVText(csvText: string): RawCSVRow[] {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const nonEmpty = lines.filter(l => l.trim().length > 0)
  if (nonEmpty.length === 0) return []

  const headers = parseCSVLine(nonEmpty[0]).map(h => h.trim())
  const { referenceCol, totalCostCol, totalPcsCol, dateCol, clientCol, supplierCols, errors } = detectColumns(headers)

  if (errors.length > 0) {
    // Surface header errors as a single synthetic row so callers can report them
    return []
  }

  const rows: RawCSVRow[] = []

  for (let lineIdx = 1; lineIdx < nonEmpty.length; lineIdx++) {
    const line = nonEmpty[lineIdx].trim()
    if (!line) continue

    const fields = parseCSVLine(line)
    const raw: Record<string, string> = {}
    headers.forEach((h, i) => { raw[h] = (fields[i] ?? '').trim() })

    const reference  = (fields[referenceCol] ?? '').trim()
    const costStr    = (fields[totalCostCol] ?? '').trim()
    const pcsStr     = (fields[totalPcsCol]  ?? '').trim()
    const dateStr    = dateCol   !== -1 ? (fields[dateCol]   ?? '').trim() : ''
    const clientName = clientCol !== -1 ? (fields[clientCol] ?? '').trim() : null

    const totalCost = parseFloat(costStr.replace(/,/g, ''))
    const totalPcs  = parseInt(pcsStr, 10)

    // Store date as-is from CSV (column is TEXT in DB)
    const shipmentDate = dateStr || null

    const suppliers: Record<string, number> = {}
    for (const { name, index } of supplierCols) {
      const val = (fields[index] ?? '').trim()
      suppliers[name] = val === '' ? 0 : parseInt(val, 10)
    }

    rows.push({
      rowIndex: lineIdx,   // 1-based line number (header = 0, first data = 1)
      reference,
      totalCost:   isNaN(totalCost) ? 0 : totalCost,
      totalPcs:    isNaN(totalPcs)  ? 0 : totalPcs,
      shipmentDate,
      clientName:  clientName || null,
      suppliers,
      raw,
    })
  }

  return rows
}

// ── Date normaliser ──────────────────────────────────────────
// Accepts: dd/mm/yyyy, dd-mm-yyyy, mm/dd/yyyy, yyyy-mm-dd, d MMM yyyy, etc.
// Returns: yyyy-mm-dd string or null

function parseDate(raw: string): string | null {
  if (!raw) return null

  // Already ISO: yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // dd/mm/yyyy or dd-mm-yyyy (4-digit year)
  const dmy4 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy4) {
    const [, d, m, y] = dmy4
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // dd/mm/yy or dd-mm-yy (2-digit year — assume 20xx)
  const dmy2 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (dmy2) {
    const [, d, m, y] = dmy2
    return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  return null
}

// ── Re-export detected supplier columns for external use ─────

export function getSupplierColumns(csvText: string): string[] {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headerLine = lines.find(l => l.trim().length > 0) ?? ''
  const headers = parseCSVLine(headerLine).map(h => h.trim())
  const { supplierCols } = detectColumns(headers)
  return supplierCols.map(c => c.name)
}
