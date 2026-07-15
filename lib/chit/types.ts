// Row shapes for the chit subsystem. Mirrors migration_v107_chit.sql.

import type { CommissionModel } from './auction'

export interface ChitContact {
  name?: string
  phone?: string
  relation?: string
  detail?: string
}

export interface ChitMember {
  id: string
  user_id: string
  name: string
  phone: string | null
  dial_code: string
  address: string | null
  aadhaar: string | null
  pan: string | null
  nominees: ChitContact[]
  reference_contacts: ChitContact[]
  guarantors: ChitContact[]
  securities: ChitContact[]
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ChitGroup {
  id: string
  user_id: string
  company_id: string | null
  name: string
  chit_value: number
  members: number
  commission_pct: number
  bid_ceiling_pct: number
  commission_model: CommissionModel
  auction_day: number | null
  start_date: string | null
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  updated_at: string
}

export interface ChitGroupMember {
  id: string
  group_id: string
  member_id: string
  slot_number: number | null
  created_at: string
  /** Joined in for display. */
  member?: ChitMember
}

export interface ChitAuction {
  id: string
  group_id: string
  month_number: number
  auction_date: string
  winner_member_id: string | null
  bid_amount: number
  commission: number
  net_payout: number
  dividend_per_member: number
  payout_transaction_id: string | null
  paid_at: string | null
  notes: string | null
  created_at: string
}

export interface ChitCollection {
  id: string
  group_id: string
  member_id: string
  month_number: number
  amount: number
  paid_date: string
  income_transaction_id: string | null
  account_id: string | null
  notes: string | null
  created_at: string
}

export type ReceivableStatus = 'PENDING' | 'OVERDUE' | 'PAID'

export interface ChitReceivable {
  id: string
  group_id: string
  member_id: string
  month_number: number
  amount: number
  due_date: string | null
  status: ReceivableStatus
  collection_id: string | null
  created_at: string
}

/** Strip +91 / 91 / leading 0 to a 10-digit canonical form for dedup. */
export function normalizePhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits.slice(-10)
}
