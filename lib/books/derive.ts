// Double-entry "books" — a READ-ONLY projection of the existing single-entry
// data into a balanced ledger. Nothing here writes; it only reads the same
// transactions/accounts/categories the rest of the app already stores, and
// expands each into debit/credit lines. Delete this file + the /books route to
// revert entirely — no schema, no existing code is touched.

import { isLiability } from '@/lib/account-metrics'

export interface BooksAccount {
  id: string
  name: string
  type: string
  initial_balance: number
  include_in_net_worth: boolean
}
export interface BooksTxn {
  type: string                 // 'expense' | 'income' | 'transfer'
  account_id: string | null
  to_account_id: string | null
  amount: number
  category_id: string | null
  date: string                 // yyyy-mm-dd
}
export interface BooksCategory { id: string; name: string; type: string }

export interface BooksInput {
  accounts: BooksAccount[]
  transactions: BooksTxn[]
  categories: BooksCategory[]
  /** Current market value of the in-net-worth asset module (gold, property…). */
  assetsCurrentValue?: number
  /** P&L date window (inclusive). Balances are always all-time. */
  from?: string
  to?: string
}

export type LedgerGroup = 'asset' | 'liability' | 'income' | 'expense' | 'equity'
export interface LedgerRow { key: string; name: string; group: LedgerGroup; debit: number; credit: number }

