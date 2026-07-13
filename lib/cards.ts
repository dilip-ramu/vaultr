// ── Credit card statement engine ─────────────────────────────────────────────
// A card's billing cycle closes on `statement_day` each month; payment is due
// on `statement_due_day` (the next occurrence after the close).
//
// Calculated statement amount = the card's debt at the close date, derived
// purely from your transactions. The bank's own figure (entered by you, stored
// in card_statements) minus the calculated figure = hidden charges: interest,
// late fees, annual fees, EMI interest, forex markup, GST on all of these.

export interface CardTxn {
  account_id: string
  to_account_id: string | null
  type: 'expense' | 'income' | 'transfer'
  amount: number
  date: string // YYYY-MM-DD
}

export interface CardCycle {
  statementDate: string       // cycle close (YYYY-MM-DD)
  periodStart: string         // day after previous close
  dueDate: string             // payment due date for this statement
  spends: number              // expenses in the cycle window
  refunds: number             // income (refunds/cashback) in the window
  payments: number            // transfers into the card in the window
  calculatedAmount: number    // debt at close date (≥ 0)
  bankAmount: number | null   // what the bank says (user-entered)
  hiddenCharges: number | null // bankAmount − calculatedAmount
  paidSinceClose: number      // payments made after the close date
  remainingDue: number        // max(0, owed − paidSinceClose)
  /**
   * Is this statement done with?
   *
   * TWO things can settle it, and BOTH must count — this was the bug. The Cards
   * page treated a statement as paid once you'd recorded a payment against it
   * (card_statements.payment_transaction_id), while the dashboard only looked at
   * remainingDue. Pay on or before the close date and the payment falls INSIDE
   * the cycle rather than after it, so remainingDue never drops — the card read
   * "paid" on the Cards page and kept nagging you on the dashboard forever.
   */
  settled: boolean
}

export interface CardOverview {
  cycles: CardCycle[]          // newest first
  currentCycleStart: string    // day after last close
  currentCycleSpend: number    // spends since last close
  totalHiddenCharges: number   // sum over cycles with a bank amount
  cyclesWithBankAmount: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`

function daysInMonth(y: number, m0: number): number {
  return new Date(y, m0 + 1, 0).getDate()
}

/** The given day-of-month in (y, m0), clamped to the month's length
 *  (statement day 31 in February → Feb 28/29). */
function clampedDate(y: number, m0: number, day: number): string {
  return iso(y, m0, Math.min(day, daysInMonth(y, m0)))
}

/** Most recent cycle-close date on or before `today`. */
export function lastStatementDate(statementDay: number, today: string): string {
  const [y, m] = today.split('-').map(Number)
  const thisMonth = clampedDate(y, m - 1, statementDay)
  if (thisMonth <= today) return thisMonth
  const pm = m - 2 < 0 ? 11 : m - 2
  const py = m - 2 < 0 ? y - 1 : y
  return clampedDate(py, pm, statementDay)
}

/** Walk back `count` close dates from (and including) `fromClose`. */
export function statementDates(statementDay: number, fromClose: string, count: number): string[] {
  const out: string[] = []
  let [y, m] = fromClose.split('-').map(Number)
  let m0 = m - 1
  for (let i = 0; i < count; i++) {
    out.push(clampedDate(y, m0, statementDay))
    m0--; if (m0 < 0) { m0 = 11; y-- }
  }
  return out // newest first
}

/** First occurrence of `dueDay` strictly after the close date. */
export function dueDateFor(statementDate: string, dueDay: number): string {
  const [y, m] = statementDate.split('-').map(Number)
  const sameMonth = clampedDate(y, m - 1, dueDay)
  if (sameMonth > statementDate) return sameMonth
  const nm = m % 12          // next month, 0-based
  const ny = m === 12 ? y + 1 : y
  return clampedDate(ny, nm, dueDay)
}

/** Day after a date (YYYY-MM-DD). */
function dayAfter(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day + 1))
  return iso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
}

/** Card debt at end of `date`: −balance when negative, else 0 (credit balance). */
export function debtAt(accountId: string, initialBalance: number, txns: CardTxn[], date: string): number {
  let bal = initialBalance
  for (const t of txns) {
    if (t.date > date) continue
    if (t.type === 'income' && t.account_id === accountId) bal += t.amount
    else if (t.type === 'expense' && t.account_id === accountId) bal -= t.amount
    else if (t.type === 'transfer' && t.account_id === accountId) bal -= t.amount
    else if (t.type === 'transfer' && t.to_account_id === accountId) bal += t.amount
  }
  return bal < 0 ? -bal : 0
}

function sumWindow(
  accountId: string, txns: CardTxn[], from: string, to: string,
): { spends: number; refunds: number; payments: number } {
  let spends = 0, refunds = 0, payments = 0
  for (const t of txns) {
    if (t.date < from || t.date > to) continue
    if (t.type === 'expense' && t.account_id === accountId) spends += t.amount
    else if (t.type === 'income' && t.account_id === accountId) refunds += t.amount
    else if (t.type === 'transfer' && t.to_account_id === accountId) payments += t.amount
  }
  return { spends, refunds, payments }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Full overview for one card. `bankAmounts` maps statement_date → bank figure. */
export function cardOverview(opts: {
  accountId: string
  initialBalance: number
  statementDay: number
  dueDay: number | null
  txns: CardTxn[]              // all transactions touching this card
  bankAmounts: Record<string, number>
  /** Statement dates you've explicitly recorded a payment against. */
  paidDates?: string[]
  today: string                // YYYY-MM-DD
  historyMonths?: number       // how many closed cycles to show (default 12)
}): CardOverview {
  const { accountId, initialBalance, statementDay, dueDay, txns, bankAmounts, today } = opts
  const paid = new Set(opts.paidDates ?? [])
  const months = opts.historyMonths ?? 12

  const lastClose = lastStatementDate(statementDay, today)
  const closes = statementDates(statementDay, lastClose, months + 1) // +1 for period starts

  const cycles: CardCycle[] = []
  for (let i = 0; i < months && i + 1 < closes.length; i++) {
    const close = closes[i]
    const prevClose = closes[i + 1]
    const periodStart = dayAfter(prevClose)
    const { spends, refunds, payments } = sumWindow(accountId, txns, periodStart, close)
    const calculated = round2(debtAt(accountId, initialBalance, txns, close))
    const bank = bankAmounts[close] ?? null
    const owed = bank ?? calculated
    const after = sumWindow(accountId, txns, dayAfter(close), today)
    const due = dueDay ? dueDateFor(close, dueDay) : dayAfter(close)

    cycles.push({
      statementDate: close,
      periodStart,
      dueDate: due,
      spends: round2(spends),
      refunds: round2(refunds),
      payments: round2(payments),
      calculatedAmount: calculated,
      bankAmount: bank,
      hiddenCharges: bank === null ? null : round2(bank - calculated),
      paidSinceClose: round2(after.payments),
      remainingDue: round2(Math.max(0, owed - after.payments)),
      // Explicitly paid, or nothing left owing. Either settles it.
      settled: paid.has(close) || round2(Math.max(0, owed - after.payments)) <= 0,
    })
  }

  const current = sumWindow(accountId, txns, dayAfter(lastClose), today)
  const withBank = cycles.filter(c => c.hiddenCharges !== null)

  return {
    cycles,
    currentCycleStart: dayAfter(lastClose),
    currentCycleSpend: round2(current.spends),
    totalHiddenCharges: round2(withBank.reduce((s, c) => s + (c.hiddenCharges ?? 0), 0)),
    cyclesWithBankAmount: withBank.length,
  }
}
