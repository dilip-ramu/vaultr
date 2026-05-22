'use client'

import { useState } from 'react'
import { Plus, Wallet, TrendingUp, TrendingDown } from 'lucide-react'
import type { Account } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import AccountCard from './AccountCard'
import AccountForm from './AccountForm'

export default function AccountsClient({ initialAccounts }: { initialAccounts: Account[] }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)

  const totalAssets = accounts
    .filter(a => !['credit', 'loan'].includes(a.type) && a.include_in_net_worth)
    .reduce((sum, a) => sum + (a.balance ?? 0), 0)

  const totalLiabilities = accounts
    .filter(a => ['credit', 'loan'].includes(a.type) && a.include_in_net_worth)
    .reduce((sum, a) => sum + Math.abs(a.balance ?? 0), 0)

  const netWorth = totalAssets - totalLiabilities

  const handleSaved = (account: Account) => {
    setAccounts(prev => {
      const exists = prev.find(a => a.id === account.id)
      if (exists) return prev.map(a => a.id === account.id ? account : a)
      return [...prev, account]
    })
    setShowForm(false)
    setEditAccount(null)
  }

  const handleDelete = (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  const handleEdit = (account: Account) => {
    setEditAccount(account)
    setShowForm(true)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Accounts</h1>
          <p className="text-sm text-gray-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditAccount(null); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-brand-600 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Net Worth Summary */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6 shadow-sm">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Net Worth</p>
        <p className="text-3xl font-bold text-gray-900 mb-4">{formatCurrency(netWorth)}</p>
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Assets</p>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalAssets)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5 text-red-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-400">Liabilities</p>
              <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalLiabilities)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Accounts by type */}
      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No accounts yet</p>
          <p className="text-gray-400 text-sm mt-1">Add your first account to get started</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-brand-500 text-sm font-medium"
          >
            + Add Account
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(ACCOUNT_TYPE_CONFIG).map(([type, config]) => {
            const typeAccounts = accounts.filter(a => a.type === type)
            if (typeAccounts.length === 0) return null
            return (
              <div key={type}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2">
                  {config.label}
                </p>
                <div className="space-y-2">
                  {typeAccounts.map(account => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Account Form Modal */}
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
