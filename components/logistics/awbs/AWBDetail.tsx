'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, Plus, TrendingUp } from 'lucide-react'
import type { AWB, AWBAllocation, MarkupRule } from '@/lib/logistics/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { calculateMargin } from '@/lib/logistics/calculations'
import AWBChargeBreakdown from './AWBChargeBreakdown'

interface Props {
  awb: AWB
  courierId: string
  currency?: string
  allocations: AWBAllocation[]
  markupRules: MarkupRule[]
}

export default function AWBDetail({ awb: initialAWB, courierId, currency = 'INR', allocations: initialAllocations, markupRules }: Props) {
  const [awb] = useState(initialAWB)
  const [allocations] = useState(initialAllocations)

  const totalBilled = allocations.reduce((s, a) => {
    const effective = a.override_amount ?? a.billed_amount ?? 0
    return s + effective
  }, 0)
  const { margin, marginPct } = calculateMargin(awb.total_charge, totalBilled)

  const destination = [awb.destination_city, awb.destination_country].filter(Boolean).join(', ')
  const perPiece = awb.total_pieces > 0 ? awb.total_charge / awb.total_pieces : null

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/logistics/courier-invoices/${courierId}`}
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-lg font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {awb.awb_number}
          </p>
          {destination && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{destination}{awb.shipment_date ? ` · ${formatDate(awb.shipment_date)}` : ''}</p>}
        </div>
        <Link
          href={`/logistics/courier-invoices/${courierId}/awbs/${awb.id}/edit`}
          className="w-9 h-9 rounded-xl flex items-center justify-center border transition-colors hover:bg-[var(--surface-2)]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          <Pencil className="w-4 h-4" />
        </Link>
      </div>

      {/* Charge breakdown */}
      <AWBChargeBreakdown awb={awb} currency={currency} />

      {/* Per-piece cost */}
      {perPiece !== null && awb.total_pieces > 0 && (
        <div
          className="flex items-center justify-between px-4 py-3 rounded-xl"
          style={{ backgroundColor: 'var(--surface-2)' }}
        >
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Per piece ({awb.total_pieces} PCS)
          </span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--text)' }}>
            {formatCurrency(perPiece, currency)}
          </span>
        </div>
      )}

      {/* Allocations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Allocations ({allocations.length})
          </h2>
          <Link
            href={`/logistics/courier-invoices/${courierId}/awbs/${awb.id}/allocate`}
            className="flex items-center gap-1 text-sm font-medium"
            style={{ color: 'var(--brand)' }}
          >
            <Plus className="w-4 h-4" /> Add
          </Link>
        </div>

        {allocations.length === 0 ? (
          <div className="card p-8 flex flex-col items-center gap-3 text-center">
            <TrendingUp className="w-8 h-8" style={{ color: 'var(--text-faint)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No allocations yet. Add suppliers to split this shipment cost.
            </p>
            <Link
              href={`/logistics/courier-invoices/${courierId}/awbs/${awb.id}/allocate`}
              className="px-3 py-2 rounded-xl text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              Add Allocation
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Table header */}
            <div
              className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
            >
              <span>Supplier</span>
              <span className="text-center">PCS</span>
              <span className="text-right">Base</span>
              <span className="text-right">Billed</span>
            </div>
            {allocations.map((alloc, i) => {
              const effective = alloc.override_amount ?? alloc.billed_amount ?? 0
              return (
                <div
                  key={alloc.id}
                  className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 border-t text-sm"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate" style={{ color: 'var(--text)' }}>
                      {alloc.customer?.name ?? '—'}
                    </p>
                    {alloc.markup_type !== 'none' && alloc.markup_value > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                        +{alloc.markup_type === 'percentage' ? `${alloc.markup_value}%` : formatCurrency(alloc.markup_value, currency)}
                      </p>
                    )}
                  </div>
                  <span className="text-center font-mono font-semibold" style={{ color: 'var(--text)' }}>{alloc.pieces}</span>
                  <span className="text-right tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {alloc.base_cost !== null ? formatCurrency(alloc.base_cost, currency) : '—'}
                  </span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: 'var(--income)' }}>
                    {formatCurrency(effective, currency)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Profitability summary */}
      {allocations.length > 0 && (
        <div className="card p-4 space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Profitability</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Cost', value: formatCurrency(awb.total_charge, currency), color: 'var(--expense)' },
              { label: 'Billed', value: formatCurrency(totalBilled, currency), color: 'var(--income)' },
              { label: `Margin (${marginPct}%)`, value: formatCurrency(margin, currency), color: margin >= 0 ? 'var(--income)' : 'var(--expense)' },
            ].map(({ label, value, color }) => (
              <div key={label} className="space-y-0.5">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
                <p className="text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
          {/* Progress bar */}
          {awb.total_charge > 0 && (
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--surface-2)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min((totalBilled / awb.total_charge) * 100, 100)}%`,
                  backgroundColor: marginPct >= 0 ? 'var(--income)' : 'var(--expense)',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
