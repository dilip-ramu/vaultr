// The monthly statement partners get.
//
// Owner only. The document is meant to be SENT to partners, not browsed by
// them — a chit admin has no business reading the bank balance, and the page
// turns them away the same way the Admins page does.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveChitAccess } from '@/lib/chit/access'
import ChitStatementClient from '@/components/chit/ChitStatementClient'
import {
  buildStatement, monthPeriod, lastCompletedMonth, selectableMonths,
  type StatementTxn, type StatementCollection, type StatementAuction, type StatementGroup,
} from '@/lib/chit/statement'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit statement — Inex' }

/** The one account this statement is about. Named, not guessed. */
const CHIT_ACCOUNT_NAME = 'Unyra Capital'

export default async function ChitStatementPage({
  searchParams,
}: { searchParams: Promise<{ m?: string }> }) {
  const access = await resolveChitAccess()
  if (!access) redirect('/login')
  if (!access.isOwner) redirect('/chit')

  const supabase = await createClient()
  const uid = access.ownerId
  const today = new Date().toISOString().split('T')[0]

  const { m } = await searchParams
  const months = selectableMonths(today, 14)
  const period = m && /^\d{4}-\d{2}$/.test(m) ? monthPeriod(m) : lastCompletedMonth(today)

  // The account. Matched by name, case-insensitively, so renaming the case does
  // not silently produce an empty statement.
  const { data: accounts } = await supabase
    .from('account_balances')
    .select('id, name, balance, initial_balance, type, is_active')
    .eq('user_id', uid)

  const all = (accounts ?? []) as {
    id: string; name: string; balance: number | null
    initial_balance: number | null; type: string; is_active: boolean
  }[]
  const account = all.find(a => a.name.trim().toLowerCase() === CHIT_ACCOUNT_NAME.toLowerCase())

  if (!account) {
    return (
      <ChitStatementClient
        months={months} selectedKey={period.key} statement={null}
        missingAccount={CHIT_ACCOUNT_NAME}
        knownAccounts={all.map(a => a.name).sort()}
        businessName={CHIT_ACCOUNT_NAME}
      />
    )
  }

  // Everything that has ever touched the account. The opening balance is the
  // running total up to the period start, so the whole history is needed — a
  // statement built from a window would open at the wrong number.
  const txns: StatementTxn[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, date, name, account_id, to_account_id, category:categories(name)')
      .or(`account_id.eq.${account.id},to_account_id.eq.${account.id}`)
      .eq('user_id', uid)
      // NOT filtered to the period. buildStatement needs the whole history to
      // find the opening balance, AND it needs to see transactions dated after
      // the period to know whether comparing against the app's live balance
      // means anything. Filtering here would make every past month look wrong.
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const cat = r.category as { name: string } | { name: string }[] | null
      txns.push({
        id: r.id, type: r.type, amount: Number(r.amount), date: r.date, name: r.name,
        account_id: r.account_id, to_account_id: r.to_account_id,
        category_name: Array.isArray(cat) ? cat[0]?.name ?? null : cat?.name ?? null,
      })
    }
    if (data.length < 1000) break
  }

  const [{ data: groups }, { data: collections }, { data: auctions }, { data: members }, { data: roster }] =
    await Promise.all([
      supabase.from('chit_groups').select('id, name, chit_value, members, status').eq('user_id', uid).order('name'),
      supabase.from('chit_collections')
        .select('group_id, member_id, month_number, amount, paid_date, income_transaction_id')
        .eq('user_id', uid),
      supabase.from('chit_auctions')
        .select('group_id, month_number, auction_date, winner_member_id, bid_amount, commission, net_payout, dividend_per_member, payout_transaction_id')
        .eq('user_id', uid),
      supabase.from('chit_members').select('id, name, member_code').eq('user_id', uid),
      supabase.from('chit_group_members').select('group_id, member_id').eq('user_id', uid),
    ])

  const memberNames: Record<string, { name: string; code: string | null }> = {}
  for (const r of (members ?? []) as { id: string; name: string; member_code: string | null }[]) {
    memberNames[r.id] = { name: r.name, code: r.member_code ?? null }
  }
  const rosterByGroup: Record<string, string[]> = {}
  for (const r of (roster ?? []) as { group_id: string; member_id: string }[]) {
    (rosterByGroup[r.group_id] ??= []).push(r.member_id)
  }

  const statement = buildStatement({
    accountId: account.id,
    accountName: account.name,
    initialBalance: Number(account.initial_balance ?? 0),
    recordedBalance: account.balance != null ? Number(account.balance) : null,
    periodStart: period.start,
    periodEnd: period.end,
    txns,
    collections: (collections ?? []) as StatementCollection[],
    auctions: (auctions ?? []) as StatementAuction[],
    groups: (groups ?? []) as StatementGroup[],
    memberNames,
    rosterByGroup,
  })

  return (
    <ChitStatementClient
      months={months} selectedKey={period.key} statement={statement}
      businessName={account.name}
    />
  )
}
