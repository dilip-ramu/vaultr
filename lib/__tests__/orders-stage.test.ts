// Where an order has got to, and what you may do about it.

import { describe, it, expect } from 'vitest'
import {
  OPEN_STAGES, stageMeta, isOpen, stageIndex,
  allowedStages, canMoveTo, suggestedStage,
} from '@/lib/orders/stage'

describe('the stages', () => {
  it('runs in the order the work happens', () => {
    expect([...OPEN_STAGES]).toEqual(['enquiry', 'confirmed', 'ordered', 'shipped', 'invoiced'])
  })

  it('gives every stage a label and a plain-words hint', () => {
    for (const s of [...OPEN_STAGES, 'closed', 'cancelled']) {
      const m = stageMeta(s)
      expect(m.label.length).toBeGreaterThan(2)
      expect(m.hint.length).toBeGreaterThan(10)
    }
  })

  it('falls back rather than crashing on a stage it does not know', () => {
    expect(stageMeta('nonsense').key).toBe('enquiry')
  })

  it('counts closed and cancelled as finished', () => {
    expect(isOpen('shipped')).toBe(true)
    expect(isOpen('closed')).toBe(false)
    expect(isOpen('cancelled')).toBe(false)
  })

  it('places closed at the end of the bar and cancelled nowhere on it', () => {
    expect(stageIndex('enquiry')).toBe(0)
    expect(stageIndex('invoiced')).toBe(4)
    expect(stageIndex('closed')).toBe(5)
    expect(stageIndex('cancelled')).toBe(-1)
  })
})

describe('moving an order by hand', () => {
  it('lets you go backwards — a mis-click is far more common than a cancellation', () => {
    expect(canMoveTo('shipped', 'confirmed')).toBe(true)
  })

  it('never lets a dropdown close an order, because closing moves real money', () => {
    for (const s of OPEN_STAGES) expect(canMoveTo(s, 'closed')).toBe(false)
  })

  it('freezes a closed order until it is reopened', () => {
    expect(allowedStages('closed')).toEqual([])
    expect(canMoveTo('closed', 'shipped')).toBe(false)
  })

  it('lets you cancel from anywhere still open', () => {
    for (const s of OPEN_STAGES) expect(canMoveTo(s, 'cancelled')).toBe(true)
  })

  it('lets you revive a cancelled order', () => {
    expect(canMoveTo('cancelled', 'confirmed')).toBe(true)
  })
})

describe('what the paperwork suggests', () => {
  it('offers to move forward when the documents have run ahead', () => {
    expect(suggestedStage('confirmed', { hasSalesOrder: true, hasPurchaseOrder: true })).toBe('ordered')
    expect(suggestedStage('ordered', { hasShipped: true })).toBe('shipped')
    expect(suggestedStage('shipped', { hasCustomerInvoice: true })).toBe('invoiced')
  })

  it('never suggests going backwards — you moved it back on purpose', () => {
    expect(suggestedStage('invoiced', { hasSalesOrder: true })).toBe(null)
  })

  it('says nothing when the paperwork has not caught up', () => {
    expect(suggestedStage('ordered', { hasSalesOrder: true, hasPurchaseOrder: true })).toBe(null)
  })

  it('stays quiet on a closed or cancelled order', () => {
    expect(suggestedStage('closed', { hasCustomerInvoice: true })).toBe(null)
    expect(suggestedStage('cancelled', { hasCustomerInvoice: true })).toBe(null)
  })

  it('reads the furthest document, not the first one it finds', () => {
    // An invoice exists but no challan was ever made. The invoice wins.
    expect(suggestedStage('enquiry', { hasSalesOrder: true, hasCustomerInvoice: true })).toBe('invoiced')
  })
})
