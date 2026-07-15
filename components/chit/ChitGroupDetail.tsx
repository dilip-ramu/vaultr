'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, X, Check, Gavel, Wallet, Trash2 } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { inr } from '@/lib/assets/valuation'
import {
  monthlyInstallment, numberOfMonths, runAuction, type GroupParams,
} from '@/lib/chit/auction'
import type { ChitGroup, ChitGroupMember, ChitAuction, ChitCollection, ChitMember } from '@/lib/chit/types'

type Tab = 'members' | 'auctions' | 'collections' | 'receivables'
type Account = { id: string; name: string; type: string; company_id: string | null }
type Coll = ChitCollection & { member?: { name: string } }

export default function ChitGroupDetail({
  group, groupMembers, allMembers, auctions: initialAuctions, collections: initialCollections, accounts,
}: {
  group: ChitGroup
  groupMembers: ChitGroupMember[]
  allMembers: ChitMember[]
  auctions: ChitAuction[]
  collections: Coll[]
  accounts: Account[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('members')
  const [members, setMembers] = useState(groupMembers)
  const [auctions, setAuctions] = useState(initialAuctions)
  const [collections, setCollections] = useState(initialCollections)

  const params: GroupParams = {
    chitValue: Number(group.chit_value), members: group.members,
    commissionPct: Number(group.commission_pct), bidCeilingPct: Number(group.bid_ceiling_pct),
    model: group.commission_model,
  }
  const installment = monthlyInstallment(params)
  const months = numberOfMonths(params)

  // The company's own bank account is the sensible default for collections. Prefer
  // a real bank account (checking/savings) tagged to the group's company; fall
  // back to any of its accounts, then to the first available.
  const defaultAccountId =
    accounts.find(a => a.company_id === group.company_id && (a.type === 'checking' || a.type === 'savings'))?.id
    ?? accounts.find(a => a.company_id === group.company_id)?.id
    ?? accounts[0]?.id ?? ''

  const TABS: [Tab, string][] = [
    ['members', `Members · ${members.length}`],
    ['auctions', `Auctions · ${auctions.length}`],
    ['collections', `Collections · ${collections.length}`],
    ['receivables', 'Receivables'],
  ]

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <Link href="/chit/groups" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        <ChevronLeft className="w-4 h-4" /> Groups
      </Link>

      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, var(--brand-deep, var(--brand)) 0%, var(--brand-dark, var(--brand)) 100%)' }}>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.7)' }}>Chit group</p>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">{group.name}</h1>
        <p className="text-[12.5px] mt-1" style={{ color: 'rgba(255,255,255,.85)' }}>
          {inr(group.chit_value)} pot · {group.members} members · installment {inr(installment)} · {months} months ·
          {group.commission_model === 'UPFRONT' ? ' upfront commission' : ` ${group.commission_pct}% monthly`}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className="px-3.5 py-2.5 text-[13px] font-bold whitespace-nowrap"
            style={{ color: tab === k ? 'var(--brand)' : 'var(--text-muted)', borderBottom: tab === k ? '2px solid var(--brand)' : '2px solid transparent' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        <MembersTab group={group} members={members} allMembers={allMembers}
          onChange={setMembers} onRefresh={() => router.refresh()} />
      )}
      {tab === 'auctions' && (
        <AuctionsTab group={group} params={params} months={months} members={members}
          accounts={accounts} auctions={auctions} onChange={setAuctions} />
      )}
      {tab === 'collections' && (
        <CollectionsTab group={group} installment={installment} months={months}
          members={members} accounts={accounts} defaultAccountId={defaultAccountId}
          collections={collections} onChange={setCollections} />
      )}
      {tab === 'receivables' && (
        <ReceivablesTab installment={installment} months={months} members={members} collections={collections} />
      )}
    </div>
  )
}

