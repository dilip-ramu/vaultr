import { describe, it, expect } from 'vitest'
import { ordinal, niceDate, auctionNotice, auctionResult, whatsappLink } from '@/lib/chit/messages'

describe('helpers', () => {
  it('ordinals', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(21)).toBe('21st')
  })

  it('formats ISO dates as dd.mm.yyyy and leaves other text alone', () => {
    expect(niceDate('2026-04-14')).toBe('14.04.2026')
    expect(niceDate('15/06/26')).toBe('15/06/26')
    expect(niceDate(null)).toBe('')
  })
})

describe('the auction notice', () => {
  const msg = auctionNotice({
    companyName: 'Unyra Capital',
    chitValue: 500000, members: 20, tenureMonths: 21,
    startDate: '2026-04-14', installment: 25000, dueDay: 14,
    auctionTime: '6:30 PM', monthNumber: 4, auctionDate: '2026-07-14',
    bidCeilingPct: 30,
  })

  it('leads with the ordinal month and the scheme', () => {
    expect(msg).toContain('4th Month Chit Auction Notification')
    expect(msg).toContain('₹5,00,000 Monthly Chit')
  })

  it('carries the key figures', () => {
    expect(msg).toContain('Members: 20')
    expect(msg).toContain('Tenure: 21 Months')
    expect(msg).toContain('Start Date: 14.04.2026')
    expect(msg).toContain('₹25,000 per member')
    expect(msg).toContain('Every month on 14th')
    expect(msg).toContain('Auction Time: 6:30 PM')
    expect(msg).toContain('4th Month Auction Date: 14.07.2026')
    expect(msg).toContain('Up to 30%')
    expect(msg).toContain('Unyra Capital')
  })

  it('omits optional lines that weren’t supplied', () => {
    const bare = auctionNotice({
      companyName: 'X', chitValue: 100000, members: 10, tenureMonths: 10,
      installment: 10000, monthNumber: 1, bidCeilingPct: 25,
    })
    expect(bare).not.toContain('Auction Time')
    expect(bare).not.toContain('Start Date')
  })
})

describe('the auction result', () => {
  it('matches the compact format', () => {
    const msg = auctionResult({
      dateText: '15/06/26', monthNumber: 3, tenureMonths: 21,
      winnerName: 'Vishnu', auctionAmount: 79000, discount: 3950, dueAmount: 21050,
    })
    expect(msg).toBe(
      '15/06/26\nChit no. 3/21\nWinner- Vishnu\nAuction amount- 79,000\nDiscount- 3,950\nDue amount- 21,050',
    )
  })
})

describe('the wa.me link', () => {
  it('joins dial code + number and encodes the message', () => {
    const link = whatsappLink('91', '9876543210', 'Hello there')
    expect(link).toBe('https://wa.me/919876543210?text=Hello%20there')
  })

  it('strips stray non-digits from the number', () => {
    expect(whatsappLink('+91', '98765 43210', 'x')).toContain('wa.me/919876543210?')
  })
})
