'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { X, TrendingDown, TrendingUp, ArrowLeftRight, Plus, Search, ChevronDown, ChevronLeft, CheckCircle } from 'lucide-react'
import type { Transaction, Account, Category, TransactionType, Payee } from '@/lib/types'
import { getCategoryEmoji, ACCOUNT_TYPE_CONFIG, resolveAccountTypeDisplay } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { isCrossCurrency, impliedRate, validateCrossTransfer } from '@/lib/fx'
import { getTodayString, accountGroupRank } from '@/lib/utils'
import { CURRENCIES, getCurrencyMeta } from '@/lib/currencies'
import { parseAmount, dateError } from '@/lib/validation'
import FileUpload from '../shared/FileUpload'
import BottomSheet from '../shared/BottomSheet'
import AmountField from '../shared/AmountField'

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

  // A cross-currency transfer is TWO amounts. The balance view used to credit the
  // destination with the SOURCE number — send ₹91,000 to a EUR account and it
  // credited €91,000. So when the currencies differ we must ask what ACTUALLY
  // arrived; we never compute it from a market rate, because your bank's rate on
  // the day is a fact and the market's is a guess.
  const [toAmount, setToAmount] = useState(
    (transaction as { to_amount?: number | null } | undefined)?.to_amount?.toString() ?? '',
  )
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '')
  const [payeeId, setPayeeId] = useState(transaction?.payee_id ?? '')
  const [usedForCompanyId, setUsedForCompanyId] = useState<string | ''>(transaction?.used_for_company_id ?? '')
  const [date, setDate] = useState(transaction?.date ?? getTodayString())
  const [notes, setNotes] = useState(transaction?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [accounts, setAccounts] = useState<Account[]>(propAccounts ?? [])
  const [categories, setCategories] = useState<Category[]>(propCategories ?? [])
  const [payees, setPayees] = useState<Payee[]>([])
  // Your own companies (from /setup/company) — used for the "Used for" picker.
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])

  // Currency rate state
  const [currencyRate, setCurrencyRate] = useState<number | null>(null)
  const [loadingRate, setLoadingRate] = useState(false)

  // Payee UI state
  const [payeeSearch, setPayeeSearch] = useState('')
  const [showPayeeDropdown, setShowPayeeDropdown] = useState(false)
  const [showAddPayee, setShowAddPayee] = useState(false)
  const [newPayeeName, setNewPayeeName] = useState('')
  const [newPayeeType, setNewPayeeType] = useState<'personal' | 'business' | 'other'>('personal')
  const payeeRef = useRef<HTMLDivElement>(null)

  // Category search state
  const [categorySearch, setCategorySearch] = useState('')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)

  // Currency dropdown state
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [currencySearch, setCurrencySearch] = useState('')

  // ── Stepped flow (frames 19a-c) ───────────────────────────────────────────
  // Steps branch by type. When editing, skip straight to Details so all fields
  // are visible at once for a quick change.
  type Step = 'amount' | 'from' | 'to' | 'details'
  const stepsForType: Step[] =
    type === 'transfer' ? ['amount', 'from', 'to', 'details']
    : type === 'income' ? ['amount', 'to', 'details']
    : ['amount', 'from', 'details']
  const [stepIdx, setStepIdx] = useState(0)
  // Clamp to the current path length (type can change on the amount step).
  const idx = Math.min(stepIdx, stepsForType.length - 1)
  const step: Step = stepsForType[idx]
  const isLast = idx === stepsForType.length - 1

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
    const [{ data: payeeRows }, { data: companyRows }] = await Promise.all([
      supabase.from('payees').select('*').order('name'),
      supabase.from('companies').select('id, name').order('is_default', { ascending: false }).order('created_at'),
    ])
    setPayees(payeeRows ?? [])
    setCompanies(companyRows ?? [])
  }

  // Fetch currency rate when currency changes
  useEffect(() => {
    if (currency === 'INR') { setCurrencyRate(null); return }
    const fetchRate = async () => {
      setLoadingRate(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('currency_rates')
        .select('market_rate')
        .eq('currency', currency)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single()
      if (data) {
        setCurrencyRate(data.market_rate)
      } else {
        // Try fetching from API
        try {
          const res = await fetch('/api/exchange-rates')
          const json = await res.json()
          const rate = json.rates?.[currency]
          if (rate) setCurrencyRate(rate)
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
    return amt * currencyRate
  })()

  const rateUsed = currency !== 'INR' ? currencyRate : null

  // Income uses the same category list as expense so you can tag a reimbursement
  // back to the same category (e.g. 50k Vacation expense + 25k Vacation income = 25k net)
  const filteredCategories = type === 'transfer' ? [] : categories.filter(c => c.type === 'expense')

  const fromAcct = accounts.find(a => a.id === accountId)
  const toAcct = accounts.find(a => a.id === toAccountId)
  const fromCcy = (fromAcct?.currency || 'INR').toUpperCase()
  const toCcy = (toAcct?.currency || 'INR').toUpperCase()
  const crossCurrency = type === 'transfer' && !!accountId && !!toAccountId && isCrossCurrency(fromCcy, toCcy)
  const gotRate = crossCurrency
    ? impliedRate({ amount: parseFloat(originalAmount) || 0, toAmount: parseFloat(toAmount) || 0 })
    : null

  const typeConfig = {
    expense:  { label: 'Expense',  icon: TrendingDown,    color: 'bg-[var(--expense)]',   light: ' ' },
    income:   { label: 'Income',   icon: TrendingUp,      color: 'bg-[var(--income)]', light: ' ' },
    transfer: { label: 'Transfer', icon: ArrowLeftRight,  color: 'bg-[var(--transfer)]',  light: 'bg-[var(--surface-2)] text-[var(--transfer)]' },
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

  const handleSave = async () => {
    if (!originalAmount || !accountId) { setError('Amount and account are required'); return }
    if (type === 'transfer' && !toAccountId) { setError('Select destination account'); return }
    if (crossCurrency) {
      const check = validateCrossTransfer({
        amount: parseFloat(originalAmount) || 0,
        toAmount: parseFloat(toAmount) || 0,
      })
      if (!check.ok) { setError(check.errors[0]); return }
    }
    if (currency !== 'INR' && !inrAmount) { setError('Could not get exchange rate for ' + currency); return }
    const amountCheck = parseAmount(originalAmount)
    if (amountCheck.error) { setError(amountCheck.error); return }
    const dateErr = dateError(date)
    if (dateErr) { setError(dateErr); return }

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
      // What actually ARRIVED, in the destination's currency. NULL when both
      // sides share a currency — which keeps every ordinary transfer untouched.
      to_amount: crossCurrency ? parseFloat(toAmount) : null,
      fx_rate: crossCurrency ? gotRate : null,
      category_id: type !== 'transfer' && categoryId ? categoryId : null,
      payee_id: payeeId || null,
      used_for_company_id: usedForCompanyId || null,
      date,
      notes: notes.trim() || null,
    }

    const selectQuery = `*, account:accounts!account_id(id,name,color,type,avatar_url,custom_type_id), to_account:accounts!to_account_id(id,name,color,avatar_url), category:categories(id,name,icon,color,type,avatar_url), payee:payees(id,name,type), attachments(*)`

    let data, err
    if (isEdit) {
      const res = await supabase.from('transactions').update(payload).eq('id', transaction!.id).eq('user_id', user!.id).select(selectQuery).single()
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

  const typeAccent = type === 'expense' ? 'var(--expense)' : type === 'income' ? 'var(--income)' : 'var(--transfer)'
  const fmtInr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? '—'

  // Group the account picker by type, exactly like the Accounts page:
  // built-in types (in config order), then custom types, ranked the same way.
  const accountGroups = useMemo(() => {
    const groups: { key: string; label: string; color: string; type?: string; accounts: Account[] }[] = []
    for (const [type] of Object.entries(ACCOUNT_TYPE_CONFIG)) {
      const typeAccounts = accounts.filter(a => a.type === type && !a.custom_type_id)
      if (typeAccounts.length === 0) continue
      const display = resolveAccountTypeDisplay(type as keyof typeof ACCOUNT_TYPE_CONFIG)
      groups.push({ key: type, label: display.label, color: display.color, type, accounts: typeAccounts })
    }
    const customTypeMap = new Map<string, { name: string; color: string; accounts: Account[] }>()
    for (const a of accounts.filter(a => a.custom_type_id)) {
      const key = a.custom_type_id!
      if (!customTypeMap.has(key)) customTypeMap.set(key, { name: a.custom_type_name ?? 'Custom', color: a.custom_type_color ?? '#6B7280', accounts: [] })
      customTypeMap.get(key)!.accounts.push(a)
    }
    customTypeMap.forEach((v, k) => groups.push({ key: k, label: v.name, color: v.color, accounts: v.accounts }))
    return groups.sort((a, b) => {
      const ra = accountGroupRank(a.type, a.label)
      const rb = accountGroupRank(b.type, b.label)
      if (ra !== rb) return ra - rb
      return a.label.localeCompare(b.label)
    })
  }, [accounts])

  // Advance to the next step, validating the current one first.
  function goNext() {
    setError('')
    if (step === 'amount') {
      const amt = parseAmount(originalAmount)
      if (amt.error) { setError(amt.error); return }
      if (currency !== 'INR' && !inrAmount) { setError('Could not get exchange rate for ' + currency); return }
    }
    if (step === 'from' && !accountId) { setError(type === 'transfer' ? 'Pick the account to transfer from' : 'Pick an account'); return }
    if (step === 'to') {
      if (type === 'transfer' && !toAccountId) { setError('Pick the destination account'); return }
      if (type === 'income' && !accountId) { setError('Pick the account money came into'); return }
    }
    setStepIdx(idx + 1)
  }
  const goBack = () => { setError(''); setStepIdx(Math.max(0, idx - 1)) }
  // Single controlled action for the footer button and Enter key: advance until
  // the final step, and only actually save there. The footer button is always
  // type="button" so landing on the last step can never auto-submit the form.
  const submitOrAdvance = () => { if (isLast) handleSave(); else goNext() }

  // Which account the current account-step edits, and its picker.
  const accountStepSelected = (step === 'to' && type === 'income') ? accountId : step === 'to' ? toAccountId : accountId
  const setAccountStep = (id: string) => {
    if (step === 'to' && type === 'transfer') setToAccountId(id)
    else setAccountId(id)
  }
  const stepSubtitle =
    step === 'amount' ? '' :
    step === 'details' && type === 'transfer' ? `${accountName(accountId)} → ${accountName(toAccountId)}` :
    `${activeType.label} · ${fmtInr(inrAmount ?? (parseFloat(originalAmount) || 0))}`
  const stepTitle = step === 'from' ? 'From account' : step === 'to' ? 'To account' : 'Details'

  // Both new and edit use the stepped flow (edit just starts pre-filled).
  const showAmount   = step === 'amount'
  const showAccounts = step === 'from' || step === 'to'
  const showDetails  = step === 'details'

  return (
    <BottomSheet isOpen onClose={onClose}>

        {/* Stepped header (19a-c) */}
        {step === 'amount' ? (
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{isEdit ? 'Edit transaction' : 'New transaction'}</p>
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-[9px] flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex rounded-[11px] p-[3px]" style={{ background: 'var(--surface-2)' }}>
              {(['expense', 'income', 'transfer'] as TransactionType[]).map(t => {
                const active = type === t
                const acc = t === 'expense' ? 'var(--expense)' : t === 'income' ? 'var(--income)' : 'var(--transfer)'
                return (
                  <button key={t} type="button" onClick={() => setType(t)}
                    className="flex-1 py-2 rounded-[8px] text-[12.5px] font-bold transition-colors"
                    style={active ? { background: acc, color: '#fff' } : { color: 'var(--text-muted)' }}>
                    {typeConfig[t].label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center gap-[11px]">
              <button type="button" onClick={goBack} className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><ChevronLeft className="w-4 h-4" /></button>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate" style={{ color: typeAccent }}>{stepSubtitle}</p>
                <p className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>{stepTitle}</p>
              </div>
              <button type="button" onClick={onClose} className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-[5px] mt-3">
              {stepsForType.map((s, i) => <span key={s} className="flex-1 h-1 rounded-full" style={{ background: i <= idx ? 'var(--brand)' : 'var(--surface-2)' }} />)}
            </div>
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); submitOrAdvance() }} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Fixed-height body so every step is the same size (short steps get
            whitespace, long steps scroll) instead of the sheet resizing. */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto" style={{ height: 'min(58dvh, 460px)' }}>
          {error && <div className="text-[13px] rounded-xl px-4 py-2" style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)', color: 'var(--expense)' }}>{error}</div>}

          {/* Name — details step */}
          {showDetails && (
          <div>
            <label className="block text-sm font-medium  mb-1.5">Name</label>
            <input
              type="text"
              value={txName}
              onChange={e => setTxName(e.target.value)}
              placeholder="e.g. Lunch with client, Monthly rent…"
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm"
            />
          </div>
          )}

          {/* Amount + Currency — amount step */}
          {showAmount && (
          <div>
            {!isEdit && (
              <div className="text-right px-1 pt-1 pb-3">
                <p className="text-[11px] font-bold tracking-[.08em]" style={{ color: typeAccent }}>{activeType.label.toUpperCase()} AMOUNT</p>
              </div>
            )}
            <label className="block text-sm font-medium  mb-1.5">Amount</label>
            <div className="flex gap-2">
              {/* Currency picker button */}
              <button type="button" onClick={() => setShowCurrencyPicker(true)}
                className="flex items-center gap-1.5 px-3 py-3  border border-[var(--border)] rounded-xl text-sm font-semibold  shrink-0  min-w-[80px]">
                <span>{currencyMeta.flag}</span>
                <span>{currency}</span>
                <ChevronDown className="w-3 h-3 " />
              </button>
              <div className="relative flex-1">
                <AmountField
                  value={originalAmount}
                  onChange={setOriginalAmount}
                  placeholder="0.00"
                  title={`Amount (${currency})`}
                  className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-xl font-bold"
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
                  <span className="text-[var(--amber)]">No rate found for {currency}. Go to Currencies page to set it up.</span>
                )}
              </div>
            )}
          </div>
          )}

          {/* A cross-currency transfer: ask what ACTUALLY arrived.
              We deliberately do NOT compute this from the market rate — the rate
              your bank gave you is a fact, the market's is a guess, and quietly
              inventing the destination amount is how the old code credited
              €91,000 for a ₹91,000 transfer. */}
          {showAccounts && step === 'to' && crossCurrency && (
            <div className="rounded-xl border p-3.5 mb-4 space-y-2.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                  {fromCcy} → {toCcy}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>These accounts hold different currencies</span>
              </div>

              <label className="block text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Amount received ({toCcy})
                <input
                  value={toAmount}
                  onChange={e => setToAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder={`How much ${toCcy} actually landed`}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm mt-1"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </label>

              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {gotRate
                  ? <>Rate you got: 1 {fromCcy} = {gotRate} {toCcy}. {parseFloat(originalAmount) || 0} {fromCcy} left, {parseFloat(toAmount) || 0} {toCcy} arrived.</>
                  : <>Enter the amount that landed in the destination account — from the statement, not the market rate.</>}
              </p>
            </div>
          )}

          {/* Accounts — from/to step (stepped list, for both new and edit) */}
          {showAccounts && (
            <div className="flex flex-col gap-4">
              {accountGroups.map(group => {
                const groupAccounts = group.accounts.filter(a => (step === 'to' && type === 'transfer') ? a.id !== accountId : true)
                if (groupAccounts.length === 0) return null
                return (
                  <div key={group.key} className="flex flex-col gap-[9px]">
                    <div className="flex items-center gap-2 px-0.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: group.color }} />
                      <span className="text-[11px] font-extrabold uppercase tracking-[.08em]" style={{ color: 'var(--text-muted)' }}>{group.label}</span>
                    </div>
                    {groupAccounts.map(a => {
                      const selected = accountStepSelected === a.id
                      return (
                        <button key={a.id} type="button" onClick={() => setAccountStep(a.id)}
                          className="flex items-center gap-3 p-[14px] rounded-[14px] text-left transition-colors"
                          style={{ background: selected ? 'var(--brand-light)' : 'var(--surface-2)', border: `1.5px solid ${selected ? 'var(--brand)' : 'transparent'}` }}>
                          {a.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.avatar_url} alt="" className="w-10 h-10 rounded-[11px] object-cover shrink-0" />
                          ) : (
                            <span className="w-10 h-10 rounded-[11px] flex items-center justify-center text-white text-[15px] font-bold shrink-0" style={{ background: a.color || 'var(--brand)' }}>{a.name.charAt(0)}</span>
                          )}
                          <span className="flex-1 min-w-0">
                            <span className="block text-[13.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{a.name}</span>
                            {a.balance != null && <span className="block text-[11px]" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtInr(Number(a.balance))} available</span>}
                          </span>
                          {selected && <CheckCircle className="w-[18px] h-[18px] shrink-0" style={{ color: 'var(--brand)' }} />}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Payee */}
          {showDetails && type !== 'transfer' && (
            <div ref={payeeRef}>
              <label className="block text-sm font-medium  mb-1.5">
                Payee <span className="">(optional)</span>
              </label>
              <div className="relative">
                <div
                  className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm flex items-center gap-2 cursor-pointer"
                  onClick={() => setShowPayeeDropdown(true)}
                >
                  {selectedPayee ? (
                    <>
                      <span className="text-xs   px-1.5 py-0.5 rounded-md capitalize">{selectedPayee.type}</span>
                      <span className="flex-1 ">{selectedPayee.name}</span>
                      <button type="button" onClick={e => { e.stopPropagation(); setPayeeId(''); setPayeeSearch('') }}
                        className=" ">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className=" flex-1">Select payee…</span>
                  )}
                  <ChevronDown className="w-4 h-4  shrink-0" />
                </div>

                {showPayeeDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPayeeDropdown(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--surface)] rounded-xl shadow-lg border border-[var(--border)] z-20 overflow-hidden">
                      <div className="p-2 border-b border-[var(--border)]">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5  absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input autoFocus value={payeeSearch} onChange={e => setPayeeSearch(e.target.value)}
                            placeholder="Search payees…"
                            className="w-full pl-8 pr-3 py-2  rounded-lg text-sm" />
                        </div>
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        {filteredPayees.map(p => (
                          <button key={p.id} type="button"
                            onClick={() => { setPayeeId(p.id); setPayeeSearch(p.name); setShowPayeeDropdown(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5  text-left">
                            <span className={`text-xs px-1.5 py-0.5 rounded-md capitalize font-medium ${
                              p.type === 'business' ? 'bg-[var(--surface-2)] text-[var(--transfer)]' :
                              p.type === 'personal' ? 'bg-[var(--brand-light)] ' :
                              ' '
                            }`}>{p.type}</span>
                            <span className="text-sm ">{p.name}</span>
                          </button>
                        ))}
                        {filteredPayees.length === 0 && (
                          <p className="text-xs  text-center py-3">No payees found</p>
                        )}
                      </div>
                      <div className="border-t border-[var(--border)] p-2">
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

          {/* Category — searchable dropdown */}
          {showDetails && type !== 'transfer' && (
            <div className="relative">
              <label className="block text-sm font-medium  mb-1.5">Category</label>

              {/* Trigger button */}
              <button
                type="button"
                onClick={() => { setShowCategoryDropdown(true); setCategorySearch('') }}
                className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm flex items-center gap-2 text-left"
                style={{ color: categoryId ? 'var(--text)' : 'var(--text-muted)' }}
              >
                {(() => {
                  const sel = filteredCategories.find(c => c.id === categoryId)
                  return sel
                    ? <><span>{getCategoryEmoji(sel.icon)}</span><span className="flex-1 truncate">{sel.name}</span></>
                    : <span className="flex-1">No category</span>
                })()}
                <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              </button>

              {/* Dropdown */}
              {showCategoryDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                  <div
                    className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl shadow-lg overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    {/* Search input */}
                    <div className="p-2 border-b" style={{ borderColor: 'var(--border)' }}>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                        <input
                          autoFocus
                          type="text"
                          value={categorySearch}
                          onChange={e => setCategorySearch(e.target.value)}
                          placeholder="Search categories…"
                          className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                          style={{ background: 'var(--surface-2)', color: 'var(--text)' }}
                        />
                      </div>
                    </div>

                    {/* Results */}
                    <div className="max-h-52 overflow-y-auto">
                      {/* Clear option */}
                      {categoryId && !categorySearch && (
                        <button
                          type="button"
                          onClick={() => { setCategoryId(''); setShowCategoryDropdown(false) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <X className="w-3.5 h-3.5" /> Clear category
                        </button>
                      )}
                      {filteredCategories
                        .filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
                        .map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => { setCategoryId(cat.id); setShowCategoryDropdown(false) }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left"
                            style={{
                              background: cat.id === categoryId ? `${cat.color}18` : undefined,
                              color: 'var(--text)',
                            }}
                          >
                            <span className="text-base shrink-0">{getCategoryEmoji(cat.icon)}</span>
                            <span className="flex-1">{cat.name}</span>
                            {cat.id === categoryId && <span className="text-xs" style={{ color: 'var(--brand)' }}>✓</span>}
                          </button>
                        ))
                      }
                      {filteredCategories.filter(c => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase())).length === 0 && (
                        <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No categories match "{categorySearch}"</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Date */}
          {showDetails && (
          <div>
            <label className="block text-sm font-medium  mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>
          )}

          {/* Used for — which of YOUR companies bore this cost. Personal by default. */}
          {showDetails && companies.length > 0 && (
            <div>
              <label className="block text-sm font-medium  mb-1.5">
                Used for <span className="text-xs font-normal ">(optional)</span>
              </label>
              <select
                value={usedForCompanyId}
                onChange={e => setUsedForCompanyId(e.target.value)}
                className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm"
              >
                <option value="">Personal (default)</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs  mt-1">Slice spending by which business — doesn&apos;t affect who pays or invoices.</p>
            </div>
          )}

          {/* Notes */}
          {showDetails && (
          <div>
            <label className="block text-sm font-medium  mb-1.5">Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add a note…"
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>
          )}

          {showDetails && (
            <FileUpload
              transactionId={isEdit ? transaction!.id : undefined}
              existingAttachments={transaction?.attachments ?? []}
            />
          )}
        </div>

        {/* Footer — Continue through the steps, Save on the last */}
        <div className="shrink-0 px-6 pb-6 pt-3" style={{ borderTop: '1px solid var(--border-2)' }}>
          <button type="button" onClick={submitOrAdvance} disabled={saving}
            className="w-full text-white font-bold py-3.5 rounded-xl transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: typeAccent }}>
            {isLast ? (saving ? 'Saving…' : isEdit ? 'Save changes' : `Add ${activeType.label}`) : 'Continue'}
          </button>
        </div>
        </form>

      {/* Currency picker modal */}
      {showCurrencyPicker && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) setShowCurrencyPicker(false) }}
        >
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCurrencyPicker(false)} />
          <div
            className="relative w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-xl flex flex-col"
            style={{ backgroundColor: 'var(--surface)', maxHeight: '80dvh' }}
          >
            {/* Header */}
            <div
              className="px-5 pt-4 pb-3 border-b shrink-0 flex items-center gap-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                <input
                  autoFocus
                  value={currencySearch}
                  onChange={e => setCurrencySearch(e.target.value)}
                  placeholder="Search currency…"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              <button
                onClick={() => setShowCurrencyPicker(false)}
                className="w-11 h-11 flex items-center justify-center rounded-xl shrink-0"
                style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1" style={{ overscrollBehavior: 'contain' }}>
              <button
                type="button"
                onClick={() => { setCurrency('INR'); setShowCurrencyPicker(false); setCurrencySearch('') }}
                className="w-full flex items-center gap-3 px-5 py-3.5"
                style={{ background: currency === 'INR' ? 'rgba(42,122,80,0.08)' : undefined }}
              >
                <span className="text-lg">🇮🇳</span>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>INR</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Indian Rupee</p>
                </div>
                {currency === 'INR' && <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>✓</span>}
              </button>
              <div className="border-t" style={{ borderColor: 'var(--border)' }} />
              {filteredCurrencies.filter(c => c.code !== 'INR').map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => { setCurrency(c.code); setShowCurrencyPicker(false); setCurrencySearch('') }}
                  className="w-full flex items-center gap-3 px-5 py-3.5"
                  style={{ background: currency === c.code ? 'rgba(42,122,80,0.08)' : undefined }}
                >
                  <span className="text-lg">{c.flag}</span>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.code}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.name}</p>
                  </div>
                  {currency === c.code && <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>✓</span>}
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
          <div
            className="relative w-full md:max-w-sm rounded-t-3xl md:rounded-2xl shadow-xl"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>Add Payee</h3>
              <button
                type="button"
                onClick={() => setShowAddPayee(false)}
                className="w-11 h-11 flex items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Name</label>
                <input
                  autoFocus
                  type="text"
                  value={newPayeeName}
                  onChange={e => setNewPayeeName(e.target.value)}
                  placeholder="e.g. Amazon, Rahul, Swiggy"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Type</label>
                <div className="flex gap-2">
                  {(['personal', 'business', 'other'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewPayeeType(t)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold capitalize transition-all"
                      style={{
                        background: newPayeeType === t ? 'var(--brand)' : 'var(--surface-2)',
                        color: newPayeeType === t ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${newPayeeType === t ? 'var(--brand)' : 'var(--border)'}`,
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Footer */}
            <div
              className="flex gap-3 px-5 py-4 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <button
                type="button"
                onClick={() => setShowAddPayee(false)}
                className="flex-1 py-3 rounded-xl text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddPayee}
                disabled={!newPayeeName.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ background: 'var(--brand)', color: '#fff' }}
              >
                Add Payee
              </button>
            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

