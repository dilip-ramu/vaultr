'use client'

// Investments — Overview. The dashboard for the module: portfolio at a glance,
// the current market regime and what it means for risk-sizing, allocation and
// concentration, open alerts, and every holding with its AI rating and thesis
// status. Reuses the app's tokens/cards; mutations round-trip via router.refresh.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RefreshCw, Gauge, Download, TrendingUp, AlertTriangle, ChevronRight } from 'lucide-react'
import { useToast } from '@/components/shared/Toast'
import {
  Card, RegimePill, ActionChip, ThesisChip, inr, pct, postJSON,
  type HoldingRow, type RegimeRow, type AlertRow, type PortfolioSummary,
} from './shared'

interface Props {
  holdings: HoldingRow[]
  summary: PortfolioSummary
  regime: RegimeRow | null
  alerts: AlertRow[]
}

export default function InvestmentsClient({ holdings, summary, regime, alerts }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key)
    try { showToast(await fn(), 'success'); router.refresh() }
    catch (e) { showToast(e instanceof Error ? e.message : 'Something went wrong', 'error') }
    finally { setBusy(null) }
  }

  const refreshPrices = () => run('prices', async () => {
    const r = await postJSON<{ updated: number; failed: string[] }>('/api/investments/holdings', { op: 'refresh' })
    return r.failed?.length ? `Priced ${r.updated}. Couldn't price: ${r.failed.join(', ')}` : `Priced ${r.updated} holding${r.updated === 1 ? '' : 's'}`
  })
  const assessRegime = () => run('regime', async () => {
    await postJSON('/api/investments/regime'); return 'Market regime reassessed'
  })
  const seed = () => run('seed', async () => {
    const r = await postJSON<{ seeded: number; message?: string }>('/api/investments/holdings', { op: 'seed' })
    return r.seeded ? `Imported ${r.seeded} holding${r.seeded === 1 ? '' : 's'} from Assets` : (r.message ?? 'Nothing to import')
  })

  const sectors = Object.entries(summary.sectorAlloc).sort((a, b) => b[1] - a[1])

  return (
    <div className="px-4 md:px-8 py-5 max-w-[1200px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold" style={{ color: 'var(--text)' }}>Investments</h1>
          <p className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>AI research desk for your Indian equity portfolio — you approve every decision.</p>
        </div>
        <div className="flex items-center gap-2">
          <Btn icon={Download} label="Import from Assets" onClick={seed} busy={busy === 'seed'} />
          <Btn icon={Gauge} label="Assess regime" onClick={assessRegime} busy={busy === 'regime'} />
          <Btn icon={RefreshCw} label="Refresh prices" onClick={refreshPrices} busy={busy === 'prices'} primary />
        </div>
      </div>

      {/* Regime banner */}
      <Card className="p-4 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Market regime</span>
            {regime ? <RegimePill state={regime.state} /> : <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>not assessed yet</span>}
          </div>
          {regime && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{regime.as_of}</span>}
        </div>
        {regime?.summary && <p className="text-[13px] leading-relaxed mt-2" style={{ color: 'var(--text)' }}>{regime.summary}</p>}
        {regime && Object.keys(regime.drivers || {}).length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-1.5 mt-3">
            {Object.entries(regime.drivers).slice(0, 12).map(([k, v]) => (
              <div key={k} className="text-[12px]">
                <span className="font-bold capitalize" style={{ color: 'var(--text-muted)' }}>{k.replace(/_/g, ' ')}: </span>
                <span style={{ color: 'var(--text-faint)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}
        {!regime && <p className="text-[12px] mt-1" style={{ color: 'var(--text-faint)' }}>The regime sizes risk and selectivity (it is not a market-timing switch). Tap “Assess regime”.</p>}
      </Card>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Portfolio value" value={inr(summary.totalValue)} />
        <Stat label="Invested" value={inr(summary.totalInvested)} />
        <Stat label="Unrealised P&L" value={inr(summary.gain)} sub={pct(summary.gainPct)} tone={summary.gain >= 0 ? 'up' : 'down'} />
        <Stat label="Holdings" value={String(holdings.length)} sub={summary.unpriced.length ? `${summary.unpriced.length} unpriced` : undefined} />
      </div>

      {summary.unpriced.length > 0 && (
        <p className="text-[12px] mb-4" style={{ color: 'var(--amber)' }}>
          Not included in value (no price): {summary.unpriced.join(', ')}. Refresh prices, or the market may be closed.
        </p>
      )}

      {/* Allocation + concentration */}
      {sectors.length > 0 && (
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Sector allocation</p>
            <p className="text-[11px]" style={{ color: summary.concentration.maxSectorPct >= 30 ? 'var(--expense)' : 'var(--text-faint)' }}>
              Top sector {summary.concentration.maxSector} · {summary.concentration.maxSectorPct.toFixed(0)}%
              {summary.concentration.maxSectorPct >= 30 ? ' · concentrated' : ''}
            </p>
          </div>
          <div className="space-y-2">
            {sectors.map(([sec, p]) => (
              <div key={sec} className="flex items-center gap-3">
                <span className="text-[12px] w-32 shrink-0 truncate" style={{ color: 'var(--text-muted)' }}>{sec}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                  <div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 30 ? 'var(--expense)' : 'var(--brand)' }} />
                </div>
                <span className="text-[12px] font-bold w-12 text-right" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{p.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="p-4 mb-4">
          <p className="text-[11px] font-extrabold uppercase tracking-widest mb-2" style={{ color: 'var(--text-faint)' }}>Alerts</p>
          <div className="space-y-2">
            {alerts.slice(0, 8).map(a => (
              <div key={a.id} className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: a.severity === 'critical' ? 'var(--expense)' : 'var(--amber)' }} />
                <div><p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{a.title}</p>{a.body && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{a.body}</p>}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Holdings */}
      {holdings.length === 0 ? (
        <Card className="p-8 text-center">
          <TrendingUp className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
          <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>No holdings yet</p>
          <p className="text-[12.5px] mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>Import your existing stock holdings from Assets, or add one on the Holdings tab.</p>
          <div className="flex items-center justify-center gap-2">
            <Btn icon={Download} label="Import from Assets" onClick={seed} busy={busy === 'seed'} primary />
            <Link href="/investments/holdings" className="text-[12.5px] font-bold px-3 py-2 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Add manually</Link>
          </div>
        </Card>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-extrabold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Holdings</p>
            <Link href="/investments/holdings" className="text-[12px] font-bold flex items-center gap-0.5" style={{ color: 'var(--brand)' }}>Manage <ChevronRight className="w-3.5 h-3.5" /></Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {holdings.map(h => {
              const line = summary.lines.find(l => l.symbol === h.symbol.toUpperCase())
              const gain = h.last_price != null ? (h.last_price - h.avg_cost) * h.quantity : null
              return (
                <Link key={h.id} href="/investments/holdings" className="block">
                  <Card className="p-3.5 h-full tap-scale">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-extrabold truncate" style={{ color: 'var(--text)' }}>{h.symbol}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{h.company_name || h.sector || h.exchange}</p>
                      </div>
                      {h.ai_rating ? <ActionChip action={h.ai_rating} /> : <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-faint)' }}>Not analysed</span>}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div>
                        <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{line?.value != null ? inr(line.value) : '—'}</p>
                        <p className="text-[11px] font-bold" style={{ color: gain == null ? 'var(--text-faint)' : gain >= 0 ? 'var(--income)' : 'var(--expense)' }}>{gain == null ? 'no price' : inr(gain)}{line?.weightPct ? ` · ${line.weightPct.toFixed(1)}%` : ''}</p>
                      </div>
                      <ThesisChip status={h.thesis_status} />
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Btn({ icon: Icon, label, onClick, busy, primary }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; busy?: boolean; primary?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-lg transition disabled:opacity-50"
      style={primary
        ? { background: 'var(--brand)', color: '#fff' }
        : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
      <Icon className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> {label}
    </button>
  )
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p className="text-[19px] font-extrabold mt-1" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p className="text-[11px] font-bold" style={{ color: tone === 'up' ? 'var(--income)' : tone === 'down' ? 'var(--expense)' : 'var(--text-faint)' }}>{sub}</p>}
    </div>
  )
}
