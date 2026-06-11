import { describe, it, expect } from 'vitest'
import { accountGroupRank } from '../utils'

describe('accountGroupRank — Current → Savings → Credit → rest', () => {
  it('ranks built-in types', () => {
    expect(accountGroupRank('checking')).toBe(0)
    expect(accountGroupRank('savings')).toBe(1)
    expect(accountGroupRank('credit')).toBe(2)
    expect(accountGroupRank('cash')).toBe(3)
    expect(accountGroupRank('investment')).toBe(3)
  })

  it('ranks custom type names the same way (case-insensitive)', () => {
    expect(accountGroupRank('other', 'Current')).toBe(0)
    expect(accountGroupRank(null, 'Current Account')).toBe(0)
    expect(accountGroupRank(null, 'Savings')).toBe(1)
    expect(accountGroupRank(null, 'Credit Card')).toBe(2)
    expect(accountGroupRank(null, 'Wallet')).toBe(3)
  })

  it('produces the expected sort order end to end', () => {
    const groups = [
      { type: 'other', label: 'Credit Card' },
      { type: 'other', label: 'Current' },
      { type: 'other', label: 'Petty Cash' },
      { type: 'other', label: 'Savings' },
    ]
    const sorted = [...groups].sort((a, b) =>
      (accountGroupRank(a.type, a.label) - accountGroupRank(b.type, b.label)) || a.label.localeCompare(b.label)
    )
    expect(sorted.map(g => g.label)).toEqual(['Current', 'Savings', 'Credit Card', 'Petty Cash'])
  })
})
