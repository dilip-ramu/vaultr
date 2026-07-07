'use client'

import { useState, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Wallet, TrendingUp, TrendingDown, CreditCard } from 'lucide-react'
import type { Account, BuiltinTypeOverride } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, resolveAccountTypeDisplay } from '@/lib/types'
import { formatCurrency, accountGroupRank } from '@/lib/utils'
import { creditSummary, isLiability } from '@/lib/account-metrics'
import AccountCard from './AccountCard'
import type { ReconTxn } from '@/lib/reconcile'

const AccountForm = dynamic(() => import('./AccountForm'), { ssr: false })

interface Props {
  initialAccounts: Account[]
  builtinOverrides?: BuiltinTypeOverride[]
  /** All txns — passed to each AccountCard so it can render the inline
   *  reconcile panel without a network round-trip. */
  reconcileTxns?: ReconTxn[]
}

export default function AccountsClient({ initialAccounts, builtinOverrides = [], reconcileTxns }: Props) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)

  const totalAssets = accounts
    .filter(a => !isLiability(a.type) && a.include_in_net_worth)
    .reduce((sum, a) => sum + (a.balance ?? 0), 0)

  const totalLiabilities = accounts
    .filter(a => isLiability(a.type) && a.include_in_net_worth)
    .reduce((sum, a) => sum + Math.abs(a.balance ?? 0), 0)

  const netWorth = totalAssets - totalLiabilities
  const credit = creditSummary(accounts)

  // Reconcile pre-work: today (stable per render) + accountId → currency map.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const currencyById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of accounts) m[a.id] = a.currency
    return m
  }, [accounts])

  const handleSaved = useCallback((account: Account) => {
    setAccounts(prev => {
      const exists = prev.find(a => a.id === account.id)
      if (exists) return prev.map(a => a.id === account.id ? account : a)
      return [...prev, account]
    })
    setShowForm(false)
    setEditAccount(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
  }, [])

  const handleEdit = useCallback((account: Account) => {
    setEditAccount(account)
    setShowForm(true)
  }, [])

  /** Instant local update after a successful reconcile stamp — patches the
   *  matching account's last_reconciled_* fields so the badge re-renders
   *  green ("✓ Reconciled today") without waiting for router.refresh(). */
  const handleReconciled = useCallback((accountId: string, atIso: string, balance: number) => {
    setAccounts(prev => prev.map(a =>
      a.id === accountId
        ? { ...a, last_reconciled_at: atIso, last_reconciled_balance: balance }
        : a
    ))
  }, [])

  // Group accounts, then order: Current → Savings → Credit → rest
  const accountGroups = useMemo(() => {
    const groups: { key: string; label: string; color: string; type?: string; accounts: Account[] }[] = []

    // Built-in types (exclude accounts with custom_type_id from 'other' built-in group)
    for (const [type] of Object.entries(ACCOUNT_TYPE_CONFIG)) {
      const typeAccounts = accounts.filter(a => a.type === type && !a.custom_type_id)
      if (typeAccounts.length === 0) continue
      const display = resolveAccountTypeDisplay(type as keyof typeof ACCOUNT_TYPE_CONFIG, builtinOverrides)
      groups.push({ key: type, label: display.label, color: display.color, type, accounts: typeAccounts })
    }

    // Custom types
    const customTypeMap = new Map<string, { name: string; color: string; accounts: Account[] }>()
    for (const a of accounts.filter(a => a.custom_type_id)) {
      const key = a.custom_type_id!
      if (!customTypeMap.has(key)) {
        customTypeMap.set(key, { name: a.custom_type_name ?? 'Custom', color: a.custom_type_color ?? '#6B7280', accounts: [] })
      }
      customTypeMap.get(key)!.accounts.push(a)
    }
    customTypeMap.forEach((v, k) => {
      groups.push({ key: k, label: v.name, color: v.color, accounts: v.accounts })
    })

    return groups.sort((a, b) => {
      const ra = accountGroupRank(a.type, a.label)
      const rb = accountGroupRank(b.type, b.label)
      if (ra !== rb) return ra - rb
      return a.label.localeCompare(b.label)
    })
  }, [accounts, builtinOverrides])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Accounts</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditAccount(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all"
          style={{ background: 'var(--brand)', boxShadow: 'var(--shadow)' }}
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Net Worth band */}
      <div className="rounded-2xl p-5 md:p-6 mb-6" style={{ background: 'linear-gradient(135deg, var(--brand-deep) 0%, var(--brand-dark) 100%)', boxShadow: 'var(--shadow-lg)' }}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>Net Worth</p>
        <p className="text-3xl font-extrabold tracking-tight mb-4" style={{ color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(netWorth)}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="md:pr-5 md:border-r" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Assets</p>
            <p className="text-lg font-extrabold tracking-tight" style={{ color: '#86EFAC', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalAssets)}</p>
          </div>
          <div className="md:px-5 md:border-r" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Liabilities</p>
            <p className="text-lg font-extrabold tracking-tight" style={{ color: '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalLiabilities)}</p>
          </div>
          {credit.totalLimit > 0 && (
            <div className="md:px-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Available credit</p>
              <p className="text-lg font-extrabold tracking-tight" style={{ color: '#F6D08A', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(credit.totalAvailable)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Accounts by type */}
      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-2)' }}>
            <Wallet className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>No accounts yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add your first account to get started</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-sm font-medium"
            style={{ color: 'var(--brand)' }}
          >
            + Add Account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {accountGroups.map(group => (
            <div key={group.key}>
              <p className="text-xs font-semibold uppercase tracking-wide px-1 mb-2" style={{ color: 'var(--text-muted)' }}>
                {group.label}
              </p>
              <div className="space-y-2">
                {group.accounts.map(account => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    txns={reconcileTxns}
                    currencyById={currencyById}
                    today={today}
                    onReconciled={handleReconciled}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AccountForm
          account={editAccount}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditAccount(null) }}
        />
      )}
    </div>
  )
}
