'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Building2, Phone, Mail, Edit2, Trash2, ToggleLeft, ToggleRight, UserPlus } from 'lucide-react'
import type { Supplier } from '@/lib/suppliers/types'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/suppliers/types'
import SupplierForm from './SupplierForm'
import EntityCard, { FaceField } from '@/components/shared/EntityCard'
import { autoColor } from '@/lib/card-gradient'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import { createClient } from '@/lib/supabase/client'

interface PartyTotals { outstanding: number; overdue: number }

interface Props {
  initialSuppliers: Supplier[]
  outstandingBySupplier?: Record<string, PartyTotals>
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

export default function SupplierDirectoryClient({ initialSuppliers, outstandingBySupplier = {} }: Props) {
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return suppliers.filter(s => {
      if (!showInactive && !s.is_active) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          s.name.toLowerCase().includes(q) ||
          (s.supplier_code ?? '').toLowerCase().includes(q) ||
          (s.contact_person ?? '').toLowerCase().includes(q) ||
          (s.email ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [suppliers, search, showInactive])

  async function handleSaved(saved: Supplier) {
    setSuppliers(prev => {
      const exists = prev.find(s => s.id === saved.id)
      return exists ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]
    })
    setShowForm(false)
    setEditingSupplier(null)
  }

  async function handleToggleActive(id: string, current: boolean) {
    setToggling(id)
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !current }),
      })
      const data = await res.json()
      if (res.ok) setSuppliers(prev => prev.map(s => s.id === id ? data.supplier : s))
    } finally {
      setToggling(null)
    }
  }

  async function handleDelete(id: string) {
    if (!await confirmDialog('Delete this supplier? This cannot be undone.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setSuppliers(prev => prev.filter(s => s.id !== id))
      } else {
        notify(data.error ?? 'Delete failed')
      }
    } finally {
      setDeleting(null)
    }
  }

  // Create a customer record from a supplier's details (same entity, other side)
  async function handleMakeCustomer(s: Supplier) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: existing } = await supabase
      .from('customers').select('id').eq('user_id', user.id).ilike('name', s.name).maybeSingle()
    if (existing) {
      notify(`"${s.name}" is already a customer.`, 'info')
      return
    }
    if (!await confirmDialog({
      title: 'Add as customer?',
      message: `Create a customer from "${s.name}" using their contact and GST details. They'll remain a supplier too.`,
      confirmLabel: 'Add as customer',
    })) return

    const { error } = await supabase.from('customers').insert({
      user_id: user.id,
      name: s.name,
      email: s.email,
      phone: s.mobile,
      address: s.address,
      gst_number: s.gst_number,
      notes: s.notes,
    })
    if (error) notify('Could not add as customer: ' + error.message, 'error')
    else notify(`"${s.name}" added as a customer ✓`, 'success')
  }

  const termsLabel = (s: Supplier) => {
    const opt = PAYMENT_TERMS_OPTIONS.find(o => o.value === s.payment_terms)
    if (s.payment_terms === 'custom' && s.custom_terms_days) return `${s.custom_terms_days} Days`
    return opt?.label ?? s.payment_terms
  }

  // Totals across all currently-visible suppliers
  const grandOutstanding = filtered.reduce((sum, s) => sum + (outstandingBySupplier[s.id]?.outstanding ?? 0), 0)
  const grandOverdue     = filtered.reduce((sum, s) => sum + (outstandingBySupplier[s.id]?.overdue     ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Supplier Directory</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {suppliers.filter(s => s.is_active).length} active suppliers
            {grandOutstanding > 0 && <> · ₹{fmtAmt(grandOutstanding)} outstanding</>}
            {grandOverdue > 0 && <> · <span style={{ color: 'var(--expense)' }}>₹{fmtAmt(grandOverdue)} overdue</span></>}
          </p>
        </div>
        <button
          onClick={() => { setEditingSupplier(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, code, contact, email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Show inactive
        </label>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>No suppliers found</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Add your first supplier to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {filtered.map(s => {
            const color = autoColor(s.id, s.color)
            const totals = outstandingBySupplier[s.id]
            const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0'
            return (
              <div key={s.id} style={{ opacity: s.is_active ? 1 : 0.6 }}>
                <EntityCard
                  color={color}
                  onClick={() => { setEditingSupplier(s); setShowForm(true) }}
                  faceTop={<>
                    <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>Supplier</span>
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-extrabold shrink-0" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>{s.name[0]?.toUpperCase() ?? '?'}</div>
                  </>}
                  faceBottom={<>
                    <FaceField label="Supplier code" value={s.supplier_code || '—'} />
                    <div className="flex items-end justify-between gap-3 mt-3">
                      <FaceField label="Terms" value={termsLabel(s)} />
                      <FaceField label="Currency" value={s.currency} align="right" />
                    </div>
                  </>}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>{s.name}</p>
                        {!s.is_active && <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Inactive</span>}
                      </div>
                      {s.contact_person && <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{s.contact_person}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleMakeCustomer(s)} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Also add as customer"><UserPlus className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>
                      <button onClick={() => { setEditingSupplier(s); setShowForm(true) }} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Edit"><Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>
                      <button onClick={() => handleToggleActive(s.id, s.is_active)} disabled={toggling === s.id} className={iconBtn} style={{ background: 'var(--surface-2)' }} title={s.is_active ? 'Deactivate' : 'Activate'}>{s.is_active ? <ToggleRight className="w-3.5 h-3.5 text-[var(--income)]" /> : <ToggleLeft className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}</button>
                      <button onClick={() => handleDelete(s.id)} disabled={deleting === s.id} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Delete"><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Outstanding payable</p>
                    <p className="text-2xl font-extrabold tracking-tight" style={{ color: totals?.outstanding ? 'var(--text)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{totals?.outstanding ? `₹${fmtAmt(totals.outstanding)}` : '—'}</p>
                    {totals?.overdue ? <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--expense)' }}>₹{fmtAmt(totals.overdue)} overdue</p> : null}
                  </div>

                  <div className="mt-auto pt-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
                    {s.mobile && <span className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}><Phone className="w-3.5 h-3.5 shrink-0" />{s.mobile}</span>}
                    {s.email && <span className="flex items-center gap-1.5 text-[12px] truncate" style={{ color: 'var(--text-muted)' }}><Mail className="w-3.5 h-3.5 shrink-0" />{s.email}</span>}
                    {s.gst_number && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>GST {s.gst_number}</span>}
                    {!s.mobile && !s.email && !s.gst_number && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No contact details</span>}
                  </div>
                </EntityCard>
              </div>
            )
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <SupplierForm
          supplier={editingSupplier}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditingSupplier(null) }}
        />
      )}
    </div>
  )
}
