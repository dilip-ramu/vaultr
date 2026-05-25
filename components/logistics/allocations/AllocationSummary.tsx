import type { AWBCalculation } from '@/lib/logistics/types'
import { formatCurrency } from '@/lib/utils'

function marginColor(pct: number): string {
  if (pct >= 15) return 'var(--income)'
  if (pct >= 5)  return '#D97706'
  return 'var(--expense)'
}

interface Props {
  calc: AWBCalculation
  currency?: string
}

export default function AllocationSummary({ calc, currency = 'INR' }: Props) {
  const color = marginColor(calc.marginPct)

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)' }}>
      {/* Per-piece cost — prominent */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
          Per piece base ({calc.totalPieces} PCS)
        </span>
        <span className="font-mono text-sm font-bold" style={{ color: 'var(--text)' }}>
          {formatCurrency(calc.perPieceBaseCost, currency)}
          <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-faint)' }}>
            ({calc.perPieceBaseCost.toFixed(4)})
          </span>
        </span>
      </div>

      <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cost</p>
          <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: 'var(--expense)' }}>
            {formatCurrency(calc.totalCharge, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Billed</p>
          <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: 'var(--income)' }}>
            {formatCurrency(calc.totalBilled, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Margin</p>
          <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color }}>
            {formatCurrency(calc.totalMargin, currency)}
          </p>
          <p className="text-[10px] font-semibold" style={{ color }}>
            {calc.marginPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Pieces progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Pieces allocated</span>
          <span className="font-semibold">
            {calc.totalPieces} / {calc.totalPieces} PCS
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
          <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: 'var(--income)' }} />
        </div>
      </div>
    </div>
  )
}
