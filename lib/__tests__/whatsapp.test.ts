import { describe, it, expect } from 'vitest'
import { normalizeWhatsAppNumber, buildWhatsAppUrl, salarySlipMessage } from '../whatsapp'

describe('normalizeWhatsAppNumber', () => {
  it('10-digit Indian numbers get the 91 country code', () => {
    expect(normalizeWhatsAppNumber('9876543210')).toBe('919876543210')
  })

  it('formatted numbers are stripped to digits', () => {
    expect(normalizeWhatsAppNumber('+91 98765 43210')).toBe('919876543210')
    expect(normalizeWhatsAppNumber('098765-43210')).toBe('919876543210') // domestic leading zero
  })

  it('numbers already carrying a country code pass through', () => {
    expect(normalizeWhatsAppNumber('919876543210')).toBe('919876543210')
  })

  it('garbage and empties give null', () => {
    expect(normalizeWhatsAppNumber('')).toBe(null)
    expect(normalizeWhatsAppNumber(null)).toBe(null)
    expect(normalizeWhatsAppNumber('12345')).toBe(null)
  })
})

describe('buildWhatsAppUrl', () => {
  it('builds a wa.me link with encoded message', () => {
    expect(buildWhatsAppUrl('9876543210', 'Hi there & welcome'))
      .toBe('https://wa.me/919876543210?text=Hi%20there%20%26%20welcome')
  })

  it('returns null when the number is unusable', () => {
    expect(buildWhatsAppUrl('', 'hello')).toBe(null)
  })
})

describe('salarySlipMessage', () => {
  it('uses first name, month and net pay', () => {
    expect(salarySlipMessage('Ramesh Kumar', 'May 2026', '₹45,000'))
      .toBe('Hi Ramesh, please find attached your salary slip for May 2026. Net payable: ₹45,000.')
  })
})
