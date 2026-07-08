'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Check, Camera, ChevronDown, ChevronUp, CreditCard, Trash2, Plus } from 'lucide-react'
import type { Account, AccountType, CustomAccountType, DebitCard } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, ACCOUNT_COLORS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'
import { isLoan } from '@/lib/account-metrics'

interface AccountFormProps {
  account: Account | null
  onSaved: (account: Account) => void
  onClose: () => void
}

export default function AccountForm({ account, onSaved, onClose }: AccountFormProps) {
  const isEdit = !!account
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [showDetails, setShowDetails] = useState(false)

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [customTypeId, setCustomTypeId] = useState<string>(account?.custom_type_id ?? '')
  const [balance, setBalance] = useState(account?.initial_balance?.toString() ?? '0')
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0])
  const [currency, setCurrency] = useState(account?.currency ?? 'INR')
  const [includeNetWorth, setIncludeNetWorth] = useState(account?.include_in_net_worth ?? true)
  const [avatarUrl, setAvatarUrl] = useState(account?.avatar_url ?? '')
  const [avatarUploading, setAvatarUploading] = useState(false)

  const [statementDueDay, setStatementDueDay] = useState(account?.statement_due_day?.toString() ?? '')
  const [statementDay, setStatementDay] = useState(account?.statement_day?.toString() ?? '')
  const [creditLimit, setCreditLimit] = useState(account?.credit_limit?.toString() ?? '')
  const [loanPrincipal, setLoanPrincipal] = useState(account?.loan_principal?.toString() ?? '')
  const [interestRate, setInterestRate] = useState(account?.interest_rate?.toString() ?? '')
  const [emiAmount, setEmiAmount] = useState(account?.emi_amount?.toString() ?? '')

  // Extended details
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '')
  const [accountHolder, setAccountHolder] = useState(account?.account_holder ?? '')
  const [branch, setBranch] = useState(account?.branch ?? '')
  const [ifscCode, setIfscCode] = useState(account?.ifsc_code ?? '')
  const [swiftCode, setSwiftCode] = useState(account?.swift_code ?? '')
  const [bankCustomerId, setBankCustomerId] = useState(account?.bank_customer_id ?? '')
  const [bankAddress, setBankAddress] = useState(account?.bank_address ?? '')
  const [openDate, setOpenDate] = useState(account?.open_date ?? '')
  const [closingDate, setClosingDate] = useState(account?.closing_date ?? '')
  // Credit card identity (CVV intentionally never stored)
  const [cardNetwork, setCardNetwork] = useState(account?.card_network ?? '')
  const [cardExpiryMonth, setCardExpiryMonth] = useState(account?.card_expiry_month?.toString() ?? '')
  const [cardExpiryYear, setCardExpiryYear] = useState(account?.card_expiry_year?.toString() ?? '')

  const [customTypes, setCustomTypes] = useState<CustomAccountType[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // v73 — debit cards linked to this account (edit mode only)
  const [dcList, setDcList] = useState<DebitCard[]>([])
  const emptyDC = { label: '', card_number: '', card_network: '', card_holder: '', expiry_month: '', expiry_year: '', bank_customer_id: '' }
  const [dcDraft, setDcDraft] = useState(emptyDC)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('custom_account_types').select('*').then(({ data }) => {
      if (data) setCustomTypes(data)
    })
  }, [])

  useEffect(() => {
    if (!account) return
    const supabase = createClient()
    supabase.from('debit_cards').select('*').eq('account_id', account.id).then(({ data }) => {
      if (data) setDcList(data as DebitCard[])
    })
  }, [account])

  async function addDebitCard() {
    if (!account) return
    if (!dcDraft.card_number.trim() && !dcDraft.label.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: e } = await supabase.from('debit_cards').insert({
      user_id: user!.id, account_id: account.id,
      label: dcDraft.label.trim() || null,
      card_number: dcDraft.card_number.trim() || null,
      card_network: dcDraft.card_network.trim() || null,
      card_holder: dcDraft.card_holder.trim() || null,
      expiry_month: dcDraft.expiry_month ? parseInt(dcDraft.expiry_month) : null,
      expiry_year: dcDraft.expiry_year ? parseInt(dcDraft.expiry_year) : null,
      bank_customer_id: dcDraft.bank_customer_id.trim() || null,
    }).select().single()
    if (e) { setError(e.message); return }
    if (data) { setDcList(prev => [...prev, data as DebitCard]); setDcDraft(emptyDC) }
  }

  async function removeDebitCard(id: string) {
    const supabase = createClient()
    await supabase.from('debit_cards').delete().eq('id', id)
    setDcList(prev => prev.filter(d => d.id !== id))
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2MB'); return }
    setAvatarUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user!.id}/accounts/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setError(uploadErr.message); setAvatarUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
    setAvatarUrl(`${publicUrl}?t=${Date.now()}`)
    setAvatarUploading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      name: name.trim(),
      type,
      custom_type_id: customTypeId || null,
      initial_balance: parseFloat(balance) || 0,
      color,
      currency,
      include_in_net_worth: includeNetWorth,
      avatar_url: avatarUrl || null,
      account_number: accountNumber.trim() || null,
      account_holder: accountHolder.trim() || null,
      branch: branch.trim() || null,
      ifsc_code: ifscCode.trim() || null,
      swift_code: swiftCode.trim() || null,
      bank_customer_id: bankCustomerId.trim() || null,
      bank_address: bankAddress.trim() || null,
      open_date: openDate || null,
      closing_date: closingDate || null,
      statement_due_day: (type === 'credit' && statementDueDay) ? parseInt(statementDueDay) : null,
      statement_day: (type === 'credit' && statementDay) ? parseInt(statementDay) : null,
      credit_limit:   (type === 'credit' && creditLimit) ? parseFloat(creditLimit) : null,
      card_network:      (type === 'credit' && cardNetwork.trim()) ? cardNetwork.trim() : null,
      card_expiry_month: (type === 'credit' && cardExpiryMonth) ? parseInt(cardExpiryMonth) : null,
      card_expiry_year:  (type === 'credit' && cardExpiryYear) ? parseInt(cardExpiryYear) : null,
      loan_principal: (isLoan(type) && loanPrincipal) ? parseFloat(loanPrincipal) : null,
      interest_rate:  ((type === 'credit' || isLoan(type)) && interestRate) ? parseFloat(interestRate) : null,
      emi_amount:     (isLoan(type) && emiAmount) ? parseFloat(emiAmount) : null,
    }

    let data, err
    if (isEdit) {
      const res = await supabase.from('accounts').update(payload).eq('id', account.id).eq('user_id', user!.id).select().single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('accounts').insert({ ...payload, user_id: user!.id }).select().single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }

    const { data: accountWithBalance } = await supabase.from('account_balances').select('*').eq('id', data.id).single()
    onSaved(accountWithBalance ?? data)
  }

  const initials = name.slice(0, 2).toUpperCase() || '??'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-xl slide-up max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-[var(--text)]">{isEdit ? 'Edit Account' : 'New Account'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && <div className="bg-[var(--surface-2)] text-[var(--expense)] text-sm rounded-xl px-4 py-3">{error}</div>}

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar url={avatarUrl} initials={initials} size="lg" />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-[var(--brand)] rounded-full flex items-center justify-center shadow-md"
              >
                {avatarUploading
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-3 h-3 text-white" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Account Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. HDFC Savings"
                required
                className="w-full px-4 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Account Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ACCOUNT_TYPE_CONFIG) as [AccountType, typeof ACCOUNT_TYPE_CONFIG[AccountType]][]).map(([t, config]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setCustomTypeId('') }}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-center ${
                    type === t && !customTypeId ? 'text-white shadow-sm' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                  }`}
                  style={type === t && !customTypeId ? { backgroundColor: config.color } : {}}
                >
                  {config.label}
                </button>
              ))}
              {customTypes.map(ct => (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => { setType('other'); setCustomTypeId(ct.id) }}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-center ${
                    customTypeId === ct.id ? 'text-white shadow-sm' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]'
                  }`}
                  style={customTypeId === ct.id ? { backgroundColor: ct.color } : {}}
                >
                  {ct.name}
                </button>
              ))}
            </div>
          </div>

          {/* Balance & Currency */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                {type === 'credit' ? (isEdit ? 'Opening outstanding' : 'Current outstanding')
                  : isLoan(type) ? (isEdit ? 'Opening outstanding' : 'Current outstanding')
                  : (isEdit ? 'Initial Balance' : 'Opening Balance')}
              </label>
              <input
                type="number"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                step="0.01"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="done"
                className="w-full px-4 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm"
              />
              {(type === 'credit' || isLoan(type)) && (
                <p className="text-[11px] text-[var(--text-faint)] mt-1">
                  Amount owed — enter as a negative number (e.g. −8400). Repayments you log later will reduce it.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm"
              >
                <option value="INR">₹ INR</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
                <option value="AED">د.إ AED</option>
                <option value="SGD">S$ SGD</option>
              </select>
            </div>
          </div>

          {/* Credit card details */}
          {type === 'credit' && (
            <div className="space-y-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Credit limit</label>
                  <input type="number" inputMode="decimal" value={creditLimit}
                    onChange={e => setCreditLimit(e.target.value)} placeholder="e.g. 200000"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Interest rate (APR %)</label>
                  <input type="number" inputMode="decimal" value={interestRate}
                    onChange={e => setInterestRate(e.target.value)} placeholder="e.g. 42"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Statement day</label>
                  <input type="number" min="1" max="31" value={statementDay}
                    onChange={e => setStatementDay(e.target.value)} placeholder="closes on"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Payment due day</label>
                  <input type="number" min="1" max="31" value={statementDueDay}
                    onChange={e => setStatementDueDay(e.target.value)} placeholder="due on"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Card network</label>
                  <input type="text" value={cardNetwork} onChange={e => setCardNetwork(e.target.value)} placeholder="Visa / Mastercard / RuPay"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Expiry (MM / YYYY)</label>
                  <div className="flex gap-2">
                    <input type="number" min="1" max="12" value={cardExpiryMonth} onChange={e => setCardExpiryMonth(e.target.value)} placeholder="MM"
                      className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    <input type="number" min="2000" max="2099" value={cardExpiryYear} onChange={e => setCardExpiryYear(e.target.value)} placeholder="YYYY"
                      className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-faint)]">Card number goes in Account Number below. We never store CVV. Limit enables utilisation tracking; statement days feed the Cards view and forecast.</p>
            </div>
          )}

          {/* Loan details */}
          {isLoan(type) && (
            <div className="space-y-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Original loan amount</label>
                  <input type="number" inputMode="decimal" value={loanPrincipal}
                    onChange={e => setLoanPrincipal(e.target.value)} placeholder="e.g. 500000"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">Interest rate (%)</label>
                  <input type="number" inputMode="decimal" value={interestRate}
                    onChange={e => setInterestRate(e.target.value)} placeholder="e.g. 9.5"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-[var(--text)] mb-1">EMI / monthly payment</label>
                  <input type="number" inputMode="decimal" value={emiAmount}
                    onChange={e => setEmiAmount(e.target.value)} placeholder="e.g. 12000"
                    className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-faint)]">Original amount enables a paid-vs-remaining progress view.</p>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                >
                  {color === c && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Include in Net Worth */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setIncludeNetWorth(!includeNetWorth)}
              className={`w-10 h-6 rounded-full transition-colors relative ${includeNetWorth ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-[var(--surface)] rounded-full shadow transition-transform ${includeNetWorth ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-[var(--text)]">Include in Net Worth</span>
          </label>

          {/* Extended Details (collapsible) */}
          <div className="border border-[var(--border)] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              <span>Bank Details <span className="text-[var(--text-faint)] font-normal">(optional)</span></span>
              {showDetails ? <ChevronUp className="w-4 h-4 text-[var(--text-faint)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-faint)]" />}
            </button>

            {showDetails && (
              <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{type === 'credit' ? 'Card Number' : 'Account Number'}</label>
                    <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                      placeholder="XXXX XXXX XXXX"
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{type === 'credit' ? 'Cardholder Name' : 'Account Holder'}</label>
                    <input type="text" value={accountHolder} onChange={e => setAccountHolder(e.target.value)}
                      placeholder="e.g. Dilip T R"
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Branch</label>
                    <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
                      placeholder="e.g. Koramangala"
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">IFSC Code</label>
                    <input type="text" value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())}
                      placeholder="HDFC0001234"
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">SWIFT Code</label>
                    <input type="text" value={swiftCode} onChange={e => setSwiftCode(e.target.value.toUpperCase())}
                      placeholder="HDFCINBB"
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Customer ID</label>
                    <input type="text" value={bankCustomerId} onChange={e => setBankCustomerId(e.target.value)}
                      placeholder="Bank Customer ID / CIF"
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Account Opened</label>
                    <input type="date" value={openDate} onChange={e => setOpenDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Closing Date</label>
                    <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Bank Address</label>
                  <textarea value={bankAddress} onChange={e => setBankAddress(e.target.value)}
                    rows={2} placeholder="Branch address..."
                    className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm resize-none" />
                </div>
              </div>
            )}
          </div>

          {/* Debit cards — linkable to funding (non-credit/loan) accounts */}
          {type !== 'credit' && !isLoan(type) && (
            <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[var(--text-muted)]" />
                <p className="text-sm font-medium text-[var(--text)]">Debit cards <span className="text-[var(--text-faint)] font-normal">(optional)</span></p>
              </div>
              {!isEdit ? (
                <p className="text-xs text-[var(--text-faint)]">Save the account first, then reopen it to link debit cards.</p>
              ) : (
                <>
                  {dcList.map(dc => (
                    <div key={dc.id} className="flex items-center gap-2 text-sm bg-[var(--surface-2)] rounded-lg px-3 py-2">
                      <span className="font-medium text-[var(--text)] truncate flex-1">{dc.label || dc.card_network || 'Debit card'}{dc.card_number ? ` ···· ${dc.card_number.replace(/\s+/g, '').slice(-4)}` : ''}</span>
                      <button type="button" onClick={() => removeDebitCard(dc.id)} className="text-[var(--expense)] hover:text-[var(--expense)]"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <input value={dcDraft.label} onChange={e => setDcDraft({ ...dcDraft, label: e.target.value })} placeholder="Label (e.g. Platinum)" className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm" />
                    <input value={dcDraft.card_network} onChange={e => setDcDraft({ ...dcDraft, card_network: e.target.value })} placeholder="Network" className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm" />
                    <input value={dcDraft.card_number} onChange={e => setDcDraft({ ...dcDraft, card_number: e.target.value })} placeholder="Card number" className="col-span-2 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm font-mono" />
                    <input value={dcDraft.expiry_month} onChange={e => setDcDraft({ ...dcDraft, expiry_month: e.target.value })} placeholder="Exp MM" className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm" />
                    <input value={dcDraft.expiry_year} onChange={e => setDcDraft({ ...dcDraft, expiry_year: e.target.value })} placeholder="Exp YYYY" className="px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm" />
                    <input value={dcDraft.bank_customer_id} onChange={e => setDcDraft({ ...dcDraft, bank_customer_id: e.target.value })} placeholder="Customer ID (CIF)" className="col-span-2 px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm" />
                  </div>
                  <button type="button" onClick={addDebitCard} className="flex items-center gap-1.5 text-sm font-medium text-[var(--brand)]"><Plus className="w-4 h-4" /> Add debit card</button>
                  <p className="text-[11px] text-[var(--text-faint)]">CVV is never stored.</p>
                </>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[var(--brand)] hover:opacity-90 text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
