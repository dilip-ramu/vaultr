'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2, ExternalLink, Info } from 'lucide-react'
import Link from 'next/link'
import type { Account } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, EMOJI_MAP } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'

interface AccountCardProps {
  account: Account
  onEdit: (account: Account) => void
  onDelete: (id: string) => void
}

export default function AccountCard({ account, onEdit, onDelete }: AccountCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [txCount, setTxCount] = useState<number | null>(account.transaction_count ?? null)

  const builtinConfig = ACCOUNT_TYPE_CONFIG[account.type] ?? ACCOUNT_TYPE_CONFIG.other
  const typeLabel = account.custom_type_name ?? builtinConfig.label
  const typeColor = account.custom_type_color ?? (account.color || builtinConfig.color)
  const typeBgColor = account.custom_type_color ? `${account.custom_type_color}18` : builtinConfig.bgColor
  const typeIcon = account.custom_type_icon ?? builtinConfig.icon
  const typeAvatarUrl = account.custom_type_avatar_url ?? null

  const balance = account.balance ?? account.initial_balance

  const handleDelete = async () => {
    setShowMenu(false)

    let count = txCount
    if (count === null) {
      const supabase = createClient()
      const { data } = await supabase.rpc('get_account_transaction_count', { p_account_id: account.id })
      count = data ?? 0
      setTxCount(count)
    }

    if (count! > 0) {
      try { sessionStorage.removeItem('vaultr-deleted-tx-ids') } catch {}
      setTxCount(null)
      alert(
        `Cannot delete "${account.name}" — it has ${count} linked transaction${count! > 1 ? 's' : ''}.\n\n` +
        `Please go to this account's transactions and delete them first, then try again.`
      )
      window.location.href = `/transactions?account=${account.id}`
      return
    }

    if (!confirm(`Delete "${account.name}"? This cannot be undone.`)) return

    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.from('accounts').update({ is_active: false }).eq('id', account.id)
    if (error) {
      alert('Could not delete account: ' + error.message)
      setDeleting(false)
    } else {
      onDelete(account.id)
    }
  }

  return (
    <Link
      href={`/accounts/${account.id}`}
      className={`bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center gap-3 transition-all hover:shadow-md active:scale-[0.99] ${deleting ? 'opacity-50' : ''}`}
      style={{ borderLeftWidth: '3px', borderLeftColor: account.color || typeColor }}
    >
      {/* Avatar or icon */}
      {account.avatar_url ? (
        <Avatar url={account.avatar_url} initials={account.name.slice(0, 2).toUpperCase()} size="md" />
      ) : typeAvatarUrl ? (
        <img src={typeAvatarUrl} alt={typeLabel} className="w-10 h-10 rounded-xl object-cover shrink-0" />
      ) : (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
          style={{ backgroundColor: typeBgColor }}
        >
          {EMOJI_MAP[typeIcon] ?? getAccountEmoji(account.type)}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{account.name}</p>
        <p className="text-xs text-gray-400">{typeLabel}</p>
        {txCount !== null && txCount > 0 && (
          <p className="text-[10px] text-gray-300">{txCount} transaction{txCount > 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Balance */}
      <div className="text-right shrink-0">
        <p className={`font-bold text-sm ${balance < 0 ? 'text-red-500' : 'text-gray-900'}`}>
          {formatCurrency(balance)}
        </p>
        {!account.include_in_net_worth && (
          <p className="text-[10px] text-gray-400">Excluded</p>
        )}
      </div>

      {/* Menu */}
      <div className="relative shrink-0" onClick={e => e.preventDefault()}>
        <button
          onClick={e => { e.preventDefault(); setShowMenu(!showMenu) }}
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={e => { e.preventDefault(); setShowMenu(false) }} />
            <div className="absolute right-0 top-9 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20 min-w-44">
              <button
                onClick={() => { setShowMenu(false); onEdit(account) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Account
              </button>
              <Link
                href={`/accounts/${account.id}`}
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Info className="w-3.5 h-3.5" /> Account Details
              </Link>
              <Link
                href={`/transactions?account=${account.id}`}
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View Transactions
              </Link>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Archiving…' : 'Delete Account'}
              </button>
            </div>
          </>
        )}
      </div>
    </Link>
  )
}

function getAccountEmoji(type: string): string {
  const map: Record<string, string> = {
    checking: '🏦', savings: '🐷', credit: '💳',
    cash: '💵', investment: '📈', loan: '🏛️', other: '💰',
  }
  return map[type] ?? '💰'
}
