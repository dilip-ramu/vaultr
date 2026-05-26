'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle } from 'lucide-react'
import type { SupplierBalance } from '@/lib/recoverables/types'

interface SupplierBalancesProps {
  balances: SupplierBalance[]
  currency: string
}

function fmtAmount(n: number, currency: string) {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' '
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SupplierBalances({ balances, currency }: SupplierBalancesProps) {
  const router = useRouter()

  if (balances.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-10 gap-3">
        <CheckCircle className="w-8 h-8" style={{ color: 'var(--income, #22c55e)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>All caught up</p>
      </div>
    )
  }

  return (
    <div className="card divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
      {balances.map(b => {
        const progressPct = b.totalAmount > 0
          ? Math.min(100, (b.pendingAmount / b.totalAmount) * 100)
          : 0

        return (
          <button
            key={b.supplierName}
            onClick={() => router.push(`/recoverables/suppliers/${encodeURIComponent(b.supplierName)}`)}
            className="w-full flex items-center gap-3 py-3 px-1 text-left transition-colors hover:opacity-80 tap-scale"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                {b.supplierName}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ backgroundColor: 'var(--border)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progressPct}%`, backgroundColor: 'var(--brand)' }}
                  />
                </div>
                <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {b.allocationCount} pending
                </span>
              </div>
            </div>
            <p className="text-sm font-semibold shrink-0" style={{ color: 'var(--brand)' }}>
              {fmtAmount(b.pendingAmount, currency)}
            </p>
          </button>
        )
      })}
    </div>
  )
}
