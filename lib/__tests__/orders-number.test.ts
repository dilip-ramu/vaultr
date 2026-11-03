import { describe, it, expect } from 'vitest'
import { nextOrderNumber, orderNumberHead } from '@/lib/orders/number'

describe('numbering an order', () => {
  it('starts at 0001 for a fresh year', () => {
    expect(nextOrderNumber([], 2026)).toBe('ORD-26-0001')
  })

  it('carries on from the highest used', () => {
    expect(nextOrderNumber(['ORD-26-0001', 'ORD-26-0007', 'ORD-26-0003'], 2026)).toBe('ORD-26-0008')
  })

  it('does not reuse a deleted number', () => {
    // Three orders existed, the middle one was deleted. The next must be 0004,
    // not 0003 — 0003 is already printed on somebody's paperwork.
    expect(nextOrderNumber(['ORD-26-0001', 'ORD-26-0003'], 2026)).toBe('ORD-26-0004')
  })

  it('restarts each year', () => {
    expect(nextOrderNumber(['ORD-26-0042'], 2027)).toBe('ORD-27-0001')
  })

  it('ignores anything that is not one of our numbers', () => {
    expect(nextOrderNumber(['PNG/2026/118', '', 'ORD-26-xx'], 2026)).toBe('ORD-26-0001')
  })

  it('has a head you can show on a form before saving', () => {
    expect(orderNumberHead(2026)).toBe('ORD-26-')
  })
})
