// Detect and apply corporate actions for the Lab's holdings (correctness pass,
// item 3). Previously this module existed but NOTHING imported it, so dividends
// were never credited and a split would silently halve NAV — the exchange quote
// adjusts, our share count did not. It is now called from the Lab lifecycle
// (cycle.ts, mark phase) and from the Research Update.
//
// Guarantees:
//   • IDEMPOTENT — every event is inserted under a unique key with
//     ignoreDuplicates, and its effect (cash credit / quantity adjustment) is
//     applied ONLY when the insert actually created the row. Running the sync
//     twice cannot pay a dividend twice.
//   • IMMUTABLE — each applied action leaves a permanent row; nothing is edited.
//   • ELIGIBILITY FROM HISTORY — dividend shares come from replaying the trade
//     log to the day before the ex-date (lib/investments/lab/eligibility.ts),
//     not from the current holding.
//   • SPLITS/BONUS ADJUST THE CARRIED PRICE too, so the next mark values the
//     new share count at the new price scale.
//
// Documented assumptions:
//   • DIVIDEND_TAX_PCT = 0. The Lab models transaction costs, not income or
//     capital-gains tax; applying withholding to dividends alone would be
//     inconsistent. Change it in one place if that policy changes.
//   • Rights, buybacks, mergers and demergers are FLAGGED, never applied — a
//     wrong adjustment is worse than a visible gap.
//   • An event with no ex-date is not actionable (we cannot establish
//     eligibility), so it is flagged for review rather than guessed at.

import type { SupabaseClient } from '@supabase/supabase-js'
import { researchJson } from '../claude'
import type { ResearchOptions } from '../providers/fundamentals'
import type { CallUsage } from '../models'
import { eligibleShares, computeDividend, adjustCarriedPrice, quantityFactor, type TradeLike } from './eligibility'
import { isSupportedAction } from './corporate'
import type { LabAccount, Exchange } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** No withholding modelled — consistent with modelling no capital-gains tax. */
export const DIVIDEND_TAX_PCT = 0

interface CAEvent {
  symbol: string; exchange?: string; type?: string
  dividend_per_share?: number; ratio?: number
  ex_date?: string; record_date?: string; payment_date?: string; details?: string
}

export interface CASyncResult {
  ran: boolean
  /** What the lookup call consumed, when one was made. */
  usage?: CallUsage
  dividends: number
  splits: number
  bonuses: number
  flagged: number
  skipped: number
  cashCredited: number
  notes: string[]
  failure: string | null
}

const EMPTY = (): CASyncResult => ({
  ran: false, dividends: 0, splits: 0, bonuses: 0, flagged: 0, skipped: 0,
  cashCredited: 0, notes: [], failure: null,
})

const DIVIDEND_KINDS = ['dividend', 'interim', 'final', 'special']

export interface CASyncOptions {
  now?: Date
  research?: ResearchOptions
  /** Injectable for tests — returns the raw event list. */
  fetchEvents?: (prompt: string) => Promise<{ events: CAEvent[]; sources: unknown[]; failure: string | null }>
}

