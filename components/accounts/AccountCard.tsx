'use client'

import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2, ExternalLink, Info, Scale, ChevronDown, ChevronRight, Check } from 'lucide-react'
import Link from 'next/link'
import type { Account } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, EMOJI_MAP } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '../AppShell'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import { isCredit, isLoan, creditMetrics, loanMetrics } from '@/lib/account-metrics'
import AccountReconcilePanel from './AccountReconcilePanel'
import type { ReconTxn } from '@/lib/reconcile'

interface AccountCardProps {
  account: Account
  onEdit: (account: Account) => void
  onDelete: (id: string) => void
  /** All txns across every account — used by the inline reconcile panel to
   *  compute a running-balance ledger. Omit and the reconcile toggle hides. */
  txns?: ReconTxn[]
  /** account_id → currency map, needed for cross-currency transfer flagging. */
  currencyById?: Record<string, string>
  /** Today's date (YYYY-MM-DD) — passed as a prop so the whole page uses a
   *  single consistent "today" and future-dated flagging stays deterministic. */
  today?: string
  /** Bubbles up successful reconcile-stamps so AccountsClient can update the
   *  badge instantly (router.refresh() alone doesn't touch its useState). */
  onReconciled?: (accountId: string, atIso: string, balance: number) => void
}

export default function AccountCard({ account, onEdit, onDelete, txns, currencyById, today, onReconciled }: AccountCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [txCount, setTxCount] = useState<number | null>(account.transaction_count ?? null)
  const canReconcile = !!(txns && currencyById && today)

  const builtinConfig = ACCOUNT_TYPE_CONFIG[account.type] ?? ACCOUNT_TYPE_CONFIG.other
  const typeLabel = account.custom_type_name ?? builtinConfig.label
  const typeColor = account.custom_type_color ?? (account.color || builtinConfig.color)
  const typeBgColor = account.custom_type_color ? `${account.custom_type_color}18` : builtinConfig.bgColor
  const typeIcon = account.custom_type_icon ?? builtinConfig.icon
  const typeAvatarUrl = account.custom_type_avatar_url ?? null

  const balance = account.balance ?? account.initial_balance
  const credit = isCredit(account.type)
  const loan = isLoan(account.type)
  const cm = credit ? creditMetrics(account) : null
  const lm = loan ? loanMetrics(account) : null
  const fmt = (n: number) => formatCurrency(n)

  // Reconciliation-status badge shown at-a-glance under the account name.
  // "fresh" (<= 7 days), "stale" (8-30 days), "old" (> 30 days), "never".
  const reconStatus = (() => {
    if (!account.last_reconciled_at) {
      return { key: 'never', label: 'Not reconciled', color: 'var(--text-faint)', bg: 'transparent', tick: false }
    }
    const ts = new Date(account.last_reconciled_at).getTime()
    const days = Math.floor((Date.now() - ts) / 86400000)
    const when = days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`
    if (days <= 7)  return { key: 'fresh', label: `Reconciled ${when}`, color: 'var(--income)',  bg: 'rgba(34,197,94,0.10)',  tick: true  }
    if (days <= 30) return { key: 'stale', label: `Reconciled ${when}`, color: 'var(--amber)',        bg: 'rgba(245,158,11,0.10)', tick: true  }
    return             { key: 'old',   label: `Reconciled ${when}`, color: 'var(--expense)', bg: 'rgba(239,68,68,0.10)',  tick: false }
  })()

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
      try { sessionStorage.removeItem('inex-deleted-tx-ids') } catch {}
      setTxCount(null)
      notify(
        `Cannot delete "${account.name}" — it has ${count} linked transaction${count! > 1 ? 's' : ''}.\n\n` +
        `Please go to this account's transactions and delete them first, then try again.`
      )
      window.location.href = `/transactions?account=${account.id}`
      return
    }

    if (!await confirmDialog(`Delete "${account.name}"? This cannot be undone.`)) return

    setDeleting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setDeleting(false); return }
    const { error } = await supabase.from('accounts').update({ is_active: false }).eq('id', account.id).eq('user_id', user.id)
    if (error) {
      notify('Could not delete account: ' + error.message)
      setDeleting(false)
    } else {
      onDelete(account.id)
    }
  }

  return (
    <div
      className={`bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm transition-all hover:shadow-md ${deleting ? 'opacity-50' : ''}`}
      style={{ borderLeftWidth: '3px', borderLeftColor: account.color || typeColor }}
    >
     <Link
       href={`/accounts/${account.id}`}
       className="flex flex-col gap-3 p-4 active:scale-[0.99] transition-transform"
     >
     <div className="flex items-center gap-3">
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
        <p className="font-semibold text-[var(--text)] text-sm truncate">{account.name}</p>
        <p className="text-xs text-[var(--text-faint)]">{typeLabel}</p>
        {txCount !== null && txCount > 0 && (
          <p className="text-[10px] text-[var(--text-faint)]">{txCount} transaction{txCount > 1 ? 's' : ''}</p>
        )}
        {canReconcile && (
          <span
            className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ color: reconStatus.color, background: reconStatus.bg }}
            title={
              account.last_reconciled_at
                ? `Last matched the bank on ${new Date(account.last_reconciled_at).toLocaleDateString()}${
                    account.last_reconciled_balance != null ? ` at ${fmt(account.last_reconciled_balance)}` : ''
                  }.`
                : 'You haven’t reconciled this account against the bank yet — tap the scale icon to check.'
            }
          >
            {reconStatus.tick && <Check className="w-3 h-3" />}
            {reconStatus.label}
          </span>
        )}
      </div>

      {/* Balance — type-aware */}
      <div className="text-right shrink-0">
        {credit && cm ? (
          <>
            <p className="font-bold text-sm" style={{ color: cm.outstanding > 0 ? 'var(--expense)' : 'var(--income)' }}>
              {cm.outstanding > 0 ? fmt(cm.outstanding) : (cm.creditBalance > 0 ? `+${fmt(cm.creditBalance)}` : fmt(0))}
            </p>
            <p className="text-[10px] text-[var(--text-faint)]">{cm.outstanding > 0 ? 'outstanding' : 'no dues'}</p>
          </>
        ) : loan && lm ? (
          <>
            <p className="font-bold text-sm" style={{ color: lm.outstanding > 0 ? 'var(--expense)' : 'var(--income)' }}>
              {fmt(lm.outstanding)}
            </p>
            <p className="text-[10px] text-[var(--text-faint)]">remaining</p>
          </>
        ) : (
          <>
            <p className={`font-bold text-sm ${balance < 0 ? 'text-[var(--expense)]' : 'text-[var(--text)]'}`}>
              {formatCurrency(balance)}
            </p>
            {!account.include_in_net_worth && (
              <p className="text-[10px] text-[var(--text-faint)]">Excluded</p>
            )}
          </>
        )}
      </div>

      {/* Reconcile toggle — expands an in-place ledger + "Log Reconciliation"
          panel below the card so users don't need a separate Reconcile page. */}
      {canReconcile && (
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); setReconcileOpen(o => !o) }}
          title={reconcileOpen ? 'Hide reconciliation' : 'Check against actual bank balance'}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all shrink-0"
          style={{
            color: reconcileOpen ? 'var(--brand)' : 'var(--text-muted)',
            background: reconcileOpen ? 'var(--brand-light)' : 'transparent',
          }}
        >
          <Scale className="w-4 h-4" />
        </button>
      )}

      {/* Menu */}
      <div className="relative shrink-0" onClick={e => e.preventDefault()}>
        <button
          onClick={e => { e.preventDefault(); setShowMenu(!showMenu) }}
          className="w-8 h-8 flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-2)] rounded-lg transition-all"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={e => { e.preventDefault(); setShowMenu(false) }} />
            <div className="absolute right-0 top-9 bg-[var(--surface)] rounded-xl shadow-lg border border-[var(--border)] py-1 z-20 min-w-44">
              <button
                onClick={() => { setShowMenu(false); onEdit(account) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit Account
              </button>
              <Link
                href={`/accounts/${account.id}`}
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
              >
                <Info className="w-3.5 h-3.5" /> Account Details
              </Link>
              <Link
                href={`/transactions?account=${account.id}`}
                onClick={() => setShowMenu(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View Transactions
              </Link>
              <div className="my-1 border-t border-[var(--border)]" />
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--expense)] hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Archiving…' : 'Delete Account'}
              </button>
            </div>
          </>
        )}
      </div>
     </div>

      {/* Credit card: available + utilisation */}
      {credit && cm && cm.limit != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: cm.overLimit ? 'var(--expense)' : 'var(--text-muted)' }}>
              {cm.overLimit ? 'Over limit!' : `${fmt(cm.available ?? 0)} available`}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>
              of {fmt(cm.limit)} · {Math.round((cm.utilisation ?? 0) * 100)}% used
            </span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min((cm.utilisation ?? 0) * 100, 100)}%`,
              background: (cm.utilisation ?? 0) >= 0.9 ? 'var(--expense)' : (cm.utilisation ?? 0) >= 0.5 ? 'var(--amber)' : 'var(--income)',
            }} />
          </div>
          {account.interest_rate != null && (
            <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{account.interest_rate}% APR</p>
          )}
        </div>
      )}

      {/* Loan: repaid progress + EMI/rate */}
      {loan && lm && lm.principal != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span style={{ color: 'var(--income)' }}>{fmt(lm.repaid ?? 0)} repaid</span>
            <span style={{ color: 'var(--text-faint)' }}>of {fmt(lm.principal)} · {Math.round((lm.progress ?? 0) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${Math.min((lm.progress ?? 0) * 100, 100)}%`, background: 'var(--income)',
            }} />
          </div>
          {(lm.emi != null || lm.rate != null) && (
            <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
              {lm.emi != null && `EMI ${fmt(lm.emi)}`}{lm.emi != null && lm.rate != null && ' · '}{lm.rate != null && `${lm.rate}%`}
            </p>
          )}
        </div>
      )}
     </Link>

     {/* In-place reconcile panel — was the /reconcile page, now inline. */}
     {canReconcile && reconcileOpen && (
       <AccountReconcilePanel
         account={{
           id: account.id,
           name: account.name,
           currency: account.currency,
           initial_balance: account.initial_balance,
           balance: account.balance ?? null,
         }}
         txns={txns!}
         currencyById={currencyById!}
         today={today!}
         onReconciled={onReconciled}
       />
     )}
    </div>
  )
}

function getAccountEmoji(type: string): string {
  const map: Record<string, string> = {
    checking: '🏦', savings: '🐷', credit: '💳', cash: '💵', investment: '📈',
    loan: '🏛️', auto_loan: '🚗', home_loan: '🏠', business_loan: '💼', chit: '🏢', other: '💰',
  }
  return map[type] ?? '💰'
}
