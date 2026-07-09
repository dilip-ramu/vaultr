'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Users, Phone, Mail, Edit2, Trash2, Building2, Receipt } from 'lucide-react'
import type { Customer } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import CustomerForm from './CustomerForm'
import EntityCard, { FaceField } from '@/components/shared/EntityCard'
import { autoColor } from '@/lib/card-gradient'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

interface PartyTotals { outstanding: number; overdue: number }

interface Props {
  initialCustomers: Customer[]
  outstandingByCustomer?: Record<string, PartyTotals>
  /** Ids of customers already flagged reimbursable (a payee row links to
   *  them). Used to preselect the toggle in the form and to render a badge
   *  on the customer row. */
  reimbursableCustomerIds?: string[]
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

export default function CustomersClient({ initialCustomers, outstandingByCustomer = {}, reimbursableCustomerIds = [] }: Props) {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [reimbursableIds, setReimbursableIds] = useState<Set<string>>(new Set(reimbursableCustomerIds))
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return customers.filter(c => {
      if (search) {
        const q = search.toLowerCase()
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.phone ?? '').toLowerCase().includes(q) ||
          (c.gst_number ?? '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [customers, search])

  function handleSaved(saved: Customer, isReimbursable: boolean) {
    setCustomers(prev => {
      const exists = prev.find(c => c.id === saved.id)
      return exists
        ? prev.map(c => c.id === saved.id ? saved : c)
        : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    })
    setReimbursableIds(prev => {
      const next = new Set(prev)
      if (isReimbursable) next.add(saved.id)
      else                next.delete(saved.id)
      return next
    })
    setShowForm(false)
    setEditingCustomer(null)
    // Refresh so the Reimbursables tab bar picks up any new/removed customer.
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!await confirmDialog('Delete this customer? Invoices linked to them will not be deleted.')) return
    setDeleting(id)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { notify('Session expired', 'error'); return }
      // Belt-and-suspenders: rely on RLS but also filter client-side so a
      // missing/misconfigured policy can't quietly cross tenants.
      const { error } = await supabase.from('customers').delete().eq('id', id).eq('user_id', user.id)
      if (error) {
        notify(error.message, 'error')
      } else {
        setCustomers(prev => prev.filter(c => c.id !== id))
      }
    } finally {
      setDeleting(null)
    }
  }

  // Create a supplier record from a customer's details (same entity, other side)
  async function handleMakeSupplier(c: Customer) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: existing } = await supabase
      .from('suppliers').select('id').eq('user_id', user.id).ilike('name', c.name).maybeSingle()
    if (existing) {
      notify(`"${c.name}" is already a supplier.`, 'info')
      return
    }
    if (!await confirmDialog({
      title: 'Add as supplier?',
      message: `Create a supplier from "${c.name}" using their contact and GST details. They'll remain a customer too.`,
      confirmLabel: 'Add as supplier',
    })) return

    const { error } = await supabase.from('suppliers').insert({
      user_id: user.id,
      name: c.name,
      email: c.email,
      mobile: c.phone,
      address: c.address,
      gst_number: c.gst_number,
      notes: c.notes,
      payment_terms: '30',
      currency: 'INR',
      is_active: true,
    })
    if (error) notify('Could not add as supplier: ' + error.message, 'error')
    else notify(`"${c.name}" added as a supplier ✓`, 'success')
  }

  // Totals across visible customers
  const grandOutstanding = filtered.reduce((sum, c) => sum + (outstandingByCustomer[c.id]?.outstanding ?? 0), 0)
  const grandOverdue     = filtered.reduce((sum, c) => sum + (outstandingByCustomer[c.id]?.overdue     ?? 0), 0)

  const iconBtn = 'w-8 h-8 rounded-lg flex items-center justify-center shrink-0'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Customer Directory</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {customers.length} customer{customers.length !== 1 ? 's' : ''}
            {grandOutstanding > 0 && <> · ₹{fmtAmt(grandOutstanding)} outstanding</>}
            {grandOverdue > 0 && <> · <span style={{ color: 'var(--expense)' }}>₹{fmtAmt(grandOverdue)} overdue</span></>}
          </p>
        </div>
        <button
          onClick={() => { setEditingCustomer(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email, phone, GST…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>No customers found</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Add your first customer to get started</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {filtered.map(c => {
            const color = autoColor(c.id, c.color)
            const totals = outstandingByCustomer[c.id]
            const location = [c.city, c.state].filter(Boolean).join(', ')
            return (
              <EntityCard
                key={c.id}
                color={color}
                onClick={() => { setEditingCustomer(c); setShowForm(true) }}
                faceTop={<>
                  <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>Customer</span>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-extrabold shrink-0" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>{c.name[0]?.toUpperCase() ?? '?'}</div>
                </>}
                faceBottom={<>
                  <FaceField label="GSTIN" value={c.gst_number || '—'} />
                  <div className="mt-3"><FaceField label="Location" value={location || '—'} /></div>
                </>}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>{c.name}</p>
                      {reimbursableIds.has(c.id) && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)', color: 'var(--brand)' }}>Reimbursable</span>
                      )}
                    </div>
                    {location && <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{location}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <Link href={`/recoverables/customers/${encodeURIComponent(c.name)}`} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="View invoices"><Receipt className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></Link>
                    <button onClick={() => handleMakeSupplier(c)} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Also add as supplier"><Building2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>
                    <button onClick={() => { setEditingCustomer(c); setShowForm(true) }} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Edit"><Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>
                    <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id} className={iconBtn} style={{ background: 'var(--surface-2)' }} title="Delete"><Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" /></button>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Outstanding</p>
                  <p className="text-2xl font-extrabold tracking-tight" style={{ color: totals?.outstanding ? 'var(--text)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{totals?.outstanding ? `₹${fmtAmt(totals.outstanding)}` : '—'}</p>
                  {totals?.overdue ? <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--expense)' }}>₹{fmtAmt(totals.overdue)} overdue</p> : null}
                </div>

                <div className="mt-auto pt-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border-2, var(--border))' }}>
                  {c.email && <span className="flex items-center gap-1.5 text-[12px] truncate" style={{ color: 'var(--text-muted)' }}><Mail className="w-3.5 h-3.5 shrink-0" />{c.email}</span>}
                  {c.phone && <span className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}><Phone className="w-3.5 h-3.5 shrink-0" />{c.phone}</span>}
                  {!c.email && !c.phone && <span className="text-[11px]" style={{ color: 'var(--text-faint)' }}>No contact details</span>}
                </div>
              </EntityCard>
            )
          })}
        </div>
      )}

      {showForm && (
        <CustomerForm
          customer={editingCustomer}
          initialReimbursable={editingCustomer ? reimbursableIds.has(editingCustomer.id) : false}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditingCustomer(null) }}
        />
      )}
    </div>
  )
}
