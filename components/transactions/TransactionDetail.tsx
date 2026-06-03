'use client'

import { useState } from 'react'
import { X, Pencil, Trash2, ArrowRight, Calendar } from 'lucide-react'
import type { Transaction, Account, Category } from '@/lib/types'
import { getCategoryEmoji } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import ActivityFeed from '../shared/ActivityFeed'
import FileUpload from '../shared/FileUpload'

interface Props {
  transaction: Transaction
  onEdit: (tx: Transaction) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export default function TransactionDetail({ transaction: tx, onEdit, onDelete, onClose }: Props) {
  const [deleting, setDeleting] = useState(false)
  const account = tx.account as Account | undefined
  const toAccount = tx.to_account as Account | undefined
  const category = tx.category as Category | undefined

  const handleDelete = async () => {
    if (!confirm('Delete this transaction?')) return
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('transactions').delete().eq('id', tx.id)
    if (error) {
      alert('Could not delete: ' + error.message)
      setDeleting(false)
      return
    }
    onDelete(tx.id)
    onClose()
  }

  const amountColor = tx.type === 'income' ? 'text-green-600' : tx.type === 'expense' ? 'text-red-500' : 'text-blue-500'
  const amountPrefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '↔'

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl shadow-xl slide-up max-h-[85vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
              style={{ backgroundColor: category?.color ? `${category.color}18` : '#F3F4F6' }}
            >
              {tx.type === 'transfer' ? '↔️' : getCategoryEmoji(category?.icon)}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {category?.name ?? (tx.type === 'transfer' ? 'Transfer' : 'Uncategorised')}
              </p>
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {formatDate(tx.date)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onEdit(tx)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Amount */}
          <div className="text-center py-2">
            <p className={`text-3xl font-bold ${amountColor}`}>
              {amountPrefix}{formatCurrency(tx.amount)}
            </p>
            <div className="flex items-center justify-center gap-2 mt-1.5 text-sm text-gray-500">
              <span>{account?.name}</span>
              {tx.type === 'transfer' && toAccount && (
                <>
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>{toAccount.name}</span>
                </>
              )}
            </div>
            {tx.notes && <p className="text-sm text-gray-400 mt-1 italic">"{tx.notes}"</p>}
          </div>

          <div className="border-t border-gray-100 pt-4">
            {/* Attachments */}
            <FileUpload
              transactionId={tx.id}
              existingAttachments={tx.attachments ?? []}
            />
          </div>

          <div className="border-t border-gray-100 pt-4">
            {/* Activity Notes */}
            <ActivityFeed transactionId={tx.id} />
          </div>

          {/* Delete */}
          <div className="border-t border-gray-100 pt-4">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete Transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
