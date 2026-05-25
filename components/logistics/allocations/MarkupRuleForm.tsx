'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/lib/types'
import type { MarkupRule, MarkupType } from '@/lib/logistics/types'

const COURIER_PROVIDERS = ['', 'DHL', 'FedEx', 'Aramex', 'UPS', 'custom']

interface Props {
  customer: Customer
  existing?: MarkupRule
  onSaved: (rule: MarkupRule) => void
  onCancel: () => void
}

export default function MarkupRuleForm({ customer, existing, onSaved, onCancel }: Props) {
  const [markupType, setMarkupType] = useState<MarkupType>(existing?.markup_type ?? 'percentage')
  const [markupValue, setMarkupValue] = useState(existing?.markup_value.toString() ?? '0')
  const [minimumAmount, setMinimumAmount] = useState(existing?.minimum_amount?.toString() ?? '')
  const [courierProvider, setCourierProvider] = useState(existing?.courier_provider ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = {
    backgroundColor: 'var(--surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const payload = {
        user_id: user.id,
        customer_id: customer.id,
        markup_type: markupType,
        markup_value: parseFloat(markupValue) || 0,
        minimum_amount: parseFloat(minimumAmount) || null,
        courier_provider: courierProvider || null,
        notes: notes.trim() || null,
        is_active: true,
      }

      const { data, error: dbErr } = existing
        ? await supabase
            .from('markup_rules')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single()
        : await supabase
            .from('markup_rules')
            .upsert(payload, { onConflict: 'user_id,customer_id,courier_provider' })
            .select()
            .single()

      if (dbErr) throw new Error(dbErr.message)
      onSaved(data as MarkupRule)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Customer (read-only) */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Customer</p>
        <p className="text-sm font-semibold px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}>
          {customer.name}
        </p>
      </div>

      {/* Markup type */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Markup Type</p>
        <div className="flex gap-2">
          {(['percentage', 'flat', 'none'] as MarkupType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setMarkupType(t)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all capitalize"
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

      {/* Markup value */}
      {markupType !== 'none' && (
        <div>
          <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {markupType === 'percentage' ? 'Percentage (%)' : 'Flat Amount (₹)'}
          </label>
          <input
            type="number"
            value={markupValue}
            onChange={e => setMarkupValue(e.target.value)}
            placeholder={markupType === 'percentage' ? '20' : '500'}
            min="0"
            step={markupType === 'percentage' ? '0.01' : '1'}
            inputMode="decimal"
            className="w-full px-3 py-2.5 rounded-xl text-sm border"
            style={inputStyle}
          />
        </div>
      )}

      {/* Minimum amount */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Minimum Amount (optional floor)
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

      {/* Courier provider scope */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Apply to (blank = all couriers)
        </label>
        <select
          value={courierProvider}
          onChange={e => setCourierProvider(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl text-sm border"
          style={inputStyle}
        >
          <option value="">All couriers</option>
          {COURIER_PROVIDERS.filter(Boolean).map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl text-sm border resize-none"
          style={inputStyle}
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving…' : 'Save Rule'}
        </button>
      </div>
    </form>
  )
}
