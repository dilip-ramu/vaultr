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
  ] = await Promise.all([
    supabase.from('payroll_months').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('payroll_entries')
      .select('*, employee:employees(*)')
      .eq('payroll_month_id', id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true }),
    supabase.from('accounts')
      .select('id, name, type')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    supabase.from('recoverable_invoice_settings')
      .select('company_name, company_address')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (!month) notFound()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <MonthDetailClient
        month={month as PayrollMonth}
        entries={(entries ?? []) as PayrollEntry[]}
        accounts={accounts ?? []}
        companyName={settings?.company_name ?? null}
        companyAddress={settings?.company_address ?? null}
      />
    </div>
  )
}
