// ── Account reconciliation engine ────────────────────────────────────────────
// Recomputes each account's balance from first principles, exactly as the
// account_balances DB view does, and surfaces anomalies that commonly cause a
// computed balance to drift from the real bank balance.

export interface ReconTxn {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  date: string
  name: string | null
  original_currency: string | null
  account_id: string
  to_account_id: string | null
}

export interface LedgerRow {
  txn: ReconTxn
  effect: number        // signed effect on THIS account
  running: number       // balance after this row
  flags: string[]
}

export type AnomalyKind = 'foreign_currency' | 'possible_duplicate' | 'future_dated' | 'cross_currency_transfer'

/** Signed effect of a transaction on a given account — mirrors the SQL CASE. */
export function effectOn(t: ReconTxn, accountId: string): number {
  if (t.type === 'income' && t.account_id === accountId) return t.amount
  if (t.type === 'expense' && t.account_id === accountId) return -t.amount
  if (t.type === 'transfer' && t.account_id === accountId) return -t.amount
  if (t.type === 'transfer' && t.to_account_id === accountId) return t.amount
  return 0
}

/** Build a running-balance ledger (oldest → newest) for one account. */
export function buildLedger(opts: {
  accountId: string
  accountCurrency: string
  initialBalance: number
  txns: ReconTxn[]            // all txns (will be filtered to this account)
  today: string              // YYYY-MM-DD
  accountCurrencyById: Record<string, string>
}): { rows: LedgerRow[]; computedBalance: number } {
  const { accountId, accountCurrency, initialBalance, txns, today, accountCurrencyById } = opts

  const mine = txns
    .filter(t => t.account_id === accountId || t.to_account_id === accountId)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Detect possible duplicates: same signed effect + same date appearing >1×
  const seen = new Map<string, number>()
  for (const t of mine) {
    const key = `${effectOn(t, accountId)}|${t.date}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }

  let running = initialBalance
  const rows: LedgerRow[] = []
  for (const t of mine) {
    const effect = effectOn(t, accountId)
    running = Math.round((running + effect) * 100) / 100
    const flags: string[] = []

    if (t.original_currency && t.original_currency !== 'INR') flags.push('foreign')
    if (t.date > today) flags.push('future')
    if ((seen.get(`${effect}|${t.date}`) ?? 0) > 1) flags.push('dup?')
    // A transfer where the two accounts hold different currencies: one INR
    // amount is applied to both legs, which can't be right.
    if (t.type === 'transfer' && t.to_account_id) {
      const ca = accountCurrencyById[t.account_id]
      const cb = accountCurrencyById[t.to_account_id]
      if (ca && cb && ca !== cb) flags.push('cross-currency')
    }

    rows.push({ txn: t, effect, running, flags })
  }

  return { rows, computedBalance: running }
}

/** True when an account's balance should be treated as suspect at a glance. */
export function accountIsForeign(currency: string): boolean {
  return !!currency && currency !== 'INR'
}
