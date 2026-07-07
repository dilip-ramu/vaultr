'use client'

import { useState, useMemo, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Building2, Phone, Mail, Edit2, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, UserPlus } from 'lucide-react'
import type { Supplier } from '@/lib/suppliers/types'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/suppliers/types'
import SupplierForm from './SupplierForm'
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>No suppliers found</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Add your first supplier to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: 'var(--surface-2, var(--surface))' }}>
                <tr>
                  {['Supplier', 'Contact', 'Payment Terms', 'Currency', 'Outstanding', 'Overdue', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <Fragment key={s.id}>
                    <tr
                      className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderBottom: expandedId === s.id ? 'none' : '1px solid var(--border)',
                        opacity: s.is_active ? 1 : 0.55,
                      }}
                      onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: 'var(--brand)' }}>
                            {s.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium" style={{ color: 'var(--text)' }}>{s.name}</p>
                            {s.supplier_code && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.supplier_code}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {s.contact_person && <p style={{ color: 'var(--text)' }}>{s.contact_person}</p>}
                        {s.mobile && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.mobile}</p>}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text)' }}>{termsLabel(s)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>
                          {s.currency}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--text)' }}>
                        {outstandingBySupplier[s.id]?.outstanding ? `₹${fmtAmt(outstandingBySupplier[s.id].outstanding)}` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: (outstandingBySupplier[s.id]?.overdue ?? 0) > 0 ? 'var(--expense)' : 'var(--text-muted)' }}>
                        {outstandingBySupplier[s.id]?.overdue ? `₹${fmtAmt(outstandingBySupplier[s.id].overdue)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-[var(--brand-light)] text-[var(--income)]' : 'bg-[var(--surface-2)] text-[var(--text-muted)]'}`}>
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleMakeCustomer(s)}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title="Also add as customer"
                          >
                            <UserPlus className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          </button>
                          <button
                            onClick={() => { setEditingSupplier(s); setShowForm(true) }}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          </button>
                          <button
                            onClick={() => handleToggleActive(s.id, s.is_active)}
                            disabled={toggling === s.id}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title={s.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {s.is_active
                              ? <ToggleRight className="w-3.5 h-3.5 text-[var(--income)]" />
                              : <ToggleLeft className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                            }
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            disabled={deleting === s.id}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
                          </button>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {expandedId === s.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {expandedId === s.id && (
                      <tr key={`${s.id}-detail`} style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <InfoCell label="Email" value={s.email} />
                            <InfoCell label="GST Number" value={s.gst_number} />
                            <InfoCell label="PAN Number" value={s.pan_number} />
                            <InfoCell label="Address" value={s.address} />
                            <InfoCell label="Bank Name" value={s.bank_name} />
                            <InfoCell label="Account Number" value={s.account_number} />
                            <InfoCell label="IFSC / SWIFT" value={s.ifsc_swift} />
                            {s.notes && <InfoCell label="Notes" value={s.notes} />}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(s => (
              <div key={s.id} className="p-4" style={{ backgroundColor: 'var(--surface)', opacity: s.is_active ? 1 : 0.55 }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: 'var(--brand)' }}>
                      {s.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{s.name}</p>
                      {s.supplier_code && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.supplier_code}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => handleMakeCustomer(s)} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }} title="Also add as customer">
                      <UserPlus className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button onClick={() => { setEditingSupplier(s); setShowForm(true) }} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
                      <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg bg-[var(--surface-2)]">
                      <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {s.contact_person && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Building2 className="w-3 h-3" />{s.contact_person}
                    </span>
                  )}
                  {s.mobile && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Phone className="w-3 h-3" />{s.mobile}
                    </span>
                  )}
                  {s.email && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Mail className="w-3 h-3" />{s.email}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand)' }}>{s.currency}</span>
                  <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: s.is_active ? '#dcfce7' : '#f3f4f6', color: s.is_active ? 'var(--income)' : '#6b7280' }}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {(outstandingBySupplier[s.id]?.outstanding || outstandingBySupplier[s.id]?.overdue) ? (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs tabular-nums">
                    {outstandingBySupplier[s.id]?.outstanding ? (
                      <span style={{ color: 'var(--text-muted)' }}>
                        Outstanding <span className="font-semibold" style={{ color: 'var(--text)' }}>₹{fmtAmt(outstandingBySupplier[s.id].outstanding)}</span>
                      </span>
                    ) : null}
                    {outstandingBySupplier[s.id]?.overdue ? (
                      <span style={{ color: 'var(--text-muted)' }}>
                        Overdue <span className="font-semibold" style={{ color: 'var(--expense)' }}>₹{fmtAmt(outstandingBySupplier[s.id].overdue)}</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
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

function InfoCell({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="font-medium mt-0.5 break-all" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  )
}
