import { describe, it, expect } from './shim'
import {
  netProceeds, totalDeductions, realisedGain, realisedPct, validateSale, salePatch, unsellPatch,
  SALE_CATEGORY_NAME, saleTransactionName, saleTransactionNote,
} from '../lib/assets/sale'

describe('net proceeds', () => {
  it('takes charges and tax out of the sale price', () => {
    expect(netProceeds({ gross: 100000, charges: 500, tax: 10000 })).toBe(89500)
  })

  it('is just the price when nothing was deducted', () => {
    expect(netProceeds({ gross: 100000 })).toBe(100000)
    expect(netProceeds({ gross: 100000, charges: 0, tax: 0 })).toBe(100000)
  })

  it('treats missing values as zero rather than NaN', () => {
    expect(netProceeds({ gross: 5000, charges: null, tax: undefined })).toBe(5000)
  })

  it('rounds to paise, so a third of a rupee never drifts', () => {
    expect(netProceeds({ gross: 1000, charges: 33.333, tax: 0 })).toBe(966.67)
  })

  it('reports what was taken off the top', () => {
    expect(totalDeductions({ gross: 100000, charges: 500, tax: 10000 })).toBe(10500)
  })
})

describe('realised gain', () => {
  // THE BUG THIS EXISTS TO PREVENT: the old app computed sold_price − cost,
  // which counts the bank's fee and the taxman's cut as your profit.
  it('is measured on what reached the account, not the headline price', () => {
    const sale = { gross: 100000, charges: 500, tax: 10000 }
    expect(realisedGain(sale, 80000)).toBe(9500)      // NOT 20000
  })

  it('goes negative on a losing sale', () => {
    expect(realisedGain({ gross: 70000, charges: 500, tax: 0 }, 80000)).toBe(-10500)
  })

  it('can turn a nominal profit into a real loss once deductions bite', () => {
    const sale = { gross: 82000, charges: 1000, tax: 2000 }
    expect(sale.gross).toBeGreaterThan(80000)          // looks like a gain
    expect(realisedGain(sale, 80000)).toBe(-1000)      // actually a loss
  })

  it('expresses the gain as a percentage of cost', () => {
    expect(realisedPct({ gross: 100000, charges: 500, tax: 10000 }, 80000)).toBe(11.88)
  })

  it('has no percentage for a zero-cost asset instead of dividing by zero', () => {
    expect(realisedPct({ gross: 1000 }, 0)).toBeNull()
  })
})

describe('validation', () => {
  const ok = { gross: 100000, charges: 500, tax: 10000 }

  it('accepts a coherent sale', () => {
    expect(validateSale(ok, { markReceived: false, date: '2026-07-12' }).ok).toBe(true)
  })

  it('refuses a sale with no price', () => {
    const v = validateSale({ gross: 0 }, { markReceived: false, date: '2026-07-12' })
    expect(v.ok).toBe(false)
    expect(v.errors.join(' ')).toContain('price')
  })

  it('refuses deductions larger than the sale itself — that is a typo, not a sale', () => {
    const v = validateSale({ gross: 1000, charges: 800, tax: 500 }, { markReceived: false, date: '2026-07-12' })
    expect(v.ok).toBe(false)
    expect(v.errors.join(' ')).toContain('more than the sale price')
  })

  it('refuses negative charges or tax', () => {
    expect(validateSale({ gross: 1000, charges: -5 }, { markReceived: false, date: '2026-07-12' }).ok).toBe(false)
    expect(validateSale({ gross: 1000, tax: -5 }, { markReceived: false, date: '2026-07-12' }).ok).toBe(false)
  })

  it('demands a date', () => {
    expect(validateSale(ok, { markReceived: false, date: '' }).ok).toBe(false)
  })

  it('demands an account when the money has been received', () => {
    const v = validateSale(ok, { markReceived: true, date: '2026-07-12', accountId: null })
    expect(v.ok).toBe(false)
    expect(v.errors.join(' ')).toContain('account')
    expect(validateSale(ok, { markReceived: true, date: '2026-07-12', accountId: 'acc-1' }).ok).toBe(true)
  })

  it('does not demand an account when the money has not arrived yet', () => {
    expect(validateSale(ok, { markReceived: false, date: '2026-07-12' }).ok).toBe(true)
  })
})

describe('the row we write', () => {
  const sale = { gross: 100000, charges: 500, tax: 10000 }

  it('records an unpaid sale with no account and no transaction', () => {
    const p = salePatch(sale, { soldDate: '2026-07-12', markReceived: false })
    expect(p.status).toBe('sold')
    expect(p.sale_payment_status).toBe('awaiting')
    expect(p.sale_net).toBe(89500)
    expect(p.sale_account_id).toBeNull()
    expect(p.sale_transaction_id).toBeNull()
    expect(p.sale_received_date).toBeNull()
  })

  it('records a settled sale against the account and the transaction that credited it', () => {
    const p = salePatch(sale, {
      soldDate: '2026-07-12', markReceived: true,
      accountId: 'acc-1', receivedDate: '2026-07-15', transactionId: 'txn-1',
      buyer: '  Ravi  ', reference: 'UTR123',
    })
    expect(p.sale_payment_status).toBe('received')
    expect(p.sale_account_id).toBe('acc-1')
    expect(p.sale_received_date).toBe('2026-07-15')
    expect(p.sale_transaction_id).toBe('txn-1')
    expect(p.sale_buyer).toBe('Ravi')          // trimmed
  })

  it('falls back to the sale date when money arrived the same day', () => {
    const p = salePatch(sale, { soldDate: '2026-07-12', markReceived: true, accountId: 'a', receivedDate: '' })
    expect(p.sale_received_date).toBe('2026-07-12')
  })

  it('keeps an empty buyer as null rather than an empty string', () => {
    const p = salePatch(sale, { soldDate: '2026-07-12', markReceived: false, buyer: '   ' })
    expect(p.sale_buyer).toBeNull()
  })

  it('un-selling wipes every trace of the money', () => {
    const p = unsellPatch()
    expect(p.status).toBe('held')
    expect(p.sold_price).toBeNull()
    expect(p.sale_net).toBeNull()
    expect(p.sale_charges).toBe(0)
    expect(p.sale_tax).toBe(0)
    expect(p.sale_account_id).toBeNull()
    expect(p.sale_transaction_id).toBeNull()
  })
})

describe('the transaction we book', () => {
  const sale = { gross: 100000, charges: 500, tax: 10000 }

  // THE BUG: the credit landed in the transaction list with no title and no
  // category, reading as a bare "Uncategorised" income line.
  it('titles the row with the asset that was sold', () => {
    expect(saleTransactionName('Gold chain 22k')).toBe('Sale of Gold chain 22k')
  })

  it('files every asset sale under one category', () => {
    expect(SALE_CATEGORY_NAME).toBe('Sale of Asset')
  })

  it('explains the money trail in the note', () => {
    const note = saleTransactionNote(sale, { buyer: 'Ravi', reference: 'UTR9' })
    expect(note).toContain('Buyer: Ravi')
    expect(note).toContain('Gross 100000')
    expect(note).toContain('charges 500')
    expect(note).toContain('tax 10000')
    expect(note).toContain('89500')      // the net that actually landed
    expect(note).toContain('Ref: UTR9')
  })

  it('says nothing about deductions when there were none', () => {
    const note = saleTransactionNote({ gross: 5000 }, { buyer: 'Ravi' })
    expect(note).toBe('Buyer: Ravi')
  })

  it('is empty rather than noisy when there is nothing to add', () => {
    expect(saleTransactionNote({ gross: 5000 }, {})).toBe('')
  })
})
