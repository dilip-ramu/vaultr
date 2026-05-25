import Link from 'next/link'
import { MapPin, Package } from 'lucide-react'
import type { AWB } from '@/lib/logistics/types'
import { formatCurrency, formatDate } from '@/lib/utils'

const CHARGE_PILLS: Array<{ key: keyof AWB; label: string }> = [
  { key: 'fuel_surcharge',     label: 'Fuel' },
  { key: 'demand_surcharge',   label: 'Demand' },
  { key: 'gogreen_surcharge',  label: 'GoGreen' },
  { key: 'remote_area_charge', label: 'Remote' },
  { key: 'other_charges',      label: 'Other' },
  { key: 'tax_amount',         label: 'Tax' },
]

function piecesColor(awb: AWB): string {
  if (awb.total_pieces === 0) return 'var(--text-faint)'
  if (awb.allocated_pieces === 0) return 'var(--expense)'
  if (awb.allocated_pieces < awb.total_pieces) return '#D97706'
  return 'var(--income)'
}

interface Props {
  awb: AWB
  invoiceId: string
  currency?: string
}

export default function AWBCard({ awb, invoiceId, currency = 'INR' }: Props) {
  const activePills = CHARGE_PILLS.filter(({ key }) => {
    const v = awb[key]
    return typeof v === 'number' && v > 0
  })

  const destination = [awb.destination_city, awb.destination_country].filter(Boolean).join(', ')

  return (
    <Link
      href={`/logistics/courier-invoices/${invoiceId}/awbs/${awb.id}`}
      className="card p-4 flex flex-col gap-3 hover:bg-[var(--surface-2)] transition-colors active:scale-[0.99]"
    >
      {/* Top row: AWB number + charge */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="font-mono text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>
            {awb.awb_number}
          </p>
          {awb.shipment_date && (
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{formatDate(awb.shipment_date)}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--text)' }}>
            {formatCurrency(awb.total_charge, currency)}
          </p>
          <p className="text-xs font-semibold tabular-nums" style={{ color: piecesColor(awb) }}>
            {awb.allocated_pieces}/{awb.total_pieces > 0 ? awb.total_pieces : '?'} PCS
          </p>
        </div>
      </div>

      {/* Destination + receiver */}
      {(destination || awb.receiver_name) && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            {[destination, awb.receiver_name].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {/* Surcharge pills */}
      {activePills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activePills.map(({ key, label }) => (
            <span
              key={key}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              {label} {formatCurrency(awb[key] as number, currency)}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
