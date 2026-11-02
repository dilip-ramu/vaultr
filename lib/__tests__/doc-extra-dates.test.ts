// Cut-off date and ETD on purchase orders: which types carry them, what gets
// saved, and what prints.

import { describe, it, expect } from 'vitest'
import {
  extraDateFields, hasExtraDates, ALL_EXTRA_DATE_KEYS,
  extraDatesToForm, extraDatesToSave, extraDateChips, extraDateFieldValues,
} from '@/lib/documents/extraDates'

const fmt = (iso: string) => iso.split('-').reverse().join('/')

describe('which documents carry the extra dates', () => {
  it('a purchase order carries cut-off date and ETD, in that order', () => {
    expect(extraDateFields('purchase_order').map(f => f.key)).toEqual(['cutoff_date', 'etd'])
    expect(hasExtraDates('purchase_order')).toBe(true)
  })

  it('nothing else does', () => {
    for (const t of ['quotation', 'proforma_gst', 'credit_note', 'debit_note', 'sales_order', 'delivery_challan']) {
      expect(extraDateFields(t)).toEqual([])
      expect(hasExtraDates(t)).toBe(false)
    }
  })

  it('every field has a label and a hint, so nobody has to guess', () => {
    for (const f of extraDateFields('purchase_order')) {
      expect(f.label.length).toBeGreaterThan(1)
      expect(f.hint.length).toBeGreaterThan(5)
    }
  })

  it('lists every key once, for the columns a query has to cover', () => {
    expect([...ALL_EXTRA_DATE_KEYS].sort()).toEqual(['cutoff_date', 'etd'])
  })
})

describe('loading a saved document into the form', () => {
  it('gives the date part only — an input[type=date] rejects a timestamp', () => {
    const form = extraDatesToForm('purchase_order', { cutoff_date: '2026-03-10T00:00:00Z', etd: '2026-03-25' })
    expect(form).toEqual({ cutoff_date: '2026-03-10', etd: '2026-03-25' })
  })

  it('turns an unset date into an empty string, never null', () => {
    expect(extraDatesToForm('purchase_order', { cutoff_date: null })).toEqual({ cutoff_date: '', etd: '' })
    expect(extraDatesToForm('purchase_order', null)).toEqual({ cutoff_date: '', etd: '' })
  })

  it('offers nothing for a type that does not carry them', () => {
    expect(extraDatesToForm('quotation', { etd: '2026-03-25' })).toEqual({})
  })
})

describe('saving the form', () => {
  it('stores a blank field as NULL, because "" is not a date', () => {
    expect(extraDatesToSave('purchase_order', { cutoff_date: '', etd: '2026-03-25' }))
      .toEqual({ cutoff_date: null, etd: '2026-03-25' })
  })

  it('trims what was typed', () => {
    expect(extraDatesToSave('purchase_order', { cutoff_date: ' 2026-03-10 ', etd: '' }))
      .toEqual({ cutoff_date: '2026-03-10', etd: null })
  })

  it('clears a value a type does not carry, so it cannot linger', () => {
    expect(extraDatesToSave('quotation', { cutoff_date: '2026-03-10', etd: '2026-03-25' }))
      .toEqual({ cutoff_date: null, etd: null })
  })

  it('always writes every column, so an edit can clear a date', () => {
    const saved = extraDatesToSave('purchase_order', {})
    expect(Object.keys(saved).sort()).toEqual(['cutoff_date', 'etd'])
  })
})

describe('what prints on the document', () => {
  it('shows the dates as labelled chips, formatted', () => {
    expect(extraDateChips('purchase_order', { cutoff_date: '2026-03-10', etd: '2026-03-25' }, fmt))
      .toEqual([
        { label: 'Cut-off date', value: '10/03/2026' },
        { label: 'ETD', value: '25/03/2026' },
      ])
  })

  it('drops a blank one rather than printing an empty label', () => {
    expect(extraDateChips('purchase_order', { cutoff_date: '', etd: '2026-03-25' }, fmt))
      .toEqual([{ label: 'ETD', value: '25/03/2026' }])
    expect(extraDateChips('purchase_order', null, fmt)).toEqual([])
  })

  it('prints nothing on a document type that has no such dates', () => {
    expect(extraDateChips('credit_note', { etd: '2026-03-25' }, fmt)).toEqual([])
  })

  it('exposes flat template keys, blank rather than missing', () => {
    expect(extraDateFieldValues('purchase_order', { etd: '2026-03-25' }, fmt))
      .toEqual({ 'doc.cutoff_date': '', 'doc.etd': '25/03/2026' })
    expect(extraDateFieldValues('quotation', { etd: '2026-03-25' }, fmt)).toEqual({})
  })
})
