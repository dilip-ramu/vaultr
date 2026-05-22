'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Check, Camera, ChevronDown, ChevronUp } from 'lucide-react'
import type { Account, AccountType } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, ACCOUNT_COLORS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'

interface CustomAccountType {
  id: string
  name: string
  color: string
  icon: string
}

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
  const [customTypeId, setCustomTypeId] = useState<string>('')
  const [balance, setBalance] = useState(account?.initial_balance?.toString() ?? '0')
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0])
  const [currency, setCurrency] = useState(account?.currency ?? 'INR')
  const [includeNetWorth, setIncludeNetWorth] = useState(account?.include_in_net_worth ?? true)
  const [avatarUrl, setAvatarUrl] = useState(account?.avatar_url ?? '')
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Extended details
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '')
  const [branch, setBranch] = useState(account?.branch ?? '')
  const [ifscCode, setIfscCode] = useState(account?.ifsc_code ?? '')
  const [swiftCode, setSwiftCode] = useState(account?.swift_code ?? '')
  const [bankAddress, setBankAddress] = useState(account?.bank_address ?? '')
  const [openDate, setOpenDate] = useState(account?.open_date ?? '')
  const [closingDate, setClosingDate] = useState(account?.closing_date ?? '')

  const [customTypes, setCustomTypes] = useState<CustomAccountType[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.from('custom_account_types').select('*').then(({ data }) => {
      if (data) setCustomTypes(data)
    })
  }, [])

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
      initial_balance: parseFloat(balance) || 0,
      color,
      currency,
      include_in_net_worth: includeNetWorth,
      avatar_url: avatarUrl || null,
      account_number: accountNumber.trim() || null,
      branch: branch.trim() || null,
      ifsc_code: ifscCode.trim() || null,
      swift_code: swiftCode.trim() || null,
      bank_address: bankAddress.trim() || null,
      open_date: openDate || null,
      closing_date: closingDate || null,
    }

    let data, err
    if (isEdit) {
      const res = await supabase.from('accounts').update(payload).eq('id', account.id).select().single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('accounts').insert({ ...payload, user_id: user!.id }).select().single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }

    const { data: accountWithBalance } = await supabase.from('account_balances').select('*').eq('id', data.id).single()
    onSaved(accountWithBalance ?? data)
  }

  // Initials for avatar preview
  const initials = name.slice(0, 2).toUpperCase() || '??'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-xl slide-up max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Account' : 'New Account'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar url={avatarUrl} initials={initials} size="lg" />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center shadow-md"
              >
                {avatarUploading
                  ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <Camera className="w-3 h-3 text-white" />}
              </button>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Account Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. HDFC Savings"
                required
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Account Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(ACCOUNT_TYPE_CONFIG) as [AccountType, typeof ACCOUNT_TYPE_CONFIG[AccountType]][]).map(([t, config]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-center ${
                    type === t ? 'text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                  style={type === t ? { backgroundColor: config.color } : {}}
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
                    customTypeId === ct.id ? 'text-white shadow-sm' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {isEdit ? 'Initial Balance' : 'Opening Balance'}
              </label>
              <input
                type="number"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                step="0.01"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
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

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
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
              className={`w-10 h-6 rounded-full transition-colors relative ${includeNetWorth ? 'bg-brand-500' : 'bg-gray-200'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${includeNetWorth ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-gray-700">Include in Net Worth</span>
          </label>

          {/* Extended Details (collapsible) */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span>Bank Details <span className="text-gray-400 font-normal">(optional)</span></span>
              {showDetails ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {showDetails && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
                    <input type="text" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
                      placeholder="XXXX XXXX XXXX"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                    <input type="text" value={branch} onChange={e => setBranch(e.target.value)}
                      placeholder="e.g. Koramangala"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">IFSC Code</label>
                    <input type="text" value={ifscCode} onChange={e => setIfscCode(e.target.value.toUpperCase())}
                      placeholder="HDFC0001234"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">SWIFT Code</label>
                    <input type="text" value={swiftCode} onChange={e => setSwiftCode(e.target.value.toUpperCase())}
                      placeholder="HDFCINBB"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Account Opened</label>
                    <input type="date" value={openDate} onChange={e => setOpenDate(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Closing Date</label>
                    <input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Bank Address</label>
                  <textarea value={bankAddress} onChange={e => setBankAddress(e.target.value)}
                    rows={2} placeholder="Branch address..."
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none" />
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
