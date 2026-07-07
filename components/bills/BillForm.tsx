'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown, Search } from 'lucide-react'
import type { Bill, Account, Category, Customer, RecurrenceInterval, PaymentTerms, BillDirection } from '@/lib/types'
import { PAYMENT_TERMS_LABELS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getTodayString } from '@/lib/utils'
import { CURRENCIES, getCurrencyMeta } from '@/lib/currencies'
import FileUpload from '../shared/FileUpload'
import AccountChipPicker from '../shared/AccountChipPicker'
import AmountField from '../shared/AmountField'

interface Props {
  bill: Bill | null
  defaultDirection: BillDirection
  accounts: Account[]
  categories: Category[]
  customers: Customer[]
  onSaved: (bill: Bill) => void
  onClose: () => void
}

export default function BillForm({ bill, defaultDirection, accounts, categories, customers, onSaved, onClose }: Props) {
  const isEdit = !!bill

  const [direction, setDirection] = useState<BillDirection>(bill?.direction ?? defaultDirection)
  const [name, setName] = useState(bill?.name ?? '')
  const [currency, setCurrency] = useState(bill?.original_currency ?? 'INR')
  const [amount, setAmount] = useState(
    bill?.original_currency && bill.original_currency !== 'INR' && bill.original_amount
      ? bill.original_amount.toString()
      : bill?.amount?.toString() ?? ''
  )
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [currencySearch, setCurrencySearch] = useState('')
  const [exchangeRate, setExchangeRate] = useState<number | null>(null)
  const [loadingRate, setLoadingRate] = useState(false)
  const [accountId, setAccountId] = useState(bill?.account_id ?? '')
  const [categoryId, setCategoryId] = useState(bill?.category_id ?? '')
  const [customerId, setCustomerId] = useState(bill?.customer_id ?? '')
  const [dueDate, setDueDate] = useState(bill?.due_date ?? getTodayString())
  const [followUpDate, setFollowUpDate] = useState(bill?.follow_up_date ?? '')
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(bill?.payment_terms ?? 'due_on_receipt')
  const [invoiceNumber, setInvoiceNumber] = useState(bill?.invoice_number ?? '')
  const [isRecurring, setIsRecurring] = useState(bill?.is_recurring ?? false)
  const [interval, setInterval] = useState<RecurrenceInterval>(bill?.recurrence_interval ?? 'monthly')
  const [notes, setNotes] = useState(bill?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currency === 'INR') { setExchangeRate(null); return }
    setLoadingRate(true)
    const supabase = createClient()
    supabase
      .from('currency_rates')
      .select('market_rate')
      .eq('currency', currency)
      .order('effective_from', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) {
          setExchangeRate(data.market_rate)
        } else {
          fetch('/api/exchange-rates').then(r => r.json()).then(j => {
            const r = j.rates?.[currency]
            if (r) setExchangeRate(r)
          }).catch(() => {})
        }
        setLoadingRate(false)
      })
  }, [currency])

  const inrAmount = (() => {
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) return null
    if (currency === 'INR') return n
    if (!exchangeRate) return null
    return n * exchangeRate
  })()

  const filteredCurrencies = CURRENCIES.filter(c =>
    c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
    c.name.toLowerCase().includes(currencySearch.toLowerCase())
  )

  const expenseCats = categories.filter(c => c.type === 'expense')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !amount || !accountId) { setError('Name, amount and account are required'); return }
    if (currency !== 'INR' && !inrAmount) { setError('No exchange rate found for ' + currency + '. Set it in Currencies.'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const finalAmount = inrAmount ?? parseFloat(amount)
    const payload = {
      name: name.trim(),
      amount: finalAmount,
      original_currency: currency,
      original_amount: currency !== 'INR' ? parseFloat(amount) : null,
      exchange_rate_used: currency !== 'INR' ? exchangeRate : null,
      direction,
      account_id: accountId,
      category_id: categoryId || null,
      customer_id: (direction === 'sent' && customerId) ? customerId : null,
      due_date: dueDate,
      follow_up_date: followUpDate || null,
      payment_terms: paymentTerms,
      invoice_number: invoiceNumber.trim() || null,
      is_recurring: isRecurring,
      recurrence_interval: isRecurring ? interval : null,
      notes: notes.trim() || null,
      status: 'pending' as const,
    }

    let data, err
    if (isEdit) {
      const res = await supabase.from('bills').update(payload).eq('id', bill.id).eq('user_id', user!.id)
        .select('*, account:accounts(id,name,color,type), category:categories(id,name,icon,color), customer:customers(id,name,email,phone)')
        .single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('bills').insert({ ...payload, user_id: user!.id })
        .select('*, account:accounts(id,name,color,type), category:categories(id,name,icon,color), customer:customers(id,name,email,phone)')
        .single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-xl slide-up overflow-hidden">

        {/* Direction header */}
        <div className={`px-6 pt-5 pb-4 ${direction === 'sent' ? 'bg-[var(--transfer)]' : 'bg-[var(--brand)]'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">{isEdit ? 'Edit Bill' : 'New Bill'}</h2>
            <button onClick={onClose} className="w-8 h-8 bg-[var(--surface)]/20 rounded-lg flex items-center justify-center">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDirection('received')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold ${direction === 'received' ? 'bg-[var(--surface)] ' : 'bg-[var(--surface)]/20 text-white'}`}>
              📥 Received
            </button>
            <button type="button" onClick={() => setDirection('sent')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold ${direction === 'sent' ? 'bg-[var(--surface)] ' : 'bg-[var(--surface)]/20 text-white'}`}>
              📤 Sent
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && <div className="  text-sm rounded-xl px-4 py-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium  mb-1.5">
              {direction === 'sent' ? 'Invoice / Bill Name' : 'Bill Name'}
            </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder={direction === 'sent' ? 'e.g. Web Design Invoice' : 'e.g. Electricity Bill'}
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>

          {/* Amount + Currency */}
          <div>
            <label className="block text-sm font-medium  mb-1.5">Amount</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCurrencyPicker(true)}
                className="flex items-center gap-1.5 px-3 py-3  border border-[var(--border)] rounded-xl text-sm font-semibold  shrink-0 min-w-[80px]">
                <span>{getCurrencyMeta(currency).flag}</span>
                <span>{currency}</span>
                <ChevronDown className="w-3 h-3 " />
              </button>
              <AmountField value={amount} onChange={setAmount}
                placeholder="0.00" className="flex-1 px-4 py-3  border border-[var(--border)] rounded-xl text-sm font-bold" />
            </div>
            {currency !== 'INR' && amount && (
              <div className="mt-1.5 px-3 py-1.5 rounded-xl text-xs" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                {loadingRate ? 'Fetching rate…' : inrAmount
                  ? <>{parseFloat(amount).toFixed(2)} {currency} × ₹{exchangeRate?.toFixed(2)} = <strong>₹{inrAmount.toFixed(2)}</strong></>
                  : <span className="text-[var(--amber)]">No rate for {currency}. Set it in Currencies.</span>
                }
              </div>
            )}
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium  mb-1.5">Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required
              className="w-full px-3 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>

          {/* Payment Terms */}
          <div>
            <label className="block text-sm font-medium  mb-1.5">Payment Terms</label>
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value as PaymentTerms)}
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm">
              {(Object.entries(PAYMENT_TERMS_LABELS) as [PaymentTerms, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Invoice number (for sent bills) */}
          {direction === 'sent' && (
            <div>
              <label className="block text-sm font-medium  mb-1.5">Invoice Number</label>
              <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="INV-001" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm font-mono" />
            </div>
          )}

          {/* Customer (for sent bills) */}
          {direction === 'sent' && customers.length > 0 && (
            <div>
              <label className="block text-sm font-medium  mb-1.5">Customer</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm">
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Account */}
          <div>
            <label className="block text-sm font-medium  mb-1.5">Account</label>
            <AccountChipPicker accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
            {!accountId && <p className="text-xs  mt-1">Please select an account</p>}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium  mb-1.5">Category</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm">
              <option value="">No category</option>
              {expenseCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Follow-up date */}
          <div>
            <label className="block text-sm font-medium  mb-1.5">
              Follow-up Reminder Date <span className="">(optional)</span>
            </label>
            <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>

          {/* Recurring */}
          <div className=" rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setIsRecurring(!isRecurring)}
                className={`w-10 h-6 rounded-full transition-colors relative ${isRecurring ? 'bg-brand-500' : ''}`}>
                <div className={`absolute top-1 w-4 h-4 bg-[var(--surface)] rounded-full shadow transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm font-medium ">Recurring</span>
            </label>
            {isRecurring && (
              <div className="grid grid-cols-4 gap-1.5">
                {(['daily', 'weekly', 'monthly', 'yearly'] as RecurrenceInterval[]).map(i => (
                  <button key={i} type="button" onClick={() => setInterval(i)}
                    className={`py-2 rounded-xl text-xs font-medium capitalize transition-all ${interval === i ? 'bg-brand-500 text-white' : 'bg-[var(--surface)] border border-[var(--border)] '}`}>
                    {i}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium  mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add a note…" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>

          {/* Attachments — only shown when editing an existing bill */}
          {isEdit && bill?.id && (
            <div className="border-t border-[var(--border)] pt-4">
              <FileUpload
                billId={bill.id}
                existingAttachments={bill.attachments ?? []}
              />
            </div>
          )}
          {!isEdit && (
            <p className="text-xs  text-center">
              💡 Save first, then edit to attach receipts or invoices
            </p>
          )}

          <button type="submit" disabled={saving}
            className={`w-full text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60 ${direction === 'sent' ? 'bg-[var(--transfer)] hover:bg-[var(--transfer)]' : 'bg-brand-500 hover:bg-brand-600'}`}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : direction === 'sent' ? 'Create Invoice' : 'Add Bill'}
          </button>
        </form>

        {/* Currency picker modal */}
        {showCurrencyPicker && (
          <div className="absolute inset-0 z-10 flex flex-col rounded-t-3xl md:rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)' }}>
            <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input autoFocus value={currencySearch} onChange={e => setCurrencySearch(e.target.value)}
                  placeholder="Search currency…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              </div>
              <button onClick={() => { setShowCurrencyPicker(false); setCurrencySearch('') }}
                className="w-8 h-8 flex items-center justify-center rounded-lg"
                style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {['INR', ...filteredCurrencies.filter(c => c.code !== 'INR').map(c => c.code)].map(code => {
                const meta = getCurrencyMeta(code)
                return (
                  <button key={code} type="button"
                    onClick={() => { setCurrency(code); setShowCurrencyPicker(false); setCurrencySearch('') }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left"
                    style={{ background: currency === code ? 'var(--brand-light)' : undefined }}>
                    <span className="text-lg">{meta.flag}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{meta.code}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{meta.name}</p>
                    </div>
                    {currency === code && <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Selected</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
