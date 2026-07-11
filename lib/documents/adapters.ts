// Adapters that turn each stored document shape into the unified DocModel that
// <DocDesign> renders. Pure functions — safe to call from server components.

import type { DocModel, DocRow, DocColumn } from './model'
import { invoiceStatusBand } from './model'
import { amountToWords } from '@/lib/recoverables/invoices/words'

const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
const plain = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
const compact = (v: string | null | undefined) => (v && String(v).trim()) || null

interface BrandRefs { logoUrl?: string | null; signatureUrl?: string | null; accent: string }

export interface InvoiceSettings {
  company_name?: string | null; company_address?: string | null; company_gstin?: string | null
  company_phone?: string | null; company_email?: string | null
  bank_account_name?: string | null; bank_account_number?: string | null; bank_ifsc?: string | null
  bank_name?: string | null; swift_code?: string | null; terms_conditions?: string | null
}

function companyLines(s: InvoiceSettings | null): string[] {
  if (!s) return []
  const out: string[] = []
  if (compact(s.company_address)) out.push(String(s.company_address))
  const line2: string[] = []
  if (compact(s.company_gstin)) line2.push('GSTIN ' + s.company_gstin)
  if (compact(s.company_phone)) line2.push(String(s.company_phone))
  if (line2.length) out.push(line2.join(' · '))
  if (compact(s.company_email)) out.push(String(s.company_email))
  return out
}

function bankLines(s: InvoiceSettings | null): string[] {
  if (!s) return []
  const parts: string[] = []
  if (compact(s.bank_name)) parts.push('Bank: ' + s.bank_name)
  if (compact(s.bank_account_name)) parts.push('Account Name: ' + s.bank_account_name)
  if (compact(s.bank_account_number)) parts.push('Account Number: ' + s.bank_account_number)
  const l2: string[] = []
  if (compact(s.bank_ifsc)) l2.push('IFSC: ' + s.bank_ifsc)
  if (compact(s.swift_code)) l2.push('SWIFT: ' + s.swift_code)
  if (l2.length) parts.push(l2.join(' · '))
  return parts
}

// ── Tax invoice (recoverable typed) ──────────────────────────────────────────

interface TaxLine {
  description?: string | null; awb?: string | null; client_name?: string | null
  hsn_sac?: string | null; qty?: number | null; rate?: number | null; amount?: number | null
  cgst_amount?: number | null; sgst_amount?: number | null
}
interface TaxInvoice {
  invoice_number?: string | null; invoice_date?: string | null; due_date?: string | null
  customer_name?: string | null; customer_address?: string | null; customer_gstin?: string | null; customer_state?: string | null
  subtotal?: number | null; cgst_rate?: number | null; sgst_rate?: number | null
  cgst_amount?: number | null; sgst_amount?: number | null; total?: number | null
  status?: string | null; notes?: string | null; payment_terms?: string | null
}

