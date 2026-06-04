import type { CommissionType } from './types'

// ── Commission math (single source of truth) ─────────────────────────────────
// Used by CommissionForm (create/edit) — and covered by lib/__tests__/commission.test.ts

export interface StyleAmountInput {
  quantity: string | number
  rate_per_piece: string | number
  commission_type: CommissionType
  commission_value: string | number   // %, per-piece amount, or fixed total
}

const num = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v)) || 0

/** total order value, commission in order currency, and commission in INR.
 *  When currency ≠ INR and no exchange rate is available, INR is 0
 *  (deliberately conservative — never books an unconverted foreign amount as INR). */
export function computeStyleAmounts(
  s: StyleAmountInput,
  exchangeRate: number | null,
  currency: string,
): { total: number; comm: number; inr: number } {
  const qty   = num(s.quantity)
  const rate  = num(s.rate_per_piece)
  const total = qty * rate
  const val   = num(s.commission_value)
  const comm  = s.commission_type === 'percentage' ? total * (val / 100)
              : s.commission_type === 'per_piece'  ? qty * val
              : val
  const inr   = currency === 'INR' ? comm : (exchangeRate ? comm * exchangeRate : 0)
  return { total, comm, inr }
}
