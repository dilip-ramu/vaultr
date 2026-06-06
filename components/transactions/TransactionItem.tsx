'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2, ArrowRight, Paperclip } from 'lucide-react'
import type { Transaction, Account, Category } from '@/lib/types'
import { getCategoryEmoji } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import TransactionDetail from './TransactionDetail'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

interface Props {
  transaction: Transaction
  isFirst?: boolean
  isLast: boolean
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
  /** When viewing a specific account, transfers show +/- relative to this account */
  contextAccountId?: string
}

export default function TransactionItem({ transaction: tx, isFirst, isLast, onEdit, onDelete, contextAccountId }: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const account = tx.account as Account | undefined
  const toAccount = tx.to_account as Account | undefined
  const category = tx.category as Category | undefined

  const handleDelete = async () => {
    if (!await confirmDialog('Delete this transaction?')) return
    const supabase = createClient()
    await supabase.from('transactions').delete().eq('id', tx.id)
    onDelete(tx.id)
  }

  const amountColor = tx.type === 'income'
    ? 'var(--income)'
    : tx.type === 'expense'
    ? 'var(--expense)'
    : 'var(--transfer)'

  const amountPrefix = tx.type === 'income' ? '+'
    : tx.type === 'expense' ? '-'
    : tx.type === 'transfer' && contextAccountId
      ? (tx.to_account_id === contextAccountId ? '+' : tx.account_id === contextAccountId ? '-' : '')
      : ''

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className={`flex items-center gap-3 px-4 cursor-pointer transition-colors active:bg-[var(--surface-2)] ${isFirst ? 'rounded-t-2xl' : ''} ${isLast ? 'rounded-b-2xl' : 'border-b'}`}
        style={{
          minHeight: 64,
          paddingTop: 12,
          paddingBottom: 12,
          borderColor: 'var(--border-2)',
        }}
      >
        {/* Category icon */}
        <div
          className="w-10 h-10 flex items-center justify-center text-base shrink-0"
          style={{
            backgroundColor: category?.color ? `${category.color}26` : 'var(--surface-2)',
            color: category?.color ?? 'var(--text-muted)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          {tx.type === 'transfer' ? '↔️' : getCategoryEmoji(category?.icon)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
            {tx.name || category?.name || (tx.type === 'transfer' ? 'Transfer' : 'Uncategorised')}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {tx.name && category?.name && (
              <span className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{category.name} ·</span>
            )}
            <span className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{account?.name ?? ''}</span>
            {tx.type === 'transfer' && toAccount && (
              <>
                <ArrowRight className="w-3 h-3 shrink-0" style={{ color: 'var(--text-faint)' }} />
                <span className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{toAccount.name}</span>
              </>
            )}
            {tx.payee?.name && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-md shrink-0"
                style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                {tx.payee.name}
              </span>
            )}
            {tx.original_currency && tx.original_currency !== 'INR' && tx.original_amount && (
              <span className="text-xs shrink-0 font-mono" style={{ color: 'var(--transfer)' }}>
                {tx.original_currency} {tx.original_amount}
              </span>
            )}
            {tx.notes && (
              <span className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>· {tx.notes}</span>
            )}
            {(tx.attachments?.length ?? 0) > 0 && (
              <Paperclip className="w-3 h-3 shrink-0" style={{ color: 'var(--text-faint)' }} />
            )}
          </div>
        </div>

        {/* Amount */}
        <p className="text-sm font-bold tabular-nums shrink-0" style={{ color: amountColor }}>
          {amountPrefix}{formatCurrency(tx.amount)}
        </p>

        {/* Menu */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: 'var(--text-faint)' }}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div
                className="absolute right-0 top-8 rounded-xl shadow-lg py-1 z-20 min-w-32"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <button
                  onClick={() => { setShowMenu(false); onEdit(tx) }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--text)' }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </button>
                <button
                  onClick={() => { setShowMenu(false); handleDelete() }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
                  style={{ color: 'var(--expense)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showDetail && (
        <TransactionDetail
          transaction={tx}
          onEdit={t => { setShowDetail(false); onEdit(t) }}
          onDelete={id => { setShowDetail(false); onDelete(id) }}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  )
}

