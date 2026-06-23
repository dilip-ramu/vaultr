import { describe, it, expect } from 'vitest'
import { effectOn, buildLedger, type ReconTxn } from '../reconcile'

const t = (o: Partial<ReconTxn>): ReconTxn => ({
  id: Math.random().toString(36).slice(2), type: 'expense', amount: 0, date: '2026-05-01',
  name: null, original_currency: 'INR', account_id: 'A', to_account_id: null, ...o,
})

describe('effectOn — mirrors the account_balances SQL', () => {
  it('income adds, expense subtracts on the owning account', () => {
    expect(effectOn(t({ type: 'income', amount: 100, account_id: 'A' }), 'A')).toBe(100)
    expect(effectOn(t({ type: 'expense', amount: 100, account_id: 'A' }), 'A')).toBe(-100)
  })
  it('transfer subtracts from source, adds to destination', () => {
    const tr = t({ type: 'transfer', amount: 500, account_id: 'A', to_account_id: 'B' })
    expect(effectOn(tr, 'A')).toBe(-500)
    expect(effectOn(tr, 'B')).toBe(500)
  })
  it('unrelated account is unaffected', () => {
    expect(effectOn(t({ type: 'income', amount: 100, account_id: 'A' }), 'Z')).toBe(0)
  })
})

describe('buildLedger', () => {
  const base = { accountId: 'A', accountCurrency: 'INR', today: '2026-06-30', accountCurrencyById: { A: 'INR', B: 'INR' } }

  it('running balance = opening + signed effects, oldest first', () => {
    const { rows, computedBalance } = buildLedger({
      ...base, initialBalance: 1000,
      txns: [
        t({ type: 'income', amount: 500, date: '2026-05-02', account_id: 'A' }),
        t({ type: 'expense', amount: 200, date: '2026-05-03', account_id: 'A' }),
        t({ type: 'transfer', amount: 300, date: '2026-05-04', account_id: 'A', to_account_id: 'B' }),
      ],
    })
    expect(rows.map(r => r.running)).toEqual([1500, 1300, 1000])
    expect(computedBalance).toBe(1000)
  })

  it('flags foreign-currency, future-dated, and cross-currency transfers', () => {
    const { rows } = buildLedger({
      ...base, initialBalance: 0,
      accountCurrencyById: { A: 'INR', B: 'USD' },
      txns: [
        t({ type: 'expense', amount: 100, date: '2026-05-02', account_id: 'A', original_currency: 'USD' }),
        t({ type: 'income', amount: 50, date: '2027-01-01', account_id: 'A' }),
        t({ type: 'transfer', amount: 200, date: '2026-05-05', account_id: 'A', to_account_id: 'B' }),
      ],
    })
    const allFlags = rows.flatMap(r => r.flags)
    expect(allFlags).toContain('foreign')
    expect(allFlags).toContain('future')
    expect(allFlags).toContain('cross-currency')
  })

  it('flags possible duplicates (same effect + same date)', () => {
    const { rows } = buildLedger({
      ...base, initialBalance: 0,
      txns: [
        t({ type: 'expense', amount: 999, date: '2026-05-02', account_id: 'A' }),
        t({ type: 'expense', amount: 999, date: '2026-05-02', account_id: 'A' }),
      ],
    })
    expect(rows[0].flags).toContain('dup?')
    expect(rows[1].flags).toContain('dup?')
  })

  it('only includes transactions touching this account', () => {
    const { rows } = buildLedger({
      ...base, initialBalance: 0,
      txns: [ t({ type: 'income', amount: 1, account_id: 'OTHER' }) ],
    })
    expect(rows).toHaveLength(0)
  })
})
