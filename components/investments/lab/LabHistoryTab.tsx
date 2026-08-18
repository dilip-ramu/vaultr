'use client'

// Investment Lab — Decisions, Trades and Income.
//
// These three views are the Lab's audit trail. Rows are read-only by
// construction: the database blocks UPDATE on lab_decisions, lab_trades,
// lab_dividends and lab_corporate_actions for every role, so what is displayed
// is what was recorded at the time.

import { useEffect, useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { ActionChip, ConfidenceBar } from '../shared'
import {
  Card, SectionTitle, Empty, Row, KindChip, inr, inr2, pct, toneOf, fmtDateTime, fmtDate, getJSON,
  type DecisionRow, type TradeRow, type DividendRow, type CorporateActionRow,
} from './labShared'
import type { RecAction } from '@/lib/investments/types'

export type HistoryView = 'decisions' | 'trades' | 'income'

export default function LabHistoryTab({ view }: { view: HistoryView }) {
  if (view === 'decisions') return <Decisions />
  if (view === 'trades') return <Trades />
  return <Income />
}

function useFeed<T>(url: string, pick: (d: unknown) => T) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getJSON<unknown>(url)
      .then(d => { if (alive) setData(pick(d)) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : 'Could not load') })
    return () => { alive = false }
  }, [url])   // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error }
}

function Loading() {
  return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-faint)' }} /></div>
}

// ── Decisions ───────────────────────────────────────────────────────────────

