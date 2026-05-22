'use client'

import { useState } from 'react'
import { Plus, Users, Mail, Phone, MapPin, Building2, Pencil, Trash2, Receipt } from 'lucide-react'
import Link from 'next/link'
import type { Customer } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import CustomerForm from './CustomerForm'

export default function CustomersClient({ initialCustomers }: { initialCustomers: Customer[] }) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  const handleSaved = (customer: Customer) => {
    setCustomers(prev => {
      const exists = prev.find(c => c.id === customer.id)
      if (exists) return prev.map(c => c.id === customer.id ? customer : c)
      return [...prev, customer].sort((a, b) => a.name.localeCompare(b.name))
    })
    setShowForm(false)
    setEditCustomer(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this customer? Bills linked to them will not be deleted.')) return
    const supabase = createClient()
    await supabase.from('customers').delete().eq('id', id)
    setCustomers(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500">{customers.length} customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditCustomer(null); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-brand-500 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:bg-brand-600 transition-all"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search customers…"
        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm mb-4"
      />

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">{search ? 'No customers found' : 'No customers yet'}</p>
          {!search && (
            <p className="text-gray-400 text-sm mt-1">Add customers to use in outgoing bills & invoices</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(customer => (
            <div key={customer.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                  {customer.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{customer.name}</p>
                  {customer.gst_number && (
                    <p className="text-xs text-gray-400">GST: {customer.gst_number}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                    {customer.email && (
                      <a href={`mailto:${customer.email}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-500">
                        <Mail className="w-3 h-3" /> {customer.email}
                      </a>
                    )}
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-500">
                        <Phone className="w-3 h-3" /> {customer.phone}
                      </a>
                    )}
                    {customer.address && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="w-3 h-3" /> {customer.address}
                      </span>
                    )}
                  </div>
                  {customer.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">{customer.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 shrink-0">
                  <Link
                    href={`/bills?customer=${customer.id}`}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded-lg transition-all"
                    title="View bills"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => { setEditCustomer(customer); setShowForm(true) }}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(customer.id)}
                    className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <CustomerForm
          customer={editCustomer}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditCustomer(null) }}
        />
      )}
    </div>
  )
}
