// Assets domain types (frames 25a–j).

export type ValuationType = 'market' | 'rate' | 'depreciate' | 'building' | 'stock' | 'fx'

export interface GoldDetails {
  weight_g?: number          // net metal weight
  gross_weight_g?: number
  purity?: string            // 22K / 24K / 12.5K / 92.5% …
  price_per_gram?: number    // metal cost/gram at purchase
  value_addition_pct?: number
  wastage_pct?: number       // legacy alias for value addition
  making_per_gram?: number
  making_charge?: number     // flat making (legacy)
  certification?: number
  discount?: number
  tax_pct?: number
  gst_pct?: number           // legacy alias for tax
  // stones — cost + independently-tracked present value per carat
  diamond_carats?: number
  diamond_cost_per_carat?: number
  diamond_present_per_carat?: number
  other_carats?: number
  other_cost_per_carat?: number
  other_present_per_carat?: number
  // attachments
  invoice_url?: string
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
// Repeatable sub-items
export interface StoneEntry { type?: string; weight_ct?: number; cost?: number; present?: number }
export interface DocEntry { type?: string; url?: string; name?: string }

export const STONE_TYPES = ['Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Coral', 'Topaz', 'Cubic Zirconia', 'Other']
export const DOC_TYPES = ['Parent document', 'Sale deed', 'Patta', 'Chitta', 'Adangal', 'FMB sketch', 'EC (Encumbrance)', 'Tax receipt', 'Approval / Plan', 'Khata', 'Other']

// Foreign currency HELD (not spent). Valued at the rate from the Currencies
// page. See lib/assets/forex.ts — a currency with no rate is worth "unknown",
// never zero.
export interface ForexDetails {
  fx_currency?: string
  fx_amount?: number
  fx_acquired_rate?: number
}

// Stocks: quantity × a fetched price. See lib/assets/stocks.ts — the price can
// be missing or stale, and the maths there is honest about both.
export interface StockDetails {
  symbol?: string
  exchange?: 'NSE' | 'BSE'
  quantity?: number
  avg_cost?: number
  last_price?: number
  last_price_at?: string
}

export type AssetDetails = GoldDetails & LandDetails & BuildingDetails & ElectronicsDetails & StockDetails & ForexDetails & {
  stones?: StoneEntry[]
  location?: string
  documents?: DocEntry[]
  currency?: string          // purchase currency (ISO code); INR/blank = native
} & Record<string, unknown>

// Common purchase currencies (INR first). Any ISO code the forex API returns will convert.
export const ASSET_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'CHF', 'JPY', 'SAR', 'QAR', 'KWD', 'MYR', 'HKD', 'CNY', 'THB', 'NZD', 'ZAR']

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
  // Sale tracking. A sale has two stages: the price is agreed (status 'sold',
  // payment 'awaiting'), then the money lands in an account net of charges and
  // tax (payment 'received', with a real transaction behind it).
  // Realised profit = sale_net − cost_total — NOT sold_price − cost_total.
  status: 'held' | 'sold'
  sold_price: number | null          // gross, what the buyer agreed to pay
  sold_date: string | null
  sale_charges: number               // bank / brokerage fees deducted
  sale_tax: number                   // TDS or tax withheld at source
  sale_net: number | null            // what actually reached the account
  sale_account_id: string | null
  sale_transaction_id: string | null
  sale_payment_status: 'awaiting' | 'received'
  sale_received_date: string | null
  sale_buyer: string | null
  sale_reference: string | null
  /** The expense that bought this asset, if it was created from a transaction. */
  purchase_transaction_id: string | null
  /** Which company owns it. NULL = personal / unassigned. */
  company_id: string | null
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
    key: 'platinum', label: 'Platinum', emoji: '⚪', valuation: 'market',
    blurb: 'market-linked',
    subcategories: [
      { key: 'jewellery', label: 'Jewellery', valuation: 'market' },
      { key: 'coins', label: 'Coins', valuation: 'market' },
      { key: 'bars', label: 'Bars', valuation: 'market' },
    ],
  },
  {
    key: 'foreign_currency', label: 'Foreign currency', emoji: '💱', valuation: 'fx',
    blurb: 'rate-linked',
    subcategories: [
      { key: 'cash', label: 'Cash in hand', valuation: 'fx' },
      { key: 'holding', label: 'Held abroad', valuation: 'fx' },
    ],
  },
  {
    key: 'stocks', label: 'Stocks', emoji: '📈', valuation: 'stock',
    blurb: 'market-priced',
    subcategories: [
      { key: 'equity', label: 'Equity', valuation: 'stock' },
      { key: 'etf', label: 'ETF', valuation: 'stock' },
      { key: 'mutual_fund', label: 'Mutual fund', valuation: 'stock' },
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
