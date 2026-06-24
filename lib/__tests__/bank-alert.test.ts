import { describe, it, expect } from 'vitest'
import {
  extractAmount, extractDirection, extractPartialAccount, extractMerchant, extractDate, genericParse,
  parseAlert, normalizeCurrency, extractCurrency,
} from '../bank-alert/parse'
import '../bank-alert/banks'   // register ICICI etc.
import {
  accountDigits, matchAccount, findDuplicate, findTransferPair, applyMerchantRule,
  type AccountRef, type TxnLike, type DraftLike,
} from '../bank-alert/drafts'

describe('parser helpers', () => {
  it('extracts amounts in common Indian formats', () => {
    expect(extractAmount('Rs. 1,234.56 debited')).toBe(1234.56)
    expect(extractAmount('INR 1234 spent')).toBe(1234)
    expect(extractAmount('₹1,03,428.15 paid')).toBe(103428.15)
    expect(extractAmount('no money here')).toBe(null)
  })

  it('detects debit vs credit, debit by default', () => {
    expect(extractDirection('Rs 500 debited from your a/c')).toBe('debit')
    expect(extractDirection('Rs 500 credited to your a/c')).toBe('credit')
    expect(extractDirection('Rs 500 spent at SWIGGY')).toBe('debit')
    // both words: first occurrence wins
    expect(extractDirection('credited ... not debited')).toBe('credit')
  })

  it('extracts last-4 from account/card references', () => {
    expect(extractPartialAccount('a/c XX1234 debited')).toBe('1234')
    expect(extractPartialAccount('card ending 5678')).toBe('5678')
    expect(extractPartialAccount('A/C ****9012')).toBe('9012')
    expect(extractPartialAccount('no account ref')).toBe(null)
  })

  it('extracts a merchant', () => {
    expect(extractMerchant('Rs 500 spent at SWIGGY on 12-06')).toBe('SWIGGY')
    expect(extractMerchant('paid to AMAZON PAY, ref 123')).toBe('AMAZON PAY')
  })

  it('extracts a date or falls back to received', () => {
    expect(extractDate('on 12-06-2026 at')).toBe('2026-06-12')
    expect(extractDate('dated 5 Jun 2026')).toBe('2026-06-05')
    expect(extractDate('no date', '2026-06-20T10:00:00Z')).toBe('2026-06-20')
  })

  it('generic parse assembles a draft with confidence', () => {
    const r = genericParse({ from: 'alerts@bank.com', subject: 'Txn alert', body: 'Rs. 2,400.00 debited from a/c XX1234 at SWIGGY on 12-06-2026' })
    expect(r.amount).toBe(2400)
    expect(r.direction).toBe('debit')
    expect(r.partialAccount).toBe('1234')
    expect(r.merchant).toBe('SWIGGY')
    expect(r.confidence).toBeGreaterThan(0.7)
  })

  it('normalises and extracts currency', () => {
    expect(normalizeCurrency('Rs.')).toBe('INR')
    expect(normalizeCurrency('₹')).toBe('INR')
    expect(normalizeCurrency('usd')).toBe('USD')
    expect(extractCurrency('charged USD 50.00 at')).toBe('USD')
    expect(extractCurrency('Rs. 100 debited')).toBe('INR')
  })

  it('parses "Mon DD, YYYY" dates', () => {
    expect(extractDate('on Jun 12, 2026 at 05:44')).toBe('2026-06-12')
  })
})

describe('ICICI credit card parser', () => {
  const icici = (body: string) => parseAlert({ from: 'credit_cards@icici.bank.in', subject: 'ICICI Bank Credit Card Transaction', body })

  it('parses a real ICICI alert exactly', () => {
    const r = icici('Your ICICI Bank Credit Card XX0015 has been used for a transaction of INR 3,808.67 on Jun 12, 2026 at 05:44:02. Info: TIRUPUR LORRY URIMAIYA.')!
    expect(r.amount).toBe(3808.67)
    expect(r.currency).toBe('INR')
    expect(r.direction).toBe('debit')
    expect(r.partialAccount).toBe('0015')
    expect(r.merchant).toBe('TIRUPUR LORRY URIMAIYA')
    expect(r.date).toBe('2026-06-12')
    expect(r.confidence).toBeGreaterThan(0.9)
  })

  it('parses the second sample (different card + merchant)', () => {
    const r = icici('Your ICICI Bank Credit Card XX3017 has been used for a transaction of INR 1,712.00 on Jun 12, 2026 at 07:42:56. Info: THE CHOCOLATE ROOM.')!
    expect(r.amount).toBe(1712)
    expect(r.partialAccount).toBe('3017')
    expect(r.merchant).toBe('THE CHOCOLATE ROOM')
  })

  it('handles a foreign-currency card spend', () => {
    const r = icici('Your ICICI Bank Credit Card XX0015 has been used for a transaction of USD 50.00 on Jun 12, 2026 at 05:44:02. Info: AMAZON US.')!
    expect(r.currency).toBe('USD')
    expect(r.amount).toBe(50)
  })

  it('a "used for a transaction" alert is always a debit (expense)', () => {
    const r = icici('Your ICICI Bank Credit Card XX3017 has been used for a transaction of INR 1,712.00 on Jun 12, 2026. Info: THE CHOCOLATE ROOM. Total Credit Limit is INR 5,50,000.00')!
    expect(r.direction).toBe('debit')
  })

  it('a payment-received alert is a credit', () => {
    const r = icici('Payment received towards your ICICI Bank Credit Card XX0015 of INR 10,000.00 on Jun 12, 2026.')
    expect(r?.direction).toBe('credit')
  })

  it('skips non-transaction ICICI emails (promos/statements) entirely', () => {
    // matches ICICI (mentions credit card) but has no transaction line → null
    const r = icici('Convert transactions of Rs 3,000 and above on your ICICI Bank Credit Card into EMI. Give a missed call on 9537667667. SMS iMobile Pay to 56767661.')
    expect(r).toBe(null)
  })
})

