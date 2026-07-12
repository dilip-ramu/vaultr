'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Wallet, Gem, CreditCard, ArrowDownLeft, ArrowUpRight, Users, AlertTriangle } from 'lucide-react'
import {
  buildBalanceSheet, unassignedSheet, isLiabilityAccount,
  type SheetAccount, type SheetAsset, type SheetReceivable, type SheetPayable,
} from '@/lib/companies/balanceSheet'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'

const inr = (n: number) =>
  (n < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(n))

interface Data {
  accounts: SheetAccount[]
  assets: SheetAsset[]
  receivables: SheetReceivable[]
  payables: SheetPayable[]
}

export default function CompanyViewClient({
  company, companies, data, employeeCount,
}: {
  company: { id: string; name: string; gstin: string | null; accent: string | null }
  companies: { id: string; name: string }[]
  data: Data
  employeeCount: number
}) {
  const router = useRouter()
  const { hidden } = useBalanceVisibility()
  const m = (n: number) => (hidden ? '••••' : inr(n))

  const sheet = useMemo(() => buildBalanceSheet(company.id, data), [company.id, data])
  const unassigned = useMemo(() => unassignedSheet(data), [data])

  const [tab, setTab] = useState<'cash' | 'assets' | 'receivables' | 'payables'>('cash')

  const mine = <T extends { companyId: string | null }>(rows: T[]) => rows.filter(r => r.companyId === company.id)
  const accounts = mine(data.accounts)
  const cashAccounts = accounts.filter(a => !isLiabilityAccount(a))
  const debtAccounts = accounts.filter(isLiabilityAccount)
  const assets = mine(data.assets).filter(a => a.status !== 'sold')
  const receivables = mine(data.receivables).filter(r => r.outstanding > 0)
  const payables = mine(data.payables).filter(p => p.outstanding > 0)

  const accent = company.accent || 'var(--brand)'
  const card = { borderColor: 'var(--border)', background: 'var(--surface)' }

  const nothingTagged = accounts.length === 0 && assets.length === 0

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{company.name}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            What this company owns and owes. {company.gstin ? `GSTIN ${company.gstin}` : 'No GSTIN set'}
            {employeeCount > 0 && ` · ${employeeCount} employee${employeeCount === 1 ? '' : 's'}`}
          </p>
        </div>

        <select
          value={company.id}
          onChange={e => router.push(`/organization/companies/${e.target.value}`)}
          className="px-3 py-2 rounded-lg border text-sm font-semibold"
          style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Net position */}
      <div className="rounded-2xl p-5" style={{ background: accent }}>
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.75)' }}>Net position</p>
        <p className="text-[32px] font-extrabold tracking-tight tabular-nums text-white">{m(sheet.net)}</p>
        <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,.8)' }}>
          owns {m(sheet.assets + sheet.cash + sheet.receivables)} · owes {m(sheet.debt + sheet.payables)}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat icon={<Wallet className="w-4 h-4" />} label="Cash" value={m(sheet.cash)} sub={`${sheet.counts.accounts} account(s)`} />
        <Stat icon={<Gem className="w-4 h-4" />} label="Assets" value={m(sheet.assets)} sub={`${sheet.counts.assets} held`} />
        <Stat icon={<ArrowDownLeft className="w-4 h-4" />} label="Receivable" value={m(sheet.receivables)} sub={`${sheet.counts.receivables} invoice(s)`} tone="income" />
        <Stat icon={<CreditCard className="w-4 h-4" />} label="Debt" value={m(sheet.debt)} sub="cards & loans" tone="expense" />
        <Stat icon={<ArrowUpRight className="w-4 h-4" />} label="Payable" value={m(sheet.payables)} sub={`${sheet.counts.payables} bill(s)`} tone="expense" />
      </div>

      {nothingTagged && (
        <div className="rounded-2xl border p-4 flex items-start gap-2.5" style={{ borderColor: '#f0c36d', background: 'rgba(240,195,109,.10)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#b7791f' }} />
          <div>
            <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>No accounts or assets are tagged to this company yet</p>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Open an account or an asset and set its Company. Until then only invoices and bills — which already carry a company — show up here.
              {unassigned.net !== 0 && <> There&apos;s currently {m(unassigned.net)} sitting untagged.</>}
            </p>
          </div>
        </div>
      )}

      {/* Detail */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border)' }}>
        {([
          ['cash', `Cash & debt · ${accounts.length}`],
          ['assets', `Assets · ${assets.length}`],
          ['receivables', `Receivable · ${receivables.length}`],
          ['payables', `Payable · ${payables.length}`],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="relative whitespace-nowrap px-3.5 py-2.5 text-[13px] font-bold"
            style={{ color: tab === k ? 'var(--brand)' : 'var(--text-muted)' }}
          >
            {label}
            {tab === k && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--brand)' }} />}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border overflow-hidden" style={card}>
        {tab === 'cash' && (
          <List
            empty="No accounts tagged to this company."
            rows={[
              ...cashAccounts.map(a => ({ key: a.id, title: a.name, sub: a.type, value: m(a.balance), tone: undefined as 'expense' | undefined })),
              ...debtAccounts.map(a => ({ key: a.id, title: a.name, sub: `${a.type} · owed`, value: m(Math.abs(Math.min(0, a.balance))), tone: 'expense' as const })),
            ]}
          />
        )}
        {tab === 'assets' && (
          <List
            empty="No assets tagged to this company."
            rows={assets.map(a => ({ key: a.id, title: a.name, sub: a.category, value: m(a.value), tone: undefined }))}
          />
        )}
        {tab === 'receivables' && (
          <List
            empty="Nothing outstanding — every invoice is settled."
            rows={receivables.map(r => ({
              key: r.id, title: r.party, sub: `${r.number}${r.dueDate ? ` · due ${r.dueDate}` : ''}`,
              value: m(r.outstanding), tone: undefined,
            }))}
          />
        )}
        {tab === 'payables' && (
          <List
            empty="Nothing owed — every supplier bill is paid."
            rows={payables.map(p => ({
              key: p.id,
              // An inter-company bill is money owed to another of YOUR companies.
              // Saying so matters: at group level it cancels out against their
              // receivable, so it isn't debt to the outside world.
              title: p.interCompany ? `${p.party} (own company)` : p.party,
              sub: `${p.number}${p.dueDate ? ` · due ${p.dueDate}` : ''}${p.interCompany ? ' · inter-company' : ''}`,
              value: m(p.outstanding), tone: 'expense' as const,
            }))}
          />
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
        This view is per company. The net worth on your dashboard is unchanged — it still counts everything you own,
        personal and business together. <Link href="/assets" className="font-semibold" style={{ color: 'var(--brand)' }}>Assets</Link>
      </p>
    </div>
  )
}

function Stat({
  icon, label, value, sub, tone,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'income' | 'expense' }) {
  const color = tone === 'income' ? 'var(--income)' : tone === 'expense' ? 'var(--expense)' : 'var(--text)'
  return (
    <div className="rounded-2xl border p-3.5" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--text-muted)' }}>
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-extrabold tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{sub}</p>}
    </div>
  )
}

function List({
  rows, empty,
}: { rows: { key: string; title: string; sub?: string; value: string; tone?: 'expense' }[]; empty: string }) {
  if (!rows.length) {
    return <p className="px-4 py-8 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>{empty}</p>
  }
  return (
    <div>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
        >
          <div className="min-w-0">
            <p className="text-[13.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{r.title}</p>
            {r.sub && <p className="text-[11.5px] capitalize" style={{ color: 'var(--text-muted)' }}>{r.sub}</p>}
          </div>
          <p
            className="text-[14px] font-extrabold tabular-nums shrink-0 ml-3"
            style={{ color: r.tone === 'expense' ? 'var(--expense)' : 'var(--text)' }}
          >
            {r.value}
          </p>
        </div>
      ))}
    </div>
  )
}
