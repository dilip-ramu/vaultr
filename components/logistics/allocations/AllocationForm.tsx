'use client'

import { useState, useMemo } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AWB, AWBAllocation, MarkupRule, MarkupType } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'
import { resolveMarkupForCustomer } from '@/lib/logistics/calculations'
import { formatCurrency } from '@/lib/utils'

interface Props {
  awb: AWB
  markupRules: MarkupRule[]
  customers: Customer[]
  existingCustomerIds: string[]
  currency?: string
  onAdded: (alloc: AWBAllocation) => void
}

export default function AllocationForm({
  awb,
  markupRules,
  customers,
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

  const availableCustomers = useMemo(
    () => customers.filter(c => !existingCustomerIds.includes(c.id)),
    [customers, existingCustomerIds]
  )

  const filteredCustomers = useMemo(
    () => availableCustomers.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase())
    ),
    [availableCustomers, search]
  )

  const autoMarkup = useMemo(() => {
    if (!selectedCustomer) return null
    return resolveMarkupForCustomer(selectedCustomer.id, markupRules)
  }, [selectedCustomer, markupRules])

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
    setOverrideMarkup(false)
  }

  const resetForm = () => {
    setSelectedCustomer(null)
    setSearch('')
    setPieces('1')
    setOverrideMarkup(false)
    setMarkupType('percentage')
    setMarkupValue('0')
    setMinimumAmount('')
    setError('')
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
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelectedCustomer(null) }}
          placeholder="Search customers…"
          autoComplete="off"
          className="w-full px-3 py-2.5 rounded-xl text-sm border"
          style={inputStyle}
        />
        {search && !selectedCustomer && (
          <div
            className="absolute z-10 mt-1 w-full rounded-xl border overflow-hidden shadow-lg"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            {filteredCustomers.length > 0 ? (
              filteredCustomers.slice(0, 6).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCustomer(c)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-[var(--surface-2)] transition-colors"
                  style={{ color: 'var(--text)' }}
                >
                  {c.name}
                </button>
              ))
            ) : (
              <p className="px-3 py-2.5 text-sm" style={{ color: 'var(--text-faint)' }}>
                {availableCustomers.length === 0 ? 'All customers already allocated' : 'No customers found'}
              </p>
            )}
          </div>
        )}
      </div>

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
