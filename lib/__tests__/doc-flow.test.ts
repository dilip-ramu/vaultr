import { describe, it, expect } from 'vitest'
import { defaultLayout, PAGE_H, type DocLayout, type LayoutEl } from '@/lib/documents/layout'
import {
  ROW_H, HEAD_H, rowCapacity, measuredHeight, computeShifts, tableBox, paginate, withGstGuard,
} from '@/lib/documents/flow'
import type { LayoutContext } from '@/lib/documents/layoutContext'

// Real data from the invoice that exposed the overlap: four-line addresses on
// both sides, which no fixed-height box can hold.
const LONG_COMPANY = '4/603, Kurunji Nagar, Nathakadu,\nVeerapandi,\nTiruppur- 641605\nTamil Nadu, India'
const LONG_PARTY = 'NEW NO.18/ OLD NO.17, , 4TH  CROSS STREET\nCHENNAI\nChennai\nTamil Nadu 600024'

function ctxWith(rows: number, over: Partial<Record<string, string>> = {}): LayoutContext {
  return {
    accent: '#1F5C3A',
    columns: [
      { key: 'desc', label: 'DESCRIPTION', flex: 2 },
      { key: 'amt', label: 'AMOUNT', align: 'right', flex: 1 },
    ],
    rows: Array.from({ length: rows }, (_, i) => ({ cells: { desc: `Item ${i + 1}`, amt: '100' } })),
    totals: [{ label: 'Taxable value', value: '₹1,000' }],
    grandLabel: 'TOTAL', grandValue: '₹1,180',
    bankLines: ['Bank: HDFC'],
    terms: 'Payment within 30 days.',
    fields: {
      'doc.title': 'PROFORMA INVOICE', 'doc.number': 'L-PI260001', 'doc.date': '2026-07-11',
      'company.name': 'Lullabee', 'company.address': LONG_COMPANY, 'company.gstin': '33AAMFL2572J1Z4',
      'party.label': 'CUSTOMER', 'party.name': 'Amaravathi Garments Mfg Co',
      'party.address': LONG_PARTY, 'party.gstin': '33AANFA7615E1ZN',
      'totals.grandLabel': 'TOTAL', 'totals.grand': '₹1,180',
      'totals.inWords': 'Indian Rupee One Thousand One Hundred Eighty Only',
      ...over,
    },
  }
}

const layout = () => defaultLayout('proforma_gst', 'PROFORMA INVOICE')

/** Where every element actually lands on page p, after auto-flow. */
function laidOut(l: DocLayout, ctx: LayoutContext, p = 0, pages = 1) {
  const shift = computeShifts(l, ctx, p, pages)
  const box = tableBox(l, p, shift)
  const li = l.elements.find(e => e.type === 'lineItems')
  return l.elements
    .filter(e => e.type !== 'accentBar' && (e.on ?? 'first') !== (pages > 1 && p === 0 ? 'last' : '_'))
    .map(e => {
      const s = shift.get(e.id) ?? 0
      const isTable = e.id === li?.id
      const h = isTable ? box.h : measuredHeight(e as LayoutEl, ctx)
      const top = isTable ? box.y : e.y + s
      return { el: e, x: e.x, w: e.w, top, bot: top + h }
    })
    .filter(b => b.bot > b.top)   // collapsed (empty) elements occupy nothing
}

describe('measuredHeight', () => {
  it('grows a box to fit text that needs more lines than were designed for', () => {
    const addr = layout().elements.find(e => e.field === 'company.address')!
    expect(measuredHeight(addr, ctxWith(1))).toBeGreaterThan(addr.h)
  })

  it('collapses a field with no value so it leaves no gap', () => {
    const gstin = layout().elements.find(e => e.field === 'party.gstin')!
    expect(measuredHeight(gstin, ctxWith(1, { 'party.gstin': '' }))).toBe(0)
  })

  it('never shrinks a box below its designed height', () => {
    const name = layout().elements.find(e => e.field === 'company.name')!
    expect(measuredHeight(name, ctxWith(1))).toBeGreaterThanOrEqual(name.h)
  })
})

