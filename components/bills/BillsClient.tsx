'use client'

import { useState, useMemo } from 'react'
import {
  Plus, Receipt, CheckCircle2, Clock, AlertCircle,
  RefreshCw, Send, Inbox, Calendar, ChevronDown, X, RotateCcw,
} from 'lucide-react'
import type { Bill, Account, Category, Customer, BillDirection } from '@/lib/types'
import AccountChipPicker from '../shared/AccountChipPicker'
import { PAYMENT_TERMS_LABELS } from '@/lib/types'
import { formatCurrency, formatDate, getDaysUntil } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import BillForm from './BillForm'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

interface Props {
  initialBills: Bill[]
  accounts: Account[]
  categories: Category[]
  customers: Customer[]
}

export default function BillsClient({ initialBills, accounts, categories, customers }: Props) {
  const [bills, setBills] = useState<Bill[]>(initialBills)
  const [direction, setDirection] = useState<BillDirection>('received')
  const [showForm, setShowForm] = useState(false)
  const [editBill, setEditBill] = useState<Bill | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all')
  const [payBill, setPayBill] = useState<Bill | null>(null)   // bill waiting for account selection
  const [payAccountId, setPayAccountId] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payingSaving, setPayingSaving] = useState(false)

  const directionBills = useMemo(() =>
    bills.filter(b => (b.direction ?? 'received') === direction), [bills, direction])

  const filtered = useMemo(() =>
    statusFilter === 'all' ? directionBills : directionBills.filter(b => b.status === statusFilter),
    [directionBills, statusFilter])

  // Summary counts
  const overdue = directionBills.filter(b => b.status !== 'paid' && getDaysUntil(b.due_date) < 0)
  const dueThisWeek = directionBills.filter(b => b.status === 'pending' && getDaysUntil(b.due_date) >= 0 && getDaysUntil(b.due_date) <= 7)
  const totalPending = directionBills.filter(b => b.status === 'pending').reduce((s, b) => s + b.amount, 0)

  const handleSaved = (bill: Bill) => {
    setBills(prev => {
      const exists = prev.find(b => b.id === bill.id)
      return exists
        ? prev.map(b => b.id === bill.id ? bill : b)
        : [...prev, bill].sort((a, b) => a.due_date.localeCompare(b.due_date))
    })
    setShowForm(false)
    setEditBill(null)
  }

  const handleMarkPaidClick = (bill: Bill) => {
    setPayBill(bill)
    setPayAccountId(bill.account_id ?? '')
    setPayDate(new Date().toISOString().split('T')[0])
  }

  const handleMarkPaidConfirm = async () => {
    if (!payBill) return
    if (!payAccountId && payBill.direction !== 'sent') return  // account required for received bills
    setPayingSaving(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const now = new Date().toISOString()
      await supabase.from('bills').update({ status: 'paid', settled_at: now, account_id: payAccountId || payBill.account_id }).eq('id', payBill.id).eq('user_id', user.id)
      setBills(prev => prev.map(b => b.id === payBill.id ? { ...b, status: 'paid', settled_at: now, account_id: payAccountId || b.account_id } : b))

      // Auto-create transaction for received bills
      if (payBill.direction !== 'sent') {
        if (user) {
          await supabase.from('transactions').insert({
            user_id: user.id,
            account_id: payAccountId,
            category_id: payBill.category_id,
            type: 'expense',
            amount: payBill.amount,
            date: payDate,
            notes: `Bill paid: ${payBill.name}`,
            bill_id: payBill.id,
          })
        }
      }
      setPayBill(null)
    } finally {
      setPayingSaving(false)
    }
  }

  const handleMarkUnpaid = async (bill: Bill) => {
    if (!await confirmDialog(`Mark "${bill.name}" as unpaid? This will also delete the linked expense transaction.`)) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    // Delete linked transactions
    await supabase.from('transactions').delete().eq('bill_id', bill.id).eq('user_id', user.id)
    // Reset bill status
    await supabase.from('bills').update({ status: 'pending', settled_at: null }).eq('id', bill.id).eq('user_id', user.id)
    setBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: 'pending', settled_at: null } : b))
  }

  const handleDelete = async (id: string) => {
    if (!await confirmDialog('Delete this bill?')) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('bills').delete().eq('id', id).eq('user_id', user.id)
    setBills(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">Bills</h1>
          <p className="text-sm text-[var(--text-muted)]">{directionBills.length} total</p>
        </div>
        <button
          onClick={() => { setEditBill(null); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-[var(--brand)] text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Direction tabs */}
      <div className="flex bg-[var(--surface-2)] rounded-xl p-1 mb-5">
        <button
          onClick={() => setDirection('received')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${direction === 'received' ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
        >
          <Inbox className="w-4 h-4" /> Bills Received
        </button>
        <button
          onClick={() => setDirection('sent')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${direction === 'sent' ? 'bg-[var(--surface)] shadow-sm text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
        >
          <Send className="w-4 h-4" /> Bills Sent
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-3.5 shadow-sm">
          <p className="text-[10px] text-[var(--text-faint)] font-medium uppercase tracking-wide mb-1">Pending</p>
          <p className="text-base font-bold text-[var(--text)]">{formatCurrency(totalPending)}</p>
          <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{directionBills.filter(b => b.status === 'pending').length} bills</p>
        </div>
        <div className={`rounded-2xl border p-3.5 ${dueThisWeek.length > 0 ? 'bg-[var(--accent-light)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`}>
          <p className="text-[10px] text-[var(--amber)] font-medium uppercase tracking-wide mb-1">Due Soon</p>
          <p className="text-base font-bold text-[var(--amber)]">{dueThisWeek.length}</p>
          <p className="text-[10px] text-[var(--amber)] mt-0.5">within 7 days</p>
        </div>
        <div className={`rounded-2xl border p-3.5 ${overdue.length > 0 ? 'bg-[var(--surface-2)] border-[var(--border)]' : 'bg-[var(--surface)] border-[var(--border)]'}`}>
          <p className="text-[10px] text-[var(--expense)] font-medium uppercase tracking-wide mb-1">Overdue</p>
          <p className="text-base font-bold text-[var(--expense)]">{overdue.length}</p>
          <p className="text-[10px] text-[var(--expense)] mt-0.5">{formatCurrency(overdue.reduce((s, b) => s + b.amount, 0))}</p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {(['all', 'pending', 'overdue', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
              statusFilter === f ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Bills list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-[var(--surface-2)] rounded-2xl flex items-center justify-center mx-auto mb-4">
            {direction === 'sent' ? <Send className="w-7 h-7 text-[var(--text-faint)]" /> : <Receipt className="w-7 h-7 text-[var(--text-faint)]" />}
          </div>
          <p className="text-[var(--text-muted)] font-medium">
            No {direction === 'sent' ? 'outgoing' : 'incoming'} bills {statusFilter !== 'all' ? `(${statusFilter})` : ''}
          </p>
          {statusFilter === 'all' && (
            <button onClick={() => setShowForm(true)} className="mt-3 text-[var(--brand)] text-sm font-medium">
              + Add first bill
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(bill => (
            <BillCard
              key={bill.id}
              bill={bill}
              onMarkPaid={handleMarkPaidClick}
              onMarkUnpaid={handleMarkUnpaid}
              onEdit={b => { setEditBill(b); setShowForm(true) }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {showForm && (
        <BillForm
          bill={editBill}
          defaultDirection={direction}
          accounts={accounts}
          categories={categories}
          customers={customers}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditBill(null) }}
        />
      )}

      {/* Mark as Paid modal */}
      {payBill && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm">
          <div
            className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
            style={{ backgroundColor: 'var(--surface)', maxHeight: '80dvh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
              <div>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
                  {(payBill.direction ?? 'received') === 'sent' ? 'Mark as Received' : 'Mark as Paid'}
                </h3>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {payBill.name} · {formatCurrency(payBill.amount)}
                </p>
              </div>
              <button
                onClick={() => setPayBill(null)}
                className="w-8 h-8 flex items-center justify-center rounded-xl shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-4">
              {payBill.direction !== 'sent' && (
                payBill.account_id ? (
                  // Account already on bill — show it, no picker
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: 'var(--surface-2)' }}>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Paying from</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {accounts.find(a => a.id === payBill.account_id)?.name ?? 'Saved account'}
                    </span>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Select Account *</label>
                    <AccountChipPicker accounts={accounts} selectedId={payAccountId} onSelect={setPayAccountId} />
                  </div>
                )
              )}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Payment Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={e => setPayDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPayBill(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                >Cancel</button>
                <button
                  onClick={handleMarkPaidConfirm}
                  disabled={payingSaving || (payBill.direction !== 'sent' && !payAccountId)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--income)] disabled:opacity-50"
                >
                  {payingSaving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bill card ─────────────────────────────────────────────────────
function BillCard({ bill, onMarkPaid, onMarkUnpaid, onEdit, onDelete }: {
  bill: Bill
  onMarkPaid: (b: Bill) => void
  onMarkUnpaid: (b: Bill) => void
  onEdit: (b: Bill) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const daysUntil = getDaysUntil(bill.due_date)
  const isOverdue = daysUntil < 0 || bill.status === 'overdue'
  const isPaid = bill.status === 'paid'
  const isSent = (bill.direction ?? 'received') === 'sent'
  const customer = bill.customer as Customer | undefined

  const cardBg = isPaid ? 'bg-[var(--surface)]' : isOverdue ? 'bg-[var(--surface-2)] border-[var(--border)]' : daysUntil <= 3 ? 'bg-[var(--accent-light)] border-[var(--border)]' : 'bg-[var(--surface)]'
  const dueBadge = isPaid
    ? { text: bill.settled_at ? `Settled ${formatDate(bill.settled_at)}` : 'Settled', cls: 'bg-[var(--brand-light)] text-[var(--income)]' }
    : isOverdue
    ? { text: `${Math.abs(daysUntil)}d overdue`, cls: 'bg-[var(--surface-2)] text-[var(--expense)]' }
    : daysUntil === 0
    ? { text: 'Due today!', cls: 'bg-[var(--accent-light)] text-[var(--amber)]' }
    : { text: `Due in ${daysUntil}d`, cls: 'bg-[var(--surface-2)] text-[var(--text-muted)]' }

  return (
    <div className={`rounded-2xl border ${cardBg} border-[var(--border)] overflow-hidden shadow-sm`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPaid ? 'bg-[var(--brand-light)]' : isOverdue ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface-2)]'}`}>
            {isPaid ? <CheckCircle2 className="w-5 h-5 text-[var(--income)]" />
              : isOverdue ? <AlertCircle className="w-5 h-5 text-[var(--expense)]" />
              : isSent ? <Send className="w-4 h-4 text-blue-500" />
              : <Receipt className="w-4 h-4 text-[var(--text-muted)]" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-[var(--text)] text-sm">{bill.name}</p>
              {bill.invoice_number && (
                <span className="text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-md font-mono">#{bill.invoice_number}</span>
              )}
              {bill.is_recurring && <RefreshCw className="w-3 h-3 text-[var(--text-faint)]" />}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {customer && (
                <span className="text-xs text-[var(--brand)] font-medium">{customer.name}</span>
              )}
              {bill.payment_terms && (
                <span className="text-xs text-[var(--text-faint)]">{PAYMENT_TERMS_LABELS[bill.payment_terms]}</span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${dueBadge.cls}`}>
                {dueBadge.text}
              </span>
            </div>
            {bill.follow_up_date && !isPaid && (
              <div className="flex items-center gap-1 mt-1">
                <Calendar className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] text-purple-500">Follow-up: {formatDate(bill.follow_up_date)}</span>
              </div>
            )}
          </div>

          <div className="text-right shrink-0">
            <p className="font-bold text-[var(--text)] text-sm">{formatCurrency(bill.amount)}</p>
            {bill.is_recurring && <p className="text-[10px] text-[var(--text-faint)]">{bill.recurrence_interval}</p>}
          </div>
        </div>

        {/* Expand/collapse details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 mt-2.5 text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)]"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-black/5 pt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
          <div className="flex justify-between"><span className="text-[var(--text-faint)]">Account</span><span>{(bill.account as Account | undefined)?.name}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-faint)]">Due date</span><span>{formatDate(bill.due_date)}</span></div>
          {bill.notes && <div className="flex justify-between"><span className="text-[var(--text-faint)]">Notes</span><span className="text-right">{bill.notes}</span></div>}
        </div>
      )}

      {/* Actions */}
      {!isPaid && (
        <div className="flex gap-2 px-4 pb-3.5">
          <button onClick={() => onMarkPaid(bill)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold ${isSent ? 'bg-blue-500 text-white' : 'bg-[var(--income)] text-white'}`}>
            {isSent ? 'Mark as Received' : 'Mark as Paid'}
          </button>
          <button onClick={() => onEdit(bill)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-2)] text-[var(--text)]">
            Edit
          </button>
          <button onClick={() => onDelete(bill.id)}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-2)] text-[var(--expense)]">
            Delete
          </button>
        </div>
      )}
      {isPaid && (
        <div className="flex gap-2 px-4 pb-3.5">
          <button
            onClick={() => onMarkUnpaid(bill)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-light)] text-[var(--amber)]"
          >
            <RotateCcw className="w-3 h-3" /> Mark Unpaid
          </button>
          <button onClick={() => onEdit(bill)} className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-2)] text-[var(--text)]">Edit</button>
          <button onClick={() => onDelete(bill.id)} className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-2)] text-[var(--expense)]">Delete</button>
        </div>
      )}
    </div>
  )
}
