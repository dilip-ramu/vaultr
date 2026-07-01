'use client'

import { useState, useMemo, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Users, Phone, Mail, Edit2, Trash2, ChevronDown, ChevronUp, Building2, Receipt } from 'lucide-react'
import type { Customer } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import CustomerForm from './CustomerForm'
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Customer Directory</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {customers.length} customer{customers.length !== 1 ? 's' : ''}
            {grandOutstanding > 0 && <> · ₹{fmtAmt(grandOutstanding)} outstanding</>}
            {grandOverdue > 0 && <> · <span style={{ color: '#dc2626' }}>₹{fmtAmt(grandOverdue)} overdue</span></>}
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

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center rounded-xl border" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-medium" style={{ color: 'var(--text)' }}>No customers found</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Add your first customer to get started</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: 'var(--surface-2, var(--surface))' }}>
                <tr>
                  {['Customer', 'Contact', 'GST', 'Outstanding', 'Overdue', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <Fragment key={c.id}>
                    <tr
                      className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderBottom: expandedId === c.id ? 'none' : '1px solid var(--border)',
                      }}
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ backgroundColor: 'var(--brand)' }}>
                            {c.name[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium" style={{ color: 'var(--text)' }}>{c.name}</p>
                              {reimbursableIds.has(c.id) && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                      style={{ background: 'rgba(42,122,80,0.10)', color: 'var(--brand)' }}
                                      title="Reimbursable — this customer has a Reimbursables tab and any payee-tagged expense counts toward them.">
                                  Reimbursable
                                </span>
                              )}
                            </div>
                            {c.city && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.city}{c.state ? `, ${c.state}` : ''}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {c.email && <p style={{ color: 'var(--text)' }}>{c.email}</p>}
                        {c.phone && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.phone}</p>}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                        {c.gst_number ?? <span>—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: 'var(--text)' }}>
                        {outstandingByCustomer[c.id]?.outstanding ? `₹${fmtAmt(outstandingByCustomer[c.id].outstanding)}` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3 tabular-nums" style={{ color: (outstandingByCustomer[c.id]?.overdue ?? 0) > 0 ? '#dc2626' : 'var(--text-muted)' }}>
                        {outstandingByCustomer[c.id]?.overdue ? `₹${fmtAmt(outstandingByCustomer[c.id].overdue)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <Link
                            href={`/recoverables/customers/${encodeURIComponent(c.name)}`}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title="View invoices"
                          >
                            <Receipt className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          </Link>
                          <button
                            onClick={() => handleMakeSupplier(c)}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title="Also add as supplier"
                          >
                            <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          </button>
                          <button
                            onClick={() => { setEditingCustomer(c); setShowForm(true) }}
                            className="p-1.5 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            disabled={deleting === c.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {expandedId === c.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr key={`${c.id}-detail`} style={{ backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <InfoCell label="Email" value={c.email} />
                            <InfoCell label="Phone" value={c.phone} />
                            <InfoCell label="GST Number" value={c.gst_number} />
                            <InfoCell label="Address" value={c.address} />
                            <InfoCell label="City" value={c.city} />
                            <InfoCell label="State" value={c.state ? `${c.state}${c.state_code ? ` (${c.state_code})` : ''}` : null} />
                            <InfoCell label="Pincode" value={c.pincode} />
                            <InfoCell label="Country" value={c.country} />
                            {c.notes && <InfoCell label="Notes" value={c.notes} />}
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
            {filtered.map(c => (
              <div key={c.id} className="p-4" style={{ backgroundColor: 'var(--surface)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: 'var(--brand)' }}>
                      {c.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{c.name}</p>
                      {c.gst_number && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>GST: {c.gst_number}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Link
                      href={`/recoverables/customers/${encodeURIComponent(c.name)}`}
                      className="p-1.5 rounded-lg"
                      style={{ backgroundColor: 'var(--surface-2)' }}
                      title="View invoices"
                    >
                      <Receipt className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </Link>
                    <button onClick={() => handleMakeSupplier(c)} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }} title="Also add as supplier">
                      <Building2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button onClick={() => { setEditingCustomer(c); setShowForm(true) }} className="p-1.5 rounded-lg" style={{ backgroundColor: 'var(--surface-2)' }}>
                      <Edit2 className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg bg-red-50">
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {c.email && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Mail className="w-3 h-3" />{c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Phone className="w-3 h-3" />{c.phone}
                    </span>
                  )}
                </div>
                {(outstandingByCustomer[c.id]?.outstanding || outstandingByCustomer[c.id]?.overdue) ? (
                  <div className="mt-2 flex flex-wrap gap-3 text-xs tabular-nums">
                    {outstandingByCustomer[c.id]?.outstanding ? (
                      <span style={{ color: 'var(--text-muted)' }}>
                        Outstanding <span className="font-semibold" style={{ color: 'var(--text)' }}>₹{fmtAmt(outstandingByCustomer[c.id].outstanding)}</span>
                      </span>
                    ) : null}
                    {outstandingByCustomer[c.id]?.overdue ? (
                      <span style={{ color: 'var(--text-muted)' }}>
                        Overdue <span className="font-semibold" style={{ color: '#dc2626' }}>₹{fmtAmt(outstandingByCustomer[c.id].overdue)}</span>
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
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

function InfoCell({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="font-medium mt-0.5 break-all" style={{ color: 'var(--text)' }}>{value}</p>
    </div>
  )
}
