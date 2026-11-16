import { describe, it, expect } from 'vitest'
import { docLineText, orderDocLines, type OrderLineLike } from '@/lib/orders/toDocument'
import { defaultGstFor } from '@/lib/documents/money'

const line: OrderLineLike = {
  item: 'Polo navy melange',
  description: '180 GSM single jersey, bio-washed',
  hsn: '6105',
  qty: 0,
  sellRate: 32,
  costRate: 2300,
  sizes: [{ label: 'S', qty: 200 }, { label: 'M', qty: 400 }],
}

describe('the text that reaches the other party', () => {
  it('carries the style, the spec and the sizes on one line', () => {
    expect(docLineText(line)).toBe('Polo navy melange · 180 GSM single jersey, bio-washed · S 200 / M 400')
  })

  it('flattens a multi-line spec, because the form field is one line', () => {
    expect(docLineText({ item: 'A', description: 'line one\nline two' })).toBe('A · line one · line two')
  })

  it('leaves out what is not there', () => {
    expect(docLineText({ item: 'Rib 2x2' })).toBe('Rib 2x2')
    expect(docLineText({ item: 'Rib', description: '  ' })).toBe('Rib')
  })
})

describe('which rate goes on which document', () => {
  it('gives the customer the sell rate', () => {
    expect(orderDocLines([line], 'sell', '18')[0]).toMatchObject({ rate: '32', qty: '600', hsn: '6105' })
  })

  it('gives the supplier the agreed cost rate', () => {
    expect(orderDocLines([line], 'cost', '18')[0]).toMatchObject({ rate: '2300', qty: '600' })
  })

  it('takes the quantity from the sizes on both sides', () => {
    expect(orderDocLines([line], 'sell', '18')[0].qty).toBe(orderDocLines([line], 'cost', '18')[0].qty)
  })

  it('uses the typed quantity on a line with no sizes', () => {
    expect(orderDocLines([{ item: 'Rib', qty: 85, sellRate: 1, costRate: 2 }], 'cost', '18')[0].qty).toBe('85')
  })

  it('puts the tax rate it is given on every line', () => {
    expect(orderDocLines([line], 'cost', '5')[0].gst).toBe('5')
  })

  it('zero-rates an export sales order when told to', () => {
    // The old default of 18 put Indian GST on a USD sales order.
    expect(orderDocLines([line], 'sell', defaultGstFor('USD'))[0].gst).toBe('0')
  })

  it("carries the company's own rate on a rupee purchase order", () => {
    expect(orderDocLines([line], 'cost', defaultGstFor('INR', 5))[0].gst).toBe('5')
  })
})