describe('auto-flow', () => {
  // THE BUG: the address ran under the GSTIN, which ran under the customer block.
  it('lays out four-line addresses with nothing overlapping', () => {
    const placed = laidOut(layout(), ctxWith(3))
    const clashes: string[] = []
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i], b = placed[j]
        if (a.bot <= b.top || b.bot <= a.top) continue
        if (a.x + a.w <= b.x || b.x + b.w <= a.x) continue
        clashes.push(`${a.el.type}:${a.el.field ?? a.el.text} ↔ ${b.el.type}:${b.el.field ?? b.el.text}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it('pushes what sits below a grown box, and only in the same column', () => {
    const l = layout()
    const short = computeShifts(l, ctxWith(1, { 'company.address': 'One line' }), 0, 1)
    const long = computeShifts(l, ctxWith(1), 0, 1)
    const gstin = l.elements.find(e => e.field === 'company.gstin')!
    const date = l.elements.find(e => e.field === 'doc.date')!      // right column
    expect(long.get(gstin.id)!).toBeGreaterThan(short.get(gstin.id)!)
    expect(long.get(date.id)).toBe(0)
  })

  it('lets the table absorb the growth instead of pushing the totals off the page', () => {
    const l = layout()
    const shift = computeShifts(l, ctxWith(1), 0, 1)
    const totals = l.elements.find(e => e.type === 'totals')!
    const bank = l.elements.find(e => e.type === 'bank')!
    expect(shift.get(totals.id)).toBe(0)
    expect(shift.get(bank.id)).toBe(0)

    const box = tableBox(l, 0, shift)
    const li = l.elements.find(e => e.type === 'lineItems')!
    expect(box.y).toBeGreaterThan(li.y)                 // pushed down
    expect(box.y + box.h).toBe(li.y + li.h)             // bottom held
  })

  it('keeps everything inside the page', () => {
    for (const b of laidOut(layout(), ctxWith(3))) expect(b.bot).toBeLessThanOrEqual(PAGE_H)
  })
})

describe('pagination', () => {
  it('agrees with the row height the renderer actually draws', () => {
    // If these drift apart the last row of every page gets sliced in half.
    expect(rowCapacity(HEAD_H + 5 * ROW_H)).toBe(5)
    expect(rowCapacity(HEAD_H + 5 * ROW_H + ROW_H - 1)).toBe(5)
  })

  it('keeps one short document on a single page', () => {
    expect(paginate(layout(), ctxWith(3))).toHaveLength(1)
  })

  it('spills a long document across pages without losing a row', () => {
    const chunks = paginate(layout(), ctxWith(100))
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.reduce((n, c) => n + c.length, 0)).toBe(100)
  })

  it('gives page 1 fewer rows when a long address pushed the table down', () => {
    const l = layout()
    const many = Array.from({ length: 8 }, (_, i) => `Address line ${i + 1}`).join('\n')
    const short = paginate(l, ctxWith(100, { 'company.address': 'One line', 'party.address': 'One line' }))
    const long = paginate(l, ctxWith(100, { 'company.address': many, 'party.address': many }))
    expect(long[0].length).toBeLessThan(short[0].length)
  })

  it('fills continuation pages — page 2 holds more rows than a footer-reserving last page would', () => {
    // Regression: pages 2+ used to keep the first page's header/footer bands as
    // empty gaps. A continuation page now runs top-of-page to bottom margin.
    const chunks = paginate(layout(), ctxWith(100))
    expect(chunks.length).toBeGreaterThan(1)
    // A middle page (not first, not last) should hold more rows than page 0,
    // which gives up its top band to the header.
    const middle = chunks[1]
    expect(middle.length).toBeGreaterThanOrEqual(chunks[0].length)
  })

  it('never emits an empty page', () => {
    for (const chunk of paginate(layout(), ctxWith(31))) expect(chunk.length).toBeGreaterThan(0)
  })
})

describe('GST guard', () => {
  const bare: DocLayout = {
    version: 2,
    elements: [
      { id: 'a', type: 'field', field: 'company.address', x: 44, y: 40, w: 300, h: 40 },
      { id: 'b', type: 'field', field: 'party.address', x: 44, y: 120, w: 300, h: 40 },
    ],
  }

  it('folds the GSTIN into the address when a template forgets to bind it', () => {
    const ctx = withGstGuard(bare, ctxWith(1))
    expect(ctx.fields['company.address']).toContain('GSTIN: 33AAMFL2572J1Z4')
    expect(ctx.fields['party.address']).toContain('GSTIN: 33AANFA7615E1ZN')
  })

  it('does not duplicate a GSTIN the template already prints', () => {
    const ctx = withGstGuard(defaultLayout('proforma_gst', 'X'), ctxWith(1))
    expect(ctx.fields['company.address']).not.toContain('GSTIN')
    expect(ctx.fields['party.address']).not.toContain('GSTIN')
  })

  it('adds nothing when there is no GSTIN to print', () => {
    const ctx = withGstGuard(bare, ctxWith(1, { 'company.gstin': '', 'party.gstin': '' }))
    expect(ctx.fields['company.address']).not.toContain('GSTIN')
  })
})
