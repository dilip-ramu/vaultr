// Everything the net worth needs, fetched once, in one place.
//
// The dashboard and the company page MUST agree. If each assembled its own rows,
// they would drift the first time one of them learned about a new kind of asset
// and the other didn't — and you'd have two screens confidently showing two
// different net worths with no way to tell which was lying. So there is one
// gatherer, and both call it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { valueAsset, assetFx } from '@/lib/assets/valuation'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'
import type { SheetAccount, SheetAsset, SheetReceivable, SheetPayable } from '@/lib/companies/balanceSheet'
import type { NetWorthCompany, OwnerLoanRow, Exclusion } from '@/lib/networth'
import { rateMap, toBase, BASE_CURRENCY } from '@/lib/fx'

export interface NetWorthData {
  accounts: SheetAccount[]
  assets: SheetAsset[]
  receivables: SheetReceivable[]
  payables: SheetPayable[]
  companies: NetWorthCompany[]
  loans: OwnerLoanRow[]
  excluded: Exclusion[]
  caveats: Exclusion[]
}

export async function fetchNetWorthData(supabase: SupabaseClient, uid: string): Promise<NetWorthData> {
  const [
    { data: companyRows },
    { data: accountRows },
    { data: balanceRows },
    { data: assetRows },
    { data: rates },
    { data: defaults },
    { data: currencyRows },
    { data: invoiceRows },
    { data: billRows },
    { data: mirrorRows },
    { data: loanRows },
  ] = await Promise.all([
    supabase.from('companies').select('id, name, invoice_accent, ownership_pct')
      .eq('user_id', uid).order('is_default', { ascending: false }).order('name'),
    supabase.from('accounts').select('id, name, type, company_id, currency, include_in_net_worth, is_active')
      .eq('user_id', uid).eq('is_active', true),
    supabase.from('account_balances').select('id, balance').eq('user_id', uid),
    supabase.from('assets').select('*').eq('user_id', uid),
    supabase.from('market_rates').select('*').order('rate_date', { ascending: false }).limit(120),
    supabase.from('asset_rate_defaults').select('*').eq('user_id', uid),
    supabase.from('currency_rates').select('currency, market_rate, custom_rate').eq('user_id', uid),
    supabase.from('recoverable_invoices')
      .select('id, invoice_number, customer_name, customer_id, company_id, balance_due, due_date, status')
      .eq('user_id', uid).neq('status', 'cancelled'),
    supabase.from('supplier_invoices')
      .select('id, invoice_number, company_id, amount, due_date, is_paid, supplier:suppliers(name)')
      .eq('user_id', uid).eq('is_paid', false),
    supabase.from('customers').select('id, mirrored_company_id').eq('user_id', uid)
      .not('mirrored_company_id', 'is', null),
    supabase.from('owner_loans').select('company_id, direction, amount').eq('user_id', uid),
  ])

  const excluded: Exclusion[] = []
  const caveats: Exclusion[] = []

  // ── Currency rates, ₹ per unit ─────────────────────────────────────────────
  const currencyRates: Record<string, number> = {}
  for (const c of (currencyRows ?? []) as { currency: string; market_rate: number | null; custom_rate: number | null }[]) {
    const r = Number(c.custom_rate ?? c.market_rate)
    if (Number.isFinite(r) && r > 0) currencyRates[c.currency.toUpperCase()] = r
  }
  const fxRates = rateMap(
    Object.entries(currencyRates).map(([currency, rate]) => ({ currency, market_rate: rate })),
  )

  // ── Accounts ───────────────────────────────────────────────────────────────
  const balanceById = new Map(
    ((balanceRows ?? []) as { id: string; balance: number }[]).map(b => [b.id, Number(b.balance) || 0]),
  )

  const accounts: SheetAccount[] = []
  for (const a of (accountRows ?? []) as Record<string, unknown>[]) {
    // The user's own switch. An account excluded from net worth stays excluded.
    if ((a.include_in_net_worth as boolean | null) === false) continue

    const native = balanceById.get(a.id as string) ?? 0
    const ccy = ((a.currency as string | null) ?? BASE_CURRENCY).toUpperCase()
    const base = ccy === BASE_CURRENCY ? native : toBase(native, ccy, fxRates)

    // No rate means we do NOT know what this is worth in rupees. Counting it as
    // zero would silently delete the money; counting it at face value would add
    // dollars to rupees. So: leave it out, and say which one and why.
    if (base === null) {
      excluded.push({
        what: `${native.toLocaleString('en-IN')} ${ccy} in ${a.name as string}`,
        why: `no ${ccy} rate — set one in Settings → Currencies`,
      })
      continue
    }

    accounts.push({
      id: a.id as string,
      name: a.name as string,
      type: a.type as string,
      companyId: (a.company_id as string | null) ?? null,
      balance: base,
    })
  }

  // ── Assets ─────────────────────────────────────────────────────────────────
  const marketRates = (rates ?? []) as MarketRate[]
  const rateDefaults = (defaults ?? []) as AssetRateDefault[]

  const assets: SheetAsset[] = ((assetRows ?? []) as Asset[]).map(a => {
    const v = valueAsset(a, marketRates, rateDefaults, assetFx(a, currencyRates), currencyRates)

    // valueAsset falls back to COST when it can't price something, and says so in
    // the note. That's the right call for the total (cost is a real number) but
    // it must not pass silently — it isn't today's value.
    if (v.currentNote && /no .*rate set|no price fetched|stale/i.test(v.currentNote)) {
      caveats.push({ what: a.name, why: v.currentNote })
    }

    return {
      id: a.id,
      name: a.name,
      category: a.category,
      companyId: (a as Asset & { company_id?: string | null }).company_id ?? null,
      value: a.status === 'sold' ? (a.sale_net ?? a.sold_price ?? 0) : v.current,
      status: a.status,
    }
  })

  // ── Receivables ────────────────────────────────────────────────────────────
  const receivables: SheetReceivable[] = ((invoiceRows ?? []) as Record<string, unknown>[]).map(i => ({
    id: i.id as string,
    number: String(i.invoice_number ?? ''),
    party: String(i.customer_name ?? ''),
    companyId: (i.company_id as string | null) ?? null,
    outstanding: Number(i.balance_due) || 0,
    dueDate: (i.due_date as string | null) ?? null,
  }))

  // ── Payables, including the other side of inter-company invoices ───────────
  const mirrorOf = new Map(
    ((mirrorRows ?? []) as { id: string; mirrored_company_id: string }[])
      .map(m => [m.id, m.mirrored_company_id]),
  )
  const companyName = new Map(
    ((companyRows ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]),
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

  // One event, two sides. A bills B: a receivable for A and a payable for B.
  // Booking only the receivable is how invoicing yourself starts looking like
  // making money.
  for (const i of (invoiceRows ?? []) as Record<string, unknown>[]) {
    const buyerCompanyId = mirrorOf.get(String(i.customer_id ?? ''))
    const sellerCompanyId = (i.company_id as string | null) ?? null
    const outstanding = Number(i.balance_due) || 0
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

  // ── Companies and your stake in each ───────────────────────────────────────
  const companies: NetWorthCompany[] = ((companyRows ?? []) as Record<string, unknown>[]).map(c => ({
    id: c.id as string,
    name: c.name as string,
    color: (c.invoice_accent as string | null) ?? null,
    // A company that predates the stake column is 100% yours — which is what it
    // has effectively been all along. The default cannot move any existing number.
    ownershipPct: c.ownership_pct == null ? 100 : Number(c.ownership_pct),
  }))

  const loans: OwnerLoanRow[] = ((loanRows ?? []) as Record<string, unknown>[]).map(l => ({
    companyId: l.company_id as string,
    direction: l.direction as OwnerLoanRow['direction'],
    amount: Number(l.amount) || 0,
  }))

  return { accounts, assets, receivables, payables, companies, loans, excluded, caveats }
}
