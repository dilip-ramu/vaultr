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

  return (
    <SlipPrintView
      data={sdata}
      logoUrl={logoUrl}
      signatureUrl={signatureUrl}
      accent={normalizeAccent(company?.invoice_accent ?? undefined)}
      filename={`Salary Slip — ${employee?.name ?? 'Employee'}.pdf`}
    />
  )
}
