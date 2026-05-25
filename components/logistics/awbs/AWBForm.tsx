'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AWB } from '@/lib/logistics/types'
import { formatCurrency } from '@/lib/utils'

const CHARGE_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'shipment_charge',    label: 'Shipment Charge', required: true },
  { key: 'fuel_surcharge',     label: 'Fuel Surcharge' },
  { key: 'demand_surcharge',   label: 'Demand Surcharge' },
  { key: 'gogreen_surcharge',  label: 'GoGreen Surcharge' },
  { key: 'remote_area_charge', label: 'Remote Area Charge' },
  { key: 'other_charges',      label: 'Other Charges' },
  { key: 'tax_amount',         label: 'Tax Amount' },
]

interface ChargeState {
  shipment_charge: string
  fuel_surcharge: string
  demand_surcharge: string
  gogreen_surcharge: string
  remote_area_charge: string
  other_charges: string
  tax_amount: string
}

interface Props {
  courierId: string
  awb?: AWB
}

export default function AWBForm({ courierId, awb }: Props) {
  const router = useRouter()
  const isEdit = !!awb
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Identity
  const [awbNumber, setAwbNumber] = useState(awb?.awb_number ?? '')
  const [shipmentDate, setShipmentDate] = useState(awb?.shipment_date ?? '')
  const [receiverName, setReceiverName] = useState(awb?.receiver_name ?? '')
  const [destinationCountry, setDestinationCountry] = useState(awb?.destination_country ?? '')
  const [destinationCity, setDestinationCity] = useState(awb?.destination_city ?? '')

  // Weight
  const [actualWeight, setActualWeight] = useState(awb?.actual_weight?.toString() ?? '')
  const [volumetricWeight, setVolumetricWeight] = useState(awb?.volumetric_weight?.toString() ?? '')
  const [chargeableWeight, setChargeableWeight] = useState(awb?.chargeable_weight?.toString() ?? '')
  const [weightUnit, setWeightUnit] = useState(awb?.weight_unit ?? 'KG')

  // Charges
  const [charges, setCharges] = useState<ChargeState>({
    shipment_charge:    awb?.shipment_charge.toString() ?? '',
    fuel_surcharge:     awb?.fuel_surcharge.toString() ?? '',
    demand_surcharge:   awb?.demand_surcharge.toString() ?? '',
    gogreen_surcharge:  awb?.gogreen_surcharge.toString() ?? '',
    remote_area_charge: awb?.remote_area_charge.toString() ?? '',
    other_charges:      awb?.other_charges.toString() ?? '',
    tax_amount:         awb?.tax_amount.toString() ?? '',
  })

  // Service
  const [serviceType, setServiceType] = useState(awb?.service_type ?? '')
  const [notes, setNotes] = useState(awb?.notes ?? '')

  // Auto-set chargeable = max(actual, volumetric)
  useEffect(() => {
    const a = parseFloat(actualWeight) || 0
    const v = parseFloat(volumetricWeight) || 0
    if (a > 0 || v > 0) setChargeableWeight(String(Math.max(a, v)))
  }, [actualWeight, volumetricWeight])

  const runningTotal = Object.values(charges).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const setCharge = useCallback((key: string, val: string) => {
    setCharges(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!awbNumber.trim()) { setError('AWB number is required'); return }
    if (!charges.shipment_charge || parseFloat(charges.shipment_charge) <= 0) {
      setError('Shipment charge is required')
      return
    }

    setSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const payload = {
        user_id: user.id,
        courier_invoice_id: courierId,
        awb_number: awbNumber.trim(),
        shipment_date: shipmentDate || null,
        receiver_name: receiverName.trim() || null,
        destination_country: destinationCountry.trim() || null,
        destination_city: destinationCity.trim() || null,
        actual_weight: parseFloat(actualWeight) || null,
        volumetric_weight: parseFloat(volumetricWeight) || null,
        chargeable_weight: parseFloat(chargeableWeight) || null,
        weight_unit: weightUnit,
        shipment_charge: parseFloat(charges.shipment_charge) || 0,
        fuel_surcharge: parseFloat(charges.fuel_surcharge) || 0,
        demand_surcharge: parseFloat(charges.demand_surcharge) || 0,
        gogreen_surcharge: parseFloat(charges.gogreen_surcharge) || 0,
        remote_area_charge: parseFloat(charges.remote_area_charge) || 0,
        other_charges: parseFloat(charges.other_charges) || 0,
        tax_amount: parseFloat(charges.tax_amount) || 0,
        service_type: serviceType.trim() || null,
        notes: notes.trim() || null,
      }

      const { error: dbError } = isEdit
        ? await supabase.from('awbs').update(payload).eq('id', awb!.id)
        : await supabase.from('awbs').insert(payload)

      if (dbError) throw new Error(dbError.message)

      router.push(`/logistics/courier-invoices/${courierId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm border"
  const inputStyle = { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <>
      {/* Mobile: backdrop tap closes */}
      <div
        className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px]"
        onClick={() => router.back()}
      />
      <div className="slide-up md:page-enter fixed md:static bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto z-40 md:z-auto max-h-[92dvh] overflow-y-auto md:max-h-none md:overflow-visible md:max-w-2xl md:mx-auto md:px-4 md:py-6"
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: '24px 24px 0 0',
        }}
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'var(--border)' }} />
        </div>

        <div className="px-4 md:px-0 py-4 md:py-0">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="tap-scale w-8 h-8 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
          {isEdit ? 'Edit AWB' : 'Add AWB'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: 'var(--expense)' }}>
            {error}
          </div>
        )}

        {/* AWB Number — prominent */}
        <div className="card p-4 space-y-2">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>AWB Number *</label>
          <input
            type="text"
            value={awbNumber}
            onChange={e => setAwbNumber(e.target.value)}
            placeholder="e.g. 2895949593"
            required
            autoFocus
            className="w-full px-4 py-3 rounded-xl border font-mono text-xl font-bold tracking-wide"
            style={inputStyle}
          />
        </div>

        {/* Shipment Info */}
        <div className="card p-4 space-y-4">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>Shipment Details</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Shipment Date</label>
              <input type="date" value={shipmentDate} onChange={e => setShipmentDate(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Service Type</label>
              <input type="text" value={serviceType} onChange={e => setServiceType(e.target.value)} placeholder="EXPRESS" className={inputClass} style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Receiver Name</label>
              <input type="text" value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="Company or person name" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>City</label>
              <input type="text" value={destinationCity} onChange={e => setDestinationCity(e.target.value)} placeholder="London" className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Country</label>
              <input type="text" value={destinationCountry} onChange={e => setDestinationCountry(e.target.value)} placeholder="UK" className={inputClass} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Weight */}
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-label" style={{ color: 'var(--text-muted)' }}>Weight</label>
            <div className="flex gap-1">
              {(['KG', 'LB'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setWeightUnit(u)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: weightUnit === u ? 'var(--brand)' : 'var(--surface-2)',
                    color: weightUnit === u ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Actual', value: actualWeight, set: setActualWeight },
              { label: 'Volumetric', value: volumetricWeight, set: setVolumetricWeight },
              { label: 'Chargeable', value: chargeableWeight, set: setChargeableWeight },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={e => set(e.target.value)}
                  placeholder="0.000"
                  min="0"
                  step="0.001"
                  inputMode="decimal"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Charges — with live total */}
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-label" style={{ color: 'var(--text-muted)' }}>Charges</label>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--brand)' }}>
              Total: {formatCurrency(runningTotal)}
            </span>
          </div>
          <div className="space-y-3">
            {CHARGE_FIELDS.map(({ key, label, required }) => (
              <div key={key} className="flex items-center gap-3">
                <label className="w-36 shrink-0 text-xs font-medium" style={{ color: required ? 'var(--text)' : 'var(--text-muted)' }}>
                  {label}{required && ' *'}
                </label>
                <input
                  type="number"
                  value={charges[key as keyof ChargeState]}
                  onChange={e => setCharge(key, e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  required={required}
                  className="flex-1 px-3 py-2 rounded-xl text-sm border tabular-nums text-right"
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          {/* Running total bar */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ backgroundColor: 'var(--brand-light)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>Total Charge</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--brand)' }}>
              {formatCurrency(runningTotal)}
            </span>
          </div>
        </div>

        {/* Notes */}
        <div className="card p-4 space-y-3">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes…"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl text-sm border resize-none"
            style={inputStyle}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="tap-scale w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add AWB'}
        </button>
      </form>
      </div>
      </div>
    </>
  )
}