export async function syncCorporateActions(
  supabase: SupabaseClient,
  userId: string,
  lab: LabAccount,
  opts: CASyncOptions = {},
): Promise<CASyncResult> {
  const res = EMPTY()
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()

  const { data: positions } = await supabase
    .from('lab_positions').select('*').eq('lab_id', lab.id).eq('user_id', userId)
  if (!positions?.length) return res

  const { data: tradeRows } = await supabase
    .from('lab_trades').select('ts, side, symbol, exchange, quantity').eq('lab_id', lab.id).eq('user_id', userId)
  const trades = (tradeRows ?? []) as TradeLike[]

  const list = positions.map((p: any) => `${p.symbol} (${p.exchange})`).join(', ')
  const prompt = `For these Indian listed holdings, list corporate actions with EX-DATE on or after ${lab.start_date} up to today: ${list}.
Use web search. Include dividends (with dividend_per_share and ex/record/payment dates), stock splits (ratio = new shares per old), bonus issues (ratio = bonus shares per share held), and any rights/buyback/merger/demerger (as type "rights"/"buyback"/"merger"/"demerger").
Return ONLY JSON: { "events": [ { "symbol": string, "exchange": "NSE"|"BSE", "type": "dividend"|"split"|"bonus"|"rights"|"buyback"|"merger"|"demerger", "dividend_per_share": number|null, "ratio": number|null, "ex_date": "YYYY-MM-DD"|null, "record_date": string|null, "payment_date": string|null, "details": string } ] }
Only include actions you can verify from a source. Every action MUST carry an ex_date. If none, return an empty list.`

  let events: CAEvent[] = []
  let sources: unknown[] = []
  if (opts.fetchEvents) {
    const r = await opts.fetchEvents(prompt)
    events = r.events ?? []
    sources = r.sources ?? []
    res.failure = r.failure
  } else {
    // A dated fact to be reported, not weighed: the answer is on an exchange
    // notice. There is no deterministic corporate-actions feed wired into this
    // app today (the price provider is quotes only), so this stays a research
    // call — but it does not need the expensive model, and three searches is
    // enough to check a holdings list against NSE/BSE announcements.
    const r = await researchJson<{ events?: CAEvent[] }>({
      system: 'You report verified Indian corporate actions precisely, with dates. Never invent an action.',
      prompt, webSearch: true,
      task: 'corporate',
      maxUses: opts.research?.maxUses,
      maxUsesCap: opts.research?.maxUsesCap,
      retries: opts.research?.retries,
      timeoutMs: opts.research?.timeoutMs,
      deadline: opts.research?.deadline,
    })
    res.usage = r.usage
    if (r.failure) {
      // A lookup outage is not "no corporate actions happened". Say so and let
      // the next cycle try again; nothing is applied.
      res.failure = `${r.failure.kind}: ${r.failure.message}`
      res.notes.push('Corporate-action lookup failed — no events applied this run.')
      return res
    }
    events = r.data?.events ?? []
    sources = r.sources
  }
  res.ran = true

  for (const ev of events) {
    const symbol = String(ev.symbol ?? '').trim().toUpperCase()
    const exchange = (ev.exchange === 'BSE' ? 'BSE' : 'NSE') as Exchange
    const pos = positions.find((p: any) => String(p.symbol).toUpperCase() === symbol && p.exchange === exchange)
    if (!pos) { res.skipped++; continue }
    const type = String(ev.type ?? '').toLowerCase()
    const exDate = typeof ev.ex_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ev.ex_date) ? ev.ex_date : null

    // ── Dividends ──────────────────────────────────────────────────────────
    if (DIVIDEND_KINDS.includes(type)) {
      const dps = Number(ev.dividend_per_share)
      if (!Number.isFinite(dps) || dps <= 0) { res.skipped++; continue }
      if (!exDate) {
        res.notes.push(`${symbol}: dividend reported without an ex-date — cannot establish eligibility, skipped.`)
        res.skipped++
        continue
      }
      const shares = eligibleShares(trades, symbol, exchange, exDate)
      if (shares <= 0) {
        res.notes.push(`${symbol}: dividend with ex-date ${exDate} predates the Lab's position — not eligible.`)
        res.skipped++
        continue
      }
      const d = computeDividend(shares, dps, DIVIDEND_TAX_PCT)

      const { data: ins } = await supabase.from('lab_dividends').upsert({
        lab_id: lab.id, user_id: userId, symbol, exchange,
        dividend_per_share: dps, shares_on_record: d.sharesOnRecord, gross_dividend: d.gross,
        tax_pct: d.taxPct, net_dividend: d.net,
        ex_date: exDate, record_date: ev.record_date ?? null, payment_date: ev.payment_date ?? null,
        kind: type === 'dividend' ? 'dividend' : type,
        source: sources, processed_at: nowIso,
      }, { onConflict: 'lab_id,symbol,exchange,ex_date,dividend_per_share', ignoreDuplicates: true }).select('id')

      if (ins && ins.length) {            // newly inserted → credit cash exactly once
        const { data: acct } = await supabase.from('lab_accounts').select('cash').eq('id', lab.id).single()
        const newCash = round2(Number(acct?.cash ?? lab.cash) + d.net)
        await supabase.from('lab_accounts').update({ cash: newCash, updated_at: nowIso }).eq('id', lab.id)
        res.dividends++
        res.cashCredited = round2(res.cashCredited + d.net)
        res.notes.push(`${symbol}: ₹${d.net} dividend credited (${d.sharesOnRecord} shares × ₹${dps}, ex ${exDate}).`)
      }
      continue
    }

    // ── Splits and bonus issues ────────────────────────────────────────────
    if (type === 'split' || type === 'bonus') {
      const ratio = Number(ev.ratio)
      if (!Number.isFinite(ratio) || ratio <= 0 || !exDate) {
        res.notes.push(`${symbol}: ${type} without a usable ratio/ex-date — flagged instead of applied.`)
        await flag(supabase, userId, lab, symbol, exchange, type, ev, sources, nowIso)
        res.flagged++
        continue
      }
      const { data: ins } = await supabase.from('lab_corporate_actions').upsert({
        lab_id: lab.id, user_id: userId, symbol, exchange, type, ratio,
        ex_date: exDate, details: ev.details ?? null, status: 'applied',
        source: sources, applied_at: nowIso,
      }, { onConflict: 'lab_id,symbol,exchange,type,ex_date', ignoreDuplicates: true }).select('id')

      if (ins && ins.length) {
        const factor = quantityFactor(type, ratio)
        const newQty = Math.round(Number(pos.quantity) * factor * 10000) / 10000
        // Total cost basis is UNCHANGED — only the per-share cost falls.
        await supabase.from('lab_positions').update({
          quantity: newQty,
          last_price: adjustCarriedPrice(pos.last_price != null ? Number(pos.last_price) : null, factor),
          updated_at: nowIso,
        }).eq('lab_id', lab.id).eq('user_id', userId).eq('symbol', symbol).eq('exchange', exchange)
        if (type === 'split') res.splits++; else res.bonuses++
        res.notes.push(`${symbol}: ${type} ${ratio} applied — ${pos.quantity} → ${newQty} shares, cost basis unchanged.`)
      }
      continue
    }

    // ── Everything else: flag, never apply ─────────────────────────────────
    if (type && !isSupportedAction(type)) {
      const created = await flag(supabase, userId, lab, symbol, exchange, type, ev, sources, nowIso)
      if (created) {
        res.flagged++
        res.notes.push(`${symbol}: ${type} flagged for manual review — the Lab does not model it.`)
      }
    }
  }

  return res
}

/** Record an action we refuse to apply. Deduped even when ex_date is null,
 *  which a unique index cannot do (NULLs compare distinct in Postgres). */
async function flag(
  supabase: SupabaseClient, userId: string, lab: LabAccount,
  symbol: string, exchange: Exchange, type: string, ev: CAEvent, sources: unknown[], nowIso: string,
): Promise<boolean> {
  const exDate = typeof ev.ex_date === 'string' ? ev.ex_date : null
  let q = supabase.from('lab_corporate_actions').select('id')
    .eq('lab_id', lab.id).eq('symbol', symbol).eq('exchange', exchange).eq('type', type)
  q = exDate ? q.eq('ex_date', exDate) : q.is('ex_date', null)
  const { data: existing } = await q.limit(1)
  if (existing && existing.length) return false

  await supabase.from('lab_corporate_actions').insert({
    lab_id: lab.id, user_id: userId, symbol, exchange, type,
    ratio: Number.isFinite(Number(ev.ratio)) ? Number(ev.ratio) : null,
    ex_date: exDate, details: ev.details ?? null, status: 'flagged',
    source: sources, applied_at: nowIso,
  })
  return true
}
