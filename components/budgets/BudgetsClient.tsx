'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Target, AlertTriangle, RotateCcw, Pencil, Trash2 } from 'lucide-react'
import type { Budget, Category } from '@/lib/types'
import { EMOJI_MAP } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const BudgetForm = dynamic(() => import('./BudgetForm'), { ssr: false })

interface Props {
  budgets: Budget[]
  expenseCategories: Category[]
  currentMonth: number
  currentYear: number
}

export default function BudgetsClient({ budgets: initial, expenseCategories, currentMonth, currentYear }: Props) {
  const [budgets, setBudgets] = useState<Budget[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [editBudget, setEditBudget] = useState<Budget | undefined>()

  const handleSaved = (saved: Budget) => {
    setBudgets(prev => {
      const idx = prev.findIndex(b => b.id === saved.id)
      const spent = prev.find(b => b.id === saved.id)?.spent ?? 0
      const effective = saved.amount + (saved.rollover ? saved.rollover_amount : 0)
      const remaining = effective - spent
      const percentage = effective > 0 ? (spent / effective) * 100 : 0
      const enriched = { ...saved, spent, remaining, percentage }
      return idx >= 0
        ? prev.map((b, i) => (i === idx ? enriched : b))
        : [...prev, enriched]
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget?')) return
    const supabase = createClient()
    await supabase.from('budgets').delete().eq('id', id)
    setBudgets(prev => prev.filter(b => b.id !== id))
  }

  const openEdit = (b: Budget) => {
    setEditBudget(b)
    setShowForm(true)
  }

  const overspent = budgets.filter(b => (b.percentage ?? 0) > 100)

  // Health score: avg(min(remaining/amount,1)) across all budgets, 0-100
  const healthScore = budgets.length === 0 ? 100 : Math.round(
    (budgets.reduce((sum, b) => {
      const eff = b.amount + (b.rollover ? b.rollover_amount : 0)
      return sum + Math.max(0, Math.min((b.remaining ?? eff) / eff, 1))
    }, 0) / budgets.length) * 100
  )

  const healthColor = healthScore > 70
    ? 'var(--income)'
    : healthScore >= 40
    ? '#F59E0B'
    : 'var(--expense)'

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading" style={{ color: 'var(--text)' }}>Budgets</h1>
          <p className="text-caption">{MONTH_NAMES[currentMonth - 1]} {currentYear}</p>
        </div>
        <button
          onClick={() => { setEditBudget(undefined); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
          style={{ backgroundColor: 'var(--brand)', color: '#fff' }}
        >
          <Plus className="w-4 h-4" />
          Add Budget
        </button>
      </div>

      {/* Overspend alert */}
      {overspent.length > 0 && (
        <div
          className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--expense)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--expense)' }}>
              Overspent in {overspent.length} {overspent.length === 1 ? 'category' : 'categories'} this month
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {overspent.map(b => b.category?.name ?? '').join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Health score card */}
      {budgets.length > 0 && (
        <div
          className="rounded-2xl p-5 shadow-sm"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-label mb-1" style={{ color: 'var(--text-faint)' }}>Budget Health</p>
              <p className="text-display" style={{ color: healthColor }}>{healthScore}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {healthScore > 70 ? 'On track — great job!' : healthScore >= 40 ? 'Watch your spending' : 'Overspending in multiple areas'}
              </p>
            </div>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${healthColor}18` }}
            >
              <Target className="w-8 h-8" style={{ color: healthColor }} />
            </div>
          </div>

          {/* Mini progress bar */}
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
            <div
              className="h-2 rounded-full transition-all"
              style={{ width: `${healthScore}%`, backgroundColor: healthColor }}
            />
          </div>
        </div>
      )}

      {/* Budget cards */}
      {budgets.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: 'var(--brand-light)' }}
          >
            <Target className="w-7 h-7" style={{ color: 'var(--brand)' }} />
          </div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>No budgets yet</p>
          <p className="text-caption mb-4">Set spending limits to take control of your finances</p>
          <button
            onClick={() => { setEditBudget(undefined); setShowForm(true) }}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--brand)', color: '#fff' }}
          >
            Set your first budget
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => <BudgetCard key={b.id} budget={b} onEdit={openEdit} onDelete={handleDelete} />)}
        </div>
      )}

      {showForm && (
        <BudgetForm
          budget={editBudget}
          categories={expenseCategories}
          currentMonth={currentMonth}
          currentYear={currentYear}
          onSaved={saved => { handleSaved(saved); setShowForm(false) }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function BudgetCard({ budget: b, onEdit, onDelete }: {
  budget: Budget
  onEdit: (b: Budget) => void
  onDelete: (id: string) => void
}) {
  const spent = b.spent ?? 0
  const effective = b.amount + (b.rollover ? b.rollover_amount : 0)
  const pct = b.percentage ?? 0
  const overspent = pct > 100

  const barColor = pct < 70
    ? 'var(--income)'
    : pct < 90
    ? '#F59E0B'
    : 'var(--expense)'

  const emoji = EMOJI_MAP[b.category?.icon ?? ''] ?? '💸'

  return (
    <div
      className="rounded-2xl p-4 shadow-sm"
      style={{ backgroundColor: 'var(--surface)', border: `1px solid ${overspent ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
            style={{ backgroundColor: b.category?.color ? `${b.category.color}20` : 'var(--surface-2)' }}
          >
            {emoji}
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{b.category?.name ?? 'Unknown'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs capitalize" style={{ color: 'var(--text-faint)' }}>{b.period}</span>
              {b.rollover && (
                <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--transfer)' }}>
                  <RotateCcw className="w-2.5 h-2.5" /> Rollover
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {overspent && (
            <span
              className="px-2 py-0.5 rounded-lg text-[10px] font-bold mr-1"
              style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: 'var(--expense)' }}
            >
              OVER
            </span>
          )}
          <button
            onClick={() => onEdit(b)}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-faint)' }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(b.id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text-faint)' }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: 'var(--surface-2)' }}>
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
        />
      </div>

      {/* Amounts */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: barColor, fontWeight: 600 }}>{formatCurrency(spent)}</span>
          {' '}of {formatCurrency(effective)}
        </p>
        <p className="text-xs font-medium" style={{ color: overspent ? 'var(--expense)' : 'var(--text-faint)' }}>
          {overspent
            ? `${formatCurrency(Math.abs(b.remaining ?? 0))} over`
            : `${formatCurrency(b.remaining ?? 0)} left`}
        </p>
      </div>
    </div>
  )
}