export function taxInvoiceToModel(inv: TaxInvoice, lines: TaxLine[], settings: InvoiceSettings | null, refs: BrandRefs): DocModel {
  // A single Description column. Courier details (AWB / client) are folded into
  // the description text — never their own columns.
  const cols: DocColumn[] = [
    { key: 'desc', label: 'DESCRIPTION', flex: 2.6 },
    { key: 'hsn', label: 'HSN', align: 'center', flex: 0.6 },
    { key: 'qty', label: 'QTY', align: 'center', flex: 0.5 },
    { key: 'rate', label: 'RATE', align: 'right', flex: 0.8 },
    { key: 'amt', label: 'AMOUNT', align: 'right', flex: 0.9 },
  ]
  const buildDesc = (l: TaxLine): string => {
    const extras: string[] = []
    if (compact(l.client_name)) extras.push(String(l.client_name))
    if (compact(l.awb)) extras.push('AWB ' + l.awb)
    const base = String(l.description ?? '')
    return extras.length ? `${base}${base ? ' — ' : ''}${extras.join(' · ')}` : base
  }
  const rows: DocRow[] = lines.map(l => ({
    cells: {
      desc: buildDesc(l),
      hsn: String(l.hsn_sac ?? ''),
      qty: plain(Number(l.qty) || 0),
      rate: plain(Number(l.rate) || 0),
      amt: plain(Number(l.amount) || 0),
    },
  }))

  const cgst = Number(inv.cgst_amount) || 0
  const sgst = Number(inv.sgst_amount) || 0
  const taxable = Number(inv.subtotal) || 0
  const total = Number(inv.total) || 0
  const interState = cgst === 0 && sgst === 0 && total > taxable

  const totals = [{ label: 'Taxable value', value: inr(taxable) }]
  const summaryCols: string[] = ['TAXABLE']
  const summaryRow: string[] = [plain(taxable)]
  if (interState) {
    const igst = total - taxable
    totals.push({ label: 'IGST', value: inr(igst) })
    summaryCols.push('IGST'); summaryRow.push(plain(igst))
  } else {
    totals.push({ label: `CGST ${Number(inv.cgst_rate) || 9}%`, value: inr(cgst) })
    totals.push({ label: `SGST ${Number(inv.sgst_rate) || 9}%`, value: inr(sgst) })
    summaryCols.push(`CGST ${Number(inv.cgst_rate) || 9}%`, `SGST ${Number(inv.sgst_rate) || 9}%`)
    summaryRow.push(plain(cgst), plain(sgst))
  }

  const custLines: string[] = []
  if (compact(inv.customer_address)) custLines.push(String(inv.customer_address))
  const cl2: string[] = []
  if (compact(inv.customer_gstin)) cl2.push('GSTIN ' + inv.customer_gstin)
  if (compact(inv.customer_state)) cl2.push(String(inv.customer_state))
  if (cl2.length) custLines.push(cl2.join(' · '))

  // A saved tax invoice is a real issued invoice — treat legacy 'draft' rows as
  // issued so they read DUE/OVERDUE, never DRAFT (there is no draft workflow).
  const effectiveStatus = (inv.status ?? '') === 'draft' ? 'sent' : (inv.status ?? '')
  return {
    accent: refs.accent,
    status: invoiceStatusBand(effectiveStatus, inv.due_date),
    logoUrl: refs.logoUrl,
    companyName: settings?.company_name ?? 'Company',
    companyLines: companyLines(settings),
    title: 'TAX INVOICE',
    number: String(inv.invoice_number ?? ''),
    subNote: 'ORIGINAL FOR RECIPIENT',
    parties: [{ label: 'BILL TO', name: String(inv.customer_name ?? '—'), lines: custLines }],
    meta: [
      ...(compact(inv.invoice_date) ? [{ label: 'Invoice date', value: String(inv.invoice_date) }] : []),
      ...(compact(inv.due_date) ? [{ label: 'Due', value: String(inv.due_date) }] : []),
    ],
    columns: cols,
    rows,
    taxSummary: { title: 'TAX SUMMARY', columns: summaryCols, rows: [summaryRow] },
    totals,
    grandLabel: 'TOTAL',
    grandValue: inr(total),
    inWords: amountToWords(total, 'INR'),
    bankLines: bankLines(settings),
    terms: compact(settings?.terms_conditions) ?? undefined,
    signatureUrl: refs.signatureUrl,
    fields: {
      'doc.title': 'TAX INVOICE',
      'doc.number': String(inv.invoice_number ?? ''),
      'doc.date': String(inv.invoice_date ?? ''),
      'doc.reference': String(inv.payment_terms ?? ''),
      'company.name': settings?.company_name ?? '',
      'company.address': compact(settings?.company_address) ?? '',
      'company.gstin': compact(settings?.company_gstin) ?? '',
      'company.phone': compact(settings?.company_phone) ?? '',
      'company.email': compact(settings?.company_email) ?? '',
      'party.label': 'BILL TO',
      'party.name': String(inv.customer_name ?? ''),
      'party.address': custLines.join(', '),
      'party.gstin': compact(inv.customer_gstin) ?? '',
      'totals.grandLabel': 'TOTAL',
      'totals.grand': inr(total),
      'totals.inWords': amountToWords(total, 'INR'),
    },
  }
}

// ── Issued documents (credit/debit note, proforma, PO, delivery challan) ─────

interface DocLine {
  item?: string | null; hsn_sac?: string | null; qty?: number | null; rate?: number | null
  amount?: number | null; gst_rate?: number | null; cgst_amount?: number | null; sgst_amount?: number | null
}
interface DocRecord {
  number?: string | null; date?: string | null; reference?: string | null; notes?: string | null
  party_name?: string | null; party_address?: string | null; party_gstin?: string | null; party_state?: string | null
  subtotal?: number | null; cgst_amount?: number | null; sgst_amount?: number | null; total?: number | null
}
interface DocMeta2 {
  title: string; partyLabel: string; tax: boolean; referenceLabel?: string
  statusLabel: string; statusTone: 'grey' | 'blue' | 'violet' | 'amber' | 'green'
  subNote?: string; noteFallback?: string
}

