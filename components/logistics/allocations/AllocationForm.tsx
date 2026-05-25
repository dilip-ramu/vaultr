'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AWB, AWBAllocation, MarkupRule, MarkupType } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'
import { resolveMarkupForCustomer } from '@/lib/logistics/calculations'
import { formatCurrency } from '@/lib/utils'

interface Props {
  awb: AWB
  markupRules: MarkupRule[]
  customers: Customer[]        // kept for parent compat; search now queries DB directly
  existingCustomerIds: string[]
  currency?: string
  onAdded: (alloc: AWBAllocation) => void
}

export default function AllocationForm({
  awb,
  markupRules,
  existingCustomerIds,
  currency = 'INR',
  onAdded,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [pieces, setPieces] = useState('1')
  const [overrideMarkup, setOverrideMarkup] = useState(false)
  const [markupType, setMarkupType] = useState<MarkupType>('percentage')
  const [markupValue, setMarkupValue] = useState('0')
  const [minimumAmount, setMinimumAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Live search state
  const [searchResults, setSearchResults] = useState<Customer[]>([])
  const [searching, setSearching] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // Inline create form state
  const [showInlineForm, setShowInlineForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newGst, setNewGst] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [creating, setCreating] = useState(false)

  // Real-time Supabase search (debounced 220 ms)
  useEffect(() => {
    if (!search.trim() || selectedCustomer) {
      setSearchResults([])
      setShowCreate(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('customers')
        .select('id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at')
        .ilike('name', `%${search.trim()}%`)
        .order('name')
        .limit(10)

      const filtered = (data ?? [])
        .filter(c => !existingCustomerIds.includes(c.id)) as Customer[]
      const results = filtered.slice(0, 6)
      setSearchResults(results)
      const exactMatch = results.some(
        c => c.name.toLowerCase() === search.trim().toLowerCase()
      )
      setShowCreate(!exactMatch)
      setSearching(false)
    }, 220)
    return () => clearTimeout(timer)
  }, [search, selectedCustomer, existingCustomerIds])

  const autoMarkup = selectedCustomer
    ? resolveMarkupForCustomer(selectedCustomer.id, markupRules)
    : null

  const effectiveMarkup = overrideMarkup
    ? {
        markupType,
        markupValue: parseFloat(markupValue) || 0,
        minimumAmount: parseFloat(minimumAmount) || undefined,
      }
    : autoMarkup ?? { markupType: 'none' as MarkupType, markupValue: 0 }

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setSearch(c.name)
    setSearchResults([])
    setShowCreate(false)
    setOverrideMarkup(false)
    setShowInlineForm(false)
  }

  const resetInlineForm = () => {
    setNewName('')
    setNewEmail('')
    setNewPhone('')
    setNewGst('')
    setNewAddress('')
  }

  const resetForm = () => {
    setSelectedCustomer(null)
    setSearch('')
    setSearchResults([])
    setShowCreate(false)
    setPieces('1')
    setOverrideMarkup(false)
    setMarkupType('percentage')
    setMarkupValue('0')
    setMinimumAmount('')
    setError('')
    setShowInlineForm(false)
    resetInlineForm()
  }

  const handleCreateCustomer = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCreating(false); return }

    const { data, error: dbErr } = await supabase
      .from('customers')
      .insert({
        user_id: user.id,
        name: newName.trim(),
        email: newEmail.trim() || null,
        phone: newPhone.trim() || null,
        gst_number: newGst.trim() || null,
        address: newAddress.trim() || null,
      })
      .select('id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at')
      .single()

    if (!dbErr && data) {
      handleSelectCustomer(data as Customer)
    } else if (dbErr) {
      setError(dbErr.message)
    }
    setCreating(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCustomer) { setError('Select a customer'); return }
    const piecesNum = parseInt(pieces, 10)
    if (isNaN(piecesNum) || piecesNum < 1) { setError('Pieces must be ≥ 1'); return }

    setSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: dbErr } = await supabase
        .from('awb_allocations')
        .insert({
          user_id: user.id,
          awb_id: awb.id,
          customer_id: selectedCustomer.id,
          pieces: piecesNum,
          markup_type: effectiveMarkup.markupType,
          markup_value: effectiveMarkup.markupValue,
          minimum_amount: effectiveMarkup.minimumAmount ?? null,
          weight_kg: null,
        })
        .select('*, customer:customers(id, user_id, household_id, name, email, phone, address, gst_number, notes, created_at)')
        .single()

      if (dbErr) throw new Error(dbErr.message)

      onAdded(data as AWBAllocation)
      resetForm()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add allocation')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        <Plus className="w-4 h-4" />
        Add Supplier Allocation
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-4">
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Add Allocation</p>

      {/* Customer search */}
      <div className="relative">
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Customer / Supplier
        </label>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setSelectedCustomer(null)
              setShowInlineForm(false)
            }}
            placeholder="Search customers…"
            autoComplete="off"
            className="w-full px-3 py-2.5 rounded-xl text-sm border"
            style={inputStyle}
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-faint)' }} />
            </div>
          )}
        </div>

        {/* Dropdown results */}
        {search && !selectedCustomer && (searchResults.length > 0 || showCreate) && !showInlineForm && (
          <div
            className="absolute z-10 mt-1 w-full rounded-xl border overflow-hidden shadow-lg"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {searchResults.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCustomer(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-2)] transition-colors border-b"
                style={{ borderColor: 'var(--border)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.name}</p>
                {c.gst_number && (
                  <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-faint)' }}>
                    GST: {c.gst_number}
                  </p>
                )}
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                onClick={() => {
                  setNewName(search.trim())
                  setShowInlineForm(true)
                  setSearchResults([])
                  setShowCreate(false)
                }}
                className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-[var(--surface-2)] transition-colors"
                style={{ color: 'var(--brand)' }}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="text-sm font-medium">Create &ldquo;{search.trim()}&rdquo; as new supplier</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline create form */}
      {showInlineForm && (
        <div
          className="rounded-xl border p-3 space-y-2.5"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>New Supplier</p>
            <button
              type="button"
              onClick={() => { setShowInlineForm(false); resetInlineForm() }}
            >
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
            </button>
          </div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name *"
            className="w-full px-2.5 py-2 rounded-lg text-sm border"
            style={inputStyle}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="Email"
              className="px-2.5 py-2 rounded-lg text-sm border"
              style={inputStyle}
            />
            <input
              type="tel"
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              placeholder="Phone"
              className="px-2.5 py-2 rounded-lg text-sm border"
              style={inputStyle}
            />
          </div>
          <input
            type="text"
            value={newGst}
            onChange={e => setNewGst(e.target.value)}
            placeholder="GST Number"
            className="w-full px-2.5 py-2 rounded-lg text-sm border font-mono"
            style={inputStyle}
          />
          <input
            type="text"
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
            placeholder="Address"
            className="w-full px-2.5 py-2 rounded-lg text-sm border"
            style={inputStyle}
          />
          <button
            type="button"
            disabled={!newName.trim() || creating}
            onClick={handleCreateCustomer}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {creating ? 'Creating…' : 'Create & Select'}
          </button>
        </div>
      )}

      {/* Pieces */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Pieces
        </label>
        <input
          type="number"
          value={pieces}
          onChange={e => setPieces(e.target.value)}
          min="1"
          step="1"
          inputMode="numeric"
          className="w-full px-3 py-2.5 rounded-xl text-sm border"
          style={inputStyle}
        />
      </div>

      {/* Markup from rules */}
      {selectedCustomer && autoMarkup && (
        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: 'var(--surface-2)' }}
        >
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Markup from rules</p>
            <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text)' }}>
              {autoMarkup.markupType === 'none'
                ? 'No markup'
                : autoMarkup.markupType === 'percentage'
                  ? `${autoMarkup.markupValue}%`
                  : formatCurrency(autoMarkup.markupValue, currency)}
              {autoMarkup.minimumAmount
                ? ` · min ${formatCurrency(autoMarkup.minimumAmount, currency)}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOverrideMarkup(!overrideMarkup)}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg"
            style={{
              backgroundColor: overrideMarkup ? 'var(--brand-light)' : 'var(--surface)',
              color: overrideMarkup ? 'var(--brand)' : 'var(--text-muted)',
            }}
          >
            {overrideMarkup ? 'Using override' : 'Override'}
          </button>
        </div>
      )}

      {/* Manual markup fields (shown when override or no customer selected) */}
      {(overrideMarkup || !selectedCustomer) && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Markup Type</p>
            <div className="flex gap-2">
              {(['percentage', 'flat', 'none'] as MarkupType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMarkupType(t)}
                  className="flex-1 py-1.5 rounded-xl text-xs font-semibold capitalize"
                  style={{
                    backgroundColor: markupType === t ? 'var(--brand)' : 'var(--surface-2)',
                    color: markupType === t ? '#fff' : 'var(--text-muted)',
                    border: markupType === t ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {markupType !== 'none' && (
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {markupType === 'percentage' ? 'Percentage (%)' : 'Flat Amount (₹)'}
              </label>
              <input
                type="number"
                value={markupValue}
                onChange={e => setMarkupValue(e.target.value)}
                min="0"
                step={markupType === 'percentage' ? '0.01' : '1'}
                inputMode="decimal"
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={inputStyle}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Minimum Amount (optional)
            </label>
            <input
              type="number"
              value={minimumAmount}
              onChange={e => setMinimumAmount(e.target.value)}
              placeholder="e.g. 500"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="w-full px-3 py-2.5 rounded-xl text-sm border"
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm" style={{ color: 'var(--expense)' }}>{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => { resetForm(); setOpen(false) }}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !selectedCustomer}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Adding…' : 'Add Allocation'}
        </button>
      </div>
    </form>
  )
}
