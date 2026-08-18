import { describe, it, expect } from 'vitest'
import { syncCorporateActions } from '@/lib/investments/lab/corporate-sync'
import { asClient } from './helpers/fake-supabase'
import { seedDb, position, makeLabRow, USER, LAB, NOW } from './helpers/lab-fixture'
import type { LabAccount } from '@/lib/investments/lab/types'

const trade = (over: Record<string, unknown> = {}) => ({
  id: 'tr-seed', lab_id: LAB, user_id: USER, ts: '2026-08-03T04:00:00Z',
  side: 'buy', symbol: 'AAA', exchange: 'NSE', quantity: 100,
  gross_amount: 100_000, costs_total: 150, cash_after: 899_850, realized_pnl: null,
  ...over,
})

const events = (list: Record<string, unknown>[]) =>
  async () => ({ events: list as never, sources: [], failure: null })

describe('dividends credit virtual cash exactly once (items 3 and 4)', () => {
  const dividend = [{
    symbol: 'AAA', exchange: 'NSE', type: 'dividend',
    dividend_per_share: 12.5, ex_date: '2026-08-10',
    record_date: '2026-08-11', payment_date: '2026-08-20', details: 'interim',
  }]

  it('credits cash, records the full detail, and does not repeat on a second run', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 100 })],
      extra: { lab_trades: [trade()] },
    })
    const lab = makeLabRow() as LabAccount

    const first = await syncCorporateActions(asClient(db), USER, lab, { now: NOW, fetchEvents: events(dividend) })
    expect(first.dividends).toBe(1)
    expect(first.cashCredited).toBe(1250)
    expect(db.rows('lab_accounts')[0].cash).toBe(1_001_250)

    const row = db.rows('lab_dividends')[0]
    expect(row.shares_on_record).toBe(100)
    expect(row.gross_dividend).toBe(1250)
    expect(row.net_dividend).toBe(1250)
    expect(row.ex_date).toBe('2026-08-10')
    expect(row.payment_date).toBe('2026-08-20')
    expect(row.processed_at).toBeTruthy()

    // Idempotency: the unique key means a second sync changes nothing.
    const second = await syncCorporateActions(asClient(db), USER, lab, { now: NOW, fetchEvents: events(dividend) })
    expect(second.dividends).toBe(0)
    expect(db.count('lab_dividends')).toBe(1)
    expect(db.rows('lab_accounts')[0].cash).toBe(1_001_250)
  })

  it('uses shares held before the ex-date, not the current quantity', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 300 })],     // topped up later
      extra: { lab_trades: [trade(), trade({ id: 'tr-2', ts: '2026-08-14T04:00:00Z', quantity: 200 })] },
    })
    const r = await syncCorporateActions(asClient(db), USER, makeLabRow() as LabAccount, { now: NOW, fetchEvents: events(dividend) })
    expect(r.dividends).toBe(1)
    expect(db.rows('lab_dividends')[0].shares_on_record).toBe(100)   // not 300
    expect(r.cashCredited).toBe(1250)
  })

  it('skips a dividend with no ex-date rather than guessing eligibility', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA' })], extra: { lab_trades: [trade()] } })
    const r = await syncCorporateActions(asClient(db), USER, makeLabRow() as LabAccount, {
      now: NOW, fetchEvents: events([{ symbol: 'AAA', exchange: 'NSE', type: 'dividend', dividend_per_share: 5, ex_date: null }]),
    })
    expect(r.dividends).toBe(0)
    expect(r.skipped).toBe(1)
    expect(r.notes.join(' ')).toMatch(/ex-date/i)
  })

  it('does not pay a dividend for a position opened after the ex-date', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 100 })],
      extra: { lab_trades: [trade({ ts: '2026-08-15T04:00:00Z' })] },
    })
    const r = await syncCorporateActions(asClient(db), USER, makeLabRow() as LabAccount, { now: NOW, fetchEvents: events(dividend) })
    expect(r.dividends).toBe(0)
    expect(db.rows('lab_accounts')[0].cash).toBe(1_000_000)
  })
})

describe('splits and bonuses stay economically neutral (item 3)', () => {
  it('a 5:1 split multiplies shares, keeps total cost basis, and rescales the carried price', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1000 })],
      extra: { lab_trades: [trade()] },
    })
    const r = await syncCorporateActions(asClient(db), USER, makeLabRow() as LabAccount, {
      now: NOW, fetchEvents: events([{ symbol: 'AAA', exchange: 'NSE', type: 'split', ratio: 5, ex_date: '2026-08-12' }]),
    })
    expect(r.splits).toBe(1)
    const p = db.rows('lab_positions')[0]
    expect(p.quantity).toBe(500)
    expect(p.cost_basis).toBe(100_000)       // unchanged — per-share cost fell
    expect(p.last_price).toBe(200)           // 1000 / 5 — otherwise NAV would crash
    expect(500 * 200).toBe(100 * 1000)       // value is preserved
  })

  it('a 1:1 bonus doubles shares and halves the carried price', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1000 })],
      extra: { lab_trades: [trade()] },
    })
    const r = await syncCorporateActions(asClient(db), USER, makeLabRow() as LabAccount, {
      now: NOW, fetchEvents: events([{ symbol: 'AAA', exchange: 'NSE', type: 'bonus', ratio: 1, ex_date: '2026-08-12' }]),
    })
    expect(r.bonuses).toBe(1)
    const p = db.rows('lab_positions')[0]
    expect(p.quantity).toBe(200)
    expect(p.cost_basis).toBe(100_000)
    expect(p.last_price).toBe(500)
  })

  it('applies a split only once however often the sync runs', async () => {
    const db = seedDb({
      positions: [position({ symbol: 'AAA', quantity: 100, cost_basis: 100_000, last_price: 1000 })],
      extra: { lab_trades: [trade()] },
    })
    const lab = makeLabRow() as LabAccount
    const ev = events([{ symbol: 'AAA', exchange: 'NSE', type: 'split', ratio: 5, ex_date: '2026-08-12' }])
    await syncCorporateActions(asClient(db), USER, lab, { now: NOW, fetchEvents: ev })
    await syncCorporateActions(asClient(db), USER, lab, { now: NOW, fetchEvents: ev })
    expect(db.rows('lab_positions')[0].quantity).toBe(500)     // not 2500
    expect(db.count('lab_corporate_actions')).toBe(1)
  })

  it('flags a merger instead of applying it, and does not flag it twice', async () => {
    const db = seedDb({ positions: [position({ symbol: 'AAA' })], extra: { lab_trades: [trade()] } })
    const lab = makeLabRow() as LabAccount
    const ev = events([{ symbol: 'AAA', exchange: 'NSE', type: 'merger', ex_date: '2026-08-12', details: 'scheme of arrangement' }])
    const first = await syncCorporateActions(asClient(db), USER, lab, { now: NOW, fetchEvents: ev })
    const second = await syncCorporateActions(asClient(db), USER, lab, { now: NOW, fetchEvents: ev })
    expect(first.flagged).toBe(1)
    expect(second.flagged).toBe(0)
    expect(db.count('lab_corporate_actions')).toBe(1)
    expect(db.rows('lab_corporate_actions')[0].status).toBe('flagged')
    expect(db.rows('lab_positions')[0].quantity).toBe(100)     // untouched
  })
})