export function issuedDocToModel(doc: DocRecord, lines: DocLine[], settings: InvoiceSettings | null, meta: DocMeta2, refs: BrandRefs): DocModel {
  const cols: DocColumn[] = [
    { key: 'item', label: 'ITEM', flex: 2 },
    { key: 'hsn', label: 'HSN', align: 'center', flex: 0.7 },
    { key: 'qty', label: 'QTY', align: 'center', flex: 0.6 },
    { key: 'rate', label: 'RATE', align: 'right', flex: 0.9 },
    { key: 'amt', label: meta.tax ? 'TAXABLE' : 'VALUE', align: 'right', flex: 0.9 },
  ]
  const rows: DocRow[] = lines.map(l => ({
    cells: {
      item: String(l.item ?? ''), hsn: String(l.hsn_sac ?? ''),
      qty: plain(Number(l.qty) || 0), rate: plain(Number(l.rate) || 0), amt: plain(Number(l.amount) || 0),
    },
  }))

  const taxable = Number(doc.subtotal) || 0
  const cgst = Number(doc.cgst_amount) || 0
  const sgst = Number(doc.sgst_amount) || 0
  const total = Number(doc.total) || 0

  const totals = [{ label: meta.tax ? 'Taxable value' : 'Subtotal', value: inr(taxable) }]
  if (meta.tax) {
    if (cgst === 0 && sgst === 0 && total > taxable) totals.push({ label: 'IGST', value: inr(total - taxable) })
    else { totals.push({ label: 'CGST', value: inr(cgst) }); totals.push({ label: 'SGST', value: inr(sgst) }) }
  }

  const pLines: string[] = []
  if (compact(doc.party_address)) pLines.push(String(doc.party_address))
  const p2: string[] = []
  if (compact(doc.party_gstin)) p2.push('GSTIN ' + doc.party_gstin)
  if (compact(doc.party_state)) p2.push(String(doc.party_state))
  if (p2.length) pLines.push(p2.join(' · '))

  const metaChips = [
    ...(compact(doc.date) ? [{ label: 'Date', value: String(doc.date) }] : []),
    ...(compact(doc.reference) ? [{ label: meta.referenceLabel ?? 'Reference', value: String(doc.reference) }] : []),
  ]

  return {
    accent: refs.accent,
    status: { label: meta.statusLabel, tone: meta.statusTone },
    logoUrl: refs.logoUrl,
    companyName: settings?.company_name ?? 'Company',
    companyLines: companyLines(settings),
    title: meta.title.toUpperCase(),
    number: String(doc.number ?? ''),
    subNote: meta.subNote,
    parties: [{ label: meta.partyLabel.toUpperCase(), name: String(doc.party_name ?? '—'), lines: pLines }],
    meta: metaChips,
    columns: cols,
    rows,
    totals,
    grandLabel: meta.tax ? 'TOTAL' : 'TOTAL VALUE',
    grandValue: inr(total),
    inWords: meta.tax ? amountToWords(total, 'INR') : undefined,
    bankLines: meta.tax ? bankLines(settings) : [],
    terms: compact(settings?.terms_conditions) ?? undefined,
    note: compact(doc.notes) ?? meta.noteFallback,
    signatureUrl: refs.signatureUrl,
    fields: {
      'doc.title': meta.title.toUpperCase(),
      'doc.number': String(doc.number ?? ''),
      'doc.date': String(doc.date ?? ''),
      'doc.reference': compact(doc.reference) ?? '',
      'company.name': settings?.company_name ?? '',
      'company.address': compact(settings?.company_address) ?? '',
      'company.gstin': compact(settings?.company_gstin) ?? '',
      'company.phone': compact(settings?.company_phone) ?? '',
      'company.email': compact(settings?.company_email) ?? '',
      'party.label': meta.partyLabel.toUpperCase(),
      'party.name': String(doc.party_name ?? ''),
      'party.address': pLines.join(', '),
      'party.gstin': compact(doc.party_gstin) ?? '',
      'totals.grandLabel': meta.tax ? 'TOTAL' : 'TOTAL VALUE',
      'totals.grand': inr(total),
      'totals.inWords': meta.tax ? amountToWords(total, 'INR') : '',
    },
  }
}
