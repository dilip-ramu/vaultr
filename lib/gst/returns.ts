// GSTR-1 and GSTR-3B, derived from documents already in Vaultr.
//
// Pure functions over plain rows: the page normalises whatever the tables hold
// into OutwardSupply / InwardSupply, and everything below is arithmetic and
// classification with no database, no React and no dates-from-now. That makes
// the rules — which are the part that must be RIGHT — directly testable.
//
// Nothing here writes anything. A return is a view of your invoices, not a
// second copy of them.

import { stateCodeFromGstin, stateCodeFromName, isValidGstin, placeOfSupply } from './states'

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface GstCompany {
  id: string
  name: string
  gstin: string | null
  /** Derived from the GSTIN unless the company sits in a different state. */
  stateCode: string | null
}

export interface SupplyLine {
  hsn: string | null
  description?: string | null
  qty?: number | null
  taxable: number
  /** Combined GST rate for the line (5, 12, 18, 28…). */
  rate: number
  cgst: number
  sgst: number
  igst: number
}

export type OutwardKind = 'invoice' | 'credit_note' | 'debit_note'

/** Which table the document lives in — decides the print route for its PDF. */
export type OutwardSource = 'tax_invoice' | 'reimbursable' | 'document'

/** The print route that renders this document's PDF. */
export function printPath(s: { source: OutwardSource; id: string }): string {
  switch (s.source) {
    case 'tax_invoice':  return `/recoverables/invoices/${s.id}/print`
    case 'reimbursable': return `/reimbursables/invoices/${s.id}/print`
    default:             return `/documents/${s.id}/print`
  }
}

export interface OutwardSupply {
  id: string
  kind: OutwardKind
  source: OutwardSource
  number: string
  date: string                 // YYYY-MM-DD
  partyName: string
  partyGstin: string | null
  /** Free-text state, used only when there is no GSTIN to read it from. */
  partyState?: string | null
  taxable: number
  cgst: number
  sgst: number
  igst: number
  total: number
  lines: SupplyLine[]
  /** For a credit/debit note: the invoice it adjusts. */
  againstNumber?: string | null
  againstDate?: string | null
}

export interface InwardSupply {
  id: string
  supplierName: string
  supplierGstin: string | null
  number: string
  date: string
  taxable: number
  cgst: number
  sgst: number
  igst: number
  itcEligible: boolean
  reverseCharge: boolean
}

// ── Classification ──────────────────────────────────────────────────────────

/** B2CL kicks in above ₹2.5 lakh of invoice value to an unregistered buyer in
 *  another state. (Below that it's aggregated into B2CS.) */
export const B2CL_THRESHOLD = 250000

export const isRegistered = (s: { partyGstin: string | null }): boolean => isValidGstin(s.partyGstin)

/** The buyer's state — from the GSTIN if there is one, else the address. */
export function partyStateCode(s: { partyGstin: string | null; partyState?: string | null }): string | null {
  return stateCodeFromGstin(s.partyGstin) ?? stateCodeFromName(s.partyState)
}

/**
 * Inter-state or intra-state?
 *
 * The tax actually charged is the most reliable signal — if the invoice carries
 * IGST it WAS treated as inter-state, whatever the addresses say. Only when a
 * supply carries no tax at all do we fall back to comparing state codes.
 */
export function isInterState(s: OutwardSupply, company: GstCompany): boolean {
  if (s.igst > 0) return true
  if (s.cgst > 0 || s.sgst > 0) return false
  const party = partyStateCode(s)
  if (!party || !company.stateCode) return false
  return party !== company.stateCode
}

export type Section = 'b2b' | 'b2cl' | 'b2cs' | 'cdnr' | 'cdnur'

/** Which GSTR-1 table a supply belongs in. */
export function sectionFor(s: OutwardSupply, company: GstCompany): Section {
  const note = s.kind !== 'invoice'
  if (isRegistered(s)) return note ? 'cdnr' : 'b2b'
  if (note) return 'cdnur'
  if (isInterState(s, company) && s.total > B2CL_THRESHOLD) return 'b2cl'
  return 'b2cs'
}

// ── Return period ───────────────────────────────────────────────────────────

/** "2026-07" → the GST portal's "072026". */
export const toFilingPeriod = (month: string): string => {
  const [y, m] = month.split('-')
  return `${m}${y}`
}

export const inPeriod = (date: string, month: string): boolean => (date ?? '').slice(0, 7) === month

