import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import DocPrintView from '@/components/documents/DocPrintView'
import { normalizeAccent } from '@/lib/companies/templates'
import { resolveSignature } from '@/lib/companies/resolveSignature'
import { invoiceStatusBand, type DocModel, type DocRow } from '@/lib/documents/model'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('recoverable_invoices').select('invoice_number').eq('id', id).maybeSingle()
  return { title: (data as { invoice_number?: string } | null)?.invoice_number ?? 'Invoice' }
}

interface LineRow {
  item_type: string | null; description: string | null; amount: number | null; line_number: number | null
  awb?: string | null; salary_amount?: number | null; expended_rate?: number | null
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function monthLabel(m: string | null): string {
  if (!m) return ''
  const p = String(m).split('T')[0].split('-'); const mi = parseInt(p[1] ?? '', 10) - 1
  return (mi >= 0 && mi < 12) ? `${MONTHS[mi]} ${p[0]}` : String(m)
}

export default async function ReimbursablePrintPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoice } = await supabase
    .from('recoverable_invoices')
    .select(`id, invoice_number, invoice_month, invoice_date, due_date, status, signatory_id, subtotal, cgst_amount, sgst_amount, total, currency, company_id, customer_id,
      items:recoverable_invoice_lines(item_type, description, amount, line_number, awb, salary_amount, expended_rate)`)
    .eq('id', id).eq('user_id', user.id).eq('invoice_type', 'reimbursement').maybeSingle()
  if (!invoice) notFound()

  const companyId = invoice.company_id as string | null
  const [{ data: company }, { data: customer }] = await Promise.all([
    companyId
      ? supabase.from('companies').select('*').eq('id', companyId).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    invoice.customer_id
      ? supabase.from('customers').select('*').eq('id', invoice.customer_id as string).eq('user_id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const c = company as Record<string, unknown> | null
  const cust = customer as Record<string, unknown> | null
  let logoUrl: string | null = null
  const docLogoPath = (c?.document_logo_path as string | null) ?? (c?.logo_path as string | null)
  if (docLogoPath) logoUrl = supabase.storage.from('vaultr-avatars').getPublicUrl(docLogoPath).data?.publicUrl ?? null
  const sig = await resolveSignature(supabase, user.id, { signatoryId: (invoice.signatory_id as string | null) ?? null, companyId })
  const signatureUrl = sig.url

  const cur = (invoice.currency as string | null) ?? 'EUR'
  const fmtCur = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n || 0)
  const fmtInr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)

  const lines = ((invoice.items ?? []) as LineRow[]).slice().sort((a, b) => (a.line_number ?? 0) - (b.line_number ?? 0))
  // Per-line INR value where a rate is known (salary lines carry expended_rate).
  const lineInr = (l: LineRow): number | null => {
    const rate = Number(l.expended_rate) || 0
    if (rate <= 0) return null
    const base = Number(l.salary_amount) || Number(l.amount) || 0
    return base * rate
  }
  const hasInr = lines.some(l => lineInr(l) != null)
  // AWB is folded into the description text, never its own column.
  const lineDesc = (l: LineRow): string => {
    const base = String(l.description ?? '')
    const awb = (l.awb ?? '').trim()
    return awb ? `${base}${base ? ' — ' : ''}AWB ${awb}` : base
  }

  // Column set — dual currency (INR + billing currency) when INR is derivable.
  const columns = [
    { key: 'desc', label: 'DESCRIPTION', flex: 3 },
    ...(hasInr ? [{ key: 'inr', label: 'INR', align: 'right' as const, flex: 1.3 }] : []),
    { key: 'cur', label: `AMOUNT (${cur})`, align: 'right' as const, flex: 1.3 },
  ]

  const SECTIONS: { type: string; label: string }[] = [
    { type: 'salary', label: 'Salaries' },
    { type: 'courier', label: 'Courier charges' },
    { type: 'expense', label: 'Expenses' },
    { type: 'fixed_expense', label: 'Fixed expenses' },
    { type: 'deduction', label: 'Deductions' },
  ]
  const presentSections = SECTIONS.filter(s => lines.some(l => (l.item_type ?? 'expense') === s.type))
  const rows: DocRow[] = []
  for (const sec of SECTIONS) {
    const items = lines.filter(l => (l.item_type ?? 'expense') === sec.type)
    if (!items.length) continue
    if (presentSections.length > 1) rows.push({ strong: true, cells: { desc: sec.label } })
    for (const l of items) {
      const isDed = sec.type === 'deduction'
      const inrVal = lineInr(l)
      rows.push({
        danger: isDed,
        cells: {
          desc: String(l.description ?? ''),
          awb: String(l.awb ?? ''),
          inr: inrVal != null ? fmtInr(inrVal) : '—',
          cur: fmtCur(Number(l.amount) || 0),
        },
      })
    }
  }

  const subtotal = Number(invoice.subtotal) || 0
  const gst = (Number(invoice.cgst_amount) || 0) + (Number(invoice.sgst_amount) || 0)
  const total = Number(invoice.total) || 0
  const totals = [{ label: 'Subtotal', value: fmtCur(subtotal) }]
  if (gst > 0) totals.push({ label: 'GST', value: fmtCur(gst) })

  const bankLines: string[] = []
  if (c?.bank_name) bankLines.push('Bank: ' + c.bank_name)
  if (c?.bank_account_name) bankLines.push('Account Name: ' + c.bank_account_name)
  if (c?.bank_account_number) bankLines.push('Account Number: ' + c.bank_account_number)
  const b2: string[] = []
  if (c?.bank_ifsc) b2.push('IFSC: ' + c.bank_ifsc)
  if (c?.swift_code) b2.push('SWIFT: ' + c.swift_code)
  if (b2.length) bankLines.push(b2.join(' · '))

  const model: DocModel = {
    accent: normalizeAccent((c?.invoice_accent as string | null) ?? undefined),
    status: invoiceStatusBand((invoice.status as string | null) ?? '', invoice.due_date as string | null),
    logoUrl,
    companyName: (c?.name as string | null) ?? 'Company',
    companyLines: [c?.address, c?.gstin ? 'GSTIN ' + c.gstin : null].filter(Boolean).map(String),
    title: 'INVOICE',
    number: String(invoice.invoice_number ?? ''),
    subNote: `Payment by Telegraphic Transfer (TT)`,
    parties: [
      { label: 'BILL TO', name: (cust?.name as string | null) ?? '—', lines: [cust?.address, cust?.country].filter(Boolean).map(String) },
      { label: 'FOR THE MONTH', name: monthLabel(invoice.invoice_month as string | null), lines: [`Currency: ${cur}`] },
    ],
    meta: [
      ...(invoice.invoice_date ? [{ label: 'Invoice date', value: String(invoice.invoice_date) }] : []),
      ...(invoice.due_date ? [{ label: 'Due', value: String(invoice.due_date) }] : []),
    ],
    columns,
    rows,
    totals,
    grandLabel: 'TOTAL',
    grandValue: fmtCur(total),
    bankLines,
    signatureUrl,
    signatureSize: sig.size,
    fields: {
      'doc.title': 'INVOICE',
      'doc.number': String(invoice.invoice_number ?? ''),
      'doc.date': String(invoice.invoice_date ?? ''),
      'doc.reference': '',
      'doc.currency': cur,
      'doc.month': monthLabel(invoice.invoice_month as string | null),
      'company.name': (c?.name as string | null) ?? '',
      'company.address': (c?.address as string | null) ?? '',
      'company.gstin': (c?.gstin as string | null) ?? '',
      'company.phone': (c?.phone as string | null) ?? '',
      'company.email': (c?.email as string | null) ?? '',
      'party.label': 'BILL TO',
      'party.name': (cust?.name as string | null) ?? '',
      'party.address': [cust?.address, cust?.country].filter(Boolean).join(', '),
      'party.gstin': String(cust?.gst_number ?? ''),
      'totals.grandLabel': 'TOTAL',
      'totals.grand': fmtCur(total),
      'totals.inWords': '',
    },
  }

  // Custom per-company courier/reimbursable template, if designed.
  let layout: import('@/lib/documents/layout').DocLayout | null = null
  if (companyId) {
    const { data: lay } = await supabase.from('document_layouts').select('schema')
      .eq('user_id', user.id).eq('company_id', companyId).eq('format', 'reimbursable').maybeSingle()
    layout = (lay?.schema as import('@/lib/documents/layout').DocLayout | null) ?? null
  }

  return <DocPrintView model={model} filename={`${String(invoice.invoice_number ?? 'Invoice')}.pdf`} layout={layout} />
}
