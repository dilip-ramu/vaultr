import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Coins, Users, Layers, ChevronRight, AlertTriangle } from 'lucide-react'
import { inr } from '@/lib/assets/valuation'
import { monthlyInstallment, numberOfMonths } from '@/lib/chit/auction'
import type { ChitGroup } from '@/lib/chit/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Chit funds — Vaultr' }

export default async function ChitDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const uid = user.id

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const [
    { data: groups },
    { count: memberCount },
    { data: gm },
    { data: monthCollections },
    { data: allCollections },
    { data: todayCollections },
    { data: allAuctions },
  ] = await Promise.all([
    supabase.from('chit_groups').select('*').eq('user_id', uid),
    supabase.from('chit_members').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('chit_group_members').select('group_id, member_id').eq('user_id', uid),
    supabase.from('chit_collections').select('amount').eq('user_id', uid).gte('paid_date', monthStart),
    supabase.from('chit_collections').select('group_id, member_id, month_number').eq('user_id', uid),
    supabase.from('chit_collections').select('amount').eq('user_id', uid).eq('paid_date', today),
    // Which months have actually RUN. A month only becomes owed once its auction
    // is conducted — so outstanding is measured against these, not the full plan.
    supabase.from('chit_auctions').select('group_id, month_number, dividend_per_member').eq('user_id', uid),
  ])

  const groupList = (groups ?? []) as ChitGroup[]
  const active = groupList.filter(g => g.status === 'active').length
  const completed = groupList.filter(g => g.status === 'completed').length

  const sum = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const monthTotal = sum(monthCollections)
  const todayTotal = sum(todayCollections)

  // Outstanding, done properly: for each group, ONLY the months whose auction has
  // run are due. For each such month, each member who hasn't paid owes that
  // month's due (installment minus that month's dividend). Nothing before an
  // auction counts — a chit that hasn't started owes nothing.
  const membersByGroup: Record<string, string[]> = {}
  for (const row of (gm ?? []) as { group_id: string; member_id: string }[]) {
    (membersByGroup[row.group_id] ??= []).push(row.member_id)
  }
  const paidSlots = new Set(
    ((allCollections ?? []) as { group_id: string; member_id: string; month_number: number }[])
      .map(c => `${c.group_id}:${c.member_id}:${c.month_number}`),
  )
  const auctionsByGroup: Record<string, { month: number; dividend: number }[]> = {}
  for (const a of (allAuctions ?? []) as { group_id: string; month_number: number; dividend_per_member: number }[]) {
    (auctionsByGroup[a.group_id] ??= []).push({ month: a.month_number, dividend: Number(a.dividend_per_member) || 0 })
  }

  let outstanding = 0
  for (const g of groupList) {
    if (g.status !== 'active') continue
    const inst = monthlyInstallment({ chitValue: g.chit_value, members: g.members })
    const memberIds = membersByGroup[g.id] ?? []
    for (const { month, dividend } of auctionsByGroup[g.id] ?? []) {
      const due = Math.max(0, inst - dividend)
      for (const mid of memberIds) {
        if (!paidSlots.has(`${g.id}:${mid}:${month}`)) outstanding += due
      }
    }
  }
  outstanding = Math.round(outstanding * 100) / 100

  // Kept for the group list rows below (members tagged per group).
  const memberCountByGroup: Record<string, number> = {}
  for (const [gid, ids] of Object.entries(membersByGroup)) memberCountByGroup[gid] = ids.length

  const card = { border: '1px solid var(--border)', background: 'var(--surface)' }

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Coins className="w-6 h-6" style={{ color: 'var(--brand)' }} />
        <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Chit funds</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Collected today" value={inr(todayTotal)} />
        <Tile label="This month" value={inr(monthTotal)} />
        <Tile label="Outstanding" value={inr(outstanding)} tone="expense" />
        <Tile label="Active groups" value={`${active}${completed ? ` · ${completed} done` : ''}`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Link href="/chit/groups" className="rounded-2xl p-5 flex items-center justify-between" style={card}>
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            <div>
              <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>Groups</p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{groupList.length} total</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
        </Link>
        <Link href="/chit/members" className="rounded-2xl p-5 flex items-center justify-between" style={card}>
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5" style={{ color: 'var(--brand)' }} />
            <div>
              <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>Members</p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{memberCount ?? 0} on the roster</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
        </Link>
      </div>

      {groupList.length > 0 && (
        <div>
          <p className="text-[11px] font-extrabold tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>YOUR GROUPS</p>
          <div className="rounded-2xl overflow-hidden" style={card}>
            {groupList.map((g, i) => (
              <Link key={g.id} href={`/chit/groups/${g.id}`} className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{g.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{inr(g.chit_value)} · {memberCountByGroup[g.id] ?? 0}/{g.members} members</p>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {groupList.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={card}>
          <AlertTriangle className="w-5 h-5 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>No chit groups yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Add members, then create a group to get started.</p>
          <Link href="/chit/groups" className="inline-block mt-3 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}>Create a group</Link>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'expense' }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p className="text-lg font-extrabold mt-0.5" style={{ color: tone === 'expense' ? 'var(--expense)' : 'var(--text)' }}>{value}</p>
    </div>
  )
}
