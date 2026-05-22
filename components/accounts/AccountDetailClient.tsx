'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Pencil, Copy, Check, Calendar, Hash, Building, Globe, MapPin, CreditCard } from 'lucide-react'
import type { Account, Transaction, Category } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/types'
import { formatCurrency, formatDate, getRelativeDate } from '@/lib/utils'
import { Avatar } from '../AppShell'
import AccountForm from './AccountForm'
import TransactionItem from '../transactions/TransactionItem'
import Link from 'next/link'

interface Props {
  account: Account
  recentTransactions: Transaction[]
}

const DELETED_KEY = 'vaultr-deleted-tx-ids'
function getDeletedIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DELETED_KEY) || '[]') } catch { return [] }
}
function addDeletedId(id: string) {
  try {
    const ids = getDeletedIds()
    if (!ids.includes(id)) sessionStorage.setItem(DELETED_KEY, JSON.stringify([...ids, id]))
  } catch {}
}

export default function AccountDetailClient({ account: initialAccount, recentTransactions }: Props) {
  const router = useRouter()
  const [account, setAccount] = useState(initialAccount)
  const [showEdit, setShowEdit] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  // Filter out any transactions already deleted this session (e.g. deleted on /transactions page)
  const [transactions, setTransactions] = useState(() => {
    const deleted = getDeletedIds()
    return deleted.length ? recentTransactions.filter(t => !deleted.includes(t.id)) : recentTransactions
  })

  // Re-sync when server delivers fresh data after router.refresh()
  useEffect(() => {
    const deleted = getDeletedIds()
    setTransactions(deleted.length ? recentTransactions.filter(t => !deleted.includes(t.id)) : recentTransactions)
  }, [recentTransactions])

  const config = ACCOUNT_TYPE_CONFIG[account.type] ?? ACCOUNT_TYPE_CONFIG.other
  const balance = account.balance ?? account.initial_balance

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleSaved = (updated: Account) => {
    setAccount(updated)
    setShowEdit(false)
    router.refresh()
  }

  const handleDeleteTx = async (id: string) => {
    addDeletedId(id)                                          // sync with /transactions page
    setTransactions(prev => prev.filter(t => t.id !== id))  // instant UI update
    // Re-fetch live balance from the view so it updates immediately
    const supabase = createClient()
    const { data } = await supabase
      .from('account_balances')
      .select('*')
      .eq('id', account.id)
      .single()
    if (data) setAccount(data)
    router.refresh()
  }

  const DetailRow = ({
    label, value, field, mono = false
  }: { label: string; value: string | null | undefined; field: string; mono?: boolean }) => {
    if (!value) return null
    return (
      <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
        <p className="text-xs text-gray-500">{label}</p>
        <div className="flex items-center gap-2">
          <p className={`text-sm text-gray-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
          <button
            onClick={() => copyToClipboard(value, field)}
            className="text-gray-300 hover:text-brand-500 transition-colors"
          >
            {copiedField === field
              ? <Check className="w-3.5 h-3.5 text-green-500" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    )
  }

  const hasDetails = account.account_number || account.branch || account.ifsc_code ||
    account.swift_code || account.bank_address || account.open_date || account.closing_date

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 -ml-1">
        <ArrowLeft className="w-4 h-4" />
        Accounts
      </button>

      {/* Hero card */}
      <div
        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
        style={{ borderTopWidth: '4px', borderTopColor: account.color || config.color }}
      >
        <div className="p-5">
          <div className="flex items-center gap-4 mb-4">
            {account.avatar_url ? (
              <Avatar url={account.avatar_url} initials={account.name.slice(0, 2).toUpperCase()} size="lg" />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: config.bgColor }}>
                {getAccountEmoji(account.type)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">{account.name}</h1>
              <p className="text-sm text-gray-400">{config.label} · {account.currency}</p>
              {!account.include_in_net_worth && (
                <p className="text-xs text-amber-500 mt-0.5">Excluded from net worth</p>
              )}
            </div>
            <button
              onClick={() => setShowEdit(true)}
              className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 transition-colors shrink-0"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {/* Balance */}
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500 mb-0.5">Current Balance</p>
            <p className={`text-2xl font-bold ${balance < 0 ? 'text-red-500' : 'text-gray-900'}`}>
              {formatCurrency(balance)}
            </p>
            {account.initial_balance !== 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                Opening: {formatCurrency(account.initial_balance)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bank Details */}
      {hasDetails && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-gray-400" />
            <p className="text-sm font-semibold text-gray-900">Bank Details</p>
          </div>
          <div className="px-5">
            <DetailRow label="Account Number" value={account.account_number} field="account_number" mono />
            <DetailRow label="Branch" value={account.branch} field="branch" />
            <DetailRow label="IFSC Code" value={account.ifsc_code} field="ifsc_code" mono />
            <DetailRow label="SWIFT Code" value={account.swift_code} field="swift_code" mono />
            {account.open_date && (
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <p className="text-xs text-gray-500">Opened</p>
                <p className="text-sm font-medium text-gray-900">{formatDate(account.open_date)}</p>
              </div>
            )}
            {account.closing_date && (
              <div className="flex items-center justify-between py-3 border-b border-gray-50">
                <p className="text-xs text-gray-500">Closing Date</p>
                <p className="text-sm font-medium text-amber-600">{formatDate(account.closing_date)}</p>
              </div>
            )}
            {account.bank_address && (
              <div className="py-3">
                <p className="text-xs text-gray-500 mb-1">Address</p>
                <p className="text-sm text-gray-700">{account.bank_address}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-900">Recent Transactions</p>
          <Link
            href={`/transactions?account=${account.id}`}
            className="text-xs text-brand-500 font-medium hover:underline"
          >
            View all
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No transactions yet
          </div>
        ) : (
          <div>
            {transactions.map((tx, i) => (
              <TransactionItem
                key={tx.id}
                transaction={tx}
                isLast={i === transactions.length - 1}
                onEdit={() => {}}
                onDelete={handleDeleteTx}
              />
            ))}
          </div>
        )}
      </div>

      {showEdit && (
        <AccountForm
          account={account}
          onSaved={handleSaved}
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  )
}

function getAccountEmoji(type: string): string {
  const map: Record<string, string> = {
    checking: '🏦', savings: '🐷', credit: '💳',
    cash: '💵', investment: '📈', loan: '🏛️', other: '💰',
  }
  return map[type] ?? '💰'
}
