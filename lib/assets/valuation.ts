// Asset valuation math (frames 25a, 25d–g, 25j).
// Pure functions — no I/O — so they run identically on server and client.

import type { Asset, MarketRate, AssetRateDefault } from './types'

export interface CostLine { label: string; amount: number }
export interface Valuation {
  cost: number
  costLines: CostLine[]
  current: number
  gain: number           // current − cost
  returnPct: number      // gain / cost
  currentNote?: string   // e.g. "180g × ₹7,240 (24K today)"
}

const n = (v: unknown) => Number(v ?? 0) || 0

/** Years elapsed between a date string and now (fractional). */
export function yearsSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  const ms = Date.now() - d.getTime()
  return Math.max(0, ms / (365.25 * 24 * 3600 * 1000))
}

// ── Cost formulas per category ────────────────────────────────────────────
export function goldCost(d: Asset['details']): { cost: number; lines: CostLine[] } {
  const w = n(d.weight_g), ppg = n(d.price_per_gram)
  const metal = w * ppg
  const wastage = metal * (n(d.wastage_pct) / 100)
  const making = n(d.making_charge)
  const gst = (metal + wastage + making) * (n(d.gst_pct) / 100)
  const cost = metal + wastage + making + gst
  return {
    cost,
    lines: [
      { label: `Metal · ${w || 0}g × ₹${ppg.toLocaleString('en-IN')}`, amount: metal },
      { label: `Wastage · ${n(d.wastage_pct)}%`, amount: wastage },
      { label: 'Making charge', amount: making },
      { label: `GST · ${n(d.gst_pct)}%`, amount: gst },
    ],
  }
}

export function landCost(d: Asset['details']): { cost: number; lines: CostLine[] } {
  const area = n(d.area_cent), ppc = n(d.price_per_cent)
  const base = area * ppc
  const doc = n(d.documentation), broker = n(d.broker)
  return {
    cost: base + doc + broker,
    lines: [
      { label: `${area || 0} cent × ₹${ppc.toLocaleString('en-IN')}`, amount: base },
      { label: 'Documentation', amount: doc },
      { label: 'Broker', amount: broker },
    ],
  }
}

export function buildingCost(d: Asset['details']): { cost: number; lines: CostLine[] } {
  const land = n(d.land_cost), structure = n(d.structure_cost)
  return {
    cost: land + structure,
    lines: [
      { label: 'Land', amount: land },
      { label: 'Structure', amount: structure },
    ],
  }
}

export function electronicsCost(d: Asset['details']): { cost: number; lines: CostLine[] } {
  const cost = n(d.purchase_cost)
  return { cost, lines: [{ label: 'Purchase cost', amount: cost }] }
}

/** Compute the cost for any asset from its category + details. */
export function computeCost(category: string, valuation: string, details: Asset['details']): { cost: number; lines: CostLine[] } {
  if (category === 'gold' || category === 'silver') return goldCost(details)
  if (valuation === 'building') return buildingCost(details)
  if (category === 'real_estate') return landCost(details)
  if (category === 'electronics') return electronicsCost(details)
  return electronicsCost(details)
}

// ── Market rate lookup ────────────────────────────────────────────────────
/** Latest per-gram rate for a metal + purity from a rate list (newest first not required). */
export function latestRate(rates: MarketRate[], metal: string | null, purity: string | null): number | null {
  if (!metal) return null
  const matches = rates.filter(r => r.metal === metal && (purity ? r.purity === purity : r.purity == null))
  if (matches.length === 0) return null
  matches.sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1))
  return matches[0].rate_per_gram
}

/**
 * Purity as a fraction of the pure baseline. We only store the pure rate
 * (gold 24K, silver .999) and derive every other purity from it:
 *   gold: karat / 24   → 22K = 0.917, 18K = 0.75, 14K = 0.583
 *   silver: fineness/1000 → 925 (sterling) = 0.925, 999 = 0.999, 900 = 0.900
 */
export function purityFraction(metal: string | null, purity: string | null): number {
  if (!purity) return 1
  const m = purity.match(/[\d.]+/)
  if (!m) return 1
  const v = parseFloat(m[0])
  if (metal === 'gold') return Math.min(1, v / 24)
  if (v >= 100) return v / 1000        // 999, 925, 900
  return Math.min(1, v / 100)          // 92.5, 90
}

/** The purity-adjusted per-gram rate for an asset's metal, derived from the pure baseline. */
export function perGramRate(metal: string | null, purity: string | null, rates: MarketRate[]): number | null {
  const base = latestRate(rates, metal, metal === 'gold' ? '24K' : null)
  if (base == null) return null
  return base * purityFraction(metal, purity)
}

// ── Effective rate resolution (asset override → subcategory → category default) ──
export function effectiveRatePct(asset: Asset, defaults: AssetRateDefault[]): number {
  if (asset.override_rate_pct != null) return asset.override_rate_pct
  const sub = defaults.find(d => d.category === asset.category && d.subcategory === asset.subcategory)
  if (sub) return sub.rate_pct
  const cat = defaults.find(d => d.category === asset.category && d.subcategory == null)
  return cat?.rate_pct ?? 0
}

// ── Full valuation ─────────────────────────────────────────────────────────
export function valueAsset(asset: Asset, rates: MarketRate[], defaults: AssetRateDefault[]): Valuation {
  const { cost, lines } = computeCost(asset.category, asset.valuation_type, asset.details)
  const yrs = yearsSince(asset.purchase_date)
  let current = cost
  let note: string | undefined

  if (asset.manual_value != null) {
    current = asset.manual_value
  } else if (asset.valuation_type === 'market') {
    const g = n(asset.quantity_g)
    const rate = perGramRate(asset.metal, asset.metal_purity, rates)
    if (rate != null) {
      current = g * rate
      note = `${g}g × ₹${Math.round(rate).toLocaleString('en-IN')} (${asset.metal_purity ?? 'fine'} today)`
    }
  } else if (asset.valuation_type === 'building') {
    const d = asset.details
    const land = n(d.land_cost) * Math.pow(1 + n(d.land_appreciation_pct) / 100, yrs)
    const structure = n(d.structure_cost) * Math.pow(1 - n(d.structure_depreciation_pct) / 100, yrs)
    current = land + structure
  } else if (asset.valuation_type === 'depreciate') {
    const pct = Math.abs(effectiveRatePct(asset, defaults) || n(asset.details.depreciation_pct))
    current = cost * Math.pow(1 - pct / 100, yrs)
  } else { // rate (appreciating)
    const pct = effectiveRatePct(asset, defaults)
    current = cost * Math.pow(1 + pct / 100, yrs)
  }

  const gain = current - cost
  return { cost, costLines: lines, current, gain, returnPct: cost > 0 ? gain / cost : 0, currentNote: note }
}

// ── Formatting helpers ─────────────────────────────────────────────────────
export function inr(v: number): string {
  return '₹' + Math.round(v).toLocaleString('en-IN')
}
export function inrCompact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(a >= 1e7 * 10 ? 0 : 1)}Cr`
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`
  return '₹' + Math.round(v).toLocaleString('en-IN')
}
export function pctStr(p: number): string {
  const v = Math.round(p * 100)
  return `${v > 0 ? '+' : ''}${v}%`
}
