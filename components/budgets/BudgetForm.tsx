'use client'

import { useState } from 'react'
import { X, HelpCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Budget, Category } from '@/lib/types'
import { EMOJI_MAP } from '@/lib/types'

interface Props {
  budget?: Budget
  categories: Category[]
  currentMonth: number
  currentYear: number
  onSaved: (budget: Budget) => void
  onClose: () => void
}

export default function BudgetForm({ budget, categories, currentMonth, currentYear, onSaved, onClose }: Props) {
  const [categoryId, setCategoryId] = useState(budget?.category_id ?? '')
  const [amount, setAmount] = useState(budget ? String(budget.amount) : '')
  const [period, setPeriod] = useState<Budget['period']>(budget?.period ?? 'monthly')
  const [rollover, setRollover] = useState(budget?.rollover ?? false)
  const [showRolloverTip, setShowRolloverTip] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!categoryId) { setError('Please select a category'); return }
    const num = parseFloat(amount)
    if (!num || num <= 0) { setError('Please enter a valid amount'); return }
    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const payload = {
        user_id: user.id,
        category_id: categoryId,
        amount: num,
        period,
        rollover,
        month: period === 'monthly' ? currentMonth : null,
        year: period !== 'weekly' ? currentYear : null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }

      const { data, error: dbErr } = budget?.id
        ? await supabase.from('budgets').update(payload).eq('id', budget.id).select('*, category:categories(id,name,icon,color,avatar_url)').single()
        : await supabase.from('budgets').upsert(payload, { onConflict: 'user_id,category_id,period,month,year' }).select('*, category:categories(id,name,icon,color,avatar_url)').single()

      if (dbErr) { setError(dbErr.message); return }
      if (data) onSaved(data as Budget)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative w-full md:max-w-md"
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '28px 28px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          maxHeight: '92dvh',
          overflow: 'auto',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-heading" style={{ color: 'var(--text)' }}>
            {budget ? 'Edit Budget' : 'New Budget'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-5">
          {error && (
            <div className="px-4 py-3 rounded-xl text-sm" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: 'var(--expense)' }}>
              {error}
            </div>
          )}

          {/* Category */}
          <div>
            <p className="text-label mb-2" style={{ color: 'var(--text-muted)' }}>Category</p>
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryId(cat.id)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all"
                  style={{
                    backgroundColor: categoryId === cat.id ? `${cat.color}26` : 'var(--surface-2)',
                    color: categoryId === cat.id ? cat.color : 'var(--text-muted)',
                    border: `1.5px solid ${categoryId === cat.id ? cat.color + '60' : 'transparent'}`,
                  }}
                >
                  <span className="text-base">{EMOJI_MAP[cat.icon] ?? '💸'}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <p className="text-label mb-2" style={{ color: 'var(--text-muted)' }}>Budget Amount</p>
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>₹</span>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm font-semibold"
                style={{ color: 'var(--text)' }}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Period */}
          <div>
            <p className="text-label mb-2" style={{ color: 'var(--text-muted)' }}>Period</p>
            <div className="flex gap-2">
              {(['monthly', 'weekly', 'yearly'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium capitalize transition-all"
                  style={{
                    backgroundColor: period === p ? 'var(--brand-light)' : 'var(--surface-2)',
                    color: period === p ? 'var(--brand)' : 'var(--text-muted)',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Rollover toggle */}
          <div
            className="flex items-center justify-between px-4 py-3.5 rounded-xl"
            style={{ backgroundColor: 'var(--surface-2)' }}
          >
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Rollover unused budget</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>Add unspent amount to next period</p>
              </div>
              <button onClick={() => setShowRolloverTip(t => !t)} style={{ color: 'var(--text-faint)' }}>
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setRollover(r => !r)}
              className="w-11 h-6 rounded-full relative transition-colors shrink-0"
              style={{ backgroundColor: rollover ? 'var(--brand)' : 'var(--border)' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                style={{ left: rollover ? '22px' : '2px' }}
              />
            </button>
          </div>

          {showRolloverTip && (
            <div className="px-4 py-3 rounded-xl text-xs" style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>
              When rollover is on, any unspent budget carries over to the next period, giving you a larger allowance.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-12 rounded-2xl text-sm font-semibold"
              style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ backgroundColor: 'var(--brand)', color: '#fff', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving…' : budget ? 'Update' : 'Create Budget'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
