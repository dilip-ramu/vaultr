import type { DashboardStats } from '@/lib/recoverables/types'

interface StatsRowProps {
  stats: DashboardStats
}

function fmt(n: number, currency: string) {
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' '
  return symbol + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function StatsRow({ stats }: StatsRowProps) {
  const cards = [
    {
      value:    fmt(stats.totalPending, stats.currency),
      label:    'Total Pending',
      color:    'var(--brand)',
    },
    {
      value:    fmt(stats.totalBilled, stats.currency),
      label:    'Total Billed',
      color:    'var(--text)',
    },
    {
      value:    fmt(stats.totalPaid, stats.currency),
      label:    'Total Paid',
      color:    'var(--income, #22c55e)',
    },
    {
      value:    String(stats.batchCount),
      label:    'Active Batches',
      color:    'var(--text)',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(card => (
        <div key={card.label} className="card">
          <p className="text-display" style={{ color: card.color, fontSize: '1.5rem' }}>
            {card.value}
          </p>
          <p className="text-label mt-1" style={{ color: 'var(--text-muted)' }}>
            {card.label}
          </p>
        </div>
      ))}
    </div>
  )
}
