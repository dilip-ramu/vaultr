import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import SalarySlipPrintView from '@/components/payroll/slips/SalarySlipPrintView'
import SalarySlip17a from '@/components/payroll/slips/SalarySlip17a'
import type { SalarySlipDocData } from '@/components/templates/SalarySlipRenderer'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import { salarySlipPreset, type DocumentSchema } from '@/lib/templates/schema'
import { normalizeAccent } from '@/lib/companies/templates'

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

  type Co = { name: string | null; address: string | null; invoice_accent: string | null; logo_path: string | null }
  let company: Co | null = null
  if (companyId) {
    const { data } = await supabase.from('companies').select('name, address, invoice_accent, logo_path').eq('id', companyId).eq('user_id', user.id).maybeSingle()
    company = (data as Co | null) ?? null
  }

  let logoUrl: string | null = null
  if (company?.logo_path) {
    logoUrl = supabase.storage.from('vaultr-avatars').getPublicUrl(company.logo_path).data.publicUrl ?? null
  }

  const sdata: SalarySlipDocData = {
    entry: e, month: e.month, employee,
    companyName: company?.name ?? null,
    companyAddress: company?.address ?? null,
  }

  // Claude design (17a) — only for payroll months created under the new design.
  // Every field is the app's own slip data; only the layout schema is Claude's.
  if ((e.month as { design_version?: string | null })?.design_version === 'claude') {
    return <SalarySlip17a data={sdata} logoUrl={logoUrl} accent={normalizeAccent(company?.invoice_accent ?? undefined)} />
  }

  // Resolve the assigned salary-slip template; fall back to the classic preset.
  let schema: DocumentSchema | null = null
  {
    let aq = supabase.from('document_template_assignments').select('template_id')
      .eq('user_id', user.id).eq('doc_type', 'salary_slip')
    aq = companyId ? aq.eq('company_id', companyId) : aq.is('company_id', null)
    const { data: assignment } = await aq.maybeSingle()
    if (assignment?.template_id) {
      const { data: tpl } = await supabase.from('document_templates').select('schema')
        .eq('id', assignment.template_id).eq('user_id', user.id).maybeSingle()
      schema = (tpl?.schema as DocumentSchema | null) ?? null
    }
  }
  if (!schema) schema = salarySlipPreset('classic', normalizeAccent(company?.invoice_accent ?? undefined))

  return <SalarySlipPrintView schema={schema} data={sdata} />
}
