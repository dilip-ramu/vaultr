import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SlipPrintView from '@/components/payroll/slips/SlipPrintView'
import type { SalarySlipDocData } from '@/lib/payroll/slip'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import { normalizeAccent } from '@/lib/companies/templates'
import { resolveSignatureUrl } from '@/lib/companies/resolveSignature'

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
  const signatureUrl = await resolveSignatureUrl(supabase, user.id, {
    signatoryId: (e.month as { signatory_id?: string | null })?.signatory_id ?? null,
    companyId,
  })

  const sdata: SalarySlipDocData = {
    entry: e, month: e.month, employee,
    companyName: company?.name ?? null,
    companyAddress: company?.address ?? null,
  }

  const accent = normalizeAccent(company?.invoice_accent ?? undefined)

  // Custom per-company salary-slip template, if designed.
  let layout: import('@/lib/documents/layout').DocLayout | null = null
  let ctx: import('@/lib/documents/layoutContext').LayoutContext | null = null
  if (companyId) {
    const { data: lay } = await supabase.from('document_layouts').select('schema')
      .eq('user_id', user.id).eq('company_id', companyId).eq('format', 'salary_slip').maybeSingle()
    layout = (lay?.schema as import('@/lib/documents/layout').DocLayout | null) ?? null
  }
  if (layout) {
    const n = (v: unknown) => Number(v ?? 0)
    const inr = (v: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(v || 0)
    const basic = n(e.salary_inr)
    const earn: [string, number][] = [['Basic', basic], ['Allowances', n(e.allowances)], ['Overtime', n(e.overtime)], ['Incentives', n(e.incentives)]]
    const ded: [string, number][] = [['Deductions', n(e.deductions)], ['Advance', n(e.advance)]]
    const gross = earn.reduce((s, [, v]) => s + v, 0)
    const totDed = ded.reduce((s, [, v]) => s + v, 0)
    const net = n(e.final_payable)
    const monthLabel = String(e.month?.payroll_month ?? '')
    ctx = {
      accent,
      fields: {
        'doc.title': 'SALARY SLIP', 'company.name': company?.name ?? '', 'company.address': company?.address ?? '',
        'employee.name': employee?.name ?? '', 'employee.id': String(employee?.employee_id ?? ''), 'employee.designation': String(employee?.designation ?? ''),
        'slip.month': monthLabel, 'slip.net': inr(net), 'slip.words': (await import('@/lib/recoverables/invoices/words')).amountToWords(net, 'INR'),
      },
      columns: [{ key: 'c', label: 'COMPONENT', flex: 2 }, { key: 'a', label: 'AMOUNT', align: 'right', flex: 1 }],
      rows: [
        ...earn.map(([l, v]) => ({ cells: { c: l, a: inr(v) } })),
        { strong: true, cells: { c: 'Gross earnings', a: inr(gross) } },
        ...ded.map(([l, v]) => ({ danger: true, cells: { c: l, a: inr(v) } })),
        { strong: true, cells: { c: 'Total deductions', a: inr(totDed) } },
      ],
      totals: [], grandLabel: 'NET PAY', grandValue: inr(net),
      bankLines: [employee?.bank_name, employee?.account_number ? 'A/C ' + employee.account_number : '', employee?.ifsc ? 'IFSC ' + employee.ifsc : ''].filter(Boolean) as string[],
      logoUrl, signatureUrl,
    }
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
