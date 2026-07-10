'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Check, AlertTriangle, X } from 'lucide-react'
import type { Asset, MarketRate, AssetRateDefault } from '@/lib/assets/types'
import { valueAsset, assetFx, inr } from '@/lib/assets/valuation'
import { deriveBooks, ledgerEntries, type BooksAccount, type BooksTxn, type BooksCategory, type LedgerGroup } from '@/lib/books/derive'

interface Props {
  accounts: BooksAccount[]
  transactions: BooksTxn[]
  categories: BooksCategory[]
  assets: Asset[]
  marketRates: MarketRate[]
  defaults: AssetRateDefault[]
}

type Period = 'all' | 'fy' | 'month'

function periodRange(p: Period): { from?: string; to?: string; label: string } {
  const now = new Date()
  if (p === 'fy') {
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
    return { from: `${y}-04-01`, to: `${y + 1}-03-31`, label: `FY ${y}–${String(y + 1).slice(-2)}` }
  }
  if (p === 'month') {
    const y = now.getFullYear(), m = now.getMonth()
    const last = new Date(y, m + 1, 0).getDate()
    const mm = String(m + 1).padStart(2, '0')
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}`, label: 'This month' }
  }
  return { label: 'All time' }
}

const GROUP_LABEL: Record<LedgerGroup, string> = {
  asset: 'Assets', liability: 'Liabilities', equity: 'Equity', income: 'Income', expense: 'Expenses',
}

export default function BooksClient({ accounts, transactions, categories, assets, marketRates, defaults }: Props) {
  const [period, setPeriod] = useState<Period>('all')
  const [fxRates, setFxRates] = useState<Record<string, number>>({})
  const [drill, setDrill] = useState<{ key: string; name: string } | null>(null)

  const needsFx = useMemo(() => assets.some(a => { const c = (a.details?.currency as string | undefined)?.toUpperCase(); return c && c !== 'INR' }), [assets])
  useEffect(() => {
    if (!needsFx) return
    let live = true
    fetch('/api/exchange-rates').then(r => r.json()).then(j => { if (live && j?.rates) setFxRates(j.rates) }).catch(() => {})
    return () => { live = false }
  }, [needsFx])

  const assetsCurrentValue = useMemo(
    () => assets.filter(a => a.include_in_net_worth && a.status !== 'sold')
      .reduce((s, a) => s + valueAsset(a, marketRates, defaults, assetFx(a, fxRates)).current, 0),
    [assets, marketRates, defaults, fxRates],
  )

  const { from, to, label } = periodRange(period)
  const books = useMemo(() => deriveBooks({ accounts, transactions, categories, assetsCurrentValue, from, to }),
    [accounts, transactions, categories, assetsCurrentValue, from, to])

  const nw = books.netWorth
  const groups: LedgerGroup[] = ['asset', 'liability', 'equity', 'income', 'expense']

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Books</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>A read-only double-entry view derived from your existing data. Nothing here changes your transactions, billing, payroll or accounts.</p>
      </div>

      {/* Net worth */}
      <div className="rounded-2xl px-6 py-5 flex flex-wrap items-center gap-y-4" style={{ background: 'linear-gradient(135deg, var(--brand-deep, #14432D), color-mix(in srgb, var(--brand-deep, #14432D) 72%, #000))' }}>
        <div style={{ flex: '1.4 1 220px' }}>
          <p className="text-[11px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.6)' }}>TOTAL NET WORTH</p>
          <p className="text-[34px] font-extrabold leading-none mt-1.5" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{inr(nw.net)}</p>
          <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,.55)' }}>Accounts + assets − what you owe</p>
        </div>
        <div className="hidden sm:block" style={{ width: 1, height: 52, background: 'rgba(255,255,255,.15)' }} />
        <div style={{ flex: '1 1 120px', paddingLeft: 22 }}>
          <p className="text-[10px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.55)' }}>ACCOUNTS</p>
          <p className="text-xl font-extrabold mt-0.5" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{inr(nw.accountAssets)}</p>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <p className="text-[10px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.55)' }}>ASSETS</p>
          <p className="text-xl font-extrabold mt-0.5" style={{ color: '#9DE8B8', fontVariantNumeric: 'tabular-nums' }}>{inr(nw.assetHoldings)}</p>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <p className="text-[10px] font-bold tracking-[.1em]" style={{ color: 'rgba(255,255,255,.55)' }}>LIABILITIES</p>
          <p className="text-xl font-extrabold mt-0.5" style={{ color: '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>{inr(nw.liabilities)}</p>
        </div>
      </div>

      {/* Balance sheet */}
      {(() => {
        const bs = books.balanceSheet
        const Row = ({ label, value, bold, muted }: { label: string; value: number; bold?: boolean; muted?: boolean }) => (
          <div className="flex items-center justify-between px-5 py-2" style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
            <span className={bold ? 'font-extrabold' : ''} style={{ color: muted ? 'var(--text-muted)' : 'var(--text)', fontSize: bold ? 14 : 13, paddingLeft: muted ? 12 : 0 }}>{label}</span>
            <span className="tabular-nums" style={{ color: muted ? 'var(--text-muted)' : 'var(--text)', fontWeight: bold ? 800 : 500, fontSize: bold ? 14 : 13 }}>{inr(value)}</span>
          </div>
        )
        return (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}><h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Balance sheet</h2></div>
              <Row label="Cash & accounts" value={bs.assetsFromAccounts} muted />
              <Row label="Investments & assets (market)" value={bs.assetHoldings} muted />
              <Row label="Total assets" value={bs.assets} bold />
              <div style={{ height: 8 }} />
              <Row label="Liabilities (cards, loans)" value={bs.liabilities} bold />
              <div style={{ height: 8 }} />
              <Row label="Opening balance equity" value={bs.openingEquity} muted />
              <Row label="Retained earnings" value={bs.retained} muted />
              <Row label="Asset holdings reserve" value={bs.assetHoldings} muted />
              <Row label="Total equity" value={bs.equity} bold />
            </div>
            <div className="rounded-2xl border p-5 flex flex-col justify-center" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
              <p className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>The accounting equation</p>
              <div className="flex items-baseline gap-2 flex-wrap text-[15px] font-bold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                <span>{inr(bs.assets)}</span><span style={{ color: 'var(--text-faint)' }}>=</span>
                <span>{inr(bs.liabilities)}</span><span style={{ color: 'var(--text-faint)' }}>+</span>
                <span>{inr(bs.equity)}</span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>Assets = Liabilities + Equity</p>
              <div className="mt-3">
                {bs.balanced
                  ? <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: 'var(--income)', background: 'color-mix(in srgb, var(--income) 12%, transparent)' }}><Check className="w-3.5 h-3.5" /> Balanced</span>
                  : <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: 'var(--expense)', background: 'color-mix(in srgb, var(--expense) 12%, transparent)' }}><AlertTriangle className="w-3.5 h-3.5" /> Off by {inr(Math.abs(bs.assets - bs.liabilities - bs.equity))}</span>}
              </div>
              <p className="text-[11px] mt-3" style={{ color: 'var(--text-faint)' }}>All active accounts (the accounting view). The net-worth figure above can differ if you excluded any account from net worth.</p>
            </div>
          </div>
        )
      })()}

      {/* Trial balance */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Trial balance</h2>
          {books.trial.balanced
            ? <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: 'var(--income)', background: 'color-mix(in srgb, var(--income) 12%, transparent)' }}><Check className="w-3.5 h-3.5" /> In balance</span>
            : <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ color: 'var(--expense)', background: 'color-mix(in srgb, var(--expense) 12%, transparent)' }}><AlertTriangle className="w-3.5 h-3.5" /> Off by {inr(Math.abs(books.trial.totalDebit - books.trial.totalCredit))}</span>}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Account</th>
              <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Debit</th>
              <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const rows = books.trial.rows.filter(r => r.group === g)
              if (rows.length === 0) return null
              return (
                <Fragment key={g}>
                  <tr><td colSpan={3} className="px-5 pt-3 pb-1 text-[10.5px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{GROUP_LABEL[g]}</td></tr>
                  {rows.map(r => (
                    <tr key={r.key} className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer" style={{ borderTop: '1px solid var(--border-2, var(--border))' }} onClick={() => setDrill({ key: r.key, name: r.name })}>
                      <td className="px-5 py-2"><span className="hover:underline" style={{ color: 'var(--text)' }}>{r.name}</span></td>
                      <td className="px-5 py-2 text-right tabular-nums" style={{ color: r.debit ? 'var(--text)' : 'var(--text-faint)' }}>{r.debit ? inr(r.debit) : '—'}</td>
                      <td className="px-5 py-2 text-right tabular-nums" style={{ color: r.credit ? 'var(--text)' : 'var(--text-faint)' }}>{r.credit ? inr(r.credit) : '—'}</td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
              <td className="px-5 py-2.5 font-extrabold" style={{ color: 'var(--text)' }}>Total</td>
              <td className="px-5 py-2.5 text-right font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{inr(books.trial.totalDebit)}</td>
              <td className="px-5 py-2.5 text-right font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{inr(books.trial.totalCredit)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* P&L */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Profit &amp; loss <span className="font-medium text-[12px]" style={{ color: 'var(--text-faint)' }}>· {label}</span></h2>
          <div className="inline-flex gap-0.5 p-1 rounded-lg" style={{ background: 'var(--surface-2)' }}>
            {(['all', 'fy', 'month'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className="text-[11.5px] font-bold px-2.5 py-1 rounded-md" style={period === p ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' } : { color: 'var(--text-muted)' }}>{p === 'all' ? 'All time' : p === 'fy' ? 'This FY' : 'This month'}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ borderColor: 'var(--border)' }}>
          <div className="px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Income</p><p className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--income)' }}>{inr(books.pnl.income)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Expenses</p><p className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--expense)' }}>{inr(books.pnl.expense)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Net</p><p className="text-xl font-extrabold tabular-nums" style={{ color: books.pnl.net >= 0 ? 'var(--income)' : 'var(--expense)' }}>{books.pnl.net >= 0 ? '' : '−'}{inr(Math.abs(books.pnl.net))}</p></div>
        </div>
        {books.pnl.byCategory.length > 0 && (
          <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-faint)' }}>By category</p>
            <div className="space-y-1">
              {books.pnl.byCategory.slice(0, 12).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-[13px]">
                  <span style={{ color: 'var(--text)' }}>{c.name}</span>
                  <span className="tabular-nums font-semibold" style={{ color: c.kind === 'income' ? 'var(--income)' : 'var(--text-muted)' }}>{c.kind === 'income' ? '+' : ''}{inr(c.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Derived live from your accounts, transactions and categories — no separate bookkeeping to maintain. Opening balances post to Opening balance equity; the asset module (gold, property…) is added on top of the cash trial balance in Total net worth.</p>

      {drill && (() => {
        const entries = ledgerEntries({ accounts, transactions, categories }, drill.key)
        const dr = entries.reduce((s, e) => s + e.debit, 0)
        const cr = entries.reduce((s, e) => s + e.credit, 0)
        const fmtD = (d: string) => { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) }
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) setDrill(null) }}>
            <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[86vh]" style={{ background: 'var(--surface)' }}>
              <div className="flex items-center justify-between px-5 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="font-extrabold" style={{ color: 'var(--text)' }}>{drill.name}</p>
                  <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{entries.length} line{entries.length !== 1 ? 's' : ''} behind this balance</p>
                </div>
                <button onClick={() => setDrill(null)} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
              </div>
              <div className="overflow-y-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ background: 'var(--surface-2)' }}>
                    <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Date</th>
                    <th className="px-5 py-2 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Detail</th>
                    <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Debit</th>
                    <th className="px-5 py-2 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Credit</th>
                  </tr></thead>
                  <tbody>
                    {entries.length === 0 && <tr><td colSpan={4} className="px-5 py-8 text-center" style={{ color: 'var(--text-faint)' }}>No lines.</td></tr>}
                    {entries.map((e, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
                        <td className="px-5 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtD(e.date)}</td>
                        <td className="px-5 py-2" style={{ color: 'var(--text)' }}>{e.name}</td>
                        <td className="px-5 py-2 text-right tabular-nums" style={{ color: e.debit ? 'var(--text)' : 'var(--text-faint)' }}>{e.debit ? inr(e.debit) : '—'}</td>
                        <td className="px-5 py-2 text-right tabular-nums" style={{ color: e.credit ? 'var(--text)' : 'var(--text-faint)' }}>{e.credit ? inr(e.credit) : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                      <td className="px-5 py-2.5 font-extrabold" style={{ color: 'var(--text)' }} colSpan={2}>Total</td>
                      <td className="px-5 py-2.5 text-right font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{inr(dr)}</td>
                      <td className="px-5 py-2.5 text-right font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{inr(cr)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
