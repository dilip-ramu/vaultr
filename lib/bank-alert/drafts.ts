// ── Draft matching & duplicate logic (pure, testable) ────────────────────────

export interface AccountRef {
  id: string
  name: string
  account_number?: string | null
  matching_digits?: string | null   // comma-separated last-4s the user set
  type?: string
}

/** Last 4 digits an account is known by (explicit matching_digits, else acct no). */
export function accountDigits(a: AccountRef): string[] {
  const out: string[] = []
  if (a.matching_digits) {
    for (const part of a.matching_digits.split(/[,\s]+/)) {
      const d = part.replace(/\D/g, '')
      if (d.length >= 4) out.push(d.slice(-4))
    }
  }
  if (a.account_number) {
    const d = a.account_number.replace(/\D/g, '')
    if (d.length >= 4) out.push(d.slice(-4))
  }
  return [...new Set(out)]
}

/** Match a partial (last-4) to exactly one account.
 *  Returns the account id, or null if no/ambiguous match. */
export function matchAccount(partial: string | null, accounts: AccountRef[]): { id: string | null; ambiguous: boolean } {
  if (!partial) return { id: null, ambiguous: false }
  const last4 = partial.replace(/\D/g, '').slice(-4)
  if (last4.length < 4) return { id: null, ambiguous: false }
  const hits = accounts.filter(a => accountDigits(a).includes(last4))
  if (hits.length === 1) return { id: hits[0].id, ambiguous: false }
  if (hits.length > 1) return { id: null, ambiguous: true }
  return { id: null, ambiguous: false }
}

// ── Duplicate detection ──────────────────────────────────────────────────────

export interface TxnLike {
  id: string
  account_id: string
  amount: number
  date: string        // YYYY-MM-DD
  type: 'income' | 'expense' | 'transfer'
}

/** Is there an existing transaction that looks like the same event?
 *  Signal = same account + same amount within `hours` (default 48). */
export function findDuplicate(
  candidate: { accountId: string | null; amount: number | null; date: string | null },
  existing: TxnLike[],
  hours = 48,
): TxnLike | null {
  if (!candidate.accountId || candidate.amount == null || !candidate.date) return null
  const candTime = new Date(candidate.date + 'T00:00:00').getTime()
  const windowMs = hours * 3600 * 1000
  for (const t of existing) {
    if (t.account_id !== candidate.accountId) continue
    if (Math.abs(t.amount - candidate.amount) > 0.01) continue
    const tTime = new Date(t.date + 'T00:00:00').getTime()
    if (Math.abs(tTime - candTime) <= windowMs) return t
  }
  return null
}

// ── Transfer detection ───────────────────────────────────────────────────────

export interface DraftLike {
  id: string
  matched_account_id: string | null
  amount: number | null
  direction: 'debit' | 'credit'
  txn_date: string | null
}

/** Find a matching opposite-leg draft that, together with `draft`, forms a
 *  transfer between two of the user's own accounts (same amount, opposite
 *  direction, both matched, within `hours`). */
export function findTransferPair(
  draft: DraftLike,
  others: DraftLike[],
  hours = 48,
): DraftLike | null {
  if (!draft.matched_account_id || draft.amount == null || !draft.txn_date) return null
  const want: 'debit' | 'credit' = draft.direction === 'debit' ? 'credit' : 'debit'
  const t = new Date(draft.txn_date + 'T00:00:00').getTime()
  const win = hours * 3600 * 1000
  for (const o of others) {
    if (o.id === draft.id) continue
    if (o.direction !== want) continue
    if (!o.matched_account_id || o.matched_account_id === draft.matched_account_id) continue
    if (o.amount == null || Math.abs(o.amount - draft.amount) > 0.01) continue
    if (!o.txn_date) continue
    if (Math.abs(new Date(o.txn_date + 'T00:00:00').getTime() - t) <= win) return o
  }
  return null
}

// ── Merchant memory ──────────────────────────────────────────────────────────

export interface MerchantRule {
  merchant_pattern: string
  default_name?: string | null
  category_id?: string | null
  payee_id?: string | null
}

/** First rule whose pattern is a case-insensitive substring of the merchant. */
export function applyMerchantRule(merchant: string | null, rules: MerchantRule[]): MerchantRule | null {
  if (!merchant) return null
  const m = merchant.toLowerCase()
  for (const r of rules) {
    if (r.merchant_pattern && m.includes(r.merchant_pattern.toLowerCase())) return r
  }
  return null
}
