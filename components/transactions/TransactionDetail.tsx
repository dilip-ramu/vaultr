'use client'

import { useState } from 'react'
import { X, Pencil, Trash2, ArrowRight, Calendar } from 'lucide-react'
import type { Transaction, Account, Category } from '@/lib/types'
import { getCategoryEmoji } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import ActivityFeed from '../shared/ActivityFeed'
import FileUpload from '../shared/FileUpload'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

interface Props {
  transaction: Transaction
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function TransactionDetail({ transaction: tx, onEdit, onDelete, onClose }: Props) {
  const [deleting, setDeleting] = useState(false)
  const account   = tx.account    as Account  | undefined
  const toAccount = tx.to_account as Account  | undefined
  const category  = tx.category   as Category | undefined

  const handleDelete = async () => {
    if (!await confirmDialog('Delete this transaction?')) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('transactions').delete().eq('id', tx.id)
    if (error) {
      notify('Could not delete: ' + error.message)
      setDeleting(false)
      return
    }
    onDelete(tx.id)
    onClose()
  }

  const amountColor  = tx.type === 'income' ? '#16a34a' : tx.type === 'expense' ? '#dc2626' : '#3b82f6'
  const amountPrefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '↔'

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Sheet */}
      <div
        className="relative w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
        style={{
          backgroundColor: 'var(--surface)',
          maxHeight: '100%',
        }}
      >
        {/* ── Header (never scrolls away) ─────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b shrink-0"
          style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: category?.color ? `${category.color}22` : 'var(--surface-2)' }}
            >
              {tx.type === 'transfer' ? '↔️' : getCategoryEmoji(category?.icon)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>
                {category?.name ?? (tx.type === 'transfer' ? 'Transfer' : 'Uncategorised')}
              </p>
              <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <Calendar className="w-3 h-3 shrink-0" /> {formatDate(tx.date)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            {/* Edit — 44px touch target */}
            <button
              onClick={() => onEdit(tx)}
              className="w-11 h-11 flex items-center justify-center rounded-xl"
              style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}
            >
              <Pencil className="w-4 h-4" />
            </button>
            {/* Close — 44px touch target */}
            <button
              onClick={onClose}
              className="w-11 h-11 flex items-center justify-center rounded-xl"
              style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto px-5 py-5 space-y-5"
          style={{
            overscrollBehavior: 'contain',
            backgroundColor: 'var(--surface)',
          }}
        >
          {/* Amount */}
          <div className="text-center py-2">
            <p className="text-3xl font-bold" style={{ color: amountColor }}>
              {amountPrefix}{formatCurrency(tx.amount)}
            </p>
            <div
              className="flex items-center justify-center gap-2 mt-1.5 text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              <span>{account?.name}</span>
              {tx.type === 'transfer' && toAccount && (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{toAccount.name}</span>
                </>
              )}
            </div>
            {tx.notes && (
              <p className="text-sm mt-1 italic" style={{ color: 'var(--text-muted)' }}>
                "{tx.notes}"
              </p>
            )}
          </div>

          {/* Attachments */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <FileUpload
              transactionId={tx.id}
              existingAttachments={tx.attachments ?? []}
            />
          </div>

          {/* Activity notes */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <ActivityFeed transactionId={tx.id} />
          </div>

          {/* Delete */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
              style={{ color: '#dc2626', background: 'rgba(239,68,68,0.06)' }}
            >
              {deleting ? 'Deleting…' : 'Delete Transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
