export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'loan' | 'other'
export type TransactionType = 'expense' | 'income' | 'transfer'
export type CategoryType = 'expense' | 'income'
export type BillStatus = 'pending' | 'paid' | 'overdue'
export type BillDirection = 'received' | 'sent'
export type PaymentTerms = 'due_on_receipt' | 'net_7' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom'
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface Household {
  id: string
  name: string
  invite_code: string
  created_by: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string | null
  currency: string
  household_id: string | null
  avatar_url: string | null
  nickname: string | null
  created_at: string
}

export interface HouseholdMember extends Profile {
  email?: string
}

export interface Account {
  id: string
  user_id: string
  household_id: string | null
  created_by: string | null
  name: string
  type: AccountType
  currency: string
  initial_balance: number
  color: string
  icon: string
  avatar_url: string | null
  custom_type_id?: string | null
  custom_type_name?: string | null
  custom_type_color?: string | null
  custom_type_icon?: string | null
  custom_type_avatar_url?: string | null
  // Extended details
  account_number: string | null
  branch: string | null
  ifsc_code: string | null
  swift_code: string | null
  bank_address: string | null
  open_date: string | null
  closing_date: string | null
  statement_due_day: number | null
  include_in_net_worth: boolean
  is_active: boolean
  created_at: string
  balance?: number
  transaction_count?: number
}

export interface Category {
  id: string
  user_id: string
  household_id: string | null
  name: string
  type: CategoryType
  icon: string
  color: string
  avatar_url?: string | null
  parent_id: string | null
  created_at: string
}

export interface CustomAccountType {
  id: string
  user_id: string
  household_id: string | null
  name: string
  color: string
  icon: string
  avatar_url: string | null
  created_at: string
}

export interface BuiltinTypeOverride {
  id: string
  user_id: string
  type_key: AccountType
  name: string
  color: string
  icon: string
  avatar_url: string | null
  created_at: string
}

export interface Payee {
  id: string
  user_id: string
  household_id: string | null
  name: string
  type: 'personal' | 'business' | 'other'
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  household_id: string | null
  created_by: string | null
  account_id: string
  to_account_id: string | null
  category_id: string | null
  payee_id: string | null
  name: string | null
  type: TransactionType
  amount: number
  original_currency: string
  original_amount: number | null
  exchange_rate_used: number | null
  date: string
  notes: string | null
  bill_id: string | null
  is_contrast_billed: boolean
  created_at: string
  account?: Account
  to_account?: Account
  category?: Category
  payee?: Payee
  creator?: Profile
  attachments?: Attachment[]
  activity_notes?: ActivityNote[]
}

export interface Customer {
  id: string
  user_id: string
  household_id: string | null
  name: string
  email: string | null
  phone: string | null
  address: string | null
  gst_number: string | null
  notes: string | null
  city: string | null
  state: string | null
  state_code: string | null
  pincode: string | null
  country: string | null
  csv_alias: string | null
  created_at: string
}

export interface Bill {
  id: string
  user_id: string
  household_id: string | null
  created_by: string | null
  account_id: string
  category_id: string | null
  customer_id: string | null
  name: string
  amount: number
  due_date: string
  direction: BillDirection
  payment_terms: PaymentTerms | null
  invoice_number: string | null
  is_recurring: boolean
  recurrence_interval: RecurrenceInterval | null
  recurrence_end_date: string | null
  status: BillStatus
  settled_at: string | null
  follow_up_date: string | null
  notes: string | null
  created_at: string
  account?: Account
  category?: Category
  customer?: Customer
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  user_id: string
  transaction_id: string | null
  bill_id: string | null
  file_path: string
  file_name: string
  file_size: number | null
  content_type: string | null
  created_at: string
  url?: string
}

export interface ActivityNote {
  id: string
  user_id: string
  household_id: string | null
  transaction_id: string | null
  account_id: string | null
  bill_id: string | null
  content: string
  created_at: string
  creator?: Profile
}

// ── Display config ────────────────────────────────────────────────

