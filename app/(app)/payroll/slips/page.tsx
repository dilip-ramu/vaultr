export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SlipsClient from '@/components/payroll/slips/SlipsClient'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

export default async function SalarySlipsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all finalized months
  const { data: months } = await supabase
    .from('payroll_months')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_finalized', true)
    .order('payroll_month', { ascending: false })

  const monthMap: Record<string, PayrollMonth> = {}
  for (const m of months ?? []) monthMap[m.id] = m as PayrollMonth

  // Fetch all entries for finalized months
  const monthIds = Object.keys(monthMap)
  let allEntries: (PayrollEntry & { month: PayrollMonth; employee: Employee })[] = []

  if (monthIds.length > 0) {
    const { data: entries } = await supabase
      .from('payroll_entries')
      .select('*, employee:employees(*)')
      .in('payroll_month_id', monthIds)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    allEntries = (entries ?? []).map((e: PayrollEntry & { employee: Employee }) => ({
      ...e,
      month: monthMap[e.payroll_month_id],
      employee: e.employee!,
    }))

    // Sort by month (desc), then employee name
    allEntries.sort((a, b) => {
      const mCmp = b.month.payroll_month.localeCompare(a.month.payroll_month)
      if (mCmp !== 0) return mCmp
      return (a.employee?.name ?? '').localeCompare(b.employee?.name ?? '')
    })
  }

  // Company name from invoice settings (best-effort legacy fallback)
  const { data: settings } = await supabase
    .from('recoverable_invoice_settings')
    .select('company_name, company_address')
    .eq('user_id', user.id)
    .maybeSingle()

  // v69 — per-company look, keyed by company id, so each employee's slip uses
  // the company that employs them (employees.company_id).
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
      <SlipsClient
        entries={allEntries}
        companyName={settings?.company_name ?? null}
        companyAddress={settings?.company_address ?? null}
        companiesById={companiesById}
      />
    </div>
  )
}
