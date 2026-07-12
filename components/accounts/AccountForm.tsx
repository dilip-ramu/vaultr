'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Check, Camera, ChevronDown, ChevronUp, CreditCard, Trash2, Plus, ImagePlus } from 'lucide-react'
import type { Account, AccountType, CustomAccountType, DebitCard, BuiltinTypeOverride, AccountHolder } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, ACCOUNT_COLORS, resolveAccountTypeDisplay } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useFileDrop } from '@/components/shared/useFileDrop'
import { Avatar } from '../AppShell'
import CardGlass from '../shared/CardGlass'
import { cardFaceGradient } from '@/lib/card-gradient'
import { isLoan } from '@/lib/account-metrics'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

interface AccountFormProps {
  account: Account | null
  holders?: AccountHolder[]
  onSaved: (account: Account) => void
  onClose: () => void
  onDeleted?: (id: string) => void
}

const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' }

export default function AccountForm({ account, holders = [], onSaved, onClose, onDeleted }: AccountFormProps) {
  const [holderId, setHolderId] = useState(account?.account_holder_id ?? '')
  const isEdit = !!account
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [showDetails, setShowDetails] = useState(isEdit)

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
  const [overrides, setOverrides] = useState<BuiltinTypeOverride[]>([])
  const typeDisp = (t: AccountType) => resolveAccountTypeDisplay(t, overrides)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // Inline "new account type" quick-create
  const [showNewType, setShowNewType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeColor, setNewTypeColor] = useState(ACCOUNT_COLORS[0])
  const [creatingType, setCreatingType] = useState(false)

  const handleCreateType = async () => {
    if (!newTypeName.trim()) return
    setCreatingType(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: err } = await supabase
      .from('custom_account_types')
      .insert({ name: newTypeName.trim(), color: newTypeColor, icon: 'wallet', user_id: user!.id })
      .select().single()
    setCreatingType(false)
    if (err || !data) { setError(err?.message ?? 'Could not create type'); return }
    setCustomTypes(prev => [...prev, data])
    setType('other'); setCustomTypeId(data.id)
    setShowNewType(false); setNewTypeName(''); setNewTypeColor(ACCOUNT_COLORS[0])
  }

  // v73 — debit cards linked to this account (edit mode only)
  const [dcList, setDcList] = useState<DebitCard[]>([])
  const emptyDC = { label: '', card_number: '', card_network: '', card_holder: '', expiry_month: '', expiry_year: '', bank_customer_id: '' }
  const [dcDraft, setDcDraft] = useState(emptyDC)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('custom_account_types').select('*').then(({ data }) => {
      if (data) setCustomTypes(data)
    })
    supabase.from('builtin_account_type_overrides').select('*').then(({ data }) => {
      if (data) setOverrides(data as BuiltinTypeOverride[])
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

  const avatarDrop = useFileDrop(f => uploadAvatarFile(f[0]), { disabled: avatarUploading })
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => uploadAvatarFile(e.target.files?.[0])
  const uploadAvatarFile = async (file?: File) => {
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

  // v83 — bank link (drives the cheque template used when printing cheques).
  const [bankId, setBankId] = useState(account?.bank_id ?? '')

  // Which company this account belongs to. Optional — blank means personal, and
  // the company view will list it as unassigned rather than assuming.
  const [companyId, setCompanyId] = useState<string>(
    (account as (typeof account & { company_id?: string | null }) | undefined)?.company_id ?? '',
  )
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    const sb = createClient()
    sb.from('companies').select('id, name').order('is_default', { ascending: false }).order('name')
      .then(({ data }) => setCompanies((data ?? []) as { id: string; name: string }[]))
  }, [])
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    let live = true
    const supabase = createClient()
    supabase.from('banks').select('id, name').order('name').then(({ data }) => { if (live) setBanks(data ?? []) })
    return () => { live = false }
  }, [])

  // Bank logo — separate from the account-holder avatar.
  const [bankLogoUrl, setBankLogoUrl] = useState(account?.bank_logo_url ?? '')
  const [logoUploading, setLogoUploading] = useState(false)
  const uploadBankLogo = async (file?: File) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setError('Logo must be under 2MB'); return }
    setLogoUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const ext = file.name.split('.').pop()
    const path = `${user!.id}/bank-logos/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('vaultr-avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setError(uploadErr.message); setLogoUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('vaultr-avatars').getPublicUrl(path)
    setBankLogoUrl(`${publicUrl}?t=${Date.now()}`)
    setLogoUploading(false)
  }
  const logoDrop = useFileDrop(f => uploadBankLogo(f[0]), { disabled: logoUploading })
  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Account name is required'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      name: name.trim(),
      type,
      company_id: companyId || null,
      custom_type_id: customTypeId || null,
      initial_balance: parseFloat(balance) || 0,
      color,
      currency,
      include_in_net_worth: includeNetWorth,
      avatar_url: avatarUrl || null,
      bank_logo_url: bankLogoUrl || null,
      account_number: accountNumber.trim() || null,
      account_holder: accountHolder.trim() || null,
      account_holder_id: holderId || null,
      branch: branch.trim() || null,
      ifsc_code: ifscCode.trim() || null,
      swift_code: swiftCode.trim() || null,
      bank_customer_id: bankCustomerId.trim() || null,
      bank_address: bankAddress.trim() || null,
      bank_id: bankId || null,
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

  const handleDelete = async () => {
    if (!account) return
    if (!await confirmDialog(`Delete “${account.name}”? This can’t be undone.`)) return
    setDeleting(true)
    setError('')
    const supabase = createClient()
    const { error: e } = await supabase.from('accounts').delete().eq('id', account.id)
    if (e) { setError(e.message); setDeleting(false); return }
    onDeleted?.(account.id)
    onClose()
  }

  const initials = (name || '?').slice(0, 2).toUpperCase()
  const isCredit = type === 'credit'

  // ── Live preview values ──────────────────────────────────────────────────
  const activeCustom = customTypes.find(c => c.id === customTypeId)
  const previewFace = customTypeId ? (activeCustom?.color ?? '#2A7A50') : typeDisp(type).color
  const previewTypeLabel = customTypeId ? (activeCustom?.name ?? 'Custom') : typeDisp(type).label
  const balNum = parseFloat(balance)
  const previewBalance = (CURRENCY_SYMBOL[currency] ?? '') + (isNaN(balNum) ? '0' : Math.abs(balNum).toLocaleString('en-IN', { maximumFractionDigits: 2 }))
  const last4 = accountNumber.replace(/\s+/g, '').slice(-4)

  // Only show the three headline types as quick pills; the rest live in "More".
  const HEADLINE: AccountType[] = ['checking', 'savings', 'credit']

  const inputCls = 'w-full px-4 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:max-w-4xl rounded-t-3xl md:rounded-3xl shadow-2xl slide-up max-h-[92vh] overflow-hidden flex flex-col md:flex-row">

        {/* ── LEFT: form column ── */}
        <div className="flex flex-col flex-1 min-w-0 max-h-[92vh]">
          {/* Header */}
          <div className="shrink-0 px-6 py-4 flex items-center justify-between border-b border-[var(--border)]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0 rounded-xl transition-all" {...avatarDrop.dropProps} style={avatarDrop.dragOver ? { outline: '2px dashed var(--brand)', outlineOffset: 2 } : undefined}>
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center" style={{ background: `color-mix(in srgb, ${previewFace} 16%, transparent)` }}>
                  {avatarUrl && !avatarDrop.dragOver
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="text-[17px]">🏦</span>}
                </div>
                <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}
                  className="absolute -bottom-1 -right-1 w-5 h-5 bg-[var(--brand)] rounded-full flex items-center justify-center shadow-md">
                  {avatarUploading ? <span className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" /> : <Camera className="w-2.5 h-2.5 text-white" />}
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </div>
              <h2 className="text-lg font-extrabold text-[var(--text)] truncate">{isEdit ? `Edit · ${account?.name ?? ''}` : 'New account'}</h2>
            </div>
            <button onClick={onClose} className="w-9 h-9 shrink-0 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] bg-[var(--surface-2)] rounded-xl">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && <div className="bg-[color-mix(in_srgb,var(--expense)_10%,transparent)] text-[var(--expense)] text-sm rounded-xl px-4 py-3">{error}</div>}

              {/* Account Type — pills */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text-muted)] mb-2">Account type</label>
                <div className="flex flex-wrap gap-2">
                  {HEADLINE.map(t => {
                    const active = type === t && !customTypeId
                    const d = typeDisp(t)
                    return (
                      <button key={t} type="button" onClick={() => { setType(t); setCustomTypeId('') }}
                        className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                        style={active ? { background: d.color, color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                        {d.label}
                      </button>
                    )
                  })}
                  {/* remaining built-in types + custom types */}
                  {(Object.keys(ACCOUNT_TYPE_CONFIG) as AccountType[])
                    .filter(t => !HEADLINE.includes(t))
                    .map(t => {
                      const active = type === t && !customTypeId
                      const d = typeDisp(t)
                      return (
                        <button key={t} type="button" onClick={() => { setType(t); setCustomTypeId('') }}
                          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                          style={active ? { background: d.color, color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                          {d.label}
                        </button>
                      )
                    })}
                  {customTypes.map(ct => (
                    <button key={ct.id} type="button" onClick={() => { setType('other'); setCustomTypeId(ct.id) }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                      style={customTypeId === ct.id ? { background: ct.color, color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                      {ct.name}
                    </button>
                  ))}
                  <button type="button" onClick={() => setShowNewType(v => !v)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1 border border-dashed border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
                    <Plus className="w-3.5 h-3.5" /> New type
                  </button>
                </div>

                {showNewType && (
                  <div className="mt-2 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] space-y-2.5">
                    <input type="text" autoFocus value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateType() } }}
                      placeholder="e.g. PPF, NPS, Gold, Crypto"
                      className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    <div className="flex gap-2 flex-wrap items-center">
                      {ACCOUNT_COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setNewTypeColor(c)}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110" style={{ backgroundColor: c }}>
                          {newTypeColor === c && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                        </button>
                      ))}
                      {/* custom colour — any value */}
                      <label className="w-7 h-7 rounded-full relative cursor-pointer flex items-center justify-center overflow-hidden"
                        style={{ background: ACCOUNT_COLORS.includes(newTypeColor) ? 'conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)' : newTypeColor, boxShadow: '0 0 0 1px var(--border)' }}
                        title="Custom colour">
                        <input type="color" value={newTypeColor} onChange={e => setNewTypeColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                        {!ACCOUNT_COLORS.includes(newTypeColor) && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setShowNewType(false); setNewTypeName('') }}
                        className="flex-1 py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text)] hover:bg-[var(--surface)]">Cancel</button>
                      <button type="button" onClick={handleCreateType} disabled={creatingType || !newTypeName.trim()}
                        className="flex-1 py-2 rounded-lg bg-[var(--brand)] text-white text-xs font-semibold disabled:opacity-60">
                        {creatingType ? 'Adding…' : 'Add & select'}
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--text-faint)]">Icons and renaming live on the Account Types page.</p>
                  </div>
                )}
              </div>

              {/* Account name */}
              <div>
                <label className="block text-sm font-semibold text-[var(--text-muted)] mb-1.5">Account name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. HDFC Savings" required className={inputCls} />
              </div>

              {/* Balance + Currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-[var(--text-muted)] mb-1.5">
                    {isCredit ? (isEdit ? 'Opening outstanding' : 'Current outstanding')
                      : isLoan(type) ? (isEdit ? 'Opening outstanding' : 'Current outstanding')
                      : (isEdit ? 'Initial balance' : 'Opening balance')}
                  </label>
                  <input type="number" value={balance} onChange={e => setBalance(e.target.value)} step="0.01" inputMode="decimal" autoComplete="off" enterKeyHint="done" className={inputCls} />
                  {(isCredit || isLoan(type)) && (
                    <p className="text-[11px] text-[var(--text-faint)] mt-1">Amount owed — enter as a negative number (e.g. −8400). Repayments you log later will reduce it.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-muted)] mb-1.5">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)} className="w-full px-3 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm">
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
              {isCredit && (
                <div className="space-y-3 rounded-xl p-3" style={{ background: 'var(--surface-2)' }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">Credit limit</label>
                      <input type="number" inputMode="decimal" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="e.g. 200000" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">Interest rate (APR %)</label>
                      <input type="number" inputMode="decimal" value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="e.g. 42" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">Statement day</label>
                      <input type="number" min="1" max="31" value={statementDay} onChange={e => setStatementDay(e.target.value)} placeholder="closes on" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">Payment due day</label>
                      <input type="number" min="1" max="31" value={statementDueDay} onChange={e => setStatementDueDay(e.target.value)} placeholder="due on" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">Card network</label>
                      <input type="text" value={cardNetwork} onChange={e => setCardNetwork(e.target.value)} placeholder="Visa / Mastercard / RuPay" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">Expiry (MM / YYYY)</label>
                      <div className="flex gap-2">
                        <input type="number" min="1" max="12" value={cardExpiryMonth} onChange={e => setCardExpiryMonth(e.target.value)} placeholder="MM" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                        <input type="number" min="2000" max="2099" value={cardExpiryYear} onChange={e => setCardExpiryYear(e.target.value)} placeholder="YYYY" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
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
                      <input type="number" inputMode="decimal" value={loanPrincipal} onChange={e => setLoanPrincipal(e.target.value)} placeholder="e.g. 500000" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">Interest rate (%)</label>
                      <input type="number" inputMode="decimal" value={interestRate} onChange={e => setInterestRate(e.target.value)} placeholder="e.g. 9.5" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-[var(--text)] mb-1">EMI / monthly payment</label>
                      <input type="number" inputMode="decimal" value={emiAmount} onChange={e => setEmiAmount(e.target.value)} placeholder="e.g. 12000" className="w-full px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm" />
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-faint)]">Original amount enables a paid-vs-remaining progress view.</p>
                </div>
              )}

              {/* Bank details (collapsible) */}
              <div className="border rounded-xl overflow-hidden" style={{ borderColor: showDetails ? previewFace : 'var(--border)' }}>
                <button type="button" onClick={() => setShowDetails(!showDetails)}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold"
                  style={{ color: showDetails ? previewFace : 'var(--text)', background: showDetails ? `color-mix(in srgb, ${previewFace} 8%, transparent)` : 'transparent' }}>
                  <span>Bank details <span className="text-[var(--text-faint)] font-normal">(optional)</span></span>
                  {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 text-[var(--text-faint)]" />}
                </button>

                {showDetails && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
                    {/* Bank logo (separate from the account-holder photo) */}
                    <div className="flex items-center gap-3 pt-3">
                      <button type="button" onClick={() => logoInputRef.current?.click()} {...logoDrop.dropProps}
                        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden transition-all"
                        style={{ background: logoDrop.dragOver ? 'var(--brand-light)' : 'var(--surface-2)', border: `1px ${logoDrop.dragOver ? 'dashed var(--brand)' : 'solid var(--border)'}` }}>
                        {bankLogoUrl && !logoDrop.dragOver
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={bankLogoUrl} alt="" className="w-full h-full object-contain" />
                          : <ImagePlus className="w-5 h-5" style={{ color: 'var(--text-faint)' }} />}
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Bank logo</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{logoUploading ? 'Uploading…' : 'Shown on the card & shareable image. Tap or drop an image.'}</p>
                        {bankLogoUrl && <button type="button" onClick={() => setBankLogoUrl('')} className="text-[11px] mt-0.5" style={{ color: 'var(--expense)' }}>Remove</button>}
                      </div>
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => uploadBankLogo(e.target.files?.[0])} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{isCredit ? 'Card number' : 'Account number'}</label>
                        <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="XXXX XXXX XXXX" className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{isCredit ? 'Cardholder' : 'Account holder'}</label>
                        <select value={holderId} onChange={e => { const id = e.target.value; setHolderId(id); const h = holders.find(x => x.id === id); setAccountHolder(h ? h.name : '') }}
                          className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm appearance-none" style={{ color: 'var(--text)' }}>
                          <option value="">— None —</option>
                          {holders.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                        </select>
                        <p className="text-[10.5px] mt-1" style={{ color: 'var(--text-faint)' }}>{holders.length === 0 ? 'Add people in Settings → Users, then pick them here.' : 'Name & photo come from the user — edit them in Settings → Users.'}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Company</label>
                        <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                          className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm appearance-none" style={{ color: 'var(--text)' }}>
                          <option value="">Personal / unassigned</option>
                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <p className="text-[10.5px] mt-1" style={{ color: 'var(--text-faint)' }}>Used by the company view. Leave blank for a personal account.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Bank (cheque template)</label>
                        <select value={bankId} onChange={e => setBankId(e.target.value)} className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm">
                          <option value="">— Not linked —</option>
                          {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <p className="text-[10.5px] mt-1" style={{ color: 'var(--text-faint)' }}>Link to a bank (Setup → Banks) to print cheques on its calibrated layout.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Branch</label>
                        <input type="text" value={branch} onChange={e => setBranch(e.target.value)} placeholder="e.g. Koramangala" className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">IFSC code</label>
                        <input type="text" value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())} placeholder="HDFC0001234" className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">SWIFT code</label>
                        <input type="text" value={swiftCode} onChange={e => setSwiftCode(e.target.value.toUpperCase())} placeholder="HDFCINBB" className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Customer ID</label>
                        <input type="text" value={bankCustomerId} onChange={e => setBankCustomerId(e.target.value)} placeholder="Bank Customer ID / CIF" className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Account opened</label>
                        <input type="date" value={openDate} onChange={e => setOpenDate(e.target.value)} className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Closing date</label>
                        <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)} className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">Bank address</label>
                      <textarea value={bankAddress} onChange={e => setBankAddress(e.target.value)} rows={2} placeholder="Branch address..." className="w-full px-3 py-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-sm resize-none" />
                    </div>
                  </div>
                )}
              </div>

              {/* Debit cards */}
              {type !== 'credit' && !isLoan(type) && (
                <div className="border border-[var(--border)] rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-[var(--text-muted)]" />
                    <p className="text-sm font-semibold text-[var(--text)]">Debit cards <span className="text-[var(--text-faint)] font-normal">(optional)</span></p>
                  </div>
                  {!isEdit ? (
                    <p className="text-xs text-[var(--text-faint)]">Save the account first, then reopen it to link debit cards.</p>
                  ) : (
                    <>
                      {dcList.map(dc => (
                        <div key={dc.id} className="flex items-center gap-2 text-sm bg-[var(--surface-2)] rounded-lg px-3 py-2">
                          <span className="font-medium text-[var(--text)] truncate flex-1">{dc.label || dc.card_network || 'Debit card'}{dc.card_number ? ` ···· ${dc.card_number.replace(/\s+/g, '').slice(-4)}` : ''}</span>
                          <button type="button" onClick={() => removeDebitCard(dc.id)} className="text-[var(--expense)]"><Trash2 className="w-3.5 h-3.5" /></button>
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

              {/* Colour + net worth */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div onClick={() => setIncludeNetWorth(!includeNetWorth)}
                    className={`w-10 h-6 rounded-full transition-colors relative ${includeNetWorth ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-[var(--surface)] rounded-full shadow transition-transform ${includeNetWorth ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className="text-sm text-[var(--text)]">Include in Net Worth</span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t border-[var(--border)] flex items-center gap-3">
              {isEdit && onDeleted && (
                <button type="button" onClick={handleDelete} disabled={deleting}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[var(--expense)] disabled:opacity-60">
                  <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : 'Delete'}
                </button>
              )}
              <div className="flex items-center gap-3 ml-auto">
                <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-2)]">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl bg-[var(--brand)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                  {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add account'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* ── RIGHT: live preview ── */}
        <div className="hidden md:flex md:w-[380px] shrink-0 flex-col justify-center px-8" style={{ background: 'color-mix(in srgb, var(--surface-2) 60%, var(--surface))', borderLeft: '1px solid var(--border)' }}>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)] mb-3">Preview</p>
          <div className="rounded-2xl p-5 shadow-lg relative overflow-hidden" style={{ background: cardFaceGradient(previewFace), color: '#fff', minHeight: 150 }}>
            <CardGlass base={previewFace} />
            <div className="flex items-start justify-between gap-3 relative z-[1]">
              <div className="min-w-0">
                <p className="text-[17px] font-bold truncate">{name || 'Account name'}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{previewTypeLabel}</p>
              </div>
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.4)' }} />
                : <span className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>{initials}</span>}
            </div>
            <p className="text-[28px] font-extrabold tracking-tight mt-4 relative z-[1]" style={{ fontVariantNumeric: 'tabular-nums' }}>{previewBalance}</p>
            <div className="flex items-end justify-between gap-3 mt-3 text-[11px] relative z-[1]" style={{ color: 'rgba(255,255,255,0.75)' }}>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>···· {last4 || '0000'}</span>
              {ifscCode && <span>IFSC {ifscCode}</span>}
            </div>
          </div>
          <p className="text-xs text-[var(--text-faint)] text-center mt-4">Live — updates as you edit.</p>
        </div>
      </div>
    </div>
  )
}
