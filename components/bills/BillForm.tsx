'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Bill, Account, Category, Customer, RecurrenceInterval, PaymentTerms, BillDirection } from '@/lib/types'
import { PAYMENT_TERMS_LABELS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getTodayString } from '@/lib/utils'
import FileUpload from '../shared/FileUpload'

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
  const [amount, setAmount] = useState(bill?.amount?.toString() ?? '')
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

  const expenseCats = categories.filter(c => c.type === 'expense')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !amount || !accountId) { setError('Name, amount and account are required'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      name: name.trim(),
      amount: parseFloat(amount),
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
      const res = await supabase.from('bills').update(payload).eq('id', bill.id)
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
      <div className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-xl slide-up overflow-hidden">

        {/* Direction header */}
        <div className={`px-6 pt-5 pb-4 ${direction === 'sent' ? 'bg-blue-500' : 'bg-indigo-500'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-white">{isEdit ? 'Edit Bill' : 'New Bill'}</h2>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setDirection('received')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold ${direction === 'received' ? 'bg-white text-gray-800' : 'bg-white/20 text-white'}`}>
              📥 Received
            </button>
            <button type="button" onClick={() => setDirection('sent')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold ${direction === 'sent' ? 'bg-white text-gray-800' : 'bg-white/20 text-white'}`}>
              📤 Sent
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {direction === 'sent' ? 'Invoice / Bill Name' : 'Bill Name'}
            </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder={direction === 'sent' ? 'e.g. Web Design Invoice' : 'e.g. Electricity Bill'}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required min="0.01" step="0.01"
                  inputMode="decimal" autoComplete="off" enterKeyHint="done"
                  placeholder="0.00" className="w-full pl-7 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required
                className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          {/* Payment Terms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Terms</label>
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value as PaymentTerms)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
              {(Object.entries(PAYMENT_TERMS_LABELS) as [PaymentTerms, string][]).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Invoice number (for sent bills) */}
          {direction === 'sent' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Invoice Number</label>
              <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="INV-001" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono" />
            </div>
          )}

          {/* Customer (for sent bills) */}
          {direction === 'sent' && customers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Account</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
              <option value="">Select account…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
              <option value="">No category</option>
              {expenseCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Follow-up date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Follow-up Reminder Date <span className="text-gray-400">(optional)</span>
            </label>
            <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          {/* Recurring */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setIsRecurring(!isRecurring)}
                className={`w-10 h-6 rounded-full transition-colors relative ${isRecurring ? 'bg-brand-500' : 'bg-gray-200'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">Recurring</span>
            </label>
            {isRecurring && (
              <div className="grid grid-cols-4 gap-1.5">
                {(['daily', 'weekly', 'monthly', 'yearly'] as RecurrenceInterval[]).map(i => (
                  <button key={i} type="button" onClick={() => setInterval(i)}
                    className={`py-2 rounded-xl text-xs font-medium capitalize transition-all ${interval === i ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                    {i}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add a note…" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          {/* Attachments — only shown when editing an existing bill */}
          {isEdit && bill?.id && (
            <div className="border-t border-gray-100 pt-4">
              <FileUpload
                billId={bill.id}
                existingAttachments={bill.attachments ?? []}
              />
            </div>
          )}
          {!isEdit && (
            <p className="text-xs text-gray-400 text-center">
              💡 Save first, then edit to attach receipts or invoices
            </p>
          )}

          <button type="submit" disabled={saving}
            className={`w-full text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60 ${direction === 'sent' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-brand-500 hover:bg-brand-600'}`}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : direction === 'sent' ? 'Create Invoice' : 'Add Bill'}
          </button>
        </form>
      </div>
    </div>
  )
}
