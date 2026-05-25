'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { AWB } from '@/lib/logistics/types'
import { formatCurrency } from '@/lib/utils'

const CHARGE_LABELS: Array<{ key: keyof AWB; label: string }> = [
  { key: 'shipment_charge',    label: 'Shipment Charge' },
  { key: 'fuel_surcharge',     label: 'Fuel Surcharge' },
  { key: 'demand_surcharge',   label: 'Demand Surcharge' },
  { key: 'gogreen_surcharge',  label: 'GoGreen Surcharge' },
  { key: 'remote_area_charge', label: 'Remote Area' },
  { key: 'other_charges',      label: 'Other Charges' },
  { key: 'tax_amount',         label: 'Tax' },
]

interface Props {
  awb: AWB
  currency?: string
  collapsible?: boolean
}

export default function AWBChargeBreakdown({ awb, currency = 'INR', collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(!collapsible)

  const activeLines = CHARGE_LABELS.filter(({ key }) => {
    const val = awb[key]
    return typeof val === 'number' && val > 0
  })

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
        >
          <span>Charge Breakdown</span>
          <div className="flex items-center gap-2">
            <span style={{ color: 'var(--brand)' }}>{formatCurrency(awb.total_charge, currency)}</span>
            {expanded ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
          </div>
        </button>
      )}

      {expanded && (
        <div style={{ backgroundColor: 'var(--surface)' }}>
          {activeLines.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between px-4 py-2.5 border-b text-sm"
              style={{ borderColor: 'var(--border)' }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span className="font-medium tabular-nums" style={{ color: 'var(--text)' }}>
                {formatCurrency(awb[key] as number, currency)}
              </span>
            </div>
          ))}
          {/* Total line */}
          <div className="flex items-center justify-between px-4 py-3 text-sm font-bold" style={{ backgroundColor: 'var(--surface-2)' }}>
            <span style={{ color: 'var(--text)' }}>Total</span>
            <span className="tabular-nums" style={{ color: 'var(--brand)' }}>
              {formatCurrency(awb.total_charge, currency)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