export interface BooksResult {
  trial: { rows: LedgerRow[]; totalDebit: number; totalCredit: number; balanced: boolean }
  netWorth: { accountAssets: number; assetHoldings: number; assets: number; liabilities: number; net: number }
  balanceSheet: {
    assetsFromAccounts: number; assetHoldings: number; assets: number
    liabilities: number
    openingEquity: number; retained: number; equity: number
    balanced: boolean
  }
  pnl: { income: number; expense: number; net: number; byCategory: { name: string; amount: number; kind: 'income' | 'expense' }[] }
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function deriveBooks(input: BooksInput): BooksResult {
  const { accounts, transactions, categories } = input
  const acctById = new Map(accounts.map(a => [a.id, a]))
  const catName = new Map(categories.map(c => [c.id, c.name]))
  const acctGroup = (a: BooksAccount): LedgerGroup => (isLiability(a.type) ? 'liability' : 'asset')

  // ── ledger accumulation (guarantees debits === credits) ──
  const led = new Map<string, LedgerRow>()
  const ensure = (key: string, name: string, group: LedgerGroup) => {
    let row = led.get(key)
    if (!row) { row = { key, name, group, debit: 0, credit: 0 }; led.set(key, row) }
    return row
  }
  const post = (dr: [string, string, LedgerGroup], cr: [string, string, LedgerGroup], amt: number) => {
    ensure(...dr).debit += amt
    ensure(...cr).credit += amt
  }
  const acctRef = (a: BooksAccount): [string, string, LedgerGroup] => [`acct:${a.id}`, a.name, acctGroup(a)]
  const OPENING: [string, string, LedgerGroup] = ['equity:opening', 'Opening balance equity', 'equity']

  // opening balances
  for (const a of accounts) {
    const ib = Number(a.initial_balance) || 0
    if (ib === 0) continue
    if (ib >= 0) post(acctRef(a), OPENING, ib)
    else post(OPENING, acctRef(a), -ib)
  }

  // transactions → journal lines
  for (const t of transactions) {
    const amt = Math.abs(Number(t.amount) || 0)
    if (amt === 0) continue
    if (t.type === 'transfer') {
      const from = t.account_id ? acctById.get(t.account_id) : undefined
      const to = t.to_account_id ? acctById.get(t.to_account_id) : undefined
      if (from && to) post(acctRef(to), acctRef(from), amt)
    } else if (t.type === 'income') {
      const acc = t.account_id ? acctById.get(t.account_id) : undefined
      if (!acc) continue
      const cKey = t.category_id ? `cat:${t.category_id}` : 'cat:uncat-income'
      const cName = (t.category_id && catName.get(t.category_id)) || 'Uncategorised income'
      post(acctRef(acc), [cKey, cName, 'income'], amt)
    } else { // expense (default)
      const acc = t.account_id ? acctById.get(t.account_id) : undefined
      if (!acc) continue
      const cKey = t.category_id ? `cat:${t.category_id}` : 'cat:uncat-expense'
      const cName = (t.category_id && catName.get(t.category_id)) || 'Uncategorised expense'
      post([cKey, cName, 'expense'], acctRef(acc), amt)
    }
  }

  // fold each account's accumulation into a single natural-side balance
  const rows: LedgerRow[] = []
  let totalDebit = 0, totalCredit = 0
  for (const row of led.values()) {
    const net = r2(row.debit - row.credit)
    const debit = net > 0 ? net : 0
    const credit = net < 0 ? -net : 0
    if (debit === 0 && credit === 0) continue
    rows.push({ ...row, debit, credit })
    totalDebit += debit; totalCredit += credit
  }
  const groupRank: Record<LedgerGroup, number> = { asset: 0, liability: 1, equity: 2, income: 3, expense: 4 }
  rows.sort((a, b) => groupRank[a.group] - groupRank[b.group] || a.name.localeCompare(b.name))

  // ── net worth (mirrors the accounts page + asset module) ──
  const bal = new Map(accounts.map(a => [a.id, Number(a.initial_balance) || 0]))
  const adj = (id: string | null, d: number) => { if (id && bal.has(id)) bal.set(id, (bal.get(id) || 0) + d) }
  for (const t of transactions) {
    const amt = Number(t.amount) || 0
    if (t.type === 'transfer') { adj(t.account_id, -amt); adj(t.to_account_id, amt) }
    else if (t.type === 'income') adj(t.account_id, amt)
    else adj(t.account_id, -amt)
  }
  let accountAssets = 0, liabilities = 0
  for (const a of accounts) {
    if (!a.include_in_net_worth) continue
    const b = bal.get(a.id) || 0
    if (isLiability(a.type)) liabilities += Math.abs(b)
    else accountAssets += b
  }
  const assetHoldings = r2(input.assetsCurrentValue || 0)
  const assets = r2(accountAssets + assetHoldings)
  const netWorth = { accountAssets: r2(accountAssets), assetHoldings, assets, liabilities: r2(liabilities), net: r2(assets - liabilities) }

  // ── balance sheet, derived from the (balanced) trial → always reconciles ──
  const gnet = (grp: LedgerGroup) => rows.filter(r => r.group === grp).reduce((s, r) => s + (r.debit - r.credit), 0)
  const assetsFromAccounts = r2(gnet('asset'))          // debit-normal
  const bsLiabilities = r2(-gnet('liability'))           // credit-normal
  const openingEquity = r2(-gnet('equity'))
  const retained = r2(-gnet('income') - gnet('expense')) // income (credit) − expense (debit)
  const bsAssets = r2(assetsFromAccounts + assetHoldings)
  const bsEquity = r2(openingEquity + retained + assetHoldings)
  const balanceSheet = {
    assetsFromAccounts, assetHoldings, assets: bsAssets,
    liabilities: bsLiabilities,
    openingEquity, retained, equity: bsEquity,
    balanced: Math.abs(bsAssets - (bsLiabilities + bsEquity)) < 0.5,
  }

  // ── P&L over the window ──
  const inRange = (t: BooksTxn) => (!input.from || t.date >= input.from) && (!input.to || t.date <= input.to)
  let income = 0, expense = 0
  const byCat = new Map<string, { name: string; amount: number; kind: 'income' | 'expense' }>()
  for (const t of transactions) {
    if (t.type === 'transfer' || !inRange(t)) continue
    const amt = Math.abs(Number(t.amount) || 0)
    const kind: 'income' | 'expense' = t.type === 'income' ? 'income' : 'expense'
    if (kind === 'income') income += amt; else expense += amt
    const key = `${kind}:${t.category_id ?? 'uncat'}`
    const name = (t.category_id && catName.get(t.category_id)) || `Uncategorised ${kind}`
    const e = byCat.get(key) ?? { name, amount: 0, kind }
    e.amount += amt; byCat.set(key, e)
  }
  const byCategory = [...byCat.values()].sort((a, b) => b.amount - a.amount)

  return {
    trial: { rows, totalDebit: r2(totalDebit), totalCredit: r2(totalCredit), balanced: Math.abs(totalDebit - totalCredit) < 0.01 },
    netWorth,
    balanceSheet,
    pnl: { income: r2(income), expense: r2(expense), net: r2(income - expense), byCategory },
  }
}
