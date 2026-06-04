'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Customer } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  customer: Customer | null
  onSaved: (customer: Customer) => void
  onClose: () => void
}

export default function CustomerForm({ customer, onSaved, onClose }: Props) {
  const isEdit = !!customer
  const [name, setName] = useState(customer?.name ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [address, setAddress] = useState(customer?.address ?? '')
  const [gst, setGst] = useState(customer?.gst_number ?? '')
  const [city, setCity] = useState(customer?.city ?? '')
  const [state, setState] = useState(customer?.state ?? '')
  const [stateCode, setStateCode] = useState(customer?.state_code ?? '')
  const [pincode, setPincode] = useState(customer?.pincode ?? '')
  const [country, setCountry] = useState(customer?.country ?? 'India')
  const [csvAlias, setCsvAlias] = useState(customer?.csv_alias ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [paysCommission, setPaysCommission] = useState(customer?.pays_commission ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      name:       name.trim(),
      email:      email.trim() || null,
      phone:      phone.trim() || null,
      address:    address.trim() || null,
      gst_number: gst.trim() || null,
      city:       city.trim() || null,
      state:      state.trim() || null,
      state_code: stateCode.trim() || null,
      pincode:    pincode.trim() || null,
      country:    country.trim() || null,
      csv_alias:       csvAlias.trim() || null,
      notes:           notes.trim() || null,
      pays_commission: paysCommission,
    }

    let data, err
    if (isEdit) {
      const res = await supabase.from('customers').update(payload).eq('id', customer.id).select().single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('customers').insert({ ...payload, user_id: user!.id }).select().single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer / Company Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="e.g. Acme Corp" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="billing@company.com" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">GST Number</label>
            <input type="text" value={gst} onChange={e => setGst(e.target.value)}
              placeholder="22AAAAA0000A1Z5" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Street / Building / Area…" rows={2}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                placeholder="e.g. Mumbai" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Pincode</label>
              <input type="text" value={pincode} onChange={e => setPincode(e.target.value)}
                placeholder="400001" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">State</label>
              <input type="text" value={state} onChange={e => setState(e.target.value)}
                placeholder="e.g. Maharashtra" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">State Code</label>
              <input type="text" value={stateCode} onChange={e => setStateCode(e.target.value)}
                placeholder="e.g. 27" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Country</label>
            <input type="text" value={country} onChange={e => setCountry(e.target.value)}
              placeholder="India" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">CSV Alias</label>
            <input type="text" value={csvAlias} onChange={e => setCsvAlias(e.target.value)}
              placeholder="e.g. SURIYAA KNITWEAR" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono" />
            <p className="text-xs text-gray-400 mt-1">
              Exact column header used in courier CSV files. Used to auto-match imports.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes…" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
          </div>

          {/* Commission flag — private, not visible to customer */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-700">Pays commission</p>
              <p className="text-xs text-gray-400 mt-0.5">Private — only visible to you</p>
            </div>
            <button
              type="button"
              onClick={() => setPaysCommission(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${paysCommission ? 'bg-brand-500' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${paysCommission ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>

          <button type="submit" disabled={saving}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
          </button>
        </form>
      </div>
    </div>
  )
}
