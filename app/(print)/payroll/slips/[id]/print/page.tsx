import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SlipPrintView from '@/components/payroll/slips/SlipPrintView'
import type { SalarySlipDocData } from '@/lib/payroll/slip'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import { normalizeAccent } from '@/lib/companies/templates'
import { resolveSignature } from '@/lib/companies/resolveSignature'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('payroll_entries').select('employee:employees(name)').eq('id', id).maybeSingle()
  const nm = (data as { employee?: { name?: string } } | null)?.employee?.name
  return { title: nm ? `Salary Slip — ${nm}` : 'Salary Slip' }
}

export default async function SalarySlipPrintPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: entry } = await supabase
    .from('payroll_entries')
    .select('*, employee:employees(*), month:payroll_months(*)')
    .eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!entry) notFound()

  const e = entry as unknown as PayrollEntry & { employee: Employee; month: PayrollMonth }
  const employee = e.employee
  const companyId = employee?.company_id ?? null

  type Co = { name: string | null; address: string | null; invoice_accent: string | null; logo_path: string | null; document_logo_path: string | null }
  let company: Co | null = null
  if (companyId) {
    const { data } = await supabase.from('companies').select('name, address, invoice_accent, logo_path, document_logo_path').eq('id', companyId).eq('user_id', user.id).maybeSingle()
    company = (data as Co | null) ?? null
  }

  let logoUrl: string | null = null
  const slipLogoPath = company?.document_logo_path ?? company?.logo_path
  if (slipLogoPath) {
    logoUrl = supabase.storage.from('vaultr-avatars').getPublicUrl(slipLogoPath).data.publicUrl ?? null
  }

  // v89 — signature from the run's chosen signatory (fallback company default).
  const sig = await resolveSignature(supabase, user.id, {
    signatoryId: (e.month as { signatory_id?: string | null })?.signatory_id ?? null,
    companyId,
  })
  const signatureUrl = sig.url

  const sdata: SalarySlipDocData = {
    entry: e, month: e.month, employee,
    companyName: company?.name ?? null,
    companyAddress: company?.address ?? null,
  }

  const accent = normalizeAccent(company?.invoice_accent ?? undefined)

  // The salary slip always renders from its template: the company's saved one,
  // or the built-in default. What you see in Templates is what prints.
  const { defaultLayout } = await import('@/lib/documents/layout')
  const { amountToWords } = await import('@/lib/recoverables/invoices/words')
  let layout: import('@/lib/documents/layout').DocLayout = defaultLayout('salary_slip', 'SALARY SLIP')
  if (companyId) {
    const { data: lay } = await supabase.from('document_layouts').select('schema')
      .eq('user_id', user.id).eq('company_id', companyId).eq('format', 'salary_slip').maybeSingle()
    if (lay?.schema) layout = lay.schema as import('@/lib/documents/layout').DocLayout
  }

  const n = (v: unknown) => Number(v ?? 0)
  const inr = (v: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v || 0)
  const fmtDate = (d: unknown) => {
    if (!d) return '—'
    const dt = new Date(String(d))
    return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const monthLabel = (() => {
    const m = String(e.month?.payroll_month ?? '')
    const p = m.split('T')[0].split('-'); const mi = parseInt(p[1] ?? '', 10) - 1
    return (mi >= 0 && mi < 12) ? `${MONTHS[mi]} ${p[0]}` : m
  })()

  const basic = n(e.salary_inr)
  const earn: [string, number][] = [['Basic', basic], ['Allowances', n(e.allowances)], ['Overtime', n(e.overtime)], ['Incentives', n(e.incentives)]]
  const ded: [string, number][] = [['Deductions', n(e.deductions)], ['Advance', n(e.advance)]]
  const gross = earn.reduce((s, [, v]) => s + v, 0)
  const totDed = ded.reduce((s, [, v]) => s + v, 0)
  const net = n(e.final_payable)
  const rate = n(e.expended_rate)

  const ctx: import('@/lib/documents/layoutContext').LayoutContext = {
    accent,
    fields: {
      'doc.title': 'SALARY SLIP',
      'company.name': company?.name ?? '',
      'company.address': company?.address ?? '',
      'employee.name': employee?.name ?? '',
      'employee.id': String(employee?.employee_id ?? '—'),
      'employee.designation': String(employee?.designation ?? '—'),
      'employee.pan': String(employee?.pan_number ?? '—'),
      'employee.joining': fmtDate(employee?.joining_date),
      'employee.bank': String(employee?.bank_name ?? '—'),
      'employee.account': String(employee?.account_number ?? '—'),
      'employee.ifsc': String(employee?.ifsc ?? '—'),
      'slip.month': monthLabel,
      'slip.paidOn': fmtDate(e.month?.payment_date),
      'slip.gross': inr(gross),
      'slip.deductions': inr(totDed),
      'slip.net': inr(net),
      'slip.words': amountToWords(net, 'INR'),
      'slip.sourceSalary': `${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n(e.salary_amount))} ${employee?.salary_currency || 'EUR'}`,
      'slip.fxRate': rate > 0 ? inr(rate) : '—',
    },
    columns: [{ key: 'c', label: 'COMPONENT', flex: 2 }, { key: 'a', label: 'AMOUNT', align: 'right', flex: 1 }],
    rows: [
      ...earn.map(([l, v]) => ({ cells: { c: l, a: inr(v) } })),
      { strong: true, cells: { c: 'Gross earnings', a: inr(gross) } },
      ...ded.map(([l, v]) => ({ danger: true, cells: { c: l, a: inr(v) } })),
      { strong: true, cells: { c: 'Total deductions', a: inr(totDed) } },
    ],
    totals: [], grandLabel: 'NET PAY', grandValue: inr(net),
    bankLines: [], logoUrl, signatureUrl, signatureSize: sig.size,
  }

  return (
    <SlipPrintView
      data={sdata}
      logoUrl={logoUrl}
      signatureUrl={signatureUrl}
      accent={accent}
      filename={`Salary Slip — ${employee?.name ?? 'Employee'}.pdf`}
      layout={layout}
      ctx={ctx}
    />
  )
}
