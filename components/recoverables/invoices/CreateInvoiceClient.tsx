'use client'

import { Fragment, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react'
import { useToast } from '@/components/shared/Toast'

// ── Shared types (exported for server component) ──────────────────────────

export interface AllocationRow {
  id: string
  pieces: number
  base_cost: number
  shipment_id: string
  batch_id: string
  customer_name: string
  customer_id: string | null
  awb: string
  shipmentDate: string | null
  batchName: string
  batchDate: string | null
}

export interface PendingCustomer {
  customerName: string
  customerId: string | null
  allocationCount: number
  pendingAmount: number
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface CompanyOption {
  id: string
  name: string
  is_default: boolean
  cgst_rate: number
  sgst_rate: number
  hsn_sac: string
}

interface Props {
  initialCustomerName: string | null
  pendingCustomers: PendingCustomer[]
  initialAllocations: AllocationRow[]
  cgstRate: number
  sgstRate: number
  /** Company default HSN/SAC — seeds each line's editable HSN. */
  hsnSac?: string
  companies?: CompanyOption[]
}

/** Per-line tax/HSN, edited in the review step. Seeded from the chosen
 *  company's defaults; each line can be overridden independently. */
interface LineTax { hsn: string; cgst: number; sgst: number }

// ── Helpers ───────────────────────────────────────────────────────────────

function r2(n: number) { return Math.round(n * 100) / 100 }
function r4(n: number) { return Math.round(n * 10000) / 10000 }
function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ── Component ─────────────────────────────────────────────────────────────

export default function CreateInvoiceClient({
  initialCustomerName,
  pendingCustomers,
  initialAllocations,
  cgstRate,
  sgstRate,
  hsnSac = '996812',
  companies = [],
}: Props) {
  const router = useRouter()
  const { showToast } = useToast()

  const [step, setStep]               = useState<1 | 2 | 3>(1)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [markupType, setMarkupType]   = useState<'none' | 'percentage' | 'flat'>('none')
  const [markupValue, setMarkupValue] = useState(0)
  const [paymentTerms, setPaymentTerms] = useState('due_on_receipt')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
  // Picked company. Default = company marked is_default (= Contrast after backfill).
  const defaultCompanyId = companies.find(c => c.is_default)?.id ?? companies[0]?.id ?? ''
  const [companyId, setCompanyId]     = useState<string>(defaultCompanyId)
  const [showCompanyPicker, setShowCompanyPicker] = useState<boolean>(companies.length > 1)
  const pickedCompany = companies.find(c => c.id === companyId) ?? null
  const effCgst = pickedCompany ? pickedCompany.cgst_rate : cgstRate
  const effSgst = pickedCompany ? pickedCompany.sgst_rate : sgstRate
  const effHsn  = (pickedCompany?.hsn_sac ?? hsnSac ?? '996812') || '996812'

  // Per-line HSN + GST overrides, keyed by allocation id. Unset lines follow
  // the company default (effHsn / effCgst / effSgst). Editable in step 3.
  const [lineTax, setLineTax] = useState<Record<string, LineTax>>({})
  const taxFor = (id: string): LineTax =>
    lineTax[id] ?? { hsn: effHsn, cgst: effCgst, sgst: effSgst }
  const setLineField = (id: string, field: keyof LineTax, value: string | number) => {
    setLineTax(prev => ({ ...prev, [id]: { ...taxFor(id), [field]: value } }))
  }
  const applyToAll = (field: keyof LineTax, value: string | number) => {
    setLineTax(prev => {
      const next = { ...prev }
      for (const a of selectedAllocations) {
        next[a.id] = { ...(prev[a.id] ?? { hsn: effHsn, cgst: effCgst, sgst: effSgst }), [field]: value }
      }
      return next
    })
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const grouped = useMemo(() => {
    const map = new Map<string, AllocationRow[]>()
    for (const a of initialAllocations) {
      const list = map.get(a.batchName) ?? []
      list.push(a)
      map.set(a.batchName, list)
    }
    return Array.from(map.entries())
  }, [initialAllocations])

  const selectedAllocations = useMemo(
    () => initialAllocations.filter(a => selectedIds.has(a.id)),
    [initialAllocations, selectedIds],
  )

  const selectedBase = useMemo(
    () => r2(selectedAllocations.reduce((s, a) => s + Number(a.base_cost), 0)),
    [selectedAllocations],
  )

  const selectedPieces = useMemo(
    () => selectedAllocations.reduce((s, a) => s + a.pieces, 0),
    [selectedAllocations],
  )

  const afterMarkupTotal = useMemo(() => {
    if (markupType === 'percentage') return r2(selectedBase * (1 + markupValue / 100))
    if (markupType === 'flat')       return r2(selectedBase + markupValue * selectedPieces)
    return selectedBase
  }, [markupType, markupValue, selectedBase, selectedPieces])

  const reviewLines = useMemo(() => {
    return selectedAllocations
      .map(a => {
        const baseRate   = a.pieces > 0 ? r4(Number(a.base_cost) / a.pieces) : 0
        const rate       = markupType === 'percentage' ? r4(baseRate * (1 + markupValue / 100))
                         : markupType === 'flat'       ? r4(baseRate + markupValue)
                         : baseRate
        const amount     = r2(a.pieces * rate)
        const tax        = lineTax[a.id] ?? { hsn: effHsn, cgst: effCgst, sgst: effSgst }
        const cgstAmount = r2(amount * tax.cgst / 100)
        const sgstAmount = r2(amount * tax.sgst / 100)
        return { ...a, rate, amount, hsn: tax.hsn, cgstRate: tax.cgst, sgstRate: tax.sgst, cgstAmount, sgstAmount }
      })
      .sort((a, b) => {
        if (a.shipmentDate && b.shipmentDate) {
          const cmp = a.shipmentDate.localeCompare(b.shipmentDate)
          if (cmp !== 0) return cmp
        } else if (a.shipmentDate) return -1
        else if (b.shipmentDate)   return 1
        return a.awb.localeCompare(b.awb)
      })
  }, [selectedAllocations, markupType, markupValue, lineTax, effHsn, effCgst, effSgst])

  const subtotal     = useMemo(() => r2(reviewLines.reduce((s, l) => s + l.amount, 0)), [reviewLines])
  const cgstTotal    = useMemo(() => r2(reviewLines.reduce((s, l) => s + l.cgstAmount, 0)), [reviewLines])
  const sgstTotal    = useMemo(() => r2(reviewLines.reduce((s, l) => s + l.sgstAmount, 0)), [reviewLines])
  const invoiceTotal = useMemo(() => r2(subtotal + cgstTotal + sgstTotal), [subtotal, cgstTotal, sgstTotal])
  // True when every line shares one CGST/SGST rate — lets the summary show a
  // single "@ x%" label; mixed invoices drop the rate from the label.
  const uniformRates = useMemo(() => {
    if (reviewLines.length === 0) return true
    const first = reviewLines[0]
    return reviewLines.every(l => l.cgstRate === first.cgstRate && l.sgstRate === first.sgstRate)
  }, [reviewLines])

  const customerId = useMemo(() => {
    for (const a of selectedAllocations) if (a.customer_id) return a.customer_id
    return undefined
  }, [selectedAllocations])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleAll = () => {
    if (selectedIds.size === initialAllocations.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(initialAllocations.map(a => a.id)))
    }
  }

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleCreate = async () => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/recoverables/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName:  initialCustomerName,
          customerId:    customerId ?? undefined,
          companyId:     companyId || undefined,
          markupType,
          markupValue,
          allocationIds: [...selectedIds],
          lines:         reviewLines.map(l => ({
            allocationId: l.id,
            hsnSac:       l.hsn,
            cgstRate:     l.cgstRate,
            sgstRate:     l.sgstRate,
          })),
          invoiceDate,
          paymentTerms,
          notes:         notes || undefined,
        }),
      })
      const data = await res.json() as { success?: boolean; invoiceId?: string; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Failed to create invoice')
      showToast('Invoice created', 'success')
      router.push(`/recoverables/invoices/${data.invoiceId}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create invoice', 'error')
      setSubmitting(false)
    }
  }

  // ── Customer picker mode ──────────────────────────────────────────────────

  if (!initialCustomerName) {
    return (
      <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/recoverables')}
            className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-2)' }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>New Invoice</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Select a customer to invoice</p>
          </div>
        </div>

        {pendingCustomers.length === 0 ? (
          <div className="card text-center py-10 space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No pending allocations to invoice</p>
            <Link href="/recoverables" className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
              Back to Recoverables
            </Link>
          </div>
        ) : (
          <div className="card divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
            {pendingCustomers.map(c => (
              <button
                key={c.customerName}
                onClick={() => router.push(`/recoverables/invoices/new?customer=${encodeURIComponent(c.customerName)}`)}
                className="w-full flex items-center justify-between gap-3 py-3.5 px-1 text-left hover:opacity-80 tap-scale"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                    {c.customerName}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {c.allocationCount} AWB{c.allocationCount !== 1 ? 's' : ''} pending
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
                    {fmt(c.pendingAmount)}
                  </span>
                  <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Wizard mode ───────────────────────────────────────────────────────────

  const STEPS = [
    { n: 1 as const, label: 'Select AWBs' },
    { n: 2 as const, label: 'Markup' },
    { n: 3 as const, label: 'Review' },
  ]

  const goBack = () => {
    if (step > 1) {
      setStep((step - 1) as 1 | 2 | 3)
    } else {
      router.push('/recoverables/invoices/new')
    }
  }

  return (
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Company picker — opens when multiple companies exist */}
      {showCompanyPicker && companies.length > 1 && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
          <div className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl" style={{ background: 'var(--surface)' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Which company is this invoice from?</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>The default is highlighted.</p>
            </div>
            <div className="px-3 py-3 space-y-2 max-h-[60dvh] overflow-y-auto">
              {companies.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setCompanyId(c.id); setShowCompanyPicker(false) }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left text-sm"
                  style={{
                    background: companyId === c.id ? 'rgba(42,122,80,0.08)' : 'var(--surface)',
                    borderColor: companyId === c.id ? 'var(--brand)' : 'var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.is_default && (
                    <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(42,122,80,0.1)', color: 'var(--brand)' }}>Default</span>
                  )}
                </button>
              ))}
            </div>
            <div className="px-5 py-3 border-t flex items-center justify-end" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowCompanyPicker(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--brand)' }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header + step indicator */}
      <div className="flex items-start gap-3">
        <button
          onClick={goBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl shrink-0 mt-0.5"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-2)' }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold truncate" style={{ color: 'var(--text)' }}>
            New Invoice — {initialCustomerName}
          </h1>
          {pickedCompany && (
            <button
              onClick={() => setShowCompanyPicker(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              title="Change company"
            >
              From <span className="font-semibold" style={{ color: 'var(--text)' }}>{pickedCompany.name}</span>
              {companies.length > 1 && <span>· change</span>}
            </button>
          )}
          {/* Step indicator */}
          <div className="flex items-center gap-1 mt-2">
            {STEPS.map((s, i) => (
              <Fragment key={s.n}>
                {i > 0 && (
                  <div className="flex-1 max-w-[24px] h-px mx-1" style={{ backgroundColor: 'var(--border)' }} />
                )}
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      backgroundColor: step > s.n
                        ? 'var(--income, #22c55e)'
                        : step === s.n
                        ? 'var(--brand)'
                        : 'var(--surface-2)',
                      color: step >= s.n ? 'white' : 'var(--text-muted)',
                    }}
                  >
                    {step > s.n ? <Check className="w-3 h-3" /> : s.n}
                  </div>
                  <span
                    className="text-xs hidden sm:block"
                    style={{
                      color: step === s.n ? 'var(--brand)' : 'var(--text-muted)',
                      fontWeight: step === s.n ? 600 : 400,
                    }}
                  >
                    {s.label}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* ── Step 1: AWB Selection ── */}
      {step === 1 && (
        <div className="space-y-4">
          {initialAllocations.length === 0 ? (
            <div className="card py-10 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No pending AWBs for {initialCustomerName}
              </p>
            </div>
          ) : (
            <>
              {/* Select all row */}
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {initialAllocations.length} AWB{initialAllocations.length !== 1 ? 's' : ''} available
                </p>
                <button
                  onClick={toggleAll}
                  className="text-xs font-semibold"
                  style={{ color: 'var(--brand)' }}
                >
                  {selectedIds.size === initialAllocations.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {/* Grouped by batch */}
              {grouped.map(([batchName, batchAllocs]) => (
                <div key={batchName} className="card overflow-hidden">
                  {/* Batch header */}
                  <div
                    className="px-3 py-2"
                    style={{ backgroundColor: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                  >
                    <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {batchName}
                    </p>
                  </div>

                  {/* Allocation rows */}
                  <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
                    {batchAllocs.map(a => (
                      <label
                        key={a.id}
                        className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:opacity-80"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(a.id)}
                          onChange={() => toggleId(a.id)}
                          className="w-4 h-4 rounded shrink-0"
                          style={{ accentColor: 'var(--brand)' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-mono font-medium truncate" style={{ color: 'var(--text)' }}>
                            {a.awb}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {fmtDate(a.shipmentDate)} · {a.pieces} pcs
                          </p>
                        </div>
                        <p className="text-sm font-semibold shrink-0" style={{ color: 'var(--text)' }}>
                          {fmt(Number(a.base_cost))}
                        </p>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* Running total */}
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: 'var(--brand-light)' }}
              >
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {selectedIds.size} AWB{selectedIds.size !== 1 ? 's' : ''} selected
                </p>
                <p className="text-sm font-bold" style={{ color: 'var(--brand)' }}>
                  {fmt(selectedBase)} before GST
                </p>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={selectedIds.size === 0}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity"
                style={{ backgroundColor: 'var(--brand)', opacity: selectedIds.size === 0 ? 0.4 : 1 }}
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Step 2: Markup ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card space-y-5">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Apply markup to {selectedIds.size} selected AWB{selectedIds.size !== 1 ? 's' : ''}
            </h2>

            {/* Markup type toggle */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'var(--surface-2)' }}>
              {(
                [
                  ['none', 'No Markup'],
                  ['percentage', 'Percentage %'],
                  ['flat', '₹ per piece'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => { setMarkupType(v); if (v === 'none') setMarkupValue(0) }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: markupType === v ? 'var(--surface)' : 'transparent',
                    color: markupType === v ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: markupType === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Markup value */}
            {markupType !== 'none' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {markupType === 'percentage' ? 'Markup percentage' : 'Flat amount per piece'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={markupValue || ''}
                    onChange={e => setMarkupValue(Math.max(0, Number(e.target.value)))}
                    placeholder="0"
                    min={0}
                    step={markupType === 'percentage' ? 0.5 : 1}
                    className="flex-1 px-3 py-2.5 rounded-xl text-sm border outline-none"
                    style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                  />
                  <span className="text-sm font-medium w-12 text-right" style={{ color: 'var(--text-muted)' }}>
                    {markupType === 'percentage' ? '%' : '₹/pc'}
                  </span>
                </div>
              </div>
            )}

            {/* Live preview */}
            <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: 'var(--surface-2)' }}>
              <div className="flex items-center justify-between text-xs">
                <span style={{ color: 'var(--text-muted)' }}>Base (before markup)</span>
                <span style={{ color: 'var(--text)' }}>{fmt(selectedBase)}</span>
              </div>
              {markupType !== 'none' && markupValue > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>
                    Markup ({markupType === 'percentage' ? `${markupValue}%` : `₹${markupValue}/pc`})
                  </span>
                  <span style={{ color: 'var(--brand)' }}>+{fmt(afterMarkupTotal - selectedBase)}</span>
                </div>
              )}
              <div
                className="flex items-center justify-between text-sm font-semibold pt-2"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                <span style={{ color: 'var(--text)' }}>After markup (excl. GST)</span>
                <span style={{ color: 'var(--brand)' }}>{fmt(afterMarkupTotal)}</span>
              </div>
            </div>
          </div>

          {/* Invoice details */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Invoice details</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Invoice date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={e => setInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Payment terms</label>
                <select
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                >
                  <option value="due_on_receipt">Due on Receipt</option>
                  <option value="net_7">Net 7 days</option>
                  <option value="net_15">Net 15 days</option>
                  <option value="net_30">Net 30 days</option>
                  <option value="net_60">Net 60 days</option>
                  <option value="net_90">Net 90 days</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal or customer-facing notes…"
                className="w-full px-3 py-2.5 rounded-xl text-sm border outline-none resize-none"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
              />
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Preview Invoice <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Step 3: Review ── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Apply-to-all helper — HSN + GST default from the company; edit
              here to push one value onto every line, or edit lines below. */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>HSN &amp; GST</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Applies to all lines</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium block" style={{ color: 'var(--text-muted)' }}>HSN/SAC</span>
                <input
                  type="text"
                  defaultValue={effHsn}
                  onChange={e => applyToAll('hsn', e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium block" style={{ color: 'var(--text-muted)' }}>CGST %</span>
                <input
                  type="number" min={0} step={0.5}
                  defaultValue={effCgst}
                  onChange={e => applyToAll('cgst', Math.max(0, Number(e.target.value)))}
                  className="w-full px-2.5 py-2 rounded-lg text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium block" style={{ color: 'var(--text-muted)' }}>SGST %</span>
                <input
                  type="number" min={0} step={0.5}
                  defaultValue={effSgst}
                  onChange={e => applyToAll('sgst', Math.max(0, Number(e.target.value)))}
                  className="w-full px-2.5 py-2 rounded-lg text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                />
              </label>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Need different rates for some lines? Edit them directly in the table below.
            </p>
          </div>

          {/* Line items table — HSN / CGST% / SGST% editable per line */}
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['AWB', 'Qty', 'Rate', 'HSN', 'CGST%', 'SGST%', 'Amount'].map(h => (
                    <th
                      key={h}
                      className="py-2 px-2 text-left text-[11px] font-semibold whitespace-nowrap"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reviewLines.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="py-2 px-2 font-mono text-xs" style={{ color: 'var(--text)' }}>
                      <div>{l.awb}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fmtDate(l.shipmentDate)}</div>
                    </td>
                    <td className="py-2 px-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {l.pieces}
                    </td>
                    <td className="py-2 px-2 text-xs whitespace-nowrap" style={{ color: 'var(--text)' }}>
                      {fmt(l.rate)}
                    </td>
                    <td className="py-2 px-1">
                      <input
                        type="text"
                        value={l.hsn}
                        onChange={e => setLineField(l.id, 'hsn', e.target.value)}
                        className="w-16 px-1.5 py-1 rounded-md text-xs border outline-none"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                      />
                    </td>
                    <td className="py-2 px-1">
                      <input
                        type="number" min={0} step={0.5}
                        value={l.cgstRate}
                        onChange={e => setLineField(l.id, 'cgst', Math.max(0, Number(e.target.value)))}
                        className="w-14 px-1.5 py-1 rounded-md text-xs border outline-none"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                      />
                    </td>
                    <td className="py-2 px-1">
                      <input
                        type="number" min={0} step={0.5}
                        value={l.sgstRate}
                        onChange={e => setLineField(l.id, 'sgst', Math.max(0, Number(e.target.value)))}
                        className="w-14 px-1.5 py-1 rounded-md text-xs border outline-none"
                        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                      />
                    </td>
                    <td className="py-2 px-2 text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--text)' }}>
                      {fmt(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* GST totals */}
          <div className="card space-y-2.5">
            {[
              { label: 'Sub Total', value: subtotal },
              { label: uniformRates ? `CGST @ ${reviewLines[0]?.cgstRate ?? effCgst}%` : 'CGST', value: cgstTotal },
              { label: uniformRates ? `SGST @ ${reviewLines[0]?.sgstRate ?? effSgst}%` : 'SGST', value: sgstTotal },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ color: 'var(--text)' }}>{fmt(row.value)}</span>
              </div>
            ))}
            <div
              className="flex items-center justify-between text-base font-bold pt-2"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--text)' }}>Total</span>
              <span style={{ color: 'var(--brand)' }}>{fmt(invoiceTotal)}</span>
            </div>
          </div>

          {/* Invoice meta summary */}
          <div
            className="card text-xs space-y-2"
            style={{ color: 'var(--text-muted)' }}
          >
            <div className="flex justify-between">
              <span>Customer</span>
              <span className="font-medium" style={{ color: 'var(--text)' }}>{initialCustomerName}</span>
            </div>
            <div className="flex justify-between">
              <span>Invoice date</span>
              <span style={{ color: 'var(--text)' }}>
                {new Date(invoiceDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Payment terms</span>
              <span style={{ color: 'var(--text)' }}>
                {paymentTerms === 'due_on_receipt' ? 'Due on Receipt'
                  : paymentTerms === 'net_7'  ? 'Net 7 days'
                  : paymentTerms === 'net_15' ? 'Net 15 days'
                  : paymentTerms === 'net_30' ? 'Net 30 days'
                  : paymentTerms === 'net_60' ? 'Net 60 days'
                  : 'Net 90 days'}
              </span>
            </div>
            {markupType !== 'none' && (
              <div className="flex justify-between">
                <span>Markup</span>
                <span style={{ color: 'var(--text)' }}>
                  {markupType === 'percentage' ? `${markupValue}%` : `₹${markupValue}/pc`}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleCreate}
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-opacity"
            style={{ backgroundColor: 'var(--brand)', opacity: submitting ? 0.7 : 1 }}
          >
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Invoice…</>
              : <><Check className="w-4 h-4" /> Create Invoice</>
            }
          </button>
        </div>
      )}
    </div>
  )
}
