'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Account, Category, Transaction } from '@/lib/types'
import { EMOJI_MAP, getCategoryEmoji } from '@/lib/types'
import AccountChipPicker from '../shared/AccountChipPicker'

interface Props {
  onSaved: (tx: Transaction) => void
  onClose: () => void
}

// Calculator keypad — digits, decimal, backspace, and the four operators.
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '.', '0', 'DEL', '+']
const OPS: Record<string, string> = { '÷': '/', '×': '*', '−': '-', '+': '+' }
const OP_CHARS = '+-*/'

/** Safely evaluate an amount expression (digits + + − × ÷) with normal
 *  precedence — no eval(). A trailing operator is ignored; ÷0 yields 0.
 *  Result is rounded to paise. */
function evalExpr(expr: string): number {
  const tokens = expr.match(/(\d+\.?\d*|\.\d+|[+\-*/])/g) ?? []
  while (tokens.length && OP_CHARS.includes(tokens[tokens.length - 1])) tokens.pop()
  if (tokens.length === 0) return 0
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
  const out: string[] = []; const ops: string[] = []
  for (const t of tokens) {
    if (t in prec) {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop() as string)
      ops.push(t)
    } else out.push(t)
  }
  while (ops.length) out.push(ops.pop() as string)
  const st: number[] = []
  for (const t of out) {
    if (t in prec) {
      const b = st.pop() ?? 0, a = st.pop() ?? 0
      st.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : (b === 0 ? 0 : a / b))
    } else st.push(parseFloat(t))
  }
  return Math.round((st.pop() ?? 0) * 100) / 100
}