function Decisions() {
  const { data, error } = useFeed<DecisionRow[]>('/api/investments/lab/decisions', d => (d as { decisions: DecisionRow[] }).decisions)
  const [openId, setOpenId] = useState<string | null>(null)

  if (error) return <Empty title="Could not load decisions" body={error} />
  if (!data) return <Loading />
  if (!data.length) return <Empty title="No decisions recorded" body="Every action the Lab takes — and every one it declines to take — is written here permanently. Run an Investment Cycle to start the record." />

  return (
    <div className="space-y-2">
      <p className="text-[11.5px] px-1" style={{ color: 'var(--text-faint)' }}>
        {data.length} {data.length === 1 ? 'entry' : 'entries'}, newest first. Nothing here can be edited after the fact.
      </p>
      {data.map(d => (
        <Card key={d.id} className="overflow-hidden">
          <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <div className="shrink-0"><KindChip kind={d.kind} /></div>
            <span className="text-[13px] font-extrabold w-24 shrink-0 truncate" style={{ color: 'var(--text)' }}>
              {d.symbol ?? '—'}
            </span>
            <span className="text-[12px] flex-1 truncate hidden sm:block" style={{ color: 'var(--text-muted)' }}>
              {d.reason || d.base_case || ''}
            </span>
            {d.quantity != null && (
              <span className="text-[11.5px] shrink-0 hidden md:block" style={{ color: 'var(--text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {d.quantity} @ {inr2(d.price)}
              </span>
            )}
            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-faint)' }}>{fmtDateTime(d.ts)}</span>
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${openId === d.id ? 'rotate-180' : ''}`} style={{ color: 'var(--text-faint)' }} />
          </button>

          {openId === d.id && (
            <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="grid sm:grid-cols-2 gap-x-8 pt-3">
                <div>
                  <Row label="Recorded" value={fmtDateTime(d.ts)} />
                  <Row label="Action" value={d.action ? <ActionChip action={d.action as RecAction} /> : 'no verdict reached'} />
                  <Row label="Quantity" value={d.quantity ?? '—'} />
                  <Row label="Price" value={inr2(d.price)} />
                  <Row label="Amount" value={d.capital_deployed != null ? inr(d.capital_deployed) : '—'} />
                </div>
                <div>
                  <Row label="Portfolio weight" value={d.portfolio_weight != null ? `${d.portfolio_weight.toFixed(1)}%` : '—'} />
                  <Row label="Realised P&L" value={d.realized_pnl != null ? inr(d.realized_pnl) : '—'} tone={toneOf(d.realized_pnl)} />
                  <Row label="Market regime" value={d.market_regime || '—'} />
                  <Row label="Model version" value={d.model_version} />
                  <Row label="Thesis broken" value={d.thesis_invalidated == null ? '—' : d.thesis_invalidated ? 'yes' : 'no'} />
                </div>
              </div>

              {(d.ai_confidence != null || d.data_confidence != null) && (
                <div className="grid grid-cols-2 gap-4">
                  <ConfidenceBar value={d.ai_confidence} label="AI confidence" />
                  <ConfidenceBar value={d.data_confidence} label="Data confidence" />
                </div>
              )}

              {d.reason && (
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>Reason</p>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text)' }}>{d.reason}</p>
                </div>
              )}
              {d.base_case && (
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>Thesis at the time</p>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{d.base_case}</p>
                </div>
              )}
              {d.invalidation?.length > 0 && (
                <div>
                  <p className="text-[11px] font-extrabold uppercase tracking-widest mb-1" style={{ color: 'var(--text-faint)' }}>Would break the thesis</p>
                  <ul className="space-y-1">
                    {d.invalidation.map((x, i) => (
                      <li key={i} className="text-[12px] flex gap-2" style={{ color: 'var(--text-muted)' }}><span>•</span><span>{x}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {d.snapshot && Object.keys(d.snapshot).length > 0 && (
                <details>
                  <summary className="text-[11.5px] font-bold cursor-pointer" style={{ color: 'var(--text-faint)' }}>
                    Inputs available at decision time
                  </summary>
                  <pre className="text-[10.5px] mt-2 p-3 rounded-lg overflow-x-auto"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                    {JSON.stringify(d.snapshot, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}

// ── Trades ──────────────────────────────────────────────────────────────────

function Trades() {
  const { data, error } = useFeed<TradeRow[]>('/api/investments/lab/trades', d => (d as { trades: TradeRow[] }).trades)

  if (error) return <Empty title="Could not load trades" body={error} />
  if (!data) return <Loading />
  if (!data.length) return <Empty title="No trades yet" body="Simulated trades appear here once the Lab acts. Every trade is paper — nothing in Inex submits an order to a broker." />

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-4 pt-4">
        <SectionTitle right={<span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ color: 'var(--amber)', background: 'color-mix(in srgb, var(--amber) 14%, transparent)' }}>simulated</span>}>
          Trade history
        </SectionTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--text-faint)' }}>
              <th className="text-left font-bold px-4 pb-2">When</th>
              <th className="text-left font-bold px-3 pb-2">Side</th>
              <th className="text-left font-bold px-3 pb-2">Security</th>
              <th className="text-right font-bold px-3 pb-2">Qty</th>
              <th className="text-right font-bold px-3 pb-2">Price</th>
              <th className="text-right font-bold px-3 pb-2">Gross</th>
              <th className="text-right font-bold px-3 pb-2">Costs</th>
              <th className="text-right font-bold px-3 pb-2">Net</th>
              <th className="text-right font-bold px-4 pb-2">Realised</th>
            </tr>
          </thead>
          <tbody>
            {data.map(t => {
              const net = t.side === 'buy' ? t.gross_amount + t.costs_total : t.gross_amount - t.costs_total
              return (
                <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDateTime(t.ts)}</td>
                  <td className="px-3 py-2.5 font-extrabold" style={{ color: t.side === 'buy' ? 'var(--income)' : 'var(--expense)' }}>
                    {t.side === 'buy' ? 'Buy' : 'Sell'}
                  </td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--text)' }}>{t.symbol}<span className="text-[10px] ml-1" style={{ color: 'var(--text-faint)' }}>{t.exchange}</span></td>
                  <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{t.quantity}</td>
                  <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{inr2(t.price)}</td>
                  <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{inr(t.gross_amount)}</td>
                  <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-faint)' }}>{inr2(t.costs_total)}</td>
                  <td className="px-3 py-2.5 text-right font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{inr(net)}</td>
                  <td className="px-4 py-2.5 text-right font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: toneOf(t.realized_pnl) }}>
                    {t.realized_pnl != null ? inr(t.realized_pnl) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] px-4 py-3" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
        Execution prices include slippage; costs cover STT, exchange, SEBI, stamp duty and GST on the delivery-equity model.
      </p>
    </Card>
  )
}

// ── Dividends and corporate actions ─────────────────────────────────────────

interface IncomePayload { dividends: DividendRow[]; corporateActions: CorporateActionRow[]; totalNet: number }

function Income() {
  const { data, error } = useFeed<IncomePayload>('/api/investments/lab/income', d => d as IncomePayload)

  if (error) return <Empty title="Could not load income" body={error} />
  if (!data) return <Loading />

  const noneAtAll = !data.dividends.length && !data.corporateActions.length
  if (noneAtAll) {
    return <Empty title="No dividends or corporate actions yet"
      body="When a holding pays a dividend the cash is credited to the Lab, and splits and bonus issues adjust the position. Both are detected during a Research Update or an Investment Cycle." />
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-extrabold" style={{ color: 'var(--text)' }}>Dividends received</p>
            <p className="text-[11.5px] mt-0.5 max-w-[420px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              Credited to virtual cash on receipt, so this is already inside portfolio value. It is part of total return, not on top of it.
            </p>
          </div>
          <p className="text-[20px] font-extrabold shrink-0" style={{ color: data.totalNet > 0 ? 'var(--income)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {inr(data.totalNet)}
          </p>
        </div>
      </Card>

      {data.dividends.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 pt-4"><SectionTitle>Payments</SectionTitle></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--text-faint)' }}>
                  <th className="text-left font-bold px-4 pb-2">Company</th>
                  <th className="text-right font-bold px-3 pb-2">Per share</th>
                  <th className="text-right font-bold px-3 pb-2">Eligible shares</th>
                  <th className="text-right font-bold px-3 pb-2">Gross</th>
                  <th className="text-right font-bold px-3 pb-2">Tax</th>
                  <th className="text-right font-bold px-3 pb-2">Net</th>
                  <th className="text-right font-bold px-3 pb-2">Ex-date</th>
                  <th className="text-right font-bold px-4 pb-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.dividends.map(d => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-2.5 font-bold" style={{ color: 'var(--text)' }}>{d.symbol}</td>
                    <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{inr2(d.dividend_per_share)}</td>
                    <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{d.shares_on_record}</td>
                    <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{inr2(d.gross_dividend)}</td>
                    <td className="px-3 py-2.5 text-right" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-faint)' }}>{(d.tax_pct * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2.5 text-right font-bold" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--income)' }}>{inr2(d.net_dividend)}</td>
                    <td className="px-3 py-2.5 text-right" style={{ color: 'var(--text-faint)' }}>{fmtDate(d.ex_date)}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--text-faint)' }}>{fmtDate(d.payment_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] px-4 py-3" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
            Eligible shares are reconstructed from the trade log as at the day before the ex-date. The Lab models transaction costs but not income tax, so the withholding assumption is 0%.
          </p>
        </Card>
      )}

      {data.corporateActions.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 pt-4"><SectionTitle>Corporate actions</SectionTitle></div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {data.corporateActions.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                    {a.symbol} · <span className="capitalize">{a.type}</span>{a.ratio ? ` ${a.ratio}` : ''}
                  </p>
                  {a.details && <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{a.details}</p>}
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>ex-date {fmtDate(a.ex_date)}</p>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    color: a.status === 'applied' ? 'var(--income)' : 'var(--amber)',
                    background: `color-mix(in srgb, ${a.status === 'applied' ? 'var(--income)' : 'var(--amber)'} 14%, transparent)`,
                  }}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] px-4 py-3" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border)' }}>
            Splits and bonus issues are applied to quantity and cost basis. Rights, buybacks, mergers and demergers are flagged for review rather than modelled — a wrong adjustment would be worse than a visible gap.
          </p>
        </Card>
      )}
    </div>
  )
}
