'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Pencil, Trash2, ArrowRight, Calendar, Split, Gem } from 'lucide-react'
import SplitTransactionModal from './SplitTransactionModal'
import MarkAsAssetModal from './MarkAsAssetModal'
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
  /** Needed for the Split action (categories + destination accounts). */
  accounts?: Account[]
  categories?: Category[]
  /** Called after a successful split — the original is gone, list must refresh. */
  onSplit?: (originalId: string) => void
}

export default function TransactionDetail({ transaction: tx, onEdit, onDelete, onClose, accounts = [], categories = [], onSplit }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [splitting, setSplitting] = useState(false)
  const account   = tx.account    as Account  | undefined
  const toAccount = tx.to_account as Account  | undefined
  const category  = tx.category   as Category | undefined

  const handleDelete = async () => {
    if (!await confirmDialog('Delete this transaction?')) return
    setDeleting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setDeleting(false); return }
    const { error } = await supabase.from('transactions').delete().eq('id', tx.id).eq('user_id', user.id)
    if (error) {
      notify('Could not delete: ' + error.message)
      setDeleting(false)
      return
    }
    onDelete(tx.id)
    onClose()
  }

  // An expense can BE a purchase: the money left, but the thing it bought is
  // still yours and belongs on the balance sheet. Only expenses, and only if
  // this transaction hasn't already been claimed by an asset.
  const [assetModal, setAssetModal] = useState(false)
  const [linkedAsset, setLinkedAsset] = useState<{ id: string; name: string } | null>(null)
  const [checkedLink, setCheckedLink] = useState(false)

  useEffect(() => {
    if (tx.type !== 'expense') { setCheckedLink(true); return }
    const sb = createClient()
    sb.from('assets').select('id, name').eq('purchase_transaction_id', tx.id).maybeSingle()
      .then(({ data }) => {
        setLinkedAsset((data as { id: string; name: string } | null) ?? null)
        setCheckedLink(true)
      })
  }, [tx.id, tx.type])

  const amountColor  = tx.type === 'income' ? 'var(--income)' : tx.type === 'expense' ? 'var(--expense)' : '#3b82f6'
  const amountPrefix = tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : '↔'

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-end md:items-stretch justify-center md:justify-end"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Right-side panel (matches Assets) */}
      <div
        className="relative w-full md:w-[460px] md:h-full rounded-t-3xl md:rounded-none shadow-2xl flex flex-col slide-up max-h-[92vh] md:max-h-none"
        style={{
          backgroundColor: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
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
            {/* Split — replace this transaction with several parts */}
            {accounts.length > 0 && (
              <button
                onClick={() => setSplitting(true)}
                title="Split into multiple transactions"
                className="w-11 h-11 flex items-center justify-center rounded-xl"
                style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}
              >
                <Split className="w-4 h-4" />
              </button>
            )}
            {/* This expense bought something you still own → make it an asset. */}
            {tx.type === 'expense' && checkedLink && !linkedAsset && (
              <button
                onClick={() => setAssetModal(true)}
                title="Mark as asset — this expense bought something you still own"
                className="w-11 h-11 flex items-center justify-center rounded-xl"
                style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}
              >
                <Gem className="w-4 h-4" />
              </button>
            )}
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
          {/* This expense didn't disappear — it bought something you still own. */}
          {linkedAsset && (
            <Link
              href="/assets"
              className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <Gem className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold truncate" style={{ color: 'var(--text)' }}>{linkedAsset.name}</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>This expense bought an asset you still hold</p>
              </div>
            </Link>
          )}

          {/* A labelled, full-width action — a bare icon in the header row is too
              easy to miss next to Split / Edit / Close. */}
          {tx.type === 'expense' && checkedLink && !linkedAsset && (
            <button
              onClick={() => setAssetModal(true)}
              className="w-full flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <Gem className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
              <div className="min-w-0">
                <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>Mark as asset</p>
                <p className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  This expense bought something you still own
                </p>
              </div>
            </button>
          )}

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
              style={{ color: 'var(--expense)', background: 'color-mix(in srgb, var(--expense) 6%, transparent)' }}
            >
              {deleting ? 'Deleting…' : 'Delete Transaction'}
            </button>
          </div>
        </div>
      </div>

      {assetModal && (

        <MarkAsAssetModal

          transaction={{ id: tx.id, name: tx.name ?? null, amount: tx.amount, date: tx.date, notes: tx.notes }}

          onSaved={a => setLinkedAsset({ id: a.id, name: a.name })}

          onClose={() => setAssetModal(false)}

        />

      )}


      {splitting && (
        <SplitTransactionModal
          transaction={tx}
          accounts={accounts}
          categories={categories}
          onClose={() => setSplitting(false)}
          onDone={() => { setSplitting(false); onSplit?.(tx.id); onClose() }}
        />
      )}
    </div>
  )
}
