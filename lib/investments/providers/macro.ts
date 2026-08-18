// Macro / market-regime provider (brief §6, §7).
//
// Assesses the CURRENT environment for Indian equities and classifies it into a
// regime. Deliberately NOT a market-timing signal — it exists to influence risk
// sizing and selectivity, and it must explain itself. Grounded via web search.
//
// Correctness pass (item 9): a failed assessment now reports WHY. The Lab keeps
// using the last stored regime when the call fails, rather than silently
// defaulting to 'neutral' and pretending that was an assessment.

import { researchJson } from '../claude'
import type { ResearchFailure } from '../claude'
import type { CallUsage } from '../models'
import type { MarketRegime, RegimeState, Source } from '../types'
import type { ResearchOptions } from './fundamentals'
import { istDateString } from '../marketdate'

const SYSTEM = `You are a macro strategist assessing conditions for INDIAN equities (Nifty/Sensex).
You translate developments into investment consequences, not headlines, and you explain your reasoning.
Consider: market valuation, earnings environment, liquidity, interest rates (RBI + Fed), inflation, INR, Brent crude, US Treasury yields, FII/DII flows, volatility, and geopolitical risk (US, China, Middle East, Russia/Ukraine, India-China, India-US, tariffs/sanctions/shipping).
Be balanced and evidence-based. Cite authoritative sources. This is for risk-sizing and selectivity, NOT market timing.`

const STATES: RegimeState[] = ['risk_on', 'neutral', 'cautious', 'risk_off', 'crisis']

export async function getMarketRegime(
  research?: ResearchOptions,
): Promise<{ regime: MarketRegime | null; error?: string; failure?: ResearchFailure; usage?: CallUsage }> {
  const prompt = `Assess the current market regime for Indian equities as of today. Use web search for the latest data.

Return ONLY a JSON object of this exact shape:
{
  "state": "risk_on"|"neutral"|"cautious"|"risk_off"|"crisis",
  "summary": string,
  "reasons": string[],
  "drivers": {
    "valuation": string, "earnings": string, "liquidity": string, "rates": string,
    "inflation": string, "inr": string, "crude": string, "yields": string,
    "fii_flows": string, "volatility": string, "geopolitics": string
  }
}
Each driver value is one concise sentence stating the current reading AND its equity consequence. Be specific with numbers where known.`
  // Judgement, so it stays on the strong model — but it is cached for 24h
  // (regime_ttl_hours), so the Lab pays for it once a day at most no matter how
  // many cycles or resumes run.
  const { data, sources, error, failure, usage } = await researchJson<{
    state?: string; summary?: string; reasons?: string[]; drivers?: Record<string, string>
  }>({
    system: SYSTEM, prompt, webSearch: true,
    task: 'regime',
    maxUses: research?.maxUses,
    maxUsesCap: research?.maxUsesCap,
    retries: research?.retries,
    timeoutMs: research?.timeoutMs,
    deadline: research?.deadline,
  })

  if (!data) return { regime: null, error: error || 'No regime returned', failure, usage }
  const state = (STATES.includes(data.state as RegimeState) ? data.state : 'neutral') as RegimeState
  return {
    regime: {
      as_of: istDateString(),   // IST, not UTC (item 8)
      state,
      summary: data.summary ?? null,
      reasons: Array.isArray(data.reasons) ? data.reasons : [],
      drivers: (data.drivers && typeof data.drivers === 'object') ? data.drivers : {},
      sources: sources as Source[],
    },
    usage,
  }
}
