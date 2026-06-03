'use client'

import { useState, useEffect, useRef } from 'react'
import { X, TrendingDown, TrendingUp, ArrowLeftRight, Plus, Search, ChevronDown } from 'lucide-react'
import type { Transaction, Account, Category, TransactionType, Payee } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getTodayString } from '@/lib/utils'
import { CURRENCIES, getCurrencyMeta } from '@/lib/currencies'
import FileUpload from '../shared/FileUpload'
import BottomSheet from '../shared/BottomSheet'
import { Avatar } from '../AppShell'

interface Props {
  transaction?: Transaction | null
  accounts?: Account[]
  categories?: Category[]
  onSaved: (tx: Transaction) => void
  onClose: () => void
}

export default function TransactionForm({ transaction, accounts: propAccounts, categories: propCategories, onSaved, onClose }: Props) {
  const isEdit = !!transaction

  const [txName, setTxName] = useState(transaction?.name ?? '')
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense')
  const [originalAmount, setOriginalAmount] = useState(
    transaction?.original_amount?.toString() ?? transaction?.amount?.toString() ?? ''
  )
  const [currency, setCurrency] = useState(transaction?.original_currency ?? 'INR')
  const [accountId, setAccountId] = useState(transaction?.account_id ?? '')
  const [toAccountId, setToAccountId] = useState(transaction?.to_account_id ?? '')
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [payeeId, setPayeeId] = useState(transaction?.payee_id ?? '')
  const [date, setDate] = useState(transaction?.date ?? getTodayString())
  const [notes, setNotes] = useState(transaction?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [accounts, setAccounts] = useState<Account[]>(propAccounts ?? [])
  const [categories, setCategories] = useState<Category[]>(propCategories ?? [])
  const [payees, setPayees] = useState<Payee[]>([])

  // Currency rate state
  const [currencyRate, setCurrencyRate] = useState<{ market: number; expended: number; billing: number } | null>(null)
  const [loadingRate, setLoadingRate] = useState(false)

  // Payee UI state
  const [payeeSearch, setPayeeSearch] = useState('')
  const [showPayeeDropdown, setShowPayeeDropdown] = useState(false)
  const [showAddPayee, setShowAddPayee] = useState(false)
  const [newPayeeName, setNewPayeeName] = useState('')
  const [newPayeeType, setNewPayeeType] = useState<'personal' | 'business' | 'other'>('personal')
  const payeeRef = useRef<HTMLDivElement>(null)

  // Currency dropdown state
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [currencySearch, setCurrencySearch] = useState('')

  useEffect(() => {
    if (propAccounts && propCategories) {
      loadPayees()
      return
    }
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const [{ data: accs }, { data: cats }] = await Promise.all([
        supabase.from('account_balances').select('*').eq('user_id', user!.id).eq('is_active', true),
        supabase.from('categories').select('*').eq('user_id', user!.id).order('name'),
      ])
      setAccounts(accs ?? [])
      setCategories(cats ?? [])
      loadPayees()
    }
    load()
  }, [propAccounts, propCategories])

  const loadPayees = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('payees').select('*').order('name')
    setPayees(data ?? [])
  }

  // Fetch currency rate when currency changes
  useEffect(() => {
    if (currency === 'INR') { setCurrencyRate(null); return }
    const fetchRate = async () => {
      setLoadingRate(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('currency_rates')
        .select('market_rate, expended_rate, billing_rate')
        .eq('currency', currency)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single()
      if (data) {
        setCurrencyRate({
          market: data.market_rate,
          expended: data.expended_rate ?? data.market_rate * 1.05,
          billing: data.billing_rate ?? data.market_rate * 0.95,
        })
      } else {
        // Try fetching from API
        try {
          const res = await fetch('/api/exchange-rates')
          const json = await res.json()
          const rate = json.rates?.[currency]
          if (rate) {
            setCurrencyRate({ market: rate, expended: rate * 1.05, billing: rate * 0.95 })
          }
        } catch {}
      }
      setLoadingRate(false)
    }
    fetchRate()
  }, [currency])

  // Compute INR amount
  const inrAmount = (() => {
    const amt = parseFloat(originalAmount)
    if (isNaN(amt) || amt <= 0) return null
    if (currency === 'INR') return amt
    if (!currencyRate) return null
    const rate = type === 'income' ? currencyRate.billing : currencyRate.expended
    return amt * rate
  })()

  const rateUsed = currency !== 'INR' && currencyRate
    ? (type === 'income' ? currencyRate.billing : currencyRate.expended)
    : null

  const filteredCategories = categories.filter(c => c.type === (type === 'transfer' ? 'expense' : type))

  const typeConfig = {
    expense:  { label: 'Expense',  icon: TrendingDown,    color: 'bg-red-500',   light: 'bg-red-50 text-red-500' },
    income:   { label: 'Income',   icon: TrendingUp,      color: 'bg-green-500', light: 'bg-green-50 text-green-500' },
    transfer: { label: 'Transfer', icon: ArrowLeftRight,  color: 'bg-blue-500',  light: 'bg-blue-50 text-blue-500' },
  }

  const selectedPayee = payees.find(p => p.id === payeeId)
  const filteredPayees = payees.filter(p =>
    p.name.toLowerCase().includes(payeeSearch.toLowerCase())
  )

  const filteredCurrencies = CURRENCIES.filter(c =>
    c.code.toLowerCase().includes(currencySearch.toLowerCase()) ||
    c.name.toLowerCase().includes(currencySearch.toLowerCase())
  )

  const handleAddPayee = async () => {
    if (!newPayeeName.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('payees')
      .insert({ name: newPayeeName.trim(), type: newPayeeType, user_id: user!.id })
      .select().single()
    if (data) {
      setPayees(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setPayeeId(data.id)
      setPayeeSearch(data.name)
    }
    setShowAddPayee(false)
    setNewPayeeName('')
    setShowPayeeDropdown(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!originalAmount || !accountId) { setError('Amount and account are required'); return }
    if (type === 'transfer' && !toAccountId) { setError('Select destination account'); return }
    if (currency !== 'INR' && !inrAmount) { setError('Could not get exchange rate for ' + currency); return }

    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const finalAmount = inrAmount ?? parseFloat(originalAmount)
    const payload = {
      type,
      amount: finalAmount,
      original_currency: currency,
      original_amount: currency !== 'INR' ? parseFloat(originalAmount) : null,
      exchange_rate_used: rateUsed ?? null,
      name: txName.trim() || null,
      account_id: accountId,
      to_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type !== 'transfer' && categoryId ? categoryId : null,
      payee_id: payeeId || null,
      date,
      notes: notes.trim() || null,
    }

    const selectQuery = `*, account:accounts!account_id(id,name,color,type,avatar_url,custom_type_id), to_account:accounts!to_account_id(id,name,color,avatar_url), category:categories(id,name,icon,color,type,avatar_url), payee:payees(id,name,type), attachments(*)`

    let data, err
    if (isEdit) {
      const res = await supabase.from('transactions').update(payload).eq('id', transaction!.id).select(selectQuery).single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('transactions').insert({ ...payload, user_id: user!.id }).select(selectQuery).single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data)
  }

  const activeType = typeConfig[type]
  const currencyMeta = getCurrencyMeta(currency)

  return (
    <BottomSheet isOpen onClose={onClose}>

        {/* Type selector header */}
        <div className={`${activeType.color} px-6 pt-5 pb-4`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white">{isEdit ? 'Edit Transaction' : 'New Transaction'}</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-white/20 rounded-lg">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex gap-2">
            {(Object.keys(typeConfig) as TransactionType[]).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${type === t ? 'bg-white text-gray-800' : 'bg-white/20 text-white'}`}>
                {typeConfig[t].label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input
              type="text"
              value={txName}
              onChange={e => setTxName(e.target.value)}
              placeholder="e.g. Lunch with client, Monthly rent…"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              autoFocus
            />
          </div>

          {/* Amount + Currency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
            <div className="flex gap-2">
              {/* Currency picker button */}
              <button type="button" onClick={() => setShowCurrencyPicker(true)}
                className="flex items-center gap-1.5 px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 shrink-0 hover:bg-gray-100 min-w-[80px]">
                <span>{currencyMeta.flag}</span>
                <span>{currency}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              <div className="relative flex-1">
                <input
                  type="number"
                  value={originalAmount}
                  onChange={e => setOriginalAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xl font-bold"
                />
              </div>
            </div>

            {/* INR conversion preview */}
            {currency !== 'INR' && originalAmount && (
              <div className="mt-2 px-3 py-2 bg-brand-50 rounded-xl text-xs">
                {loadingRate ? (
                  <span className="text-brand-400">Fetching rate…</span>
                ) : inrAmount ? (
                  <span className="text-brand-700">
                    {parseFloat(originalAmount).toFixed(2)} {currency} × ₹{rateUsed?.toFixed(2)} = <strong>₹{inrAmount.toFixed(2)}</strong>
                    {' '}<span className="text-brand-400">({type === 'income' ? 'billing rate' : 'expended rate'})</span>
                  </span>
                ) : (
                  <span className="text-amber-600">No rate found for {currency}. Go to Currencies page to set it up.</span>
                )}
              </div>
            )}
          </div>

          {/* Account */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {type === 'transfer' ? 'From Account' : 'Account'}
            </label>
            <GroupedAccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} />
            {!accountId && <p className="text-xs text-red-400 mt-1">Please select an account</p>}
          </div>

          {type === 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">To Account</label>
              <GroupedAccountChips
                accounts={accounts.filter(a => a.id !== accountId)}
                selectedId={toAccountId}
                onSelect={setToAccountId}
              />
              {!toAccountId && <p className="text-xs text-red-400 mt-1">Please select a destination account</p>}
            </div>
          )}

          {/* Payee */}
          {type !== 'transfer' && (
            <div ref={payeeRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Payee <span className="text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <div
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm flex items-center gap-2 cursor-pointer"
                  onClick={() => setShowPayeeDropdown(true)}
                >
                  {selectedPayee ? (
                    <>
                      <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-md capitalize">{selectedPayee.type}</span>
                      <span className="flex-1 text-gray-800">{selectedPayee.name}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); setPayeeId(''); setPayeeSearch('') }}
                        className="text-gray-400 hover:text-gray-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-400 flex-1">Select payee…</span>
                  )}
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </div>

                {showPayeeDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPayeeDropdown(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden">
                      <div className="p-2 border-b border-gray-100">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input autoFocus value={payeeSearch} onChange={e => setPayeeSearch(e.target.value)}
                            placeholder="Search payees…"
                            className="w-full pl-8 pr-3 py-2 bg-gray-50 rounded-lg text-sm" />
                        </div>
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        {filteredPayees.map(p => (
                          <button key={p.id} type="button"
                            onClick={() => { setPayeeId(p.id); setPayeeSearch(p.name); setShowPayeeDropdown(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left">
                            <span className={`text-xs px-1.5 py-0.5 rounded-md capitalize font-medium ${
                              p.type === 'business' ? 'bg-blue-100 text-blue-600' :
                              p.type === 'personal' ? 'bg-green-100 text-green-600' :
                              'bg-gray-100 text-gray-600'
                            }`}>{p.type}</span>
                            <span className="text-sm text-gray-800">{p.name}</span>
                          </button>
                        ))}
                        {filteredPayees.length === 0 && (
                          <p className="text-xs text-gray-400 text-center py-3">No payees found</p>
                        )}
                      </div>
                      <div className="border-t border-gray-100 p-2">
                        <button type="button"
                          onClick={() => { setShowPayeeDropdown(false); setNewPayeeName(payeeSearch); setShowAddPayee(true) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-500 font-medium hover:bg-brand-50 rounded-lg">
                          <Plus className="w-4 h-4" /> Add new payee
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Category */}
          {type !== 'transfer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                {filteredCategories.map(cat => (
                  <button key={cat.id} type="button"
                    onClick={() => setCategoryId(cat.id === categoryId ? '' : cat.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all text-left ${
                      categoryId === cat.id ? 'ring-2 ring-offset-1 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                    style={categoryId === cat.id ? { backgroundColor: cat.color } : {}}>
                    <span className="shrink-0">{getCategoryEmoji(cat.icon)}</span>
                    <span className="truncate">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add a note…"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          <FileUpload
            transactionId={isEdit ? transaction!.id : undefined}
            existingAttachments={transaction?.attachments ?? []}
          />
        </div>

        {/* Sticky submit button — always visible, never requires scrolling */}
        <div className="shrink-0 px-6 pb-6 pt-3" style={{ borderTop: '1px solid var(--border-2)' }}>
          <button type="submit" disabled={saving}
            className={`w-full text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60 ${activeType.color}`}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : `Add ${activeType.label}`}
          </button>
        </div>
        </form>

      {/* Currency picker modal */}
      {showCurrencyPicker && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCurrencyPicker(false)} />
          <div className="relative bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-xl overflow-hidden" style={{ maxHeight: '70vh' }}>
            <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input autoFocus value={currencySearch} onChange={e => setCurrencySearch(e.target.value)}
                  placeholder="Search currency…"
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm" />
              </div>
              <button onClick={() => setShowCurrencyPicker(false)}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 56px)' }}>
              {/* INR always first */}
              <button type="button" onClick={() => { setCurrency('INR'); setShowCurrencyPicker(false); setCurrencySearch('') }}
                className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 ${currency === 'INR' ? 'bg-brand-50' : ''}`}>
                <span className="text-lg">🇮🇳</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-gray-900">INR</p>
                  <p className="text-xs text-gray-400">Indian Rupee</p>
                </div>
                {currency === 'INR' && <span className="text-xs text-brand-500 font-medium">Selected</span>}
              </button>
              <div className="border-t border-gray-50" />
              {filteredCurrencies.filter(c => c.code !== 'INR').map(c => (
                <button key={c.code} type="button"
                  onClick={() => { setCurrency(c.code); setShowCurrencyPicker(false); setCurrencySearch('') }}
                  className={`w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 ${currency === c.code ? 'bg-brand-50' : ''}`}>
                  <span className="text-lg">{c.flag}</span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-gray-900">{c.code}</p>
                    <p className="text-xs text-gray-400">{c.name}</p>
                  </div>
                  {currency === c.code && <span className="text-xs text-brand-500 font-medium">Selected</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add payee modal */}
      {showAddPayee && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAddPayee(false)} />
          <div className="relative bg-white w-full md:max-w-sm rounded-t-3xl md:rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-gray-900">Add Payee</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
              <input autoFocus type="text" value={newPayeeName} onChange={e => setNewPayeeName(e.target.value)}
                placeholder="e.g. Amazon, Rahul, Swiggy"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
              <div className="flex gap-2">
                {(['personal', 'business', 'other'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setNewPayeeType(t)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                      newPayeeType === t ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAddPayee(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700">
                Cancel
              </button>
              <button type="button" onClick={handleAddPayee} disabled={!newPayeeName.trim()}
                className="flex-1 py-3 rounded-xl bg-brand-500 text-white text-sm font-semibold disabled:opacity-60">
                Add Payee
              </button>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

// ── Type order for grouping ───────────────────────────────────────────────────
const ACCOUNT_TYPE_ORDER = ['checking', 'savings', 'credit', 'cash', 'investment', 'loan', 'other']
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking', savings: 'Savings', credit: 'Credit Card',
  cash: 'Cash', investment: 'Investment', loan: 'Loan', other: 'Other',
}

function GroupedAccountChips({ accounts, selectedId, onSelect }: {
  accounts: Account[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Account[]>()
    const sorted = [...accounts].sort((a, b) => a.name.localeCompare(b.name))
    for (const acc of sorted) {
      const key = acc.type ?? 'other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(acc)
    }
    // Return groups in the canonical type order
    return ACCOUNT_TYPE_ORDER
      .filter(t => map.has(t))
      .map(t => ({ type: t, label: ACCOUNT_TYPE_LABELS[t] ?? t, accounts: map.get(t)! }))
  }, [accounts])

  if (groups.length === 0) return null

  // If all accounts are the same type, skip the group header
  const showHeaders = groups.length > 1

  return (
    <div className="space-y-2">
      {groups.map(g => (
        <div key={g.type}>
          {showHeaders && (
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-faint)' }}>
              {g.label}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {g.accounts.map(a => (
              <AccountChip key={a.id} account={a} selected={selectedId === a.id} onSelect={onSelect} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function AccountChip({ account, selected, onSelect }: {
  account: Account
  selected: boolean
  onSelect: (id: string) => void
}) {
  const config = ACCOUNT_TYPE_CONFIG[account.type] ?? ACCOUNT_TYPE_CONFIG.other
  const accentColor = account.custom_type_color ?? account.color ?? config.color
  const bgColor = account.custom_type_color ? `${account.custom_type_color}18` : config.bgColor

  return (
    <button
      type="button"
      onClick={() => onSelect(account.id)}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all ${
        selected
          ? 'bg-white shadow-sm scale-[1.02]'
          : 'bg-gray-50 border-transparent hover:bg-white hover:shadow-sm'
      }`}
      style={selected ? { borderColor: accentColor } : {}}
    >
      {account.avatar_url ? (
        <Avatar url={account.avatar_url} initials={account.name.slice(0, 2).toUpperCase()} size="sm" />
      ) : (
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ backgroundColor: bgColor }}
        >
          {getAccountEmoji(account.type)}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span className={`text-sm font-medium whitespace-nowrap ${selected ? 'text-gray-900' : 'text-gray-600'}`}>
          {account.name}
        </span>
      </div>
    </button>
  )
}

function getAccountEmoji(type: string): string {
  const map: Record<string, string> = {
    checking: '🏦', savings: '🐷', credit: '💳',
    cash: '💵', investment: '📈', loan: '🏛️', other: '💰',
  }
  return map[type] ?? '💰'
}

function getCategoryEmoji(icon: string): string {
  const map: Record<string, string> = {
    'utensils': '🍽️', 'car': '🚗', 'shopping-bag': '🛍️', 'film': '🎬',
    'zap': '⚡', 'heart-pulse': '❤️', 'graduation-cap': '🎓', 'home': '🏠',
    'plane': '✈️', 'shirt': '👕', 'gift': '🎁', 'briefcase': '💼',
    'dumbbell': '🏋️', 'smartphone': '📱', 'book': '📚', 'coffee': '☕',
    'music': '🎵', 'wifi': '📶', 'building': '🏢', 'trending-up': '📈',
    'dollar-sign': '💵', 'percent': '💹', 'laptop': '💻',
  }
  return map[icon] ?? '💰'
}
