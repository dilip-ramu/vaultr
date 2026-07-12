import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import CompanyViewClient from '@/components/companies/CompanyViewClient'
import { valueAsset, assetFx } from '@/lib/assets/valuation'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'
import type { SheetAccount, SheetAsset, SheetReceivable, SheetPayable } from '@/lib/companies/balanceSheet'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('companies').select('name').eq('id', id).maybeSingle()
  return { title: `${(data as { name?: string } | null)?.name ?? 'Company'} — Vaultr` }
}

/**
 * One company's position: what it owns, what it owes.
 *
 * Note it does NOT touch the main page's net worth — that still counts
 * everything you own, personal and business alike. Splitting those is a separate
 * decision and deliberately not taken here.
 */
export default async function CompanyViewPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const uid = user.id

  const { data: company } = await supabase
    .from('companies').select('id, name, gstin, invoice_accent')
    .eq('id', id).eq('user_id', uid).maybeSingle()
  if (!company) notFound()

  const [
    { data: companies },
    { data: accountRows },
    { data: balanceRows },
    { data: assetRows },
    { data: rates },
    { data: defaults },
    { data: invoiceRows },
    { data: billRows },
    { data: employeeRows },
    { data: mirrorRows },
  ] = await Promise.all([
    supabase.from('companies').select('id, name').eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    // company_id lives on `accounts`; the live balance lives on the view — join by id.
    supabase.from('accounts').select('id, name, type, company_id, is_active').eq('user_id', uid).eq('is_active', true),
    supabase.from('account_balances').select('id, balance').eq('user_id', uid),
    supabase.from('assets').select('*').eq('user_id', uid),
    supabase.from('market_rates').select('*').order('rate_date', { ascending: false }).limit(120),
    supabase.from('asset_rate_defaults').select('*').eq('user_id', uid),
    supabase.from('recoverable_invoices')
      .select('id, invoice_number, customer_name, customer_id, company_id, balance_due, due_date, status')
      .eq('user_id', uid).neq('status', 'cancelled'),
    supabase.from('supplier_invoices')
      .select('id, invoice_number, company_id, amount, due_date, is_paid, status, supplier:suppliers(name)')
      .eq('user_id', uid).eq('is_paid', false),
    supabase.from('employees').select('id, company_id, is_active').eq('user_id', uid).eq('is_active', true),
    // A customer can BE one of your own companies (migration v67 mirrors it into
    // the customers table). That's how cross-company billing works, and it's the
    // only way to know that an invoice A→B is a debt for B.
    supabase.from('customers').select('id, mirrored_company_id').eq('user_id', uid)
      .not('mirrored_company_id', 'is', null),
  ])

  const balanceById = new Map(
    ((balanceRows ?? []) as { id: string; balance: number }[]).map(b => [b.id, Number(b.balance) || 0]),
  )

  const accounts: SheetAccount[] = ((accountRows ?? []) as Record<string, unknown>[]).map(a => ({
    id: a.id as string,
    name: a.name as string,
    type: a.type as string,
    companyId: (a.company_id as string | null) ?? null,
    balance: balanceById.get(a.id as string) ?? 0,
  }))

  const marketRates = (rates ?? []) as MarketRate[]
  const rateDefaults = (defaults ?? []) as AssetRateDefault[]

  const assets: SheetAsset[] = ((assetRows ?? []) as Asset[]).map(a => {
    const v = valueAsset(a, marketRates, rateDefaults, assetFx(a, {}))
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      companyId: (a as Asset & { company_id?: string | null }).company_id ?? null,
      // A sold asset's value is whatever actually came in; a held one is worth
      // today's valuation.
      value: a.status === 'sold' ? (a.sale_net ?? a.sold_price ?? 0) : v.current,
      status: a.status,
    }
  })

  const receivables: SheetReceivable[] = ((invoiceRows ?? []) as Record<string, unknown>[]).map(i => ({
    id: i.id as string,
    number: String(i.invoice_number ?? ''),
    party: String(i.customer_name ?? ''),
    companyId: (i.company_id as string | null) ?? null,
    outstanding: Number(i.balance_due) || 0,
    dueDate: (i.due_date as string | null) ?? null,
  }))

  // Which of my customers are actually my own companies.
  const mirrorOf = new Map(
    ((mirrorRows ?? []) as { id: string; mirrored_company_id: string }[])
      .map(m => [m.id, m.mirrored_company_id]),
  )
  const companyName = new Map(
    ((companies ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]),
  )

  const payables: SheetPayable[] = ((billRows ?? []) as Record<string, unknown>[]).map(b => {
    const sup = b.supplier as { name?: string } | null
    return {
      id: b.id as string,
      number: String(b.invoice_number ?? '—'),
      party: String(sup?.name ?? 'Supplier'),
      companyId: (b.company_id as string | null) ?? null,
      outstanding: Number(b.amount) || 0,
      dueDate: (b.due_date as string | null) ?? null,
    }
  })

  // ── The other side of an inter-company invoice ──────────────────────────────
  // When company A bills company B, that is ONE event with TWO sides: a
  // receivable for A and a payable for B. Only the receivable was ever recorded,
  // so B looked like it owed nothing and the group's books didn't balance.
  // The customer on the invoice carries mirrored_company_id when it IS one of
  // your companies — that's what lets us book the matching debt.
  for (const i of (invoiceRows ?? []) as Record<string, unknown>[]) {
    const buyerCompanyId = mirrorOf.get(String(i.customer_id ?? ''))
    const sellerCompanyId = (i.company_id as string | null) ?? null
    const outstanding = Number(i.balance_due) || 0

    // Not inter-company, nothing owed, or a company somehow billing itself.
    if (!buyerCompanyId || outstanding <= 0 || buyerCompanyId === sellerCompanyId) continue

    payables.push({
      id: `ic-${i.id as string}`,
      number: String(i.invoice_number ?? ''),
      party: sellerCompanyId ? (companyName.get(sellerCompanyId) ?? 'Own company') : 'Own company',
      companyId: buyerCompanyId,
      outstanding,
      dueDate: (i.due_date as string | null) ?? null,
      interCompany: true,
    })
  }

  const employeeCount = ((employeeRows ?? []) as { company_id: string | null }[])
    .filter(e => e.company_id === id).length

  return (
    <CompanyViewClient
      company={{
        id: company.id as string,
        name: company.name as string,
        gstin: (company.gstin as string | null) ?? null,
        accent: (company.invoice_accent as string | null) ?? null,
      }}
      companies={((companies ?? []) as { id: string; name: string }[])}
      data={{ accounts, assets, receivables, payables }}
      employeeCount={employeeCount}
    />
  )
}