// ── GSTR-1 ──────────────────────────────────────────────────────────────────

export interface Gstr1Row {
  section: Section
  /** Identifies the underlying document, so its PDF can be pulled. */
  id: string
  source: OutwardSource
  gstin: string | null
  party: string
  number: string
  date: string
  placeOfSupply: string
  invoiceValue: number
  taxable: number
  igst: number
  cgst: number
  sgst: number
  rate: number
  /** Credit / debit notes only. */
  noteType?: 'C' | 'D'
  againstNumber?: string | null
  againstDate?: string | null
}

export interface HsnRow {
  hsn: string
  description: string
  qty: number
  rate: number
  taxable: number
  igst: number
  cgst: number
  sgst: number
  total: number
}

export interface DocRangeRow {
  nature: string
  from: string
  to: string
  count: number
  cancelled: number
}

export interface Gstr1 {
  gstin: string | null
  period: string          // MMYYYY
  rows: Gstr1Row[]
  hsn: HsnRow[]
  docs: DocRangeRow[]
  totals: { taxable: number; igst: number; cgst: number; sgst: number; invoiceValue: number }
  /** Anything we could not file — surfaced, never silently dropped. */
  warnings: string[]
}

/** The weighted GST rate of a supply, used when a line-level rate is missing. */
function supplyRate(s: OutwardSupply): number {
  if (s.taxable <= 0) return 0
  const tax = s.cgst + s.sgst + s.igst
  return Math.round((tax / s.taxable) * 100 * 100) / 100
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function buildGstr1(supplies: OutwardSupply[], company: GstCompany, month: string): Gstr1 {
  const inMonth = supplies.filter(s => inPeriod(s.date, month))
  const rows: Gstr1Row[] = []
  const warnings: string[] = []

  for (const s of inMonth) {
    const section = sectionFor(s, company)
    const pos = partyStateCode(s)

    if (section === 'b2b' && !pos) {
      warnings.push(`${s.number}: buyer is registered but the GSTIN has no readable state code.`)
    }
    if (!isRegistered(s) && s.partyGstin) {
      warnings.push(`${s.number}: "${s.partyGstin}" is not a valid GSTIN — filed as unregistered.`)
    }

    rows.push({
      section,
      id: s.id,
      source: s.source,
      gstin: isRegistered(s) ? (s.partyGstin ?? '').toUpperCase() : null,
      party: s.partyName,
      number: s.number,
      date: s.date,
      placeOfSupply: placeOfSupply(pos ?? company.stateCode),
      invoiceValue: money(s.total),
      taxable: money(s.taxable),
      igst: money(s.igst),
      cgst: money(s.cgst),
      sgst: money(s.sgst),
      rate: supplyRate(s),
      ...(s.kind === 'invoice' ? {} : {
        noteType: (s.kind === 'credit_note' ? 'C' : 'D') as 'C' | 'D',
        againstNumber: s.againstNumber ?? null,
        againstDate: s.againstDate ?? null,
      }),
    })

    if (s.kind !== 'invoice' && !s.againstNumber) {
      warnings.push(`${s.number}: note is not linked to an original invoice — GSTR-1 needs the invoice it adjusts.`)
    }
  }

  // A note reduces (credit) or adds to (debit) the liability, so credit notes
  // count negative in the totals even though the row itself is positive.
  const sign = (r: Gstr1Row) => (r.noteType === 'C' ? -1 : 1)
  const totals = rows.reduce(
    (t, r) => ({
      taxable: money(t.taxable + sign(r) * r.taxable),
      igst: money(t.igst + sign(r) * r.igst),
      cgst: money(t.cgst + sign(r) * r.cgst),
      sgst: money(t.sgst + sign(r) * r.sgst),
      invoiceValue: money(t.invoiceValue + sign(r) * r.invoiceValue),
    }),
    { taxable: 0, igst: 0, cgst: 0, sgst: 0, invoiceValue: 0 },
  )

  return {
    gstin: company.gstin,
    period: toFilingPeriod(month),
    rows,
    hsn: buildHsnSummary(inMonth),
    docs: buildDocSummary(inMonth),
    totals,
    warnings: [...new Set(warnings)],
  }
}

/** Table 12: everything rolled up by HSN and rate. */
export function buildHsnSummary(supplies: OutwardSupply[]): HsnRow[] {
  const map = new Map<string, HsnRow>()

  for (const s of supplies) {
    const sign = s.kind === 'credit_note' ? -1 : 1
    // A supply with no line detail still has to be reported — fold it into a
    // single synthetic line so nothing vanishes from the HSN table.
    const lines: SupplyLine[] = s.lines.length ? s.lines : [{
      hsn: null, qty: 1, taxable: s.taxable, rate: supplyRate(s), cgst: s.cgst, sgst: s.sgst, igst: s.igst,
    }]

    for (const l of lines) {
      const hsn = (l.hsn ?? '').trim() || 'UNSPECIFIED'
      const key = `${hsn}|${l.rate}`
      const row = map.get(key) ?? {
        hsn, description: (l.description ?? '').trim(), qty: 0, rate: l.rate,
        taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0,
      }
      row.qty += sign * (Number(l.qty) || 0)
      row.taxable = money(row.taxable + sign * l.taxable)
      row.igst = money(row.igst + sign * l.igst)
      row.cgst = money(row.cgst + sign * l.cgst)
      row.sgst = money(row.sgst + sign * l.sgst)
      row.total = money(row.taxable + row.igst + row.cgst + row.sgst)
      map.set(key, row)
    }
  }

  return [...map.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate)
}

const NATURE: Record<OutwardKind, string> = {
  invoice: 'Invoices for outward supply',
  credit_note: 'Credit notes',
  debit_note: 'Debit notes',
}

/** Table 13: the serial ranges of the documents issued this period. */
export function buildDocSummary(supplies: OutwardSupply[]): DocRangeRow[] {
  const groups = new Map<OutwardKind, string[]>()
  for (const s of supplies) {
    const list = groups.get(s.kind) ?? []
    list.push(s.number)
    groups.set(s.kind, list)
  }
  return [...groups.entries()].map(([kind, numbers]) => {
    const sorted = [...numbers].sort()
    return {
      nature: NATURE[kind],
      from: sorted[0],
      to: sorted[sorted.length - 1],
      count: sorted.length,
      cancelled: 0,   // Vaultr never reuses a number, so nothing is ever cancelled.
    }
  })
}

// ── GSTR-3B ─────────────────────────────────────────────────────────────────

export interface Gstr3b {
  gstin: string | null
  period: string
  /** 3.1(a) — outward taxable supplies (other than zero-rated, nil and exempt). */
  outward: { taxable: number; igst: number; cgst: number; sgst: number }
  /** 3.1(d) — inward supplies liable to reverse charge. */
  reverseCharge: { taxable: number; igst: number; cgst: number; sgst: number }
  /** 4(A)(5) — all other ITC. */
  itc: { igst: number; cgst: number; sgst: number }
  /** Output tax less ITC, per head. Negative = credit carried forward. */
  net: { igst: number; cgst: number; sgst: number; total: number }
  warnings: string[]
}

export function buildGstr3b(
  supplies: OutwardSupply[],
  inward: InwardSupply[],
  company: GstCompany,
  month: string,
): Gstr3b {
  const out = supplies.filter(s => inPeriod(s.date, month))
  const inw = inward.filter(s => inPeriod(s.date, month))

  const outward = out.reduce((t, s) => {
    const sign = s.kind === 'credit_note' ? -1 : 1
    return {
      taxable: money(t.taxable + sign * s.taxable),
      igst: money(t.igst + sign * s.igst),
      cgst: money(t.cgst + sign * s.cgst),
      sgst: money(t.sgst + sign * s.sgst),
    }
  }, { taxable: 0, igst: 0, cgst: 0, sgst: 0 })

  const rc = inw.filter(s => s.reverseCharge)
  const reverseCharge = rc.reduce((t, s) => ({
    taxable: money(t.taxable + s.taxable),
    igst: money(t.igst + s.igst),
    cgst: money(t.cgst + s.cgst),
    sgst: money(t.sgst + s.sgst),
  }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 })

  // Credit is only available on eligible bills. Reverse-charge tax is paid in
  // cash first and claimed as credit in the same return, so it counts too.
  const itc = inw.filter(s => s.itcEligible).reduce((t, s) => ({
    igst: money(t.igst + s.igst),
    cgst: money(t.cgst + s.cgst),
    sgst: money(t.sgst + s.sgst),
  }), { igst: 0, cgst: 0, sgst: 0 })

  const net = {
    igst: money(outward.igst - itc.igst),
    cgst: money(outward.cgst - itc.cgst),
    sgst: money(outward.sgst - itc.sgst),
    total: 0,
  }
  net.total = money(net.igst + net.cgst + net.sgst)

  const warnings: string[] = []
  const noTax = inw.filter(s => s.igst + s.cgst + s.sgst === 0 && s.taxable === 0)
  if (noTax.length) {
    warnings.push(`${noTax.length} supplier bill(s) this month have no GST breakup, so no input credit is claimed on them.`)
  }
  if (!company.gstin) warnings.push('This company has no GSTIN set — the return cannot be filed as-is.')

  return { gstin: company.gstin, period: toFilingPeriod(month), outward, reverseCharge, itc, net, warnings }
}

// ── Export shapes ───────────────────────────────────────────────────────────

/** The GSTR-1 offline tool's JSON, in the shape the portal accepts. */
export function gstr1Json(r: Gstr1) {
  const bySection = (s: Section) => r.rows.filter(x => x.section === s)
  const inv = (x: Gstr1Row) => ({
    inum: x.number, idt: fmtDate(x.date), val: x.invoiceValue, pos: (x.placeOfSupply.split('-')[0] || ''),
    rchrg: 'N', inv_typ: 'R',
    itms: [{ num: 1, itm_det: { rt: x.rate, txval: x.taxable, iamt: x.igst, camt: x.cgst, samt: x.sgst } }],
  })

  const b2b = groupBy(bySection('b2b'), x => x.gstin ?? '')
  const cdnr = groupBy(bySection('cdnr'), x => x.gstin ?? '')

  return {
    gstin: r.gstin ?? '',
    fp: r.period,
    b2b: [...b2b.entries()].map(([ctin, rows]) => ({ ctin, inv: rows.map(inv) })),
    b2cl: [...groupBy(bySection('b2cl'), x => x.placeOfSupply.split('-')[0]).entries()]
      .map(([pos, rows]) => ({ pos, inv: rows.map(inv) })),
    b2cs: bySection('b2cs').map(x => ({
      sply_ty: x.igst > 0 ? 'INTER' : 'INTRA', typ: 'OE',
      pos: x.placeOfSupply.split('-')[0], rt: x.rate,
      txval: x.taxable, iamt: x.igst, camt: x.cgst, samt: x.sgst,
    })),
    cdnr: [...cdnr.entries()].map(([ctin, rows]) => ({
      ctin,
      nt: rows.map(x => ({
        ntty: x.noteType, nt_num: x.number, nt_dt: fmtDate(x.date),
        inum: x.againstNumber ?? '', idt: x.againstDate ? fmtDate(x.againstDate) : '',
        val: x.invoiceValue, pos: x.placeOfSupply.split('-')[0], rchrg: 'N',
        itms: [{ num: 1, itm_det: { rt: x.rate, txval: x.taxable, iamt: x.igst, camt: x.cgst, samt: x.sgst } }],
      })),
    })),
    hsn: {
      data: r.hsn.map((h, i) => ({
        num: i + 1, hsn_sc: h.hsn, desc: h.description, qty: h.qty, rt: h.rate,
        txval: h.taxable, iamt: h.igst, camt: h.cgst, samt: h.sgst,
      })),
    },
    doc_issue: {
      doc_det: r.docs.map((d, i) => ({
        doc_num: i + 1, doc_typ: d.nature,
        docs: [{ num: 1, from: d.from, to: d.to, totnum: d.count, cancel: d.cancelled, net_issue: d.count - d.cancelled }],
      })),
    },
  }
}

/** GST portal wants DD-MM-YYYY. */
const fmtDate = (iso: string) => {
  const [y, m, d] = (iso ?? '').split('-')
  return y && m && d ? `${d}-${m}-${y}` : ''
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    m.set(k, [...(m.get(k) ?? []), r])
  }
  return m
}

/** A flat CSV of every row in the return — what an accountant actually wants. */
export function gstr1Csv(r: Gstr1): string {
  const head = ['Section', 'GSTIN', 'Party', 'Number', 'Date', 'Place of supply', 'Invoice value', 'Rate', 'Taxable', 'IGST', 'CGST', 'SGST', 'Note type', 'Against invoice', 'Against date']
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = r.rows.map(x => [
    x.section.toUpperCase(), x.gstin ?? '', x.party, x.number, x.date, x.placeOfSupply,
    x.invoiceValue, x.rate, x.taxable, x.igst, x.cgst, x.sgst,
    x.noteType ?? '', x.againstNumber ?? '', x.againstDate ?? '',
  ].map(esc).join(','))
  return [head.join(','), ...body].join('\n')
}
