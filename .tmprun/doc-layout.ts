import { describe, it, expect } from './shim'
import {
  defaultLayout, upgradeLayout, LAYOUT_VERSION, PAGE_H, PAGE_W,
  type DocLayout, type LayoutEl,
} from '../lib/documents/layout'
import { TEMPLATE_FORMATS } from '../lib/documents/templateFormats'

/** Every format that actually renders through the coordinate engine. */
const DOC_FORMATS = TEMPLATE_FORMATS.filter(f => !f.ready).map(f => f.slug)

/** GST documents — these carry both parties' GSTINs by law. */
const GST_FORMATS = DOC_FORMATS.filter(f => f !== 'salary_slip')

const boxes = (l: DocLayout) => l.elements.filter(e => e.type !== 'accentBar')
const sharePage = (a: LayoutEl, b: LayoutEl) => {
  const pa = a.on ?? 'first', pb = b.on ?? 'first'
  return pa === pb || pa === 'all' || pb === 'all'
}
const hit = (a: LayoutEl, b: LayoutEl) =>
  !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)

describe('defaultLayout — every document format', () => {
  it.each(DOC_FORMATS)('%s: no two elements overlap in their designed boxes', format => {
    const els = boxes(defaultLayout(format, format.toUpperCase()))
    const clashes: string[] = []
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j]
        // Deliberate stacking (a watermark behind, a stamp in front) is allowed.
        if (a.layer === 'back' || b.layer === 'back' || a.layer === 'front' || b.layer === 'front') continue
        if (sharePage(a, b) && hit(a, b)) clashes.push(`${a.type}:${a.field ?? a.text} ↔ ${b.type}:${b.field ?? b.text}`)
      }
    }
    expect(clashes).toEqual([])
  })

  it.each(DOC_FORMATS)('%s: nothing is designed off the page', format => {
    for (const el of boxes(defaultLayout(format, 'X'))) {
      expect(el.x).toBeGreaterThanOrEqual(0)
      expect(el.y).toBeGreaterThanOrEqual(0)
      expect(el.x + el.w).toBeLessThanOrEqual(PAGE_W)
      expect(el.y + el.h).toBeLessThanOrEqual(PAGE_H)
    }
  })

  // The bug: proforma printed with a blank description column, because the
  // layout hardcoded columns keyed 'desc' while the adapter emitted 'item'.
  // The table must take its columns from the document, never invent its own.
  it.each(DOC_FORMATS)('%s: the line-item table does not hardcode columns', format => {
    const li = defaultLayout(format, 'X').elements.find(e => e.type === 'lineItems')
    expect(li, `${format} has no line-item table`).toBeTruthy()
    expect(li!.columns).toBeUndefined()
  })

  // Legal requirement: seller and buyer GSTIN on every GST document.
  it.each(GST_FORMATS)('%s: prints both GSTINs', format => {
    const fields = defaultLayout(format, 'X').elements.map(e => e.field)
    expect(fields).toContain('company.gstin')
    expect(fields).toContain('party.gstin')
  })

  it.each(GST_FORMATS)('%s: labels the amount in words', format => {
    const el = defaultLayout(format, 'X').elements.find(e => e.field === 'totals.inWords')
    expect(el, `${format} does not print the amount in words`).toBeTruthy()
    expect(el!.label).toBe('Amount in words:')
  })

  it.each(DOC_FORMATS)('%s: is stamped with the current engine version', format => {
    expect(defaultLayout(format, 'X').version).toBe(LAYOUT_VERSION)
  })
})

describe('upgradeLayout', () => {
  const stale: DocLayout = { version: 1, elements: [{ id: 'a', type: 'text', x: 0, y: 0, w: 10, h: 10, text: 'hi' }] }

  it('rebuilds a layout saved against an older engine', () => {
    const up = upgradeLayout(stale, 'proforma_gst', 'PROFORMA INVOICE')!
    expect(up.version).toBe(LAYOUT_VERSION)
    expect(up.elements.map(e => e.field)).toContain('company.gstin')
  })

  it('leaves a current layout exactly as saved', () => {
    const current: DocLayout = { version: LAYOUT_VERSION, elements: stale.elements }
    expect(upgradeLayout(current, 'proforma_gst', 'X')).toBe(current)
  })

  it('treats a missing or empty layout as "no template"', () => {
    expect(upgradeLayout(null, 'proforma_gst', 'X')).toBeNull()
    expect(upgradeLayout({ version: LAYOUT_VERSION, elements: [] }, 'proforma_gst', 'X')).toBeNull()
  })
})
