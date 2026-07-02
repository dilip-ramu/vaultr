import { describe, it, expect } from 'vitest'
import { buildInvoiceLines, calcTotals, type InvoiceLine } from '../calculator'
import type { RecoverableAllocation, RecoverableShipment } from '../../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function alloc(over: Partial<RecoverableAllocation> = {}): RecoverableAllocation {
  return {
    id: 'a1', user_id: 'u', batch_id: 'b', shipment_id: 's1',
    customer_id: null, supplier_name: 'ACME', pieces: 10,
    base_cost: 1000, markup_type: 'none', markup_value: 0,
    markup_amount: 0, recoverable_amount: 1000, status: 'pending',
    billed_at: null, notes: null, created_at: '', updated_at: '',
    ...over,
  } as RecoverableAllocation
}

function shipment(over: Partial<RecoverableShipment> = {}): RecoverableShipment {
  return {
    id: 's1', user_id: 'u', batch_id: 'b', reference: 'AWB001',
    total_cost: 1000, total_pieces: 10, per_piece_cost: 100,
    source: null, shipment_date: '2026-05-01', destination: null,
    weight_kg: null, raw_row: null, created_at: '',
    ...over,
  } as RecoverableShipment
}

function r2(n: number) { return Math.round(n * 100) / 100 }

function line(amount: number, cgstRate = 9, sgstRate = 9): InvoiceLine {
  return {
    allocationId: 'x', awb: '', shipmentDate: null, clientName: null,
    qty: 1, hsnSac: '996812', baseRate: amount, rate: amount, amount,
    cgstRate, cgstAmount: r2(amount * cgstRate / 100),
    sgstRate, sgstAmount: r2(amount * sgstRate / 100),
  }
}

// ── buildInvoiceLines ────────────────────────────────────────────────────────

describe('buildInvoiceLines', () => {
  it('no markup: rate = base cost / pieces, amount = pieces × rate', () => {
    const [l] = buildInvoiceLines([alloc()], [shipment()], 'none', 0, 9, 9)
    expect(l.baseRate).toBe(100)
    expect(l.rate).toBe(100)
    expect(l.amount).toBe(1000)
  })

  it('percentage markup: 10% on ₹100 base rate → ₹110 rate', () => {
    const [l] = buildInvoiceLines([alloc()], [shipment()], 'percentage', 10, 9, 9)
    expect(l.rate).toBe(110)
    expect(l.amount).toBe(1100)
  })

  it('flat markup: ₹15 on ₹100 base rate → ₹115 rate', () => {
    const [l] = buildInvoiceLines([alloc()], [shipment()], 'flat', 15, 9, 9)
    expect(l.rate).toBe(115)
    expect(l.amount).toBe(1150)
  })

  it('GST per line: 9% CGST + 9% SGST on the line amount', () => {
    const [l] = buildInvoiceLines([alloc()], [shipment()], 'none', 0, 9, 9)
    expect(l.cgstAmount).toBe(90)
    expect(l.sgstAmount).toBe(90)
  })

  it('rounds rates to 4dp and amounts to 2dp (uneven division)', () => {
    // 3698.25 / 11 pieces = 336.204545... → 336.2045
    const [l] = buildInvoiceLines(
      [alloc({ pieces: 11, base_cost: 3698.25 })],
      [shipment({ total_pieces: 11, total_cost: 3698.25 })],
      'none', 0, 9, 9,
    )
    expect(l.baseRate).toBe(336.2045)
    expect(l.amount).toBe(3698.25) // 11 × 336.2045 = 3698.2495 → 3698.25
  })

  it('skips allocations with zero pieces', () => {
    const lines = buildInvoiceLines([alloc({ pieces: 0 })], [shipment()], 'none', 0, 9, 9)
    expect(lines).toHaveLength(0)
  })

  it('sorts lines by shipment date, then AWB', () => {
    const allocs = [
      alloc({ id: 'a1', shipment_id: 's1' }),
      alloc({ id: 'a2', shipment_id: 's2' }),
    ]
    const ships = [
      shipment({ id: 's1', reference: 'B', shipment_date: '2026-05-02' }),
      shipment({ id: 's2', reference: 'A', shipment_date: '2026-05-01' }),
    ]
    const lines = buildInvoiceLines(allocs, ships, 'none', 0, 9, 9)
    expect(lines.map(l => l.awb)).toEqual(['A', 'B'])
  })
})

// ── calcTotals ───────────────────────────────────────────────────────────────

describe('calcTotals', () => {
  it('₹10,000 at 9% + 9% GST = ₹11,800 total', () => {
    const t = calcTotals([line(10000)])
    expect(t.subtotal).toBe(10000)
    expect(t.cgstAmount).toBe(900)
    expect(t.sgstAmount).toBe(900)
    expect(t.total).toBe(11800)
    expect(t.balanceDue).toBe(t.total)
  })

  it('sums per-line GST amounts', () => {
    const t = calcTotals([line(1000), line(2500.5)])
    expect(t.subtotal).toBe(3500.5)
    expect(t.cgstAmount).toBe(315.05) // 90 + 225.05
    expect(t.total).toBe(4130.6)
  })

  it('handles paise rounding without drift', () => {
    // 33.33 × 9% = 2.9997 → 3.00 each side; total = 33.33 + 3 + 3 = 39.33
    const t = calcTotals([line(33.33)])
    expect(t.cgstAmount).toBe(3)
    expect(t.sgstAmount).toBe(3)
    expect(t.total).toBe(39.33)
  })

  it('mixes GST rates across lines', () => {
    // line A: 1000 @ 9%/9% → 90 + 90
    // line B: 2000 @ 6%/6% → 120 + 120
    const t = calcTotals([line(1000, 9, 9), line(2000, 6, 6)])
    expect(t.subtotal).toBe(3000)
    expect(t.cgstAmount).toBe(210) // 90 + 120
    expect(t.sgstAmount).toBe(210)
    expect(t.total).toBe(3420)
  })

  it('zero GST rates produce total = subtotal', () => {
    const t = calcTotals([line(500, 0, 0)])
    expect(t.total).toBe(500)
  })

  it('empty invoice totals to zero', () => {
    const t = calcTotals([])
    expect(t.subtotal).toBe(0)
    expect(t.total).toBe(0)
  })
})

// ── per-line overrides ─────────────────────────────────────────────────────

describe('buildInvoiceLines with overrides', () => {
  it('applies per-line HSN + GST override, falling back to company default', () => {
    const overrides = new Map([
      ['a1', { hsnSac: '998540', cgstRate: 6, sgstRate: 6 }],
    ])
    const [l] = buildInvoiceLines([alloc()], [shipment()], 'none', 0, 9, 9, '996812', overrides)
    expect(l.hsnSac).toBe('998540')
    expect(l.cgstRate).toBe(6)
    expect(l.cgstAmount).toBe(60) // 1000 × 6%
    expect(l.sgstAmount).toBe(60)
  })

  it('uses company default HSN + rate when no override for that line', () => {
    const [l] = buildInvoiceLines([alloc()], [shipment()], 'none', 0, 9, 9, '996812', new Map())
    expect(l.hsnSac).toBe('996812')
    expect(l.cgstRate).toBe(9)
    expect(l.cgstAmount).toBe(90)
  })
})
