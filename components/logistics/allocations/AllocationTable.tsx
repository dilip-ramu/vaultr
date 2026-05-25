'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Loader2, Check, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AWB, AWBAllocation, MarkupRule } from '@/lib/logistics/types'
import type { AWBCalculation } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'
import { calculateMargin } from '@/lib/logistics/calculations'
import { formatCurrency } from '@/lib/utils'
import AllocationSummary from './AllocationSummary'
import AllocationForm from './AllocationForm'

interface Props {
  awb: AWB
  initialAllocations: AWBAllocation[]
  markupRules: MarkupRule[]
  customers: Customer[]
  currency?: string
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function buildInitialCalc(awb: AWB, allocations: AWBAllocation[]): AWBCalculation | null {
  if (allocations.length === 0) return null
  const totalBilled = allocations.reduce((s, a) => s + (a.override_amount ?? a.billed_amount ?? 0), 0)
  const { margin, marginPct } = calculateMargin(awb.total_charge, totalBilled)
  return {
    awbId: awb.id,
    awbNumber: awb.awb_number,
    totalCharge: awb.total_charge,
    totalPieces: awb.total_pieces,
    perPieceBaseCost: awb.per_piece_base_cost ?? (awb.total_pieces > 0 ? awb.total_charge / awb.total_pieces : 0),
    allocations: allocations.map(a => ({
      customerId: a.customer_id,
      customerName: a.customer?.name ?? '',
      pieces: a.pieces,
      markupType: a.markup_type,
      markupValue: a.markup_value,
      minimumAmount: a.minimum_amount ?? undefined,
      overrideAmount: a.override_amount ?? undefined,
      baseCost: a.base_cost ?? 0,
      markupAmount: a.markup_amount ?? 0,
      billedAmount: a.billed_amount ?? 0,
      effectiveAmount: a.override_amount ?? a.billed_amount ?? 0,
      perPieceRate: a.pieces > 0 ? (a.override_amount ?? a.billed_amount ?? 0) / a.pieces : 0,
    })),
    totalBilled,
    totalMargin: margin,
    marginPct,
  }
}

// Swipe-to-delete card wrapper using CSS transforms + touch events
function SwipeCard({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const [offset, setOffset] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const startX = useRef(0)
  const isDragging = useRef(false)
  const THRESHOLD = 72

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    isDragging.current = true
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return
    const dx = startX.current - e.touches[0].clientX
    if (dx > 0) setOffset(Math.min(dx, THRESHOLD + 16))
    else if (dx < 0 && revealed) setOffset(Math.max(0, THRESHOLD - Math.abs(dx)))
  }

  const onTouchEnd = () => {
    isDragging.current = false
    if (offset >= THRESHOLD * 0.6) { setOffset(THRESHOLD); setRevealed(true) }
    else { setOffset(0); setRevealed(false) }
  }

  useEffect(() => {
    if (!revealed) return
    const close = () => { setOffset(0); setRevealed(false) }
    document.addEventListener('touchstart', close, { passive: true })
    return () => document.removeEventListener('touchstart', close)
  }, [revealed])

  return (
    <div className="relative overflow-hidden">
      {/* Delete action revealed behind */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
        style={{ width: THRESHOLD, backgroundColor: 'var(--expense)' }}
      >
        <button
          onClick={onDelete}
          className="w-full h-full flex items-center justify-center"
          aria-label="Delete"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>
      {/* Sliding content */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(-${offset}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.2s ease',
          backgroundColor: 'var(--surface)',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default function AllocationTable({
  awb,
  initialAllocations,
  markupRules,
  customers,
  currency = 'INR',
}: Props) {
  const [allocations, setAllocations] = useState<AWBAllocation[]>(initialAllocations)
  const [calc, setCalc] = useState<AWBCalculation | null>(() => buildInitialCalc(awb, initialAllocations))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recalculate = useCallback(async (current: AWBAllocation[]) => {
    if (current.length === 0) {
      setCalc(null)
      setSaveStatus('idle')
      return
    }
    setSaveStatus('saving')
    setSaveError(null)
    try {
      const res = await fetch('/api/logistics/allocations/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          awbId: awb.id,
          allocations: current.map(a => ({
            id: a.id,
            customerId: a.customer_id,
            customerName: a.customer?.name ?? '',
            pieces: a.pieces,
            markupType: a.markup_type,
            markupValue: a.markup_value,
            minimumAmount: a.minimum_amount ?? undefined,
            overrideAmount: a.override_amount ?? undefined,
          })),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { calc: newCalc } = await res.json()
      setCalc(newCalc)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
      setSaveStatus('error')
    }
  }, [awb.id])

  const scheduleRecalc = useCallback((next: AWBAllocation[]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => recalculate(next), 500)
  }, [recalculate])

  const updatePieces = (id: string, delta: number) => {
    setAllocations(prev => {
      const next = prev.map(a =>
        a.id === id ? { ...a, pieces: Math.max(1, a.pieces + delta) } : a
      )
      scheduleRecalc(next)
      return next
    })
  }

  const setPiecesExact = (id: string, val: number) => {
    if (!Number.isFinite(val) || val < 1) return
    setAllocations(prev => {
      const next = prev.map(a => a.id === id ? { ...a, pieces: val } : a)
      scheduleRecalc(next)
      return next
    })
  }

  const updateOverride = (id: string, raw: string) => {
    const val = raw === '' ? null : parseFloat(raw)
    setAllocations(prev => {
      const next = prev.map(a => a.id === id ? { ...a, override_amount: val } : a)
      scheduleRecalc(next)
      return next
    })
  }

  const deleteAllocation = async (id: string) => {
    const previousAllocations = [...allocations]
    setAllocations(prev => {
      const next = prev.filter(a => a.id !== id)
      scheduleRecalc(next)
      return next
    })
    const supabase = createClient()
    const { error } = await supabase.from('awb_allocations').delete().eq('id', id)
    if (error) {
      setAllocations(previousAllocations)
      setSaveError(`Delete failed: ${error.message}`)
      setSaveStatus('error')
    }
  }

  const handleAdded = (alloc: AWBAllocation) => {
    setAllocations(prev => {
      const next = [...prev, alloc]
      scheduleRecalc(next)
      return next
    })
  }

  const existingCustomerIds = allocations.map(a => a.customer_id)
  const allocatedPieces = allocations.reduce((s, a) => s + a.pieces, 0)
  const unallocatedPieces = awb.total_pieces - allocatedPieces

  return (

    <div className="space-y-4">
      {/* Save indicator */}
      {saveStatus !== 'idle' && (
        <div
          className="flex items-center gap-1.5 text-xs px-1"
          style={{
            color:
              saveStatus === 'error' ? 'var(--expense)' :
              saveStatus === 'saved' ? 'var(--income)' :
              'var(--text-muted)',
          }}
        >
          {saveStatus === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
          {saveStatus === 'saved' && <Check className="w-3 h-3" />}
          {saveStatus === 'saving' ? 'Saving…' :
           saveStatus === 'saved' ? 'Saved' :
           (saveError ?? 'Error')}
        </div>
      )}

      {/* Pieces progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: 'var(--text-muted)' }}>
            {allocatedPieces} / {awb.total_pieces} PCS allocated
          </span>
          {unallocatedPieces > 0 && allocations.length > 0 && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-lg"
              style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
            >
              {unallocatedPieces} unallocated
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${awb.total_pieces > 0 ? Math.min((allocatedPieces / awb.total_pieces) * 100, 100) : 0}%`,
              backgroundColor: allocatedPieces >= awb.total_pieces ? 'var(--income)' : 'var(--brand)',
            }}
          />
        </div>
      </div>

      {/* AllocationSummary */}
      {calc && <AllocationSummary calc={calc} currency={currency} />}

      {/* Allocation rows */}
      {allocations.length > 0 && (
        <div className="card overflow-hidden">
          {/* Desktop header */}
          <div
            className="hidden md:grid gap-2 px-4 py-2 text-xs font-semibold"
            style={{
              gridTemplateColumns: '1fr 112px 80px 80px 96px 32px',
              backgroundColor: 'var(--surface-2)',
              color: 'var(--text-muted)',
            }}
          >
            <span>Supplier</span>
            <span className="text-center">Pieces</span>
            <span className="text-right">Base</span>
            <span className="text-right">Billed</span>
            <span className="text-right">Override</span>
            <span />
          </div>

          {allocations.map((alloc, idx) => {
            const result = calc?.allocations.find(r => r.customerId === alloc.customer_id)
            const base = result?.baseCost ?? alloc.base_cost ?? 0
            const billed = result?.effectiveAmount ?? alloc.override_amount ?? alloc.billed_amount ?? 0
            const hasOverride = alloc.override_amount !== null
            const isExpanded = expandedId === alloc.id

            return (
              <div
                key={alloc.id}
                className={idx > 0 ? 'border-t' : ''}
                style={{ borderColor: 'var(--border)' }}
              >
                {/* Desktop row */}
                <div
                  className="hidden md:grid gap-2 px-4 py-3 items-center"
                  style={{ gridTemplateColumns: '1fr 112px 80px 80px 96px 32px' }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                      {alloc.customer?.name ?? '—'}
                    </p>
                    {alloc.markup_type !== 'none' && alloc.markup_value > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                        +{alloc.markup_type === 'percentage'
                          ? `${alloc.markup_value}%`
                          : formatCurrency(alloc.markup_value, currency)
                        }
                        {alloc.minimum_amount
                          ? ` · min ${formatCurrency(alloc.minimum_amount, currency)}`
                          : ''}
                      </p>
                    )}
                  </div>

                  {/* Pieces stepper */}
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => updatePieces(alloc.id, -1)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center font-bold leading-none"
                      style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={alloc.pieces}
                      onChange={e => setPiecesExact(alloc.id, parseInt(e.target.value, 10))}
                      min="1"
                      className="w-10 text-center text-sm font-mono font-bold border rounded-lg py-0.5"
                      style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    />
                    <button
                      type="button"
                      onClick={() => updatePieces(alloc.id, 1)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center font-bold leading-none"
                      style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      +
                    </button>
                  </div>

                  <span className="text-right text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {formatCurrency(base, currency)}
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums" style={{ color: 'var(--income)' }}>
                    {formatCurrency(billed, currency)}
                  </span>

                  <input
                    type="number"
                    value={alloc.override_amount ?? ''}
                    onChange={e => updateOverride(alloc.id, e.target.value)}
                    placeholder="—"
                    min="0"
                    step="0.01"
                    className="w-full text-right text-sm border rounded-lg px-2 py-0.5"
                    style={{
                      backgroundColor: hasOverride ? 'var(--brand-light)' : 'var(--surface-2)',
                      borderColor: hasOverride ? 'var(--brand)' : 'var(--border)',
                      color: 'var(--text)',
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => deleteAllocation(alloc.id)}
                    className="tap-scale w-8 h-8 flex items-center justify-center rounded-lg ml-auto"
                    style={{ color: 'var(--text-faint)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Mobile card — swipe left to reveal delete */}
                <SwipeCard onDelete={() => deleteAllocation(alloc.id)}>
                  <div className="md:hidden px-4 py-3.5 space-y-3">
                    {/* Top row: name + expand toggle */}
                    <div className="flex items-center justify-between min-h-[44px]">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          {alloc.customer?.name ?? '—'}
                        </p>
                        {alloc.markup_type !== 'none' && alloc.markup_value > 0 && (
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            +{alloc.markup_type === 'percentage'
                              ? `${alloc.markup_value}%`
                              : formatCurrency(alloc.markup_value, currency)}
                            {alloc.minimum_amount ? ` · min ${formatCurrency(alloc.minimum_amount, currency)}` : ''}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : alloc.id)}
                        className="tap-scale w-10 h-10 flex items-center justify-center rounded-xl"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Bottom row: PCS stepper + billed amount */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updatePieces(alloc.id, -1)}
                          className="tap-scale w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base"
                          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                        >
                          −
                        </button>
                        <span className="w-9 text-center font-mono font-bold text-sm" style={{ color: 'var(--text)' }}>
                          {alloc.pieces}
                        </span>
                        <button
                          type="button"
                          onClick={() => updatePieces(alloc.id, 1)}
                          className="tap-scale w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base"
                          style={{ backgroundColor: 'var(--surface-2)', color: 'var(--text-muted)' }}
                        >
                          +
                        </button>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>PCS</span>
                      </div>

                      <div className="text-right">
                        <p className="text-base font-bold tabular-nums" style={{ color: 'var(--income)' }}>
                          {formatCurrency(billed, currency)}
                        </p>
                        {alloc.markup_type !== 'none' && alloc.markup_value > 0 && (
                          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                            base {formatCurrency(base, currency)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Expanded: override amount */}
                    {isExpanded && (
                      <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                          Override Amount (blank = auto)
                        </p>
                        <input
                          type="number"
                          value={alloc.override_amount ?? ''}
                          onChange={e => updateOverride(alloc.id, e.target.value)}
                          placeholder="Auto-calculated"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          className="w-full px-3 py-3 rounded-xl text-sm border"
                          style={{
                            backgroundColor: 'var(--surface-2)',
                            borderColor: hasOverride ? 'var(--brand)' : 'var(--border)',
                            color: 'var(--text)',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </SwipeCard>
              </div>
            )
          })}
        </div>
      )}

      {/* Add allocation */}
      <AllocationForm
        awb={awb}
        markupRules={markupRules}
        customers={customers}
        existingCustomerIds={existingCustomerIds}
        currency={currency}
        onAdded={handleAdded}
      />
    </div>
  )
}
