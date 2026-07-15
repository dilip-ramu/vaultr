'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronDown, ChevronRight, Plus, X, Check, Gavel, Wallet, Trash2, Pencil, Trophy } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { inr } from '@/lib/assets/valuation'
import {
  monthlyInstallment, numberOfMonths, runAuction, monthlyDue, type GroupParams,
} from '@/lib/chit/auction'
import type { ChitGroup, ChitGroupMember, ChitAuction, ChitCollection, ChitMember } from '@/lib/chit/types'
import { auctionNotice, auctionResult, winnerPayout, scheduledAuctionDate, niceDate, ordinal as ordinalWord } from '@/lib/chit/messages'
import NotifyModal, { toTarget, type NotifyTarget } from './NotifyModal'
import { Send } from 'lucide-react'

type Tab = 'members' | 'auctions' | 'collections' | 'receivables'
type Account = { id: string; name: string; type: string; company_id: string | null }
type Coll = ChitCollection & { member?: { name: string } }

export default function ChitGroupDetail({
  group: initialGroup, groupMembers, allMembers, auctions: initialAuctions, collections: initialCollections, accounts, companies,
}: {
  group: ChitGroup
  groupMembers: ChitGroupMember[]
  allMembers: ChitMember[]
  auctions: ChitAuction[]
  collections: Coll[]
  accounts: Account[]
  companies: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('members')
  const [group, setGroup] = useState(initialGroup)
  const [editingGroup, setEditingGroup] = useState(false)
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

  // What a member owes for a given month = installment MINUS that month's dividend
  // (everyone's share of the winner's discount). The dividend is stored on the
  // auction row, so a month with no auction yet simply owes the full installment.
  const dividendByMonth = useMemo(
    () => new Map(auctions.map(a => [a.month_number, Number(a.dividend_per_member) || 0])),
    [auctions],
  )
  const dueForMonth = (m: number) => monthlyDue(installment, dividendByMonth.get(m) ?? 0)
  const companyName = companies.find(c => c.id === group.company_id)?.name ?? 'the company'

  // Which member won each month — used to flag the winner in the collection views.
  const winnerByMonth = useMemo(
    () => new Map(auctions.filter(a => a.winner_member_id).map(a => [a.month_number, a.winner_member_id as string])),
    [auctions],
  )

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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.7)' }}>Chit group</p>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">{group.name}</h1>
          </div>
          <button onClick={() => setEditingGroup(true)}
            className="flex items-center gap-1.5 text-[12.5px] font-bold px-3 py-1.5 rounded-lg shrink-0"
            style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </div>
        <p className="text-[12.5px] mt-1" style={{ color: 'rgba(255,255,255,.85)' }}>
          {inr(group.chit_value)} pot · {group.members} members · installment {inr(installment)} · {months} months ·
          {group.commission_model === 'UPFRONT' ? ' upfront commission' : ` ${group.commission_pct}% monthly`}
        </p>
      </div>

      {editingGroup && (
        <GroupEditForm group={group} companies={companies}
          locked={auctions.length > 0 || collections.length > 0}
          onClose={() => setEditingGroup(false)}
          onSaved={g => { setGroup(g); setEditingGroup(false) }} />
      )}

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
          auctions={auctions} collections={collections} dueForMonth={dueForMonth}
          onChange={setMembers} onRefresh={() => router.refresh()} />
      )}
      {tab === 'auctions' && (
        <AuctionsTab group={group} params={params} months={months} members={members}
          accounts={accounts} defaultAccountId={defaultAccountId} auctions={auctions} onChange={setAuctions}
          collections={collections} dueForMonth={dueForMonth} onCollected={setCollections}
          installment={installment} companyName={companyName} />
      )}
      {tab === 'collections' && (
        <CollectionsTab group={group} installment={installment} months={months}
          members={members} accounts={accounts} defaultAccountId={defaultAccountId}
          dueForMonth={dueForMonth} winnerByMonth={winnerByMonth} collections={collections} onChange={setCollections} />
      )}
      {tab === 'receivables' && (
        <ReceivablesTab group={group} installment={installment} months={months} members={members}
          auctions={auctions} accounts={accounts} defaultAccountId={defaultAccountId}
          dueForMonth={dueForMonth} collections={collections} onChange={setCollections} />
      )}
    </div>
  )
}

