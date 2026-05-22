'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2, ArrowRight, Paperclip, MessageCircle } from 'lucide-react'
import type { Transaction, Account, Category } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import TransactionDetail from './TransactionDetail'

interface Props {
  transaction: Transaction
  isLast: boolean
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
}

export default function TransactionItem({ transaction: tx, isLast, onEdit, onDelete }: Props) {
  const [showMenu, setShowMenu] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const account = tx.account as Account | undefined
  const toAccount = tx.to_account as Account | undefined
  const category = tx.category as Category | undefined

  const handleDelete = async () => {
    if (!confirm('Delete this transaction?')) return
    const supabase = createClient()
    await supabase.from('transactions').delete().eq('id', tx.id)
    onDelete(tx.id)
  }

  const amountColor = tx.type === 'income'
    ? 'text-green-600'
    : tx.type === 'expense'
    ? 'text-red-500'
    : 'text-blue-500'

  const amountPrefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''

  return (
    <>
    <div
      onClick={() => setShowDetail(true)}
      className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors ${!isLast ? 'border-b border-gray-50' : ''}`}
    >
      {/* Category icon */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0"
        style={{
          backgroundColor: category?.color ? `${category.color}18` : '#F3F4F6',
          color: category?.color ?? '#6B7280'
        }}
      >
        {getCategoryEmoji(category?.icon ?? '', tx.type)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {tx.name || category?.name || (tx.type === 'transfer' ? 'Transfer' : 'Uncategorised')}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {tx.name && category?.name && (
            <span className="text-xs text-gray-400 truncate">{category.name} ·</span>
          )}
          <span className="text-xs text-gray-400 truncate">{account?.name ?? ''}</span>
          {tx.type === 'transfer' && toAccount && (
            <>
              <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
              <span className="text-xs text-gray-400 truncate">{toAccount.name}</span>
            </>
          )}
          {tx.payee?.name && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md shrink-0">
              {tx.payee.name}
            </span>
          )}
          {tx.original_currency && tx.original_currency !== 'INR' && tx.original_amount && (
            <span className="text-xs text-blue-400 shrink-0 font-mono">
              {tx.original_currency} {tx.original_amount}
            </span>
          )}
          {tx.notes && <span className="text-xs text-gray-300 truncate">· {tx.notes}</span>}
          {(tx.attachments?.length ?? 0) > 0 && <Paperclip className="w-3 h-3 text-gray-300 shrink-0" />}
        </div>
      </div>

      {/* Amount */}
      <p className={`text-sm font-bold tabular-nums shrink-0 ${amountColor}`}>
        {amountPrefix}{formatCurrency(tx.amount)}
      </p>

      {/* Menu */}
      <div className="relative" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-lg"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-32">
              <button
                onClick={() => { setShowMenu(false); onEdit(tx) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => { setShowMenu(false); handleDelete() }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50"
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

function getCategoryEmoji(icon: string, type: string): string {
  const map: Record<string, string> = {
    'utensils': '🍽️', 'car': '🚗', 'shopping-bag': '🛍️', 'film': '🎬',
    'zap': '⚡', 'heart-pulse': '❤️‍🩹', 'graduation-cap': '🎓', 'home': '🏠',
    'plane': '✈️', 'shirt': '👕', 'gift': '🎁', 'briefcase': '💼',
    'dumbbell': '🏋️', 'smartphone': '📱', 'book': '📚', 'coffee': '☕',
    'music': '🎵', 'wifi': '📶', 'building': '🏢', 'trending-up': '📈',
    'dollar-sign': '💵', 'percent': '💹', 'laptop': '💻',
  }
  if (type === 'transfer') return '↔️'
  return map[icon] ?? (type === 'income' ? '💰' : '💸')
}