export const ACCOUNT_TYPE_CONFIG: Record<AccountType, { label: string; color: string; bgColor: string; icon: string }> = {
  checking:   { label: 'Checking',     color: '#6366F1', bgColor: '#EEF2FF', icon: 'wallet' },
  savings:    { label: 'Savings',      color: '#10B981', bgColor: '#ECFDF5', icon: 'piggy-bank' },
  credit:     { label: 'Credit Card',  color: '#F59E0B', bgColor: '#FFFBEB', icon: 'credit-card' },
  cash:       { label: 'Cash',         color: '#8B5CF6', bgColor: '#F5F3FF', icon: 'banknote' },
  investment: { label: 'Investment',   color: '#3B82F6', bgColor: '#EFF6FF', icon: 'trending-up' },
  loan:       { label: 'Loan',         color: '#EF4444', bgColor: '#FEF2F2', icon: 'landmark' },
  other:      { label: 'Other',        color: '#6B7280', bgColor: '#F9FAFB', icon: 'more-horizontal' },
}

export function resolveAccountTypeDisplay(
  type: AccountType,
  overrides?: BuiltinTypeOverride[]
): { label: string; color: string; bgColor: string; icon: string } {
  const override = overrides?.find(o => o.type_key === type)
  if (override) {
    return { label: override.name, color: override.color, bgColor: `${override.color}18`, icon: override.icon }
  }
  return ACCOUNT_TYPE_CONFIG[type]
}

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  due_on_receipt: 'Due on Receipt',
  net_7:  'Net 7 days',
  net_15: 'Net 15 days',
  net_30: 'Net 30 days',
  net_60: 'Net 60 days',
  net_90: 'Net 90 days',
  custom: 'Custom',
}

export const ACCOUNT_COLORS = [
  '#6366F1', '#10B981', '#F59E0B', '#8B5CF6',
  '#3B82F6', '#EF4444', '#EC4899', '#14B8A6',
  '#F97316', '#84CC16', '#06B6D4', '#A16207',
]

export const CATEGORY_ICONS = [
  { value: 'utensils',        label: 'Food' },
  { value: 'car',             label: 'Transport' },
  { value: 'shopping-bag',    label: 'Shopping' },
  { value: 'film',            label: 'Entertainment' },
  { value: 'zap',             label: 'Utilities' },
  { value: 'heart-pulse',     label: 'Health' },
  { value: 'graduation-cap',  label: 'Education' },
  { value: 'home',            label: 'Home' },
  { value: 'plane',           label: 'Travel' },
  { value: 'shirt',           label: 'Clothing' },
  { value: 'gift',            label: 'Gifts' },
  { value: 'briefcase',       label: 'Work' },
  { value: 'dumbbell',        label: 'Fitness' },
  { value: 'smartphone',      label: 'Tech' },
  { value: 'book',            label: 'Books' },
  { value: 'coffee',          label: 'Coffee' },
  { value: 'music',           label: 'Music' },
  { value: 'wifi',            label: 'Internet' },
  { value: 'building',        label: 'Business' },
  { value: 'trending-up',     label: 'Investment' },
  { value: 'dollar-sign',     label: 'Salary' },
  { value: 'percent',         label: 'Interest' },
  { value: 'laptop',          label: 'Laptop' },
  { value: 'more-horizontal', label: 'Other' },
]

export interface Budget {
  id: string
  user_id: string
  household_id: string | null
  category_id: string
  amount: number
  period: 'monthly' | 'weekly' | 'yearly'
  rollover: boolean
  rollover_amount: number
  month: number | null
  year: number | null
  is_active: boolean
  created_at: string
  category?: Category
  spent?: number
  remaining?: number
  percentage?: number
}

export const EMOJI_MAP: Record<string, string> = {
  'utensils': '🍽️', 'car': '🚗', 'shopping-bag': '🛍️', 'film': '🎬',
  'zap': '⚡', 'heart-pulse': '❤️', 'graduation-cap': '🎓', 'home': '🏠',
  'plane': '✈️', 'shirt': '👕', 'gift': '🎁', 'briefcase': '💼',
  'dumbbell': '🏋️', 'smartphone': '📱', 'book': '📚', 'coffee': '☕',
  'music': '🎵', 'wifi': '📶', 'building': '🏢', 'trending-up': '📈',
  'dollar-sign': '💵', 'percent': '💹', 'laptop': '💻',
  'more-horizontal': '⋯', 'wallet': '👛', 'piggy-bank': '🐷',
  'credit-card': '💳', 'banknote': '💵', 'landmark': '🏛️',
}
