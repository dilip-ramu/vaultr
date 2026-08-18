// Fundamentals provider (brief §5, §15, §16).
//
// v1 implementation researches CURRENT fundamentals via Claude + web search over
// Tier-1/2 sources (NSE/BSE/SEBI/company filings/reputable data providers) and
// returns them with a strict DATA-CONFIDENCE score. The interface is the point:
// a paid structured-data API (e.g. indianapi.in) can implement the same
// FundamentalsProvider later without touching callers.
//
// Non-negotiable behaviour: NEVER invent a missing number. A field we can't
// verify comes back null and drags data_confidence down. Low confidence is a
// valid, important answer — the recommender turns it into "INSUFFICIENT DATA".

import { researchJson } from '../claude'
import type { FundamentalsResult, Exchange, Source, MarketCapBand } from '../types'

export interface FundamentalsInput {
  symbol: string
  exchange: Exchange
  companyName?: string | null
}

export interface FundamentalsProvider {
  name: string
  getFundamentals(input: FundamentalsInput): Promise<FundamentalsResult>
}

const SYSTEM = `You are a disciplined equity research analyst covering Indian listed companies (NSE/BSE).
You gather verifiable fundamentals from authoritative sources and are scrupulously honest about what you do and do not know.

Source hierarchy (prefer higher tiers, and record which tier each source is):
  Tier 1 — NSE, BSE, SEBI, RBI, company filings, annual reports, investor presentations, earnings-call transcripts.
  Tier 2 — reputable financial-data providers and institutional-quality financial news.
  Tier 3 — general financial websites.
  Tier 4 — social media / forums (NEVER used as authoritative evidence).

Hard rules:
- NEVER fabricate or estimate a figure you cannot source. Missing => null.
- If sources disagree materially, prefer the most authoritative and note the discrepancy.
- Absolute figures (revenue, ebitda, pat, debt, cash, fcf, ocf) in INR crore. Ratios/percentages as plain numbers (e.g. roe_pct: 18.4, pe: 24.1).
- data_confidence (0-100) reflects how complete, fresh, and consistent the evidence is. Thin/stale/contradictory => low.`

function toResult(symbol: string, exchange: Exchange, parsed: unknown, sources: Source[]): FundamentalsResult {
  const p = (parsed ?? {}) as Record<string, unknown>
  const f = (p.fundamentals ?? {}) as Record<string, unknown>
  const v = (p.valuation ?? {}) as Record<string, unknown>
  const num = (x: unknown): number | null => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x))
  const band = ((): MarketCapBand | null => {
    const b = String(p.market_cap_band ?? '').toLowerCase()
    return (['large', 'mid', 'small', 'micro'] as string[]).includes(b) ? (b as MarketCapBand) : null
  })()
  // Normalise every known numeric field through num() so "" / "NA" become null.
  const fundamentals: Record<string, number | null> = {}
  for (const k of Object.keys(f)) fundamentals[k] = num(f[k])
  const valuation: Record<string, number | null> = {}
  for (const k of Object.keys(v)) valuation[k] = num(v[k])
  const dc = num(p.data_confidence)
  return {
    company_name: (p.company_name as string) ?? null,
    sector: (p.sector as string) ?? null,
    market_cap_band: band,
    fundamentals,
    valuation,
    data_confidence: dc == null ? 0 : Math.max(0, Math.min(100, Math.round(dc))),
    sources: sources.length ? sources : ((p.sources as Source[]) ?? []),
    notes: (p.notes as string) ?? undefined,
  }
}

export const claudeFundamentals: FundamentalsProvider = {
  name: 'claude-web-research',
  async getFundamentals({ symbol, exchange, companyName }): Promise<FundamentalsResult> {
    const who = companyName ? `${companyName} (${symbol}, ${exchange})` : `${symbol} on ${exchange}`
    const prompt = `Research the latest available fundamentals and valuation for ${who}, an Indian listed company.

Use web search against Tier-1/2 sources. Return ONLY a JSON object of this exact shape (use null for anything you cannot verify — do not guess):

{
  "company_name": string|null,
  "sector": string|null,
  "market_cap_band": "large"|"mid"|"small"|"micro"|null,
  "fundamentals": {
    "revenue": number|null, "revenue_growth_pct": number|null,
    "ebitda": number|null, "ebitda_margin_pct": number|null, "ebit": number|null,
    "pat": number|null, "eps": number|null, "eps_growth_pct": number|null,
    "roe_pct": number|null, "roce_pct": number|null,
    "fcf": number|null, "ocf": number|null,
    "debt": number|null, "cash": number|null, "interest_coverage": number|null,
    "promoter_holding_pct": number|null, "promoter_pledge_pct": number|null
  },
  "valuation": {
    "pe": number|null, "pb": number|null, "ev_ebitda": number|null,
    "ev_sales": number|null, "peg": number|null,
    "sector_pe": number|null, "hist_pe": number|null
  },
  "data_confidence": number,
  "notes": string|null
}

Absolute figures in INR crore. If reliable data is scarce, return mostly nulls and a low data_confidence — that is the correct answer, not a fabricated one.`
    const { data, sources, error } = await researchJson<unknown>({ system: SYSTEM, prompt, webSearch: true, maxUses: 6 })
    if (!data) {
      return {
        company_name: companyName ?? null, sector: null, market_cap_band: null,
        fundamentals: {}, valuation: {}, data_confidence: 0, sources,
        notes: error ? `Research failed: ${error}` : 'No parseable fundamentals returned.',
      }
    }
    return toResult(symbol, exchange, data, sources)
  },
}

/** The active provider. Swap here (or via DI) when a paid API is added. */
export const fundamentalsProvider: FundamentalsProvider = claudeFundamentals

export function getFundamentals(input: FundamentalsInput): Promise<FundamentalsResult> {
  return fundamentalsProvider.getFundamentals(input)
}