export default function QuickAddSheet({ onSaved, onClose }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [amount, setAmount] = useState('0')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [dateOffset, setDateOffset] = useState<0 | 1 | 'custom'>(0)
  const [customDate, setCustomDate] = useState(() => new Date().toISOString().split('T')[0])
  const [step, setStep] = useState<'amount' | 'details'>('amount')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('account_balances').select('id, name, color, type, avatar_url, custom_type_id, custom_type_name, custom_type_color, custom_type_icon').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').order('name'),
    ]).then(([{ data: accs }, { data: cats }]) => {
      setAccounts((accs ?? []) as Account[])
      setCategories(cats ?? [])
      if (accs?.length) setAccountId(accs[0].id)
      setLoading(false)
    })
  }, [])

  const filteredCategories = categories.filter(c => c.type === type)

  const handleNumpad = (key: string) => {
    navigator.vibrate?.(10)
    if (key === 'DEL') {
      setAmount(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
      return
    }
    if (key in OPS) {
      const op = OPS[key]
      setAmount(prev => {
        const lc = prev[prev.length - 1]
        // Replace a trailing operator so you can change your mind.
        return OP_CHARS.includes(lc) ? prev.slice(0, -1) + op : prev + op
      })
      return
    }
    if (key === '.') {
      setAmount(prev => {
        const curNum = prev.split(/[+\-*/]/).pop() ?? ''
        if (curNum.includes('.')) return prev
        if (prev === '0') return '0.'
        const lc = prev[prev.length - 1]
        return OP_CHARS.includes(lc) ? prev + '0.' : prev + '.'
      })
      return
    }
    // digit
    setAmount(prev => {
      if (prev === '0') return key
      const curNum = prev.split(/[+\-*/]/).pop() ?? ''
      const dec = curNum.split('.')[1]
      if (dec && dec.length >= 2) return prev  // max 2 decimals per number
      return prev + key
    })
  }

  const clearAll = () => { navigator.vibrate?.(10); setAmount('0') }

  const getDate = (): string => {
    if (dateOffset === 'custom') return customDate
    const d = new Date()
    d.setDate(d.getDate() - (dateOffset as number))
    return d.toISOString().split('T')[0]
  }

  const handleSave = async () => {
    const numAmount = evalExpr(amount)
    if (!accountId || numAmount <= 0) return
    setSaving(true)
    navigator.vibrate?.(50)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: tx } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          account_id: accountId,
          type,
          amount: numAmount,
          date: getDate(),
          category_id: categoryId || null,
          notes: note || null,
          original_currency: 'INR',
        })
        .select('*, account:account_id(*), category:category_id(*)')
        .single()
      if (tx) onSaved(tx as Transaction)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const amountNum = evalExpr(amount)
  const typeColor = type === 'expense' ? 'var(--expense)' : 'var(--income)'
  // Show the running expression + a live total once an operator is used.
  const hasOp = /[+\-*/]/.test(amount.slice(1))
  const prettyExpr = amount.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/-/g, ' − ').replace(/\+/g, ' + ').trim()
  const bigValue = hasOp ? amountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : amount

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative w-full"
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '28px 28px 0 0',
          paddingBottom: 'env(safe-area-inset-bottom, 16px)',
          maxHeight: '94dvh',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
        </div>

        {loading ? (
          <div className="px-5 pb-8 pt-2 space-y-3">
            <div className="skeleton h-10 rounded-2xl" />
            <div className="skeleton h-16 rounded-2xl" />
            <div className="skeleton h-10 rounded-2xl" />
            <div className="skeleton h-44 rounded-2xl" />
            <div className="skeleton h-14 rounded-2xl" />
          </div>
        ) : step === 'amount' ? (
          /* ── Step 1: Amount + numpad ── */
          <div className="flex flex-col">
            {/* Type toggle + close */}
            <div className="flex items-center justify-between px-5 pb-3">
              <div className="flex rounded-xl p-1" style={{ backgroundColor: 'var(--surface-2)' }}>
                {(['expense', 'income'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setType(t); setCategoryId(null) }}
                    className="px-5 py-1.5 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: type === t ? typeColor : 'transparent',
                      color: type === t ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {t === 'expense' ? 'Expense' : 'Income'}
                  </button>
                ))}
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Amount display + running expression */}
            <div className="px-5 pb-3">
              <div className="flex items-center justify-between h-5 mb-1">
                <span className="text-sm tabular-nums truncate" style={{ color: 'var(--text-muted)' }}>
                  {hasOp ? prettyExpr : ''}
                </span>
                {amount !== '0' && (
                  <button onClick={clearAll} className="text-xs font-semibold shrink-0 pl-2" style={{ color: 'var(--text-muted)' }}>
                    Clear
                  </button>
                )}
              </div>
              <p
                className="text-[52px] font-bold tabular-nums leading-none tracking-tight text-center"
                style={{ color: typeColor }}
              >
                ₹{bigValue}
              </p>
            </div>

            {/* Category chips */}
            <div className="flex gap-2 px-5 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {filteredCategories.length === 0 && (
                <p className="text-xs py-1" style={{ color: 'var(--text-faint)' }}>No categories yet</p>
              )}
              {filteredCategories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryId(id => id === cat.id ? null : cat.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium shrink-0 transition-all"
                  style={{
                    backgroundColor: categoryId === cat.id ? `${cat.color}26` : 'var(--surface-2)',
                    color: categoryId === cat.id ? cat.color : 'var(--text-muted)',
                    border: `1.5px solid ${categoryId === cat.id ? cat.color + '60' : 'transparent'}`,
                  }}
                >
                  <span>{getCategoryEmoji(cat.icon)}</span>
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Calculator keypad */}
            <div className="grid grid-cols-4 gap-1.5 px-5 pb-3">
              {KEYS.map(key => {
                const isOp = key in OPS
                return (
                  <button
                    key={key}
                    onClick={() => handleNumpad(key)}
                    className="h-14 rounded-2xl text-xl font-semibold flex items-center justify-center transition-all active:scale-95"
                    style={{
                      backgroundColor: isOp ? 'var(--brand-light)' : 'var(--surface-2)',
                      color: key === 'DEL' ? 'var(--expense)' : isOp ? 'var(--brand)' : 'var(--text)',
                    }}
                  >
                    {key === 'DEL' ? '⌫' : key}
                  </button>
                )
              })}
            </div>

            {/* Next button */}
            <div className="px-5 pb-5">
              <button
                onClick={() => amountNum > 0 && setStep('details')}
                disabled={amountNum === 0}
                className="w-full h-14 rounded-2xl text-base font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: amountNum > 0 ? 'var(--brand)' : 'var(--surface-2)',
                  color: amountNum > 0 ? '#fff' : 'var(--text-faint)',
                }}
              >
                Next <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          /* ── Step 2: Details ── */
          <div className="flex flex-col">
            {/* Amount summary — tap to go back */}
            <button
              onClick={() => setStep('amount')}
              className="flex items-center gap-3 px-5 pb-4 w-full text-left"
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--surface-2)' }}
              >
                <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {type === 'expense' ? 'Expense' : 'Income'}
                </p>
                <p
                  className="text-2xl font-bold tabular-nums leading-tight"
                  style={{ color: typeColor }}
                >
                  ₹{amount}
                </p>
              </div>
            </button>

            <div className="px-5 space-y-4 pb-4 overflow-y-auto" style={{ maxHeight: '55dvh' }}>
              {/* Account chips */}
              <div>
                <p className="text-label mb-2" style={{ color: 'var(--text-muted)' }}>Account</p>
                <AccountChipPicker
                  accounts={accounts}
                  selectedId={accountId ?? ''}
                  onSelect={setAccountId}
                />
              </div>

              {/* Note */}
              <div>
                <p className="text-label mb-2" style={{ color: 'var(--text-muted)' }}>Note</p>
                <input
                  type="text"
                  placeholder="What was this for?"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--surface-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                  }}
                />
              </div>

              {/* Date */}
              <div>
                <p className="text-label mb-2" style={{ color: 'var(--text-muted)' }}>Date</p>
                <div className="flex gap-2">
                  {([0, 1, 'custom'] as const).map(offset => (
                    <button
                      key={String(offset)}
                      onClick={() => setDateOffset(offset)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                      style={{
                        backgroundColor: dateOffset === offset ? 'var(--brand-light)' : 'var(--surface-2)',
                        color: dateOffset === offset ? 'var(--brand)' : 'var(--text-muted)',
                      }}
                    >
                      {offset === 0 ? 'Today' : offset === 1 ? 'Yesterday' : 'Custom'}
                    </button>
                  ))}
                </div>
                {dateOffset === 'custom' && (
                  <input
                    type="date"
                    value={customDate}
                    onChange={e => setCustomDate(e.target.value)}
                    className="w-full mt-2 px-4 py-3 rounded-xl text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--surface-2)',
                      color: 'var(--text)',
                      border: '1px solid var(--border)',
                    }}
                  />
                )}
              </div>
            </div>

            {/* Save button */}
            <div className="px-5 pb-5 pt-1">
              <button
                onClick={handleSave}
                disabled={saving || !accountId}
                className="w-full h-14 rounded-2xl text-base font-semibold transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--brand)',
                  color: '#fff',
                  opacity: saving || !accountId ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save Transaction'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
