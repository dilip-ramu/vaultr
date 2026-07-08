// Assets domain types (frames 25a–j).

export type ValuationType = 'market' | 'rate' | 'depreciate' | 'building'

export interface GoldDetails {
  weight_g?: number
  purity?: string          // 22K / 24K
  price_per_gram?: number   // at purchase
  wastage_pct?: number
  making_charge?: number
  gst_pct?: number
}
export interface LandDetails {
  area_cent?: number
  price_per_cent?: number
  documentation?: number
  broker?: number
}
export interface BuildingDetails {
  land_cost?: number
  land_appreciation_pct?: number
  structure_cost?: number
  structure_depreciation_pct?: number
}
export interface ElectronicsDetails {
  purchase_cost?: number
  depreciation_pct?: number
}
export type AssetDetails = GoldDetails & LandDetails & BuildingDetails & ElectronicsDetails & Record<string, unknown>

export interface Asset {
  id: string
  user_id: string
  household_id: string | null
  name: string
  category: string          // real_estate | gold | silver | electronics | custom
  subcategory: string | null
  valuation_type: ValuationType
  purchase_date: string | null
  cost_total: number
  details: AssetDetails
  metal: string | null
  metal_purity: string | null
  quantity_g: number | null
  override_rate_pct: number | null
  manual_value: number | null
  manual_value_date: string | null
  photo_url: string | null
  include_in_net_worth: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MarketRate {
  id: string
  rate_date: string
  metal: string
  purity: string | null
  rate_per_gram: number
  source: string | null
}

export interface AssetRateDefault {
  id: string
  user_id: string
  category: string
  subcategory: string | null
  kind: 'appreciate' | 'depreciate'
  rate_pct: number
}

// ── Category registry (matches the design) ────────────────────────────────
export interface CategoryDef {
  key: string
  label: string
  emoji: string
  valuation: ValuationType | 'mixed'   // 'mixed' = building has its own split
  subcategories: { key: string; label: string; valuation: ValuationType }[]
  blurb: string
}

export const ASSET_CATEGORIES: CategoryDef[] = [
  {
    key: 'real_estate', label: 'Real estate', emoji: '🏡', valuation: 'rate',
    blurb: 'rate-linked',
    subcategories: [
      { key: 'land', label: 'Land', valuation: 'rate' },
      { key: 'building', label: 'Building', valuation: 'building' },
    ],
  },
  {
    key: 'gold', label: 'Gold', emoji: '🥇', valuation: 'market',
    blurb: 'market-linked',
    subcategories: [
      { key: 'jewellery', label: 'Jewellery', valuation: 'market' },
      { key: 'coins', label: 'Coins', valuation: 'market' },
    ],
  },
  {
    key: 'silver', label: 'Silver', emoji: '🥈', valuation: 'market',
    blurb: 'market-linked',
    subcategories: [
      { key: 'jewellery', label: 'Jewellery', valuation: 'market' },
      { key: 'coins', label: 'Coins', valuation: 'market' },
      { key: 'bars', label: 'Bars', valuation: 'market' },
    ],
  },
  {
    key: 'electronics', label: 'Electronics', emoji: '💻', valuation: 'depreciate',
    blurb: 'depreciating',
    subcategories: [
      { key: 'computers', label: 'Computers', valuation: 'depreciate' },
      { key: 'phones', label: 'Phones', valuation: 'depreciate' },
      { key: 'other', label: 'Other', valuation: 'depreciate' },
    ],
  },
]

export function categoryDef(key: string): CategoryDef | undefined {
  return ASSET_CATEGORIES.find(c => c.key === key)
}

// Sensible starting defaults for rate defaults (seeded lazily in the Rates tab).
export const DEFAULT_RATES: Record<string, number> = {
  real_estate: 8,
  'real_estate:land': 8,
  'real_estate:building_land': 7,
  'real_estate:building_structure': -3,
  electronics: -25,
  'electronics:computers': -25,
  'electronics:phones': -30,
}
