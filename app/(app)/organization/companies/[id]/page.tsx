import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import CompanyViewClient from '@/components/companies/CompanyViewClient'
import { fetchNetWorthData } from '@/lib/networth-server'
import { computeNetWorth } from '@/lib/networth'
import type { OwnerLoanEntry } from '@/components/companies/OwnerLoansPanel'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('companies').select('name').eq('id', id).maybeSingle()
  return { title: `${(data as { name?: string } | null)?.name ?? 'Company'} — Vaultr` }
}

/**
 * One company's position: what it owns, what it owes, and how much of that is
 * YOURS.
 *
 * The rows come from the same gatherer the dashboard uses (lib/networth-server),
 * so the two screens cannot disagree. If this page assembled its own, the first
 * time one of them learned about a new kind of asset and the other didn't, you'd
 * have two confident and different net worths and no way to tell which lied.
 */
export default async function CompanyViewPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const uid = user.id

  const [
    { data: company },
    { data: employeeRows },
    { data: loanRows },
    netWorthData,
  ] = await Promise.all([
    supabase.from('companies').select('id, name, gstin, invoice_accent, ownership_pct')
      .eq('id', id).eq('user_id', uid).maybeSingle(),
    supabase.from('employees').select('id, company_id, is_active').eq('user_id', uid).eq('is_active', true),
    supabase.from('owner_loans').select('id, company_id, direction, amount, date, note')
      .eq('user_id', uid).eq('company_id', id).order('date', { ascending: false }),
    fetchNetWorthData(supabase, uid),
  ])
  if (!company) notFound()

  const nw = computeNetWorth(netWorthData)
  const stake = nw.companies.find(c => c.company.id === id)

  const { accounts, assets, receivables, payables } = netWorthData

  const employeeCount = ((employeeRows ?? []) as { company_id: string | null }[])
    .filter(e => e.company_id === id).length

  // Bills and invoices that belong to NO company. A company page showing zero
  // payables while you're sitting on unpaid bills isn't merely unhelpful — it's
  // wrong. Name the number instead of hiding it.
  const untagged = {
    bills: payables.filter(p => !p.companyId && !p.interCompany).length,
    billsValue: payables.filter(p => !p.companyId && !p.interCompany).reduce((t, p) => t + p.outstanding, 0),
    invoices: receivables.filter(r => !r.companyId && r.outstanding > 0).length,
  }

  return (
    <CompanyViewClient
      company={{
        id: company.id as string,
        name: company.name as string,
        gstin: (company.gstin as string | null) ?? null,
        accent: (company.invoice_accent as string | null) ?? null,
        ownershipPct: company.ownership_pct == null ? 100 : Number(company.ownership_pct),
      }}
      companies={netWorthData.companies.map(c => ({ id: c.id, name: c.name }))}
      data={{ accounts, assets, receivables, payables }}
      employeeCount={employeeCount}
      untagged={untagged}
      loans={(loanRows ?? []) as unknown as OwnerLoanEntry[]}
      loanBalance={stake?.ownerLoan ?? 0}
      equity={stake?.equity ?? 0}
      yourShare={stake?.yourShare ?? 0}
    />
  )
}
