'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, X, Users, ChevronRight, Trash2 } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { inr } from '@/lib/assets/valuation'
import {
  monthlyInstallment, numberOfMonths, monthlyCommission, groupTotals,
  type CommissionModel,
} from '@/lib/chit/auction'
import type { ChitGroup } from '@/lib/chit/types'

export default function ChitGroupsClient({ initialGroups, companies, memberCounts }: {
  initialGroups: ChitGroup[]
  companies: { id: string; name: string }[]
  memberCounts: Record<string, number>
}) {
  const router = useRouter()
  const [groups, setGroups] = useState(initialGroups)
  const [adding, setAdding] = useState(false)

  async function remove(id: string) {
    if (!(await confirmDialog('Delete this group and its members, auctions and collections? Posted transactions stay in your books.'))) return
    const res = await fetch(`/api/chit/groups?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Could not delete', 'error'); return }
    setGroups(prev => prev.filter(g => g.id !== id))
  }

  const companyName = (id: string | null) => companies.find(c => c.id === id)?.name

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Chit groups</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{groups.length} group{groups.length === 1 ? '' : 's'}</p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 text-white text-sm font-bold px-4 py-2 rounded-xl" style={{ background: 'var(--brand)' }}>
          <Plus className="w-4 h-4" /> New group
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {groups.length === 0 && (
          <p className="px-4 py-8 text-center text-sm md:col-span-2" style={{ color: 'var(--text-faint)' }}>No groups yet.</p>
        )}
        {groups.map(g => {
          const installment = monthlyInstallment({ chitValue: g.chit_value, members: g.members })
          const months = numberOfMonths({ members: g.members, model: g.commission_model })
          const inGroup = memberCounts[g.id] ?? 0
          return (
            <div key={g.id} className="rounded-2xl p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div className="flex items-start justify-between gap-2">
                <Link href={`/chit/groups/${g.id}`} className="min-w-0 flex-1">
                  <p className="text-[15px] font-extrabold truncate" style={{ color: 'var(--text)' }}>{g.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {inr(g.chit_value)} · {g.members} members · {g.commission_model === 'UPFRONT' ? 'Upfront' : `${g.commission_pct}% monthly`}
                    {companyName(g.company_id) && <> · {companyName(g.company_id)}</>}
                  </p>
                </Link>
                <button onClick={() => remove(g.id)} className="p-1 shrink-0" style={{ color: 'var(--expense)' }}><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Stat label="Installment" value={inr(installment)} />
                <Stat label="Months" value={String(months)} />
                <Stat label="Members" value={`${inGroup} / ${g.members}`} />
              </div>
              <Link href={`/chit/groups/${g.id}`}
                className="flex items-center justify-center gap-1 mt-3 py-2 rounded-xl text-[12.5px] font-bold"
                style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}>
                Open <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )
        })}
      </div>

      {adding && (
        <GroupForm companies={companies}
          onClose={() => setAdding(false)}
          onSaved={g => { setGroups(prev => [g, ...prev]); setAdding(false); router.refresh() }} />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-2.5 py-2" style={{ background: 'var(--surface-2)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p className="text-[13px] font-extrabold mt-0.5" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  )
}

function GroupForm({ companies, onClose, onSaved }: {
  companies: { id: string; name: string }[]
  onClose: () => void
  onSaved: (g: ChitGroup) => void
}) {
  const [name, setName] = useState('')
  const [chitValue, setChitValue] = useState('')
  const [members, setMembers] = useState('20')
  const [model, setModel] = useState<CommissionModel>('MONTHLY')
  const [commissionPct, setCommissionPct] = useState('5')
  const [ceiling, setCeiling] = useState('30')
  const [companyId, setCompanyId] = useState('')
  const [auctionDay, setAuctionDay] = useState('')
  const [startDate, setStartDate] = useState('')
  const [busy, setBusy] = useState(false)

  const cv = parseFloat(chitValue) || 0
  const mem = parseInt(members) || 0
  const preview = cv > 0 && mem >= 2
    ? groupTotals({ chitValue: cv, members: mem, commissionPct: parseFloat(commissionPct) || 0, bidCeilingPct: parseFloat(ceiling) || 0, model })
    : null

  const fld = 'w-full px-3 py-2.5 rounded-xl border text-sm outline-none'
  const fs = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lbl = 'text-[11px] font-bold block mb-1'

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/chit/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, chit_value: cv, members: mem, commission_model: model,
          commission_pct: parseFloat(commissionPct) || 0, bid_ceiling_pct: parseFloat(ceiling) || 0,
          company_id: companyId || null, auction_day: auctionDay || null, start_date: startDate || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { notify(json.error ?? 'Save failed', 'error'); return }
      onSaved(json.group)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-lg rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[92vh] overflow-y-auto" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>New chit group</p>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-2.5">
          <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Group name</label>
            <input className={fld} style={fs} value={name} onChange={e => setName(e.target.value)} placeholder="1 Lakh — 20 members" /></div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Chit value (pot)</label>
              <input className={fld} style={fs} inputMode="decimal" value={chitValue} onChange={e => setChitValue(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="100000" /></div>
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Members</label>
              <input className={fld} style={fs} inputMode="numeric" value={members} onChange={e => setMembers(e.target.value.replace(/[^0-9]/g, ''))} /></div>
          </div>

          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Commission model</label>
            <div className="grid grid-cols-2 gap-2">
              {([['MONTHLY', 'Monthly cut'], ['UPFRONT', 'Upfront (1st pot)']] as [CommissionModel, string][]).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setModel(m)}
                  className="px-3 py-2 rounded-xl text-[12.5px] font-semibold border"
                  style={{ borderColor: model === m ? 'var(--brand)' : 'var(--border)', background: model === m ? 'var(--brand-light)' : 'var(--surface-2)', color: model === m ? 'var(--brand)' : 'var(--text-muted)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {model === 'MONTHLY' && (
              <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Commission %</label>
                <input className={fld} style={fs} inputMode="decimal" value={commissionPct} onChange={e => setCommissionPct(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
            )}
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Bid ceiling %</label>
              <input className={fld} style={fs} inputMode="decimal" value={ceiling} onChange={e => setCeiling(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
          </div>

          <div>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Run by company</label>
            <select className={fld} style={fs} value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">— choose later —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>Collections and payouts post to this company&apos;s bank accounts.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Auction day</label>
              <input className={fld} style={fs} inputMode="numeric" value={auctionDay} onChange={e => setAuctionDay(e.target.value.replace(/[^0-9]/g, ''))} placeholder="5" /></div>
            <div><label className={lbl} style={{ color: 'var(--text-muted)' }}>Start date</label>
              <input className={fld} style={fs} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
          </div>

          {preview && (
            <div className="rounded-xl px-3.5 py-3 text-[12px]" style={{ background: 'var(--brand-light)', color: 'var(--text-muted)' }}>
              Installment <b style={{ color: 'var(--text)' }}>{inr(preview.installment)}</b> ·
              runs <b style={{ color: 'var(--text)' }}>{preview.months}</b> months ·
              {model === 'MONTHLY'
                ? <> foreman takes <b style={{ color: 'var(--text)' }}>{inr(monthlyCommission({ chitValue: cv, commissionPct: parseFloat(commissionPct) || 0 }))}</b>/month</>
                : <> foreman takes the <b style={{ color: 'var(--text)' }}>{inr(cv)}</b> first pot</>}
            </div>
          )}

          <button onClick={save} disabled={busy}
            className="w-full text-white text-sm font-bold py-2.5 rounded-xl mt-1 disabled:opacity-60" style={{ background: 'var(--brand)' }}>
            {busy ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}