describe('Amazon Pay parser', () => {
  const amzn = (body: string) => parseAlert({ from: 'no-reply@amazonpay.in', subject: 'Your payment to SWIGGY was Approved', body })

  it('parses a real Amazon Pay payment', () => {
    const r = amzn('Hi Dilip, Your payment to SWIGGY was Approved. Paid to: SWIGGY Amount: ₹497.0 Seller: SWIGGY Payment date: Wednesday, 24 June, 2026 12:12:09 PM IST')!
    expect(r.amount).toBe(497)
    expect(r.currency).toBe('INR')
    expect(r.direction).toBe('debit')
    expect(r.merchant).toBe('SWIGGY')
    expect(r.date).toBe('2026-06-24')
    expect(r.partialAccount).toBe(null)   // no account number — routed by sender default
  })

  it('treats a refund/cashback as a credit', () => {
    const r = amzn('₹100.00 cashback was added to your Amazon Pay balance on 24 June, 2026.')!
    expect(r.direction).toBe('credit')
    expect(r.amount).toBe(100)
  })

  it('skips non-payment Amazon emails', () => {
    const r = parseAlert({ from: 'no-reply@amazonpay.in', subject: 'Deals of the day', body: 'Shop now and save big on Amazon!' })
    expect(r).toBe(null)
  })
})

const acct = (over: Partial<AccountRef>): AccountRef => ({ id: 'a', name: 'A', ...over })

describe('account matching', () => {
  it('derives digits from matching_digits and account number', () => {
    expect(accountDigits(acct({ matching_digits: '1234', account_number: '99887766' }))).toEqual(['1234', '7766'])
  })

  it('matches a unique account by last-4', () => {
    const accts = [acct({ id: 'x', account_number: '111234' }), acct({ id: 'y', account_number: '225678' })]
    expect(matchAccount('1234', accts)).toEqual({ id: 'x', ambiguous: false })
  })

  it('flags ambiguous when two accounts share the last-4', () => {
    const accts = [acct({ id: 'x', matching_digits: '1234' }), acct({ id: 'y', matching_digits: '1234' })]
    expect(matchAccount('1234', accts)).toEqual({ id: null, ambiguous: true })
  })

  it('no match returns null, not ambiguous', () => {
    expect(matchAccount('0000', [acct({ account_number: '1234' })])).toEqual({ id: null, ambiguous: false })
  })
})

describe('duplicate detection', () => {
  const existing: TxnLike[] = [
    { id: 't1', account_id: 'x', amount: 2400, date: '2026-06-12', type: 'expense' },
  ]
  it('flags same account + amount within 48h', () => {
    expect(findDuplicate({ accountId: 'x', amount: 2400, date: '2026-06-13' }, existing)?.id).toBe('t1')
  })
  it('no flag when amount differs', () => {
    expect(findDuplicate({ accountId: 'x', amount: 2401, date: '2026-06-12' }, existing)).toBe(null)
  })
  it('no flag when outside the window', () => {
    expect(findDuplicate({ accountId: 'x', amount: 2400, date: '2026-06-20' }, existing)).toBe(null)
  })
  it('no flag for a different account', () => {
    expect(findDuplicate({ accountId: 'y', amount: 2400, date: '2026-06-12' }, existing)).toBe(null)
  })
})

describe('transfer detection', () => {
  it('pairs opposite legs between two own accounts', () => {
    const a: DraftLike = { id: '1', matched_account_id: 'x', amount: 5000, direction: 'debit', txn_date: '2026-06-12' }
    const b: DraftLike = { id: '2', matched_account_id: 'y', amount: 5000, direction: 'credit', txn_date: '2026-06-12' }
    expect(findTransferPair(a, [a, b])?.id).toBe('2')
  })
  it('does not pair same direction or same account', () => {
    const a: DraftLike = { id: '1', matched_account_id: 'x', amount: 5000, direction: 'debit', txn_date: '2026-06-12' }
    const same: DraftLike = { id: '2', matched_account_id: 'x', amount: 5000, direction: 'credit', txn_date: '2026-06-12' }
    expect(findTransferPair(a, [a, same])).toBe(null)
  })
})

describe('merchant memory', () => {
  it('applies the first matching rule (case-insensitive substring)', () => {
    const rules = [{ merchant_pattern: 'swiggy', category_id: 'food', payee_id: 'p1', default_name: 'Swiggy order' }]
    expect(applyMerchantRule('SWIGGY BANGALORE', rules)?.category_id).toBe('food')
    expect(applyMerchantRule('AMAZON', rules)).toBe(null)
  })
})
