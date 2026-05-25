'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft, Loader2, Check, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/lib/types'
import type { AWBAllocation, SupplierInvoice, SupplierInvoiceLine } from '@/lib/logistics/types'
import type { Account } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import InvoiceStatusBadge from './InvoiceStatusBadge'

interface UninvoicedAllocation extends AWBAllocation {
  awb_number: string
  shipment_date: string | null
  destination_city: string | null
  destination_country: string | null
}

interface AllocationGroup {
  awbId: string
  awbNumber: string
  shipmentDate: string | null
  destination: string
  allocations: UninvoicedAllocation[]
}

interface Props {
  customers: Customer[]
  uninvoicedAllocations: UninvoicedAllocation[]
  accounts: Account[]
  currency?: string
}

const today = new Date().toISOString().split('T')[0]
const plus30 = new Date(Date.now() + 30 * 86400_000).toISOString().split('T')[0]

export default function SupplierInvoiceGenerator({
  customers,
  uninvoicedAllocations,
  accounts,
  currency = 'INR',
}: Props) {
  const router = useRouter()

  // Step 1 state
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Step 2 state
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [dueDate, setDueDate] = useState(plus30)
  const [taxRate, setTaxRate] = useState('0')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [notes, setNotes] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('Net 30')

  // Step 3 state
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [result, setResult] = useState<{ invoice: SupplierInvoice; lines: SupplierInvoiceLine[] } | null>(null)

  const inputStyle = {
    backgroundColor: 'var(--surface-2)',
    borderColor: 'var(--border)',
    color: 'var(--text)',
  }

  // Filter allocations by selected customer
  const customerAllocations = useMemo(
    () => selectedCustomerId
      ? uninvoicedAllocations.filter(a => a.customer_id === selectedCustomerId)
      : [],
    [uninvoicedAllocations, selectedCustomerId]
  )

  // Group by AWB
  const groups = useMemo((): AllocationGroup[] => {
    const map = new Map<string, AllocationGroup>()
    for (const alloc of customerAllocations) {
      if (!map.has(alloc.awb_id)) {
        map.set(alloc.awb_id, {
          awbId: alloc.awb_id,
          awbNumber: alloc.awb_number,
          shipmentDate: alloc.shipment_date,
          destination: [alloc.destination_city, alloc.destination_country].filter(Boolean).join(', '),
          allocations: [],
        })
      }
      map.get(alloc.awb_id)!.allocations.push(alloc)
    }
    return [...map.values()]
  }, [customerAllocations])

  // Selected allocations
  const selectedAllocations = customerAllocations.filter(a => selectedIds.has(a.id))
  const subtotal = selectedAllocations.reduce((s, a) => s + (a.override_amount ?? a.billed_amount ?? 0), 0)
  const taxAmount = subtotal * (parseFloat(taxRate) || 0) / 100
  const total = subtotal + taxAmount

  const toggleAlloc = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleGroup = (group: AllocationGroup) => {
    const allSelected = group.allocations.every(a => selectedIds.has(a.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      group.allocations.forEach(a => allSelected ? next.delete(a.id) : next.add(a.id))
      return next
    })
  }

  const handleCustomerChange = (id: string) => {
    setSelectedCustomerId(id)
    setSelectedIds(new Set())
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Dynamically import to keep bundle lean
      const { generateSupplierInvoice } = await import('@/lib/logistics/invoice-generator')
      const res = await generateSupplierInvoice({
        supabase,
        userId: user.id,
        customerId: selectedCustomerId,
        allocationIds: [...selectedIds],
        invoiceDate,
        dueDate: dueDate || undefined,
        taxRate: parseFloat(taxRate) || 0,
        notes: notes.trim() || undefined,
        accountId: accountId || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
      })
      setResult(res)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  // ── Success state ─────────────────────────────────────────
  if (result) {
    return (
      <div className="card p-8 flex flex-col items-center gap-5 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--status-paid-bg)' }}
        >
          <Check className="w-7 h-7" style={{ color: 'var(--status-paid-text)' }} />
        </div>
        <div>
          <p className="font-semibold text-lg mb-1" style={{ color: 'var(--text)' }}>
            Invoice Generated
          </p>
          <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
            {result.invoice.invoice_number} · {formatCurrency(result.invoice.total_amount, currency)}
          </p>
          <InvoiceStatusBadge status={result.invoice.status} />
        </div>
        <div className="flex gap-3 w-full max-w-xs">
          <button
            type="button"
            onClick={() => router.push(`/logistics/supplier-invoices/${result.invoice.id}`)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            <FileText className="w-4 h-4" />
            View Invoice
          </button>
          <button
            type="button"
            onClick={() => { setResult(null); setStep(1); setSelectedIds(new Set()) }}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            New Invoice
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['Select', 'Settings', 'Preview'] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const active = step === n
          const done = step > n
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && (
                <div className="h-px w-5" style={{ backgroundColor: done ? 'var(--brand)' : 'var(--border)' }} />
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: done ? 'var(--brand)' : active ? 'var(--brand-light)' : 'var(--surface-2)',
                    color: done ? '#fff' : active ? 'var(--brand)' : 'var(--text-faint)',
                  }}
                >
                  {done ? <Check className="w-3 h-3" /> : n}
                </div>
                <span
                  className="text-xs font-semibold hidden sm:block"
                  style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
                >
                  {label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── STEP 1: Select Allocations ──────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Customer picker */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Customer
            </label>
            <select
              value={selectedCustomerId}
              onChange={e => handleCustomerChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm border"
              style={inputStyle}
            >
              <option value="">Select a customer…</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {selectedCustomerId && groups.length === 0 && (
            <div className="card p-6 text-center">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No uninvoiced allocations for this customer.
              </p>
            </div>
          )}

          {groups.map(group => {
            const allSelected = group.allocations.every(a => selectedIds.has(a.id))
            const someSelected = group.allocations.some(a => selectedIds.has(a.id))
            return (
              <div key={group.awbId} className="card overflow-hidden">
                {/* AWB header row */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center gap-3 px-4 py-3 border-b"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center border flex-shrink-0"
                    style={{
                      backgroundColor: allSelected ? 'var(--brand)' : someSelected ? 'var(--brand-light)' : 'transparent',
                      borderColor: allSelected || someSelected ? 'var(--brand)' : 'var(--border)',
                    }}
                  >
                    {(allSelected || someSelected) && (
                      <Check className="w-2.5 h-2.5" style={{ color: allSelected ? '#fff' : 'var(--brand)' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="font-mono text-sm font-bold" style={{ color: 'var(--text)' }}>
                      {group.awbNumber}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {group.destination}
                      {group.shipmentDate ? ` · ${formatDate(group.shipmentDate)}` : ''}
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    {group.allocations.filter(a => selectedIds.has(a.id)).length}/{group.allocations.length}
                  </span>
                </button>

                {/* Allocation rows */}
                {group.allocations.map((alloc, i) => {
                  const amount = alloc.override_amount ?? alloc.billed_amount ?? 0
                  const isChecked = selectedIds.has(alloc.id)
                  return (
                    <button
                      key={alloc.id}
                      type="button"
                      onClick={() => toggleAlloc(alloc.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t' : ''}`}
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center border flex-shrink-0"
                        style={{
                          backgroundColor: isChecked ? 'var(--brand)' : 'transparent',
                          borderColor: isChecked ? 'var(--brand)' : 'var(--border)',
                        }}
                      >
                        {isChecked && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="flex-1 text-left text-sm" style={{ color: 'var(--text)' }}>
                        {alloc.pieces} PCS
                        {alloc.override_amount !== null && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>
                            override
                          </span>
                        )}
                      </span>
                      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--income)' }}>
                        {formatCurrency(amount, currency)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {/* Running total */}
          {selectedIds.size > 0 && (
            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ backgroundColor: 'var(--surface-2)' }}
            >
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {selectedIds.size} allocation{selectedIds.size !== 1 ? 's' : ''} selected
              </span>
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--income)' }}>
                {formatCurrency(subtotal, currency)}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={selectedIds.size === 0}
            onClick={() => setStep(2)}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── STEP 2: Invoice Settings ────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Invoice Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Tax rate */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Tax Rate (%)
            </label>
            <div className="flex gap-2">
              {['0', '5', '12', '18', '28'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTaxRate(v)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold"
                  style={{
                    backgroundColor: taxRate === v ? 'var(--brand)' : 'var(--surface-2)',
                    color: taxRate === v ? '#fff' : 'var(--text-muted)',
                    border: taxRate === v ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {v}%
                </button>
              ))}
              <input
                type="number"
                value={taxRate}
                onChange={e => setTaxRate(e.target.value)}
                min="0"
                max="100"
                step="0.01"
                className="w-16 px-2 py-2 rounded-xl text-xs text-center border"
                style={inputStyle}
                placeholder="Custom"
              />
            </div>
          </div>

          {/* Account */}
          {accounts.length > 0 && (
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Receiving Account
              </label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={inputStyle}
              >
                <option value="">None</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Payment terms */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Payment Terms
            </label>
            <input
              type="text"
              value={paymentTerms}
              onChange={e => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 30"
              className="w-full px-3 py-2.5 rounded-xl text-sm border"
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Notes (shown on invoice)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl text-sm border resize-none"
              style={inputStyle}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              Preview <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Preview & Generate ──────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Invoice header */}
          <div className="card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Bill To</p>
                <p className="font-semibold mt-0.5" style={{ color: 'var(--text)' }}>
                  {selectedCustomer?.name}
                </p>
                {selectedCustomer?.gst_number && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    GST: {selectedCustomer.gst_number}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Invoice Date</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text)' }}>{formatDate(invoiceDate)}</p>
                {dueDate && (
                  <>
                    <p className="text-xs font-semibold mt-1.5" style={{ color: 'var(--text-muted)' }}>Due</p>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text)' }}>{formatDate(dueDate)}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="card overflow-hidden">
            <div
              className="grid gap-3 px-4 py-2 text-xs font-semibold"
              style={{
                gridTemplateColumns: '1fr 50px 80px',
                backgroundColor: 'var(--surface-2)',
                color: 'var(--text-muted)',
              }}
            >
              <span>Description</span>
              <span className="text-center">PCS</span>
              <span className="text-right">Amount</span>
            </div>
            {selectedAllocations.map((alloc, i) => {
              const amount = alloc.override_amount ?? alloc.billed_amount ?? 0
              const dest = alloc.destination_city ?? alloc.destination_country ?? ''
              return (
                <div
                  key={alloc.id}
                  className="grid gap-3 px-4 py-3 border-t text-sm items-center"
                  style={{ gridTemplateColumns: '1fr 50px 80px', borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold" style={{ color: 'var(--text)' }}>
                      {alloc.awb_number}
                    </p>
                    {dest && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-faint)' }}>→ {dest}</p>
                    )}
                  </div>
                  <span className="text-center font-mono" style={{ color: 'var(--text-muted)' }}>
                    {alloc.pieces}
                  </span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: 'var(--text)' }}>
                    {formatCurrency(amount, currency)}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div className="card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
              <span className="tabular-nums font-medium" style={{ color: 'var(--text)' }}>
                {formatCurrency(subtotal, currency)}
              </span>
            </div>
            {parseFloat(taxRate) > 0 && (
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Tax ({taxRate}%)</span>
                <span className="tabular-nums" style={{ color: 'var(--text)' }}>
                  {formatCurrency(taxAmount, currency)}
                </span>
              </div>
            )}
            <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />
            <div className="flex justify-between">
              <span className="font-semibold" style={{ color: 'var(--text)' }}>Total</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--income)' }}>
                {formatCurrency(total, currency)}
              </span>
            </div>
          </div>

          {notes && (
            <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>{notes}</p>
          )}

          {genError && (
            <p className="text-sm px-1" style={{ color: 'var(--expense)' }}>{genError}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={generating}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              {generating && <Loader2 className="w-4 h-4 animate-spin" />}
              {generating ? 'Generating…' : 'Generate Invoice'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