// ── Members ──────────────────────────────────────────────────────────────────
function MembersTab({ group, members, allMembers, onChange, onRefresh }: {
  group: ChitGroup
  members: ChitGroupMember[]
  allMembers: ChitMember[]
  onChange: (m: ChitGroupMember[]) => void
  onRefresh: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const inGroup = new Set(members.map(m => m.member_id))
  const room = group.members - members.length

  const available = allMembers.filter(m => !inGroup.has(m.id))

  async function add() {
    if (selected.size === 0) return
    const res = await fetch('/api/chit/group-members', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group_id: group.id, member_ids: [...selected] }),
    })
    const json = await res.json()
    if (!res.ok) { notify(json.error ?? 'Failed', 'error'); return }
    notify(`Added ${json.added}${json.skipped ? `, ${json.skipped} skipped` : ''}`, 'success')
    setPicking(false); setSelected(new Set()); onRefresh()
  }

  async function remove(id: string) {
    if (!(await confirmDialog('Remove from this group?'))) return
    const res = await fetch(`/api/chit/group-members?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Failed', 'error'); return }
    onChange(members.filter(m => m.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{members.length} of {group.members} seats filled</p>
        {room > 0 && (
          <button onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl text-white" style={{ background: 'var(--brand)' }}>
            <Plus className="w-4 h-4" /> Add members
          </button>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {members.length === 0 && <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>No members assigned yet.</p>}
        {members.map((gm, i) => (
          <div key={gm.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{gm.slot_number ?? '·'}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{gm.member?.name ?? 'Member'}</p>
              {gm.member?.phone && <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{gm.member.phone}</p>}
            </div>
            <button onClick={() => remove(gm.id)} className="p-1" style={{ color: 'var(--expense)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {picking && (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setPicking(false)} />
          <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[85vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Add members</p>
              <button onClick={() => setPicking(false)} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[12px] mb-3" style={{ color: 'var(--text-faint)' }}>{room} seat{room === 1 ? '' : 's'} left. Selected: {selected.size}</p>
            <div className="space-y-1">
              {available.length === 0 && <p className="text-sm py-4 text-center" style={{ color: 'var(--text-faint)' }}>Everyone is already in a group. Add more on the Members page.</p>}
              {available.map(m => {
                const on = selected.has(m.id)
                return (
                  <button key={m.id} onClick={() => setSelected(s => { const n = new Set(s); on ? n.delete(m.id) : n.add(m.id); return n })}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                    style={{ background: on ? 'var(--brand-light)' : 'var(--surface-2)' }}>
                    <span className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: on ? 'var(--brand)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border)' }}>
                      {on && <Check className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{m.name}</span>
                  </button>
                )
              })}
            </div>
            <button onClick={add} disabled={selected.size === 0}
              className="w-full text-white text-sm font-bold py-2.5 rounded-xl mt-4 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
              Add {selected.size || ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Auctions ─────────────────────────────────────────────────────────────────
function AuctionsTab({ group, params, months, members, accounts, auctions, onChange }: {
  group: ChitGroup
  params: GroupParams
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  auctions: ChitAuction[]
  onChange: (a: ChitAuction[]) => void
}) {
  const done = new Set(auctions.map(a => a.month_number))
  const nextMonth = useMemo(() => { for (let m = 1; m <= months; m++) if (!done.has(m)) return m; return null }, [done, months])
  const [conducting, setConducting] = useState(false)
  const [payFor, setPayFor] = useState<ChitAuction | null>(null)

  return (
    <div className="space-y-3">
      {nextMonth && (
        <button onClick={() => setConducting(true)}
          className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl" style={{ background: 'var(--brand)' }}>
          <Gavel className="w-4 h-4" /> Conduct auction — month {nextMonth}
        </button>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {auctions.length === 0 && <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>No auctions held yet.</p>}
        {auctions.map((a, i) => {
          const winner = members.find(m => m.member_id === a.winner_member_id)?.member?.name
          return (
            <div key={a.id} className="px-4 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Month {a.month_number} · {winner ?? (a.net_payout === 0 ? 'Foreman' : 'Winner')}</p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    bid {inr(a.bid_amount)} · commission {inr(a.commission)} · dividend {inr(a.dividend_per_member)}/member
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{inr(a.net_payout)}</p>
                  {a.payout_transaction_id
                    ? <span className="text-[11px] font-bold" style={{ color: 'var(--income)' }}>Paid</span>
                    : a.net_payout > 0
                      ? <button onClick={() => setPayFor(a)} className="text-[11px] font-bold" style={{ color: 'var(--brand)' }}>Mark paid</button>
                      : <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>—</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {conducting && nextMonth && (
        <ConductModal group={group} params={params} monthNumber={nextMonth} members={members}
          onClose={() => setConducting(false)}
          onDone={a => { onChange([...auctions.filter(x => x.month_number !== a.month_number), a].sort((x, y) => x.month_number - y.month_number)); setConducting(false) }} />
      )}

      {payFor && (
        <PayModal auction={payFor} accounts={accounts}
          onClose={() => setPayFor(null)}
          onDone={() => { onChange(auctions.map(x => x.id === payFor.id ? { ...x, payout_transaction_id: 'posted', paid_at: new Date().toISOString() } : x)); setPayFor(null) }} />
      )}
    </div>
  )
}

function ConductModal({ group, params, monthNumber, members, onClose, onDone }: {
  group: ChitGroup
  params: GroupParams
  monthNumber: number
  members: ChitGroupMember[]
  onClose: () => void
  onDone: (a: ChitAuction) => void
}) {
  const isForemanMonth = group.commission_model === 'UPFRONT' && monthNumber === 1
  const [bid, setBid] = useState('')
  const [winner, setWinner] = useState('')
  const [busy, setBusy] = useState(false)

  const preview = runAuction({ group: params, monthNumber, bidAmount: parseFloat(bid) || 0 })
  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  async function save() {
    if (!isForemanMonth && !winner) { notify('Pick the winner', 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/chit/auctions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id, month_number: monthNumber, bid_amount: parseFloat(bid) || 0, winner_member_id: winner || null }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Failed', 'error'); return }
      onDone(json.auction)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Auction — month {monthNumber}</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        {isForemanMonth ? (
          <p className="text-[13px] mb-4 rounded-xl px-3.5 py-3" style={{ background: 'var(--brand-light)', color: 'var(--text-muted)' }}>
            Upfront model: this month the company takes the entire {inr(group.chit_value)} pot as its commission. No member is paid, no bid needed.
          </p>
        ) : (
          <div className="space-y-2.5 mb-3">
            <div>
              <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Winning bid (₹ discount)</label>
              <input className={fld} style={fs} inputMode="decimal" value={bid} onChange={e => setBid(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="15000" />
              {preview.cappedFrom && <p className="text-[11px] mt-1" style={{ color: '#b7791f' }}>Capped from {inr(preview.cappedFrom)} to the ceiling {inr(preview.discount)}.</p>}
            </div>
            <div>
              <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Winner</label>
              <select className={fld} style={fs} value={winner} onChange={e => setWinner(e.target.value)}>
                <option value="">Choose…</option>
                {members.map(m => <option key={m.member_id} value={m.member_id}>{m.member?.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="rounded-xl px-3.5 py-3 text-[12.5px] space-y-1 mb-4" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          <div className="flex justify-between"><span>Winner receives</span><b style={{ color: 'var(--text)' }}>{inr(preview.netPayout)}</b></div>
          <div className="flex justify-between"><span>Commission</span><b style={{ color: 'var(--text)' }}>{inr(preview.commission)}</b></div>
          <div className="flex justify-between"><span>Dividend / member</span><b style={{ color: 'var(--text)' }}>{inr(preview.dividendPerMember)}</b></div>
          <div className="flex justify-between"><span>Member pays this month</span><b style={{ color: 'var(--text)' }}>{inr(preview.netInstallment)}</b></div>
        </div>

        <button onClick={save} disabled={busy}
          className="w-full text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-60" style={{ background: 'var(--brand)' }}>
          {busy ? 'Recording…' : 'Record auction'}
        </button>
      </div>
    </div>
  )
}

function PayModal({ auction, accounts, onClose, onDone }: {
  auction: ChitAuction
  accounts: Account[]
  onClose: () => void
  onDone: () => void
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  async function pay() {
    if (!accountId) { notify('Choose the account', 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/chit/auctions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: auction.id, account_id: accountId }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Failed', 'error'); return }
      notify(`Paid ${inr(auction.net_payout)} — posted to your books`, 'success')
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up" style={{ background: 'var(--surface)' }}>
        <p className="text-base font-extrabold mb-1" style={{ color: 'var(--text)' }}>Pay the winner {inr(auction.net_payout)}</p>
        <p className="text-[12px] mb-4" style={{ color: 'var(--text-faint)' }}>Posts an expense from the chosen account — real money out.</p>
        <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>From account</label>
        <select className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button onClick={pay} disabled={busy}
          className="w-full text-white text-sm font-bold py-2.5 rounded-xl mt-4 disabled:opacity-60" style={{ background: 'var(--brand)' }}>
          {busy ? 'Posting…' : 'Pay & record'}
        </button>
      </div>
    </div>
  )
}

// ── Collections ──────────────────────────────────────────────────────────────
// Two ways to look at the same money: a MONTH view (one month, all members — the
// natural place to collect a batch) and a MEMBER view (one member, all their
// months — the natural place to answer "is so-and-so paid up?").
function CollectionsTab({ group, installment, months, members, accounts, defaultAccountId, collections, onChange }: {
  group: ChitGroup
  installment: number
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  defaultAccountId: string
  collections: Coll[]
  onChange: (c: Coll[]) => void
}) {
  const [view, setView] = useState<'month' | 'member'>('month')

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-xl p-0.5" style={{ background: 'var(--surface-2)' }}>
        {(['month', 'member'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="px-4 py-1.5 rounded-lg text-[12.5px] font-bold capitalize"
            style={{ background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? 'var(--brand)' : 'var(--text-muted)', boxShadow: view === v ? 'var(--shadow-sm)' : undefined }}>
            {v} view
          </button>
        ))}
      </div>

      {view === 'month'
        ? <MonthView group={group} installment={installment} months={months} members={members}
            accounts={accounts} defaultAccountId={defaultAccountId} collections={collections} onChange={onChange} />
        : <MemberView group={group} installment={installment} months={months} members={members}
            accounts={accounts} defaultAccountId={defaultAccountId} collections={collections} onChange={onChange} />}
    </div>
  )
}

// ── Month view: one month, collect many at once ──────────────────────────────
function MonthView({ group, installment, months, members, accounts, defaultAccountId, collections, onChange }: {
  group: ChitGroup
  installment: number
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  defaultAccountId: string
  collections: Coll[]
  onChange: (c: Coll[]) => void
}) {
  // Land on the first month that still has someone unpaid.
  const firstOpen = useMemo(() => {
    for (let m = 1; m <= months; m++) {
      const paid = new Set(collections.filter(c => c.month_number === m).map(c => c.member_id))
      if (members.some(gm => !paid.has(gm.member_id))) return m
    }
    return 1
  }, [months, members, collections])

  const [month, setMonth] = useState(firstOpen)
  const [account, setAccount] = useState(defaultAccountId || accounts[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [amount, setAmount] = useState(String(installment))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const paidThisMonth = new Set(collections.filter(c => c.month_number === month).map(c => c.member_id))
  const unpaid = members.filter(gm => !paidThisMonth.has(gm.member_id))

  // Selecting nobody means "all unpaid" — the common case is "everyone paid this
  // month", so default to that rather than making you tick 20 boxes.
  const effective = selected.size > 0 ? unpaid.filter(gm => selected.has(gm.member_id)) : unpaid

  async function collectSelected() {
    if (effective.length === 0) { notify('Nobody to collect from', 'error'); return }
    if (!account) { notify('Choose the account', 'error'); return }
    setBusy(true)
    try {
      const amt = parseFloat(amount) || 0
      const res = await fetch('/api/chit/collections/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: group.id, paid_date: date, account_id: account,
          entries: effective.map(gm => ({ member_id: gm.member_id, month_number: month, amount: amt })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Failed', 'error'); return }
      // Optimistically add the posted rows.
      const added: Coll[] = effective.map(gm => ({
        id: `tmp-${gm.member_id}-${month}`, group_id: group.id, member_id: gm.member_id,
        month_number: month, amount: amt, paid_date: date, account_id: account,
        income_transaction_id: 'posted', notes: null, created_at: new Date().toISOString(),
        member: { name: gm.member?.name ?? '' },
      } as Coll))
      onChange([...added, ...collections])
      setSelected(new Set())
      notify(`Collected ${json.done}${json.skipped ? `, ${json.skipped} already paid` : ''}${json.failed?.length ? `, ${json.failed.length} failed` : ''} — posted to your books`, json.failed?.length ? 'error' : 'success')
    } finally { setBusy(false) }
  }

  const fld = 'px-3 py-2 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="space-y-3">
      {/* The batch controls: month, account, date, amount — all prefilled. */}
      <div className="rounded-2xl p-3.5 space-y-2.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth(m => Math.max(1, m - 1))} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>‹</button>
          <div className="flex-1 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Month</p>
            <p className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>{month} <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>of {months}</span></p>
          </div>
          <button onClick={() => setMonth(m => Math.min(months, m + 1))} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>›</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold block mb-0.5" style={{ color: 'var(--text-faint)' }}>Amount each</label>
            <input className={`${fld} w-full`} style={fs} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          </div>
          <div>
            <label className="text-[10px] font-bold block mb-0.5" style={{ color: 'var(--text-faint)' }}>Date</label>
            <input className={`${fld} w-full`} style={fs} type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold block mb-0.5" style={{ color: 'var(--text-faint)' }}>Received into</label>
          <select className={`${fld} w-full`} style={fs} value={account} onChange={e => setAccount(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* The roster for this month. Unpaid rows are tickable; paid ones show it. */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {members.length === 0 && <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>Add members first.</p>}
        {members.map((gm, i) => {
          const isPaid = paidThisMonth.has(gm.member_id)
          const on = !isPaid && (selected.size === 0 || selected.has(gm.member_id))
          return (
            <button key={gm.id} disabled={isPaid}
              onClick={() => setSelected(s => {
                // First tick switches from "all" to an explicit set.
                const base = s.size === 0 ? new Set(unpaid.map(u => u.member_id)) : new Set(s)
                base.has(gm.member_id) ? base.delete(gm.member_id) : base.add(gm.member_id)
                return base
              })}
              className="w-full flex items-center gap-3 px-4 py-3 text-left disabled:opacity-100"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                style={{ background: isPaid ? 'var(--income)' : on ? 'var(--brand)' : 'transparent', border: isPaid || on ? 'none' : '1.5px solid var(--border)' }}>
                {(isPaid || on) && <Check className="w-3.5 h-3.5 text-white" />}
              </span>
              <span className="flex-1 text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{gm.member?.name}</span>
              {isPaid && <span className="text-[11px] font-bold" style={{ color: 'var(--income)' }}>Paid</span>}
            </button>
          )
        })}
      </div>

      {unpaid.length > 0 && (
        <button onClick={collectSelected} disabled={busy || effective.length === 0}
          className="w-full text-white text-sm font-bold py-3 rounded-xl disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {busy ? 'Posting…' : `Collect ${effective.length} · ${inr((parseFloat(amount) || 0) * effective.length)}`}
        </button>
      )}
    </div>
  )
}

// ── Member view: one member, all their months ────────────────────────────────
function MemberView({ group, installment, months, members, accounts, defaultAccountId, collections, onChange }: {
  group: ChitGroup
  installment: number
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  defaultAccountId: string
  collections: Coll[]
  onChange: (c: Coll[]) => void
}) {
  const [memberId, setMemberId] = useState(members[0]?.member_id ?? '')
  const [collectMonth, setCollectMonth] = useState<number | null>(null)
  const gm = members.find(m => m.member_id === memberId)
  const paid = new Map(collections.filter(c => c.member_id === memberId).map(c => [c.month_number, c]))

  return (
    <div className="space-y-3">
      <select className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
        value={memberId} onChange={e => setMemberId(e.target.value)}>
        {members.map(m => <option key={m.member_id} value={m.member_id}>{m.member?.name}</option>)}
      </select>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Array.from({ length: months }, (_, i) => i + 1).map(m => {
          const c = paid.get(m)
          return (
            <button key={m} disabled={!!c} onClick={() => setCollectMonth(m)}
              className="rounded-xl px-3 py-2.5 text-left disabled:opacity-100"
              style={{ border: '1px solid var(--border)', background: c ? 'var(--brand-light)' : 'var(--surface)' }}>
              <p className="text-[11px] font-bold" style={{ color: 'var(--text-faint)' }}>Month {m}</p>
              <p className="text-[13px] font-extrabold" style={{ color: c ? 'var(--income)' : 'var(--text-muted)' }}>
                {c ? inr(c.amount) : 'Due'}
              </p>
            </button>
          )
        })}
      </div>

      {collectMonth != null && gm && (
        <CollectModal group={group} installment={installment} months={months}
          memberId={memberId} memberName={gm.member?.name ?? ''} accounts={accounts}
          defaultAccountId={defaultAccountId} fixedMonth={collectMonth} existing={collections}
          onClose={() => setCollectMonth(null)}
          onDone={c => { onChange([c, ...collections]); setCollectMonth(null) }} />
      )}
    </div>
  )
}

// ── Single collection (used by the member view) ──────────────────────────────
function CollectModal({ group, installment, months, memberId, memberName, accounts, defaultAccountId, fixedMonth, existing, onClose, onDone }: {
  group: ChitGroup
  installment: number
  months: number
  memberId: string
  memberName: string
  accounts: Account[]
  defaultAccountId: string
  fixedMonth?: number
  existing: Coll[]
  onClose: () => void
  onDone: (c: Coll) => void
}) {
  const paidMonths = new Set(existing.filter(c => c.member_id === memberId).map(c => c.month_number))
  const firstUnpaid = useMemo(() => { for (let m = 1; m <= months; m++) if (!paidMonths.has(m)) return m; return 1 }, [paidMonths, months])
  const [month, setMonth] = useState(String(fixedMonth ?? firstUnpaid))
  const [amount, setAmount] = useState(String(installment))
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [busy, setBusy] = useState(false)

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  async function save() {
    if (!accountId) { notify('Choose the account that received it', 'error'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/chit/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id, member_id: memberId, month_number: parseInt(month) || 1, amount: parseFloat(amount) || 0, account_id: accountId, paid_date: date }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Failed', 'error'); return }
      notify(`Collected ${inr(parseFloat(amount) || 0)} — posted to your books`, 'success')
      onDone({ ...json.collection, member: { name: memberName } })
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up" style={{ background: 'var(--surface)' }}>
        <p className="text-base font-extrabold mb-1" style={{ color: 'var(--text)' }}>Collect from {memberName}</p>
        <p className="text-[12px] mb-4" style={{ color: 'var(--text-faint)' }}>Records the installment and posts it as income to the chosen account.</p>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Month</label>
              <select className={fld} style={fs} value={month} onChange={e => setMonth(e.target.value)} disabled={fixedMonth != null}>
                {Array.from({ length: months }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m} disabled={paidMonths.has(m)}>{m}{paidMonths.has(m) ? ' — paid' : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Amount</label>
              <input className={fld} style={fs} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Date</label>
            <input className={fld} style={fs} type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Received into</label>
            <select className={fld} style={fs} value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <button onClick={save} disabled={busy}
            className="w-full text-white text-sm font-bold py-2.5 rounded-xl mt-1 disabled:opacity-60" style={{ background: 'var(--brand)' }}>
            {busy ? 'Posting…' : 'Collect & record'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Receivables ──────────────────────────────────────────────────────────────
function ReceivablesTab({ installment, months, members, collections }: {
  installment: number
  months: number
  members: ChitGroupMember[]
  collections: Coll[]
}) {
  // Derived, not stored: for each member, which months are unpaid. Simple and
  // always in step with the collections above.
  const rows = members.map(gm => {
    const paid = new Set(collections.filter(c => c.member_id === gm.member_id).map(c => c.month_number))
    const unpaid = Array.from({ length: months }, (_, i) => i + 1).filter(m => !paid.has(m))
    return { name: gm.member?.name ?? 'Member', unpaid, due: unpaid.length * installment }
  }).filter(r => r.unpaid.length > 0)

  const total = rows.reduce((s, r) => s + r.due, 0)

  return (
    <div className="space-y-3">
      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Total outstanding</p>
        <p className="text-2xl font-extrabold" style={{ color: 'var(--expense)' }}>{inr(total)}</p>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--income)' }}>Everyone is paid up.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{r.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>months {r.unpaid.join(', ')}</p>
            </div>
            <p className="text-sm font-extrabold" style={{ color: 'var(--expense)' }}>{inr(r.due)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