// ── Group edit ───────────────────────────────────────────────────────────────
function GroupEditForm({ group, companies, locked, onClose, onSaved }: {
  group: ChitGroup
  companies: { id: string; name: string }[]
  // True once auctions/collections exist — the structural fields are frozen then,
  // because changing them would restate figures already recorded.
  locked: boolean
  onClose: () => void
  onSaved: (g: ChitGroup) => void
}) {
  const [name, setName] = useState(group.name)
  const [chitValue, setChitValue] = useState(String(group.chit_value))
  const [membersCount, setMembersCount] = useState(String(group.members))
  const [commissionPct, setCommissionPct] = useState(String(group.commission_pct))
  const [ceiling, setCeiling] = useState(String(group.bid_ceiling_pct))
  const [companyId, setCompanyId] = useState(group.company_id ?? '')
  const [auctionDay, setAuctionDay] = useState(group.auction_day ? String(group.auction_day) : '')
  const [startDate, setStartDate] = useState(group.start_date ?? '')
  const [status, setStatus] = useState(group.status)
  const [busy, setBusy] = useState(false)

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lbl = 'text-[11px] font-bold block mb-1'

  async function save() {
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        id: group.id, name, company_id: companyId || null,
        commission_pct: parseFloat(commissionPct) || 0, bid_ceiling_pct: parseFloat(ceiling) || 0,
        auction_day: auctionDay || null, start_date: startDate || null, status,
      }
      // Only send the structural fields when they're actually editable — otherwise
      // the server rejects the whole PATCH and nothing saves.
      if (!locked) {
        payload.chit_value = parseFloat(chitValue) || 0
        payload.members = parseInt(membersCount) || 0
      }
      const res = await fetch('/api/chit/groups', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Save failed', 'error'); return }
      notify('Group updated', 'success')
      onSaved(json.group)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-lg rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Edit group</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2.5">
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Name</label>
            <input className={fld} style={fs} value={name} onChange={e => setName(e.target.value)} /></div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={lbl} style={{ color: 'var(--text-muted)' }}>Chit value {locked && '(locked)'}</label>
              <input className={fld} style={fs} inputMode="decimal" value={chitValue} disabled={locked}
                onChange={e => setChitValue(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
            <div>
              <label className={lbl} style={{ color: 'var(--text-muted)' }}>Members {locked && '(locked)'}</label>
              <input className={fld} style={fs} inputMode="numeric" value={membersCount} disabled={locked}
                onChange={e => setMembersCount(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          </div>
          {locked && (
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
              Chit value and member count are fixed once auctions or collections exist — changing them would restate figures already recorded.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {group.commission_model === 'MONTHLY' && (
              <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Commission %</label>
                <input className={fld} style={fs} inputMode="decimal" value={commissionPct} onChange={e => setCommissionPct(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            )}
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Bid ceiling %</label>
              <input className={fld} style={fs} inputMode="decimal" value={ceiling} onChange={e => setCeiling(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
          </div>

          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Run by company</label>
            <select className={fld} style={fs} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">— none —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Auction day</label>
              <input className={fld} style={fs} inputMode="numeric" value={auctionDay} onChange={e => setAuctionDay(e.target.value.replace(/[^0-9]/g, ''))} /></div>
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Start date</label>
              <input className={fld} style={fs} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          </div>

          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Status</label>
            <select className={fld} style={fs} value={status} onChange={e => setStatus(e.target.value as ChitGroup['status'])}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select></div>

          <button onClick={save} disabled={busy}
            className="w-full text-white text-sm font-bold py-2.5 rounded-xl mt-1 disabled:opacity-60" style={{ background: 'var(--brand)' }}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Members ──────────────────────────────────────────────────────────────────
function MembersTab({ group, members, allMembers, auctions, collections, dueForMonth, onChange, onRefresh }: {
  group: ChitGroup
  members: ChitGroupMember[]
  allMembers: ChitMember[]
  auctions: ChitAuction[]
  collections: Coll[]
  dueForMonth: (m: number) => number
  onChange: (m: ChitGroupMember[]) => void
  onRefresh: () => void
}) {
  // Per member: their outstanding dues (run months they haven't paid), and the
  // auction they won — the month, the discount they bid, and what they took home.
  const dueMonths = [...new Set(auctions.map(a => a.month_number))]
  const winByMember = new Map(auctions.filter(a => a.winner_member_id).map(a => [a.winner_member_id as string, a]))
  const info = (memberId: string) => {
    const paid = new Set(collections.filter(c => c.member_id === memberId).map(c => c.month_number))
    const pending = dueMonths.filter(m => !paid.has(m)).reduce((t, m) => t + dueForMonth(m), 0)
    return { pending, win: winByMember.get(memberId) }
  }
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
        {members.map((gm, i) => {
          const { pending, win } = info(gm.member_id)
          return (
          <div key={gm.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <SlotEditor gm={gm} onSaved={updated => onChange(members.map(m => m.id === updated.id ? { ...m, slot_number: updated.slot_number } : m))} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                {gm.member?.name ?? 'Member'}
                {win && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,195,109,.18)', color: '#b7791f' }}>
                    <Trophy className="w-3 h-3" /> Won
                  </span>
                )}
              </p>
              {/* If they won: which month, the discount they bid, and what they got. */}
              {win
                ? <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                    Month {win.month_number} · bid {inr(win.bid_amount)} discount · received {inr(win.net_payout)}
                  </p>
                : gm.member?.phone && <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{gm.member.phone}</p>}
            </div>
            <div className="text-right shrink-0">
              {pending > 0
                ? <p className="text-[12.5px] font-extrabold" style={{ color: 'var(--expense)' }}>{inr(pending)}</p>
                : <p className="text-[11px] font-bold" style={{ color: 'var(--income)' }}>Paid up</p>}
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{pending > 0 ? 'pending' : ''}</p>
            </div>
            <button onClick={() => remove(gm.id)} className="p-1" style={{ color: 'var(--expense)' }}><Trash2 className="w-4 h-4" /></button>
          </div>
          )
        })}
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

// ── Editable seat number ─────────────────────────────────────────────────────
function SlotEditor({ gm, onSaved }: {
  gm: ChitGroupMember
  onSaved: (updated: ChitGroupMember) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(gm.slot_number != null ? String(gm.slot_number) : '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/chit/group-members', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gm.id, slot_number: value === '' ? null : value }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Failed', 'error'); setValue(gm.slot_number != null ? String(gm.slot_number) : ''); return }
      onSaved(json.member)
      setEditing(false)
    } finally { setBusy(false) }
  }

  if (editing) {
    return (
      <input autoFocus disabled={busy} value={value} inputMode="numeric"
        onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-9 h-9 rounded-full text-center text-[12px] font-extrabold outline-none"
        style={{ background: 'var(--surface-2)', border: '1.5px solid var(--brand)', color: 'var(--text)' }} />
    )
  }
  return (
    <button onClick={() => setEditing(true)} title="Edit seat number"
      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold"
      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
      {gm.slot_number ?? '·'}
    </button>
  )
}

// ── Auctions ─────────────────────────────────────────────────────────────────
function AuctionsTab({ group, params, months, members, accounts, defaultAccountId, auctions, onChange, collections, dueForMonth, onCollected, installment, companyName }: {
  group: ChitGroup
  params: GroupParams
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  defaultAccountId: string
  auctions: ChitAuction[]
  onChange: (a: ChitAuction[]) => void
  collections: Coll[]
  dueForMonth: (m: number) => number
  onCollected: (c: Coll[]) => void
  installment: number
  companyName: string
}) {
  const [notify_, setNotify] = useState<{ title: string; message: string; targets: NotifyTarget[]; toggle?: { label: string; on: string; off: string; defaultOn?: boolean } } | null>(null)
  const allTargets = members.map(m => toTarget(m.member!)).filter(t => t)

  function sendNotice(monthNumber: number) {
    const message = auctionNotice({
      companyName, chitValue: Number(group.chit_value), members: group.members,
      tenureMonths: months, startDate: group.start_date, installment,
      dueDay: group.auction_day, auctionTime: '6:30 PM', monthNumber,
      auctionDate: scheduledAuctionDate(group.start_date, group.auction_day, monthNumber),
      bidCeilingPct: Number(group.bid_ceiling_pct),
    })
    setNotify({ title: `${ordinalWord(monthNumber)} month auction notice`, message, targets: allTargets })
  }

  function sendWinnerPayout(a: ChitAuction) {
    const gmWinner = members.find(m => m.member_id === a.winner_member_id)
    if (!gmWinner) { notify('No winner on this auction', 'error'); return }
    // Their own unpaid dues for run months up to and including this one.
    const auctionMonths = new Set(auctions.map(x => x.month_number))
    const paidMonths = new Set(collections.filter(c => c.member_id === a.winner_member_id).map(c => c.month_number))
    const pending = Array.from({ length: a.month_number }, (_, i) => i + 1)
      .filter(m => auctionMonths.has(m) && !paidMonths.has(m))
      .reduce((t, m) => t + dueForMonth(m), 0)
    const message = winnerPayout({
      dateText: niceDate(a.auction_date), monthNumber: a.month_number, tenureMonths: months,
      winnerName: gmWinner.member?.name ?? 'Winner', winningAmount: Number(a.net_payout),
      pendingAmount: pending,
    })
    setNotify({ title: `Message ${gmWinner.member?.name ?? 'winner'}`, message, targets: [toTarget(gmWinner.member!)] })
  }

  function sendResult(a: ChitAuction) {
    const winner = members.find(m => m.member_id === a.winner_member_id)?.member?.name ?? 'Winner'
    const base = {
      dateText: niceDate(a.auction_date), monthNumber: a.month_number, tenureMonths: months,
      winnerName: winner, auctionAmount: Number(a.net_payout),
      discount: Number(a.bid_amount), dueAmount: dueForMonth(a.month_number),
    }
    const withName = auctionResult({ ...base, showWinner: true })
    const withoutName = auctionResult({ ...base, showWinner: false })
    setNotify({
      title: `Month ${a.month_number} result`,
      message: withoutName,   // default: don't name the winner in a group broadcast
      targets: allTargets,
      toggle: { label: 'Show winner name', on: withName, off: withoutName, defaultOn: false },
    })
  }
  const done = new Set(auctions.map(a => a.month_number))
  const nextMonth = useMemo(() => { for (let m = 1; m <= months; m++) if (!done.has(m)) return m; return null }, [done, months])
  const [conducting, setConducting] = useState(false)
  const [editing, setEditing] = useState<ChitAuction | null>(null)
  const [payFor, setPayFor] = useState<ChitAuction | null>(null)

  // Everyone who has already won a month. They can't win again, so they're kept
  // out of the winner picker entirely (excluding the month being edited, so an
  // edit can keep its own winner).
  const wonMemberIds = (excludeMonth?: number) =>
    new Set(auctions.filter(a => a.winner_member_id && a.month_number !== excludeMonth).map(a => a.winner_member_id as string))

  async function deleteAuction(a: ChitAuction) {
    if (!(await confirmDialog(`Delete the month ${a.month_number} auction?`))) return
    const res = await fetch(`/api/chit/auctions?id=${a.id}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); notify(j.error ?? 'Could not delete', 'error'); return }
    onChange(auctions.filter(x => x.id !== a.id))
    notify(`Month ${a.month_number} auction deleted`, 'success')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {nextMonth && (
          <button onClick={() => setConducting(true)}
            className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2.5 rounded-xl" style={{ background: 'var(--brand)' }}>
            <Gavel className="w-4 h-4" /> Conduct auction — month {nextMonth}
          </button>
        )}
        {nextMonth && (
          <button onClick={() => sendNotice(nextMonth)}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <Send className="w-4 h-4" /> Send month {nextMonth} notice
          </button>
        )}
      </div>

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
                <div className="text-right flex items-center gap-3">
                  <div>
                    <p className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{inr(a.net_payout)}</p>
                    {a.payout_transaction_id
                      ? <span className="text-[11px] font-bold" style={{ color: 'var(--income)' }}>Paid</span>
                      : a.net_payout > 0
                        ? <button onClick={() => setPayFor(a)} className="text-[11px] font-bold" style={{ color: 'var(--brand)' }}>Mark paid</button>
                        : <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>—</span>}
                  </div>
                  {/* Once paid, the money has moved — editing is refused server-side
                      too, so we simply don't offer it here. */}
                  <button onClick={() => sendResult(a)} className="p-1" style={{ color: '#25D366' }} title="Broadcast result to all members">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                  {a.winner_member_id && (
                    <button onClick={() => sendWinnerPayout(a)} className="p-1" style={{ color: '#b7791f' }} title="Message the winner about their payout">
                      <Trophy className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!a.payout_transaction_id && (
                    <>
                      <button onClick={() => setEditing(a)} className="p-1" style={{ color: 'var(--text-faint)' }} title="Edit auction">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteAuction(a)} className="p-1" style={{ color: 'var(--expense)' }} title="Delete auction">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {conducting && nextMonth && (
        <ConductModal group={group} params={params} monthNumber={nextMonth} members={members}
          excludeWinners={wonMemberIds()}
          onClose={() => setConducting(false)}
          onDone={a => { onChange([...auctions.filter(x => x.month_number !== a.month_number), a].sort((x, y) => x.month_number - y.month_number)); setConducting(false) }} />
      )}

      {editing && (
        <ConductModal group={group} params={params} monthNumber={editing.month_number} members={members}
          existing={editing} excludeWinners={wonMemberIds(editing.month_number)}
          onClose={() => setEditing(null)}
          onDone={a => { onChange([...auctions.filter(x => x.month_number !== a.month_number), a].sort((x, y) => x.month_number - y.month_number)); setEditing(null) }} />
      )}

      {payFor && (() => {
        // The winner's OWN unpaid dues, for months whose auction has run, up to and
        // including this winning month. These can be netted off the payout — you
        // pay them the pot less what they still owe.
        const winnerId = payFor.winner_member_id
        const paidMonths = new Set(collections.filter(c => c.member_id === winnerId).map(c => c.month_number))
        const auctionMonths = new Set(auctions.map(a => a.month_number))
        const pendingDue = winnerId
          ? Array.from({ length: payFor.month_number }, (_, i) => i + 1)
              .filter(m => auctionMonths.has(m) && !paidMonths.has(m))
              .map(m => ({ month: m, amount: dueForMonth(m) }))
          : []
        return (
          <PayModal auction={payFor} accounts={accounts} defaultAccountId={defaultAccountId} group={group}
            winnerName={members.find(m => m.member_id === winnerId)?.member?.name ?? ''}
            pendingDue={pendingDue}
            onClose={() => setPayFor(null)}
            onDone={(collectedMonths, txnId) => {
              onChange(auctions.map(x => x.id === payFor.id ? { ...x, payout_transaction_id: 'posted', paid_at: new Date().toISOString() } : x))
              if (collectedMonths.length && winnerId) {
                const added: Coll[] = collectedMonths.map(m => ({
                  id: `tmp-${winnerId}-${m}`, group_id: group.id, member_id: winnerId,
                  month_number: m, amount: dueForMonth(m), paid_date: new Date().toISOString().split('T')[0],
                  account_id: null, income_transaction_id: txnId ?? 'posted', notes: null,
                  created_at: new Date().toISOString(), member: { name: members.find(mm => mm.member_id === winnerId)?.member?.name ?? '' },
                } as Coll))
                onCollected([...added, ...collections])
              }
              setPayFor(null)
            }} />
        )
      })()}

      {notify_ && (
        <NotifyModal title={notify_.title} message={notify_.message} targets={notify_.targets}
          toggle={notify_.toggle} onClose={() => setNotify(null)} />
      )}
    </div>
  )
}

function ConductModal({ group, params, monthNumber, members, existing, excludeWinners, onClose, onDone }: {
  group: ChitGroup
  params: GroupParams
  monthNumber: number
  members: ChitGroupMember[]
  existing?: ChitAuction
  excludeWinners?: Set<string>
  onClose: () => void
  onDone: (a: ChitAuction) => void
}) {
  // Only members who haven't already won can be picked. A past winner taking the
  // pot twice isn't a chit — so they don't even appear in the list.
  const eligible = members.filter(m => !(excludeWinners?.has(m.member_id)))
  const isForemanMonth = group.commission_model === 'UPFRONT' && monthNumber === 1
  const [bid, setBid] = useState(existing ? String(existing.bid_amount) : '')
  const [winner, setWinner] = useState(existing?.winner_member_id ?? '')
  // The date the auction was actually held — defaults to the schedule, editable.
  // Stored so the result message shows the auction date, not the day you keyed it.
  const [auctionDate, setAuctionDate] = useState(
    existing?.auction_date
    ?? scheduledAuctionDate(group.start_date, group.auction_day, monthNumber)
    ?? new Date().toISOString().split('T')[0],
  )
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
        body: JSON.stringify({ group_id: group.id, month_number: monthNumber, bid_amount: parseFloat(bid) || 0, winner_member_id: winner || null, auction_date: auctionDate }),
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
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{existing ? 'Edit' : ''} Auction — month {monthNumber}</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="mb-3">
          <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Auction date</label>
          <input type="date" className={fld} style={fs} value={auctionDate} onChange={e => setAuctionDate(e.target.value)} />
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
                {eligible.map(m => <option key={m.member_id} value={m.member_id}>{m.member?.name}</option>)}
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
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Record auction'}
        </button>
      </div>
    </div>
  )
}

function PayModal({ auction, accounts, defaultAccountId, group, winnerName, pendingDue, onClose, onDone }: {
  auction: ChitAuction
  accounts: Account[]
  defaultAccountId: string
  group: ChitGroup
  winnerName: string
  /** The winner's own unpaid dues (months whose auction has run, ≤ this month). */
  pendingDue: { month: number; amount: number }[]
  onClose: () => void
  onDone: (collectedMonths: number[], collectionTxnId?: string) => void
}) {
  // Default to the group's own bank account, not just the first in the list.
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [netOff, setNetOff] = useState(pendingDue.length > 0)
  const [busy, setBusy] = useState(false)

  const dueTotal = pendingDue.reduce((t, d) => t + d.amount, 0)
  const payout = Number(auction.net_payout)
  // What the winner actually receives in hand: the pot less what they still owe.
  const netCash = netOff ? Math.round((payout - dueTotal) * 100) / 100 : payout

  async function pay() {
    if (!accountId) { notify('Choose the account', 'error'); return }
    setBusy(true)
    try {
      let collectedMonths: number[] = []
      let collectionTxnId: string | undefined

      // Net the winner's dues FIRST: record them as one consolidated income, so the
      // account nets to (payout − dues) and their receivables are cleared. Both
      // sides are real transactions — that's what keeps the books honest, rather
      // than a single mystery net figure.
      if (netOff && pendingDue.length > 0) {
        const res = await fetch('/api/chit/collections/consolidated', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_id: group.id, member_id: auction.winner_member_id, account_id: accountId, paid_date: date,
            entries: pendingDue.map(d => ({ month_number: d.month, amount: d.amount })),
          }),
        })
        const cj = await res.json()
        if (!res.ok) { notify(cj.error ?? 'Could not collect the dues', 'error'); return }
        collectedMonths = cj.months ?? pendingDue.map(d => d.month)
        collectionTxnId = cj.transaction_id
      }

      // Then the payout — full net_payout as an expense. Account movement across
      // the two = payout − dues, exactly the cash you hand over.
      const res = await fetch('/api/chit/auctions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: auction.id, account_id: accountId, date }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Failed', 'error'); return }

      notify(netOff && dueTotal > 0
        ? `Paid ${inr(netCash)} (${inr(payout)} less ${inr(dueTotal)} dues) — posted to your books`
        : `Paid ${inr(payout)} — posted to your books`, 'success')
      onDone(collectedMonths, collectionTxnId)
    } finally { setBusy(false) }
  }

  const monthList = pendingDue.map(d => d.month).join(', ')

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up" style={{ background: 'var(--surface)' }}>
        <p className="text-base font-extrabold mb-1" style={{ color: 'var(--text)' }}>Pay {winnerName || 'the winner'}</p>
        <p className="text-[12px] mb-4" style={{ color: 'var(--text-faint)' }}>Posts an expense from the chosen account — real money out.</p>

        <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>Date</label>
        <input type="date" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mb-3" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          value={date} onChange={e => setDate(e.target.value)} />

        <label className="text-[11px] font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>From account</label>
        <select className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {/* The winner's own outstanding dues, netted off by default. */}
        {pendingDue.length > 0 && (
          <button type="button" onClick={() => setNetOff(v => !v)}
            className="w-full flex items-start gap-2.5 mt-3 rounded-xl px-3.5 py-3 text-left"
            style={{ background: 'var(--surface-2)' }}>
            <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: netOff ? 'var(--brand)' : 'transparent', border: netOff ? 'none' : '1.5px solid var(--border)' }}>
              {netOff && <Check className="w-3.5 h-3.5 text-white" />}
            </span>
            <span className="min-w-0">
              <span className="text-[12.5px] font-bold block" style={{ color: 'var(--text)' }}>Deduct their pending dues — {inr(dueTotal)}</span>
              <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>months {monthList}, collected from the payout</span>
            </span>
          </button>
        )}

        {/* What they actually receive. */}
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-muted)' }}>Winner receives</span>
          <span className="text-lg font-extrabold" style={{ color: 'var(--text)' }}>{inr(netCash)}</span>
        </div>
        {netOff && dueTotal > 0 && (
          <p className="text-[11px] text-right" style={{ color: 'var(--text-faint)' }}>{inr(payout)} payout − {inr(dueTotal)} dues</p>
        )}

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
function CollectionsTab({ group, installment, months, members, accounts, defaultAccountId, dueForMonth, winnerByMonth, collections, onChange }: {
  group: ChitGroup
  installment: number
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  defaultAccountId: string
  dueForMonth: (m: number) => number
  winnerByMonth: Map<number, string>
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
            accounts={accounts} defaultAccountId={defaultAccountId} dueForMonth={dueForMonth} winnerByMonth={winnerByMonth} collections={collections} onChange={onChange} />
        : <MemberView group={group} installment={installment} months={months} members={members}
            accounts={accounts} defaultAccountId={defaultAccountId} dueForMonth={dueForMonth} winnerByMonth={winnerByMonth} collections={collections} onChange={onChange} />}
    </div>
  )
}

// ── Month view: one month, collect many at once ──────────────────────────────
function MonthView({ group, installment, months, members, accounts, defaultAccountId, dueForMonth, winnerByMonth, collections, onChange }: {
  group: ChitGroup
  installment: number
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  defaultAccountId: string
  dueForMonth: (m: number) => number
  winnerByMonth: Map<number, string>
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
  const [amount, setAmount] = useState(String(dueForMonth(firstOpen)))

  // When you move to another month, refill the amount with THAT month's due —
  // installment minus that month's dividend — so the prefill is always the real
  // figure, not the flat installment. You can still override it.
  useEffect(() => { setAmount(String(dueForMonth(month))) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const paidThisMonth = new Set(collections.filter(c => c.month_number === month).map(c => c.member_id))
  const unpaid = members.filter(gm => !paidThisMonth.has(gm.member_id))
  const unpaidIds = unpaid.map(gm => gm.member_id).join(',')

  // Selection is explicit and defaults to EVERYONE unpaid — the common case is
  // "all paid this month". Reset it whenever the month (or who's unpaid) changes,
  // so you always start from "all ticked" rather than a stale set from last month.
  useEffect(() => {
    setSelected(new Set(unpaid.map(gm => gm.member_id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, unpaidIds])

  const effective = unpaid.filter(gm => selected.has(gm.member_id))
  const allSelected = unpaid.length > 0 && effective.length === unpaid.length

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
      notify(`Collected ${json.done}${json.skipped ? `, ${json.skipped} already paid` : ''}${json.failed?.length ? `, ${json.failed.length} failed` : ''} — posted to your books`, json.failed?.length ? 'error' : 'success')
    } finally { setBusy(false) }
  }

  // Undo a member's payment for THIS month — deletes the collection and its
  // income transaction, then the row shows 'Due' again.
  async function reverse(memId: string, name: string) {
    if (!(await confirmDialog(`Mark ${name} unpaid for month ${month}? This deletes the payment and its transaction.`))) return
    const res = await fetch(`/api/chit/collections?group_id=${group.id}&member_id=${memId}&month_number=${month}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); notify(j.error ?? 'Could not reverse', 'error'); return }
    onChange(collections.filter(c => !(c.member_id === memId && c.month_number === month)))
    notify(`${name} marked unpaid for month ${month}`, 'success')
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

      {/* Select all / none — toggles every UNPAID member; paid ones are untouched. */}
      {unpaid.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
            {effective.length} of {unpaid.length} selected
          </p>
          <button
            onClick={() => setSelected(allSelected ? new Set() : new Set(unpaid.map(gm => gm.member_id)))}
            className="text-[12px] font-bold px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--brand)' }}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      )}

      {/* The roster for this month. Unpaid rows are tickable; paid ones show it. */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        {members.length === 0 && <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>Add members first.</p>}
        {members.map((gm, i) => {
          const isPaid = paidThisMonth.has(gm.member_id)
          const on = !isPaid && selected.has(gm.member_id)
          return (
            <div key={gm.id} className="w-full flex items-center gap-3 px-4 py-3"
              style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <button disabled={isPaid}
                onClick={() => setSelected(s => {
                  const base = new Set(s)
                  base.has(gm.member_id) ? base.delete(gm.member_id) : base.add(gm.member_id)
                  return base
                })}
                className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-100">
                <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{ background: isPaid ? 'var(--income)' : on ? 'var(--brand)' : 'transparent', border: isPaid || on ? 'none' : '1.5px solid var(--border)' }}>
                  {(isPaid || on) && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="flex-1 text-sm font-semibold truncate flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                  {gm.member?.name}
                  {winnerByMonth.get(month) === gm.member_id && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(240,195,109,.18)', color: '#b7791f' }}>
                      <Trophy className="w-3 h-3" /> Winner
                    </span>
                  )}
                </span>
              </button>
              {isPaid && (
                <button onClick={() => reverse(gm.member_id, gm.member?.name ?? 'member')}
                  className="text-[11px] font-bold shrink-0" style={{ color: 'var(--income)' }} title="Mark unpaid">
                  Paid ✕
                </button>
              )}
            </div>
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
function MemberView({ group, installment, months, members, accounts, defaultAccountId, dueForMonth, winnerByMonth, collections, onChange }: {
  group: ChitGroup
  installment: number
  months: number
  members: ChitGroupMember[]
  accounts: Account[]
  defaultAccountId: string
  dueForMonth: (m: number) => number
  winnerByMonth: Map<number, string>
  collections: Coll[]
  onChange: (c: Coll[]) => void
}) {
  const [memberId, setMemberId] = useState(members[0]?.member_id ?? '')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [account, setAccount] = useState(defaultAccountId || accounts[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [busy, setBusy] = useState(false)

  const gm = members.find(m => m.member_id === memberId)
  const paid = new Map(collections.filter(c => c.member_id === memberId).map(c => [c.month_number, c]))

  // Switching member wipes the month selection — a set from the last person is
  // meaningless for this one.
  useEffect(() => { setSelected(new Set()) }, [memberId])

  const allMonths = Array.from({ length: months }, (_, i) => i + 1)
  const dueMonths = allMonths.filter(m => !paid.has(m))
  const allDueSelected = dueMonths.length > 0 && dueMonths.every(m => selected.has(m))

  const toggle = (m: number) => setSelected(s => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n })
  const selectedTotal = [...selected].reduce((t, m) => t + dueForMonth(m), 0)

  // Undo a collected month — deletes the collection AND its income transaction,
  // so a mistake doesn't leave phantom money in your books. Matched by slot, which
  // works even for a row we only just added optimistically.
  async function reverse(m: number) {
    if (!(await confirmDialog(`Mark month ${m} as unpaid? This deletes the recorded payment and its transaction.`))) return
    const res = await fetch(`/api/chit/collections?group_id=${group.id}&member_id=${memberId}&month_number=${m}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json().catch(() => ({})); notify(j.error ?? 'Could not reverse', 'error'); return }
    onChange(collections.filter(c => !(c.member_id === memberId && c.month_number === m)))
    notify(`Month ${m} marked unpaid`, 'success')
  }

  async function collectSelected() {
    if (selected.size === 0) { notify('Pick the months to collect', 'error'); return }
    if (!account) { notify('Choose the account', 'error'); return }
    setBusy(true)
    try {
      const monthsToPost = [...selected]
      // One member, several months → ONE consolidated transaction named for the
      // months paid. The per-month collection rows still exist underneath.
      const res = await fetch('/api/chit/collections/consolidated', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: group.id, member_id: memberId, paid_date: date, account_id: account,
          entries: monthsToPost.map(m => ({ month_number: m, amount: dueForMonth(m) })),
        }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Failed', 'error'); return }
      const txnId = json.transaction_id ?? 'posted'
      const added: Coll[] = monthsToPost.map(m => ({
        id: `tmp-${memberId}-${m}`, group_id: group.id, member_id: memberId,
        month_number: m, amount: dueForMonth(m), paid_date: date, account_id: account,
        income_transaction_id: txnId, notes: null, created_at: new Date().toISOString(),
        member: { name: gm?.member?.name ?? '' },
      } as Coll))
      onChange([...added, ...collections])
      setSelected(new Set())
      notify(`Collected ${json.done} month${json.done === 1 ? '' : 's'} · ${inr(json.total ?? 0)} — one transaction posted`, 'success')
    } finally { setBusy(false) }
  }

  const fld = 'px-3 py-2 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="space-y-3">
      <select className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
        value={memberId} onChange={e => setMemberId(e.target.value)}>
        {members.map(m => <option key={m.member_id} value={m.member_id}>{m.member?.name}</option>)}
      </select>

      {/* Batch controls. Each month's amount is its own due (installment minus
          that month's dividend), so there's no single amount field — the tiles
          below show what each month costs. */}
      <div className="rounded-2xl p-3.5 grid grid-cols-2 gap-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div>
          <label className="text-[10px] font-bold block mb-0.5" style={{ color: 'var(--text-faint)' }}>Date</label>
          <input className={`${fld} w-full`} style={fs} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold block mb-0.5" style={{ color: 'var(--text-faint)' }}>Received into</label>
          <select className={`${fld} w-full`} style={fs} value={account} onChange={e => setAccount(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {/* Select all / none across the DUE months. */}
      {dueMonths.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>{selected.size} selected</p>
          <button onClick={() => setSelected(allDueSelected ? new Set() : new Set(dueMonths))}
            className="text-[12px] font-bold px-3 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--brand)' }}>
            {allDueSelected ? 'Deselect all' : 'Select all due'}
          </button>
        </div>
      )}

      {/* Every month. Paid ones show the amount and can't be reselected; due ones
          are tickable, so you can clear several months of arrears in one go. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {allMonths.map(m => {
          const c = paid.get(m)
          const on = !c && selected.has(m)
          return (
            <button key={m} onClick={() => c ? reverse(m) : toggle(m)}
              title={c ? 'Tap to mark unpaid' : undefined}
              className="rounded-xl px-3 py-2.5 text-left flex items-start gap-2"
              style={{ border: on ? '1.5px solid var(--brand)' : '1px solid var(--border)', background: c ? 'var(--brand-light)' : on ? 'var(--brand-light)' : 'var(--surface)' }}>
              {!c && (
                <span className="w-4 h-4 mt-0.5 rounded flex items-center justify-center shrink-0"
                  style={{ background: on ? 'var(--brand)' : 'transparent', border: on ? 'none' : '1.5px solid var(--border)' }}>
                  {on && <Check className="w-3 h-3 text-white" />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                  Month {m}
                  {winnerByMonth.get(m) === memberId && <Trophy className="w-3 h-3" style={{ color: '#b7791f' }} />}
                </p>
                <p className="text-[13px] font-extrabold" style={{ color: c ? 'var(--income)' : 'var(--text-muted)' }}>
                  {c ? inr(c.amount) : inr(dueForMonth(m))}
                </p>
              </div>
              {c && <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--income)' }}>Paid ✕</span>}
            </button>
          )
        })}
      </div>

      {selected.size > 0 && (
        <button onClick={collectSelected} disabled={busy}
          className="w-full text-white text-sm font-bold py-3 rounded-xl disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {busy ? 'Posting…' : `Collect ${selected.size} month${selected.size === 1 ? '' : 's'} · ${inr(selectedTotal)}`}
        </button>
      )}
    </div>
  )
}

// ── Single collection (used by the member view) ──// ── Single collection (used by the member view) ──────────────────────────────
function CollectModal({ group, installment, months, memberId, memberName, accounts, defaultAccountId, fixedMonth, dueForMonth, existing, onClose, onDone }: {
  group: ChitGroup
  installment: number
  months: number
  memberId: string
  memberName: string
  accounts: Account[]
  defaultAccountId: string
  fixedMonth?: number
  dueForMonth: (m: number) => number
  existing: Coll[]
  onClose: () => void
  onDone: (c: Coll) => void
}) {
  const paidMonths = new Set(existing.filter(c => c.member_id === memberId).map(c => c.month_number))
  const firstUnpaid = useMemo(() => { for (let m = 1; m <= months; m++) if (!paidMonths.has(m)) return m; return 1 }, [paidMonths, months])
  const [month, setMonth] = useState(String(fixedMonth ?? firstUnpaid))
  // Prefill the chosen month's actual due — installment minus that month's dividend.
  const [amount, setAmount] = useState(String(dueForMonth(fixedMonth ?? firstUnpaid)))
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id || '')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [busy, setBusy] = useState(false)

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  useEffect(() => { setAmount(String(dueForMonth(parseInt(month) || 1))) }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

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
function ReceivablesTab({ group, installment, months, members, auctions, accounts, defaultAccountId, dueForMonth, collections, onChange }: {
  group: ChitGroup
  installment: number
  months: number
  members: ChitGroupMember[]
  auctions: ChitAuction[]
  accounts: Account[]
  defaultAccountId: string
  dueForMonth: (m: number) => number
  collections: Coll[]
  onChange: (c: Coll[]) => void
}) {
  const [collectFor, setCollectFor] = useState<{ memberId: string; name: string; month: number } | null>(null)
  const [view, setView] = useState<'member' | 'month'>('member')
  const [openMonth, setOpenMonth] = useState<number | null>(null)

  // A member owes a month only once that month has actually RUN — the signal is
  // that its auction was conducted. Due months = the months with an auction.
  const dueMonths = useMemo(
    () => [...new Set(auctions.map(a => a.month_number))].sort((a, b) => a - b),
    [auctions],
  )

  const paidByMember = useMemo(() => {
    const m = new Map<string, Set<number>>()
    for (const c of collections) {
      if (!m.has(c.member_id)) m.set(c.member_id, new Set())
      m.get(c.member_id)!.add(c.month_number)
    }
    return m
  }, [collections])

  // By member: who owes what, across all run months.
  const memberRows = members.map(gm => {
    const paid = paidByMember.get(gm.member_id) ?? new Set<number>()
    const unpaid = dueMonths.filter(m => !paid.has(m))
    const due = unpaid.reduce((t, m) => t + dueForMonth(m), 0)
    return { gm, name: gm.member?.name ?? 'Member', unpaid, due }
  }).filter(r => r.unpaid.length > 0)

  // By month: for each run month, who hasn't paid and how much is outstanding.
  const monthRows = dueMonths.map(m => {
    const nonPayers = members.filter(gm => !(paidByMember.get(gm.member_id)?.has(m)))
    return { month: m, nonPayers, due: nonPayers.length * dueForMonth(m), each: dueForMonth(m) }
  }).filter(r => r.nonPayers.length > 0)

  const total = memberRows.reduce((s, r) => s + r.due, 0)

  return (
    <div className="space-y-3">
      <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--surface-2)' }}>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Total outstanding</p>
        <p className="text-2xl font-extrabold" style={{ color: 'var(--expense)' }}>{inr(total)}</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
          {dueMonths.length === 0
            ? 'Nothing due yet — dues appear as you conduct each month\'s auction.'
            : `Across ${dueMonths.length} month${dueMonths.length === 1 ? '' : 's'} run so far.`}
        </p>
      </div>

      {/* By member (who owes) or by month (which month is short, and who). */}
      {dueMonths.length > 0 && (
        <div className="inline-flex rounded-xl p-0.5" style={{ background: 'var(--surface-2)' }}>
          {(['member', 'month'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-4 py-1.5 rounded-lg text-[12.5px] font-bold capitalize"
              style={{ background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? 'var(--brand)' : 'var(--text-muted)', boxShadow: view === v ? 'var(--shadow-sm)' : undefined }}>
              By {v}
            </button>
          ))}
        </div>
      )}

      {view === 'member' && (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {memberRows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm" style={{ color: 'var(--income)' }}>
              {dueMonths.length === 0 ? 'No months have run yet.' : 'Everyone is paid up.'}
            </p>
          )}
          {memberRows.map((r, i) => (
            <div key={r.gm.id} className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>{r.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Months pending- {r.unpaid.join(', ')}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <p className="text-sm font-extrabold" style={{ color: 'var(--expense)' }}>{inr(r.due)}</p>
                <button onClick={() => setCollectFor({ memberId: r.gm.member_id, name: r.name, month: r.unpaid[0] })}
                  className="flex items-center gap-1 text-[12px] font-bold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--brand)' }}>
                  <Wallet className="w-3.5 h-3.5" /> Collect
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'month' && (
        <div className="space-y-2">
          {monthRows.length === 0 && (
            <p className="rounded-2xl px-4 py-8 text-center text-sm" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--income)' }}>Every run month is fully collected.</p>
          )}
          {monthRows.map(r => (
            <div key={r.month} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              {/* Tap a month to see who didn't pay it. */}
              <button onClick={() => setOpenMonth(openMonth === r.month ? null : r.month)}
                className="w-full flex items-center justify-between px-4 py-3">
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Month {r.month}</p>
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{r.nonPayers.length} unpaid · {inr(r.each)} each</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-extrabold" style={{ color: 'var(--expense)' }}>{inr(r.due)}</p>
                  {openMonth === r.month ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-faint)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />}
                </div>
              </button>
              {openMonth === r.month && r.nonPayers.map(gm => (
                <div key={gm.id} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{gm.member?.name}</p>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <p className="text-[12.5px] font-bold" style={{ color: 'var(--expense)' }}>{inr(r.each)}</p>
                    <button onClick={() => setCollectFor({ memberId: gm.member_id, name: gm.member?.name ?? '', month: r.month })}
                      className="text-[11.5px] font-bold px-2.5 py-1 rounded-lg text-white" style={{ background: 'var(--brand)' }}>Collect</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {collectFor && (
        <CollectModal group={group} installment={installment} months={months}
          memberId={collectFor.memberId} memberName={collectFor.name} accounts={accounts}
          defaultAccountId={defaultAccountId} fixedMonth={collectFor.month} dueForMonth={dueForMonth} existing={collections}
          onClose={() => setCollectFor(null)}
          onDone={c => { onChange([c, ...collections]); setCollectFor(null) }} />
      )}
    </div>
  )
}
