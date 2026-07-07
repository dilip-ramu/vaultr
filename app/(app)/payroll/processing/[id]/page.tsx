export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import MonthDetailClient from '@/components/payroll/processing/MonthDetailClient'
import type { PayrollMonth, PayrollEntry } from '@/lib/payroll/types'

type PageProps = { params: Promise<{ id: string }> }

export default async function MonthDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: month },
    { data: entries },
    { data: accounts },
    { data: settings },
    { data: customers },
  ] = await Promise.all([
    supabase.from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('payroll_entries')
      .select('*, employee:employees(*)')
      .eq('payroll_month_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase.from('account_balances')
      .select('id, name, type, color, avatar_url, custom_type_id, custom_type_name, custom_type_color, custom_type_icon')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    supabase.from('recoverable_invoice_settings')
      .select('company_name, company_address')
      .eq('user_id', user.id)
      .maybeSingle(),
    // Needed for the Works-for filter chips at the top of the entries table.
    supabase.from('customers').select('id, name').eq('user_id', user.id).order('name'),
  ])

  if (!month) notFound()

  // v69 — per-company look so each employee's slip uses their employer's
  // template/accent/name/address (employees.company_id).
  const { data: companyRows } = await supabase
    .from('companies')
    .select('id, name, address, invoice_template, invoice_accent')
    .eq('user_id', user.id)
  const companiesById: Record<string, { name: string | null; address: string | null; invoice_template: string | null; invoice_accent: string | null }> = {}
  for (const c of companyRows ?? []) {
    companiesById[c.id as string] = {
      name: (c.name as string | null) ?? null,
      address: (c.address as string | null) ?? null,
      invoice_template: (c.invoice_template as string | null) ?? null,
      invoice_accent: (c.invoice_accent as string | null) ?? null,
    }
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <MonthDetailClient
        month={month as PayrollMonth}
        entries={(entries ?? []) as PayrollEntry[]}
        accounts={accounts ?? []}
        companyName={settings?.company_name ?? null}
        companyAddress={settings?.company_address ?? null}
        companiesById={companiesById}
        customers={customers ?? []}
      />
    </div>
  )
}
