'use client'

// Investment Lab — Portfolio. Every position the Lab holds, plus the cash it has
// chosen not to deploy (cash is a position here, not a gap). Clicking a row
// opens the stored thesis for that name.

import { useState } from 'react'
import { ChevronRight, Wallet } from 'lucide-react'
import {
  Card, SectionTitle, Empty, PriceAge, inr, inr2, pct, toneOf, fmtDate,
  type LabOverview, type LabPositionView,
} from './labShared'
import ThesisPanel from './ThesisPanel'

export default function LabPortfolioTab({ data }: { data: LabOverview }) {
  const [open, setOpen] = useState<LabPositionView | null>(null)
  const held = data.positions.filter(p => p.quantity > 0)

  if (!held.length) {
    return (
      <div className="space-y-4">
        <CashCard data={data} />
        <Empty
          title="Nothing held yet"
          body="The Lab is holding all of its virtual capital in cash. Cash is a legitimate position — it will only buy when something clears its own bar. Run an Investment Cycle to let it look." />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CashCard data={data} />

      <Card className="p-0 overflow-hidden">
        <div className="px-4 pt-4"><SectionTitle>Holdings</SectionTitle></div>

        {/* Desktop / tablet table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-faint)' }}>
                <th className="text-left font-bold px-4 pb-2">Company</th>
                <th className="text-right font-bold px-3 pb-2">Qty</th>
                <th className="text-right font-bold px-3 pb-2">Avg cost</th>
                <th className="text-right font-bold px-3 pb-2">Price</th>
                <th className="text-right font-bold px-3 pb-2">Value</th>
                <th className="text-right font-bold px-3 pb-2">Weight</th>
                <th className="text-right font-bold px-3 pb-2">P&L</th>
                <th className="px-3 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {held.map(p => (
                <tr key={`${p.symbol}:${p.exchange}`} onClick={() => setOpen(p)}
                  className="cursor-pointer transition-colors hover:bg-[color:var(--surface-2)]"
                  style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-3">
                    <p className="font-extrabold" style={{ color: 'var(--text)' }}>{p.symbol}</p>
                    <p className="text-[11px] truncate max-w-[200px]" style={{ color: 'var(--text-faint)' }}>
                      {p.companyName || p.sector || p.exchange}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{p.quantity}</td>
                  <td className="px-3 py-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{inr2(p.avgCost)}</td>
                  <td className="px-3 py-3 text-right">
                    <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{inr2(p.price)}</div>
                    <PriceAge hours={p.priceAgeHours} stale={p.stale} />
                  </td>
                  <td className="px-3 py-3 text-right font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{inr(p.marketValue)}</td>
                  <td className="px-3 py-3 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                    {p.weightPct != null ? `${p.weightPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: toneOf(p.unrealizedPnl) }}>
                    <div>{inr(p.unrealizedPnl)}</div>
                    <div className="text-[11px]">{pct(p.returnPct)}</div>
                  </td>
                  <td className="px-3 py-3 text-right"><ChevronRight className="w-4 h-4 inline" style={{ color: 'var(--text-faint)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {held.map(p => (
            <button key={`${p.symbol}:${p.exchange}`} onClick={() => setOpen(p)} className="w-full text-left px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-extrabold" style={{ color: 'var(--text)' }}>{p.symbol}</p>
                  <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{p.companyName || p.exchange}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13.5px] font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr(p.marketValue)}</p>
                  <p className="text-[11px] font-bold" style={{ color: toneOf(p.unrealizedPnl) }}>{inr(p.unrealizedPnl)} · {pct(p.returnPct)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {p.quantity} @ {inr2(p.avgCost)} · {p.weightPct != null ? `${p.weightPct.toFixed(1)}%` : '—'}
                </span>
                <PriceAge hours={p.priceAgeHours} stale={p.stale} />
              </div>
            </button>
          ))}
        </div>
      </Card>

      {open && (
        <ThesisPanel
          symbol={open.symbol}
          exchange={open.exchange}
          companyName={open.companyName}
          position={open}
          onClose={() => setOpen(null)} />
      )}
    </div>
  )
}

function CashCard({ data }: { data: LabOverview }) {
  const t = data.totals
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Wallet className="w-4 h-4" style={{ color: 'var(--text-faint)' }} />
          <div>
            <p className="text-[13px] font-extrabold" style={{ color: 'var(--text)' }}>Uninvested cash</p>
            <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              Cash is a position. The Lab is not required to deploy it.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{inr(t.cash)}</p>
          <p className="text-[11.5px] font-bold" style={{ color: 'var(--text-faint)' }}>
            {t.cashPct != null ? `${t.cashPct.toFixed(1)}% of portfolio` : '—'}
            {data.lab ? ` · floor ${data.lab.constraints.min_cash_pct}%` : ''}
          </p>
        </div>
      </div>
      {data.status.lastMark && (
        <p className="text-[11px] mt-3 pt-3" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
          Values are from the last market mark on {fmtDate(data.status.lastMark.as_of)}. Opening this page does not fetch fresh prices — use Run Research Update for that.
        </p>
      )}
    </Card>
  )
}
