'use client'

import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import type { Customer, FixedExpenseTemplate } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  customer: Customer | null
  /** Whether this customer is already marked reimbursable (i.e. a payee links
   *  to them). The toggle in the form preselects to this value. */
  initialReimbursable?: boolean
  onSaved: (customer: Customer, isReimbursable: boolean) => void
  onClose: () => void
}

export default function CustomerForm({ customer, initialReimbursable = false, onSaved, onClose }: Props) {
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
  const [isReimbursable, setIsReimbursable] = useState(initialReimbursable)
  // Default to INR — most customers are Indian. Pre-Batch-E this defaulted to
  // EUR because Contrast was the archetypal customer, but that's no longer
  // representative and users had to remember to switch it every time.
  const [billingCurrency, setBillingCurrency] = useState(customer?.billing_currency ?? 'INR')
  // v63 — editable per-customer fixed monthly expenses (Office Rent, etc).
  // Rows are stored in the customer's billing currency, editable inline.
  // Empty rows are dropped on save so we never persist half-typed lines.
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseTemplate[]>(
    customer?.fixed_expenses ?? []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Drop empty fixed-expense rows (either field missing) so we never
    // persist a half-typed placeholder. Currency is preserved if set; empty
    // currency omitted so it falls back to the customer's billing_currency.
    const cleanedFixed: FixedExpenseTemplate[] = fixedExpenses
      .map(f => ({
        description: f.description.trim(),
        amount:      Number(f.amount) || 0,
        currency:    f.currency?.trim().toUpperCase() || undefined,
      }))
      .filter(f => f.description.length > 0 && f.amount !== 0)

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
      csv_alias:        csvAlias.trim() || null,
      notes:            notes.trim() || null,
      pays_commission:  paysCommission,
      billing_currency: billingCurrency.trim().toUpperCase() || 'INR',
      fixed_expenses:   cleanedFixed.length > 0 ? cleanedFixed : null,
    }

    let data, err
    if (isEdit) {
      const res = await supabase.from('customers').update(payload).eq('id', customer.id).eq('user_id', user!.id).select().single()
      data = res.data; err = res.error
    } else {
      const res = await supabase.from('customers').insert({ ...payload, user_id: user!.id }).select().single()
      data = res.data; err = res.error
    }

    if (err) { setError(err.message); setSaving(false); return }

    // Reconcile the reimbursable flag AFTER the customer row exists — a POST
    // to /api/reimbursables/customers ensures a payee is linked; a DELETE
    // clears the payee.customer_id (row itself stays so history resolves).
    // Failures here don't block the save — the customer is already stored;
    // we just notify and let the user retry from the Reimbursables page.
    if (isReimbursable !== initialReimbursable) {
      try {
        if (isReimbursable) {
          await fetch('/api/reimbursables/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: data.id }),
          })
        } else {
          await fetch(`/api/reimbursables/customers?customer_id=${data.id}`, {
            method: 'DELETE',
          })
        }
      } catch {
        // Non-fatal: surface but don't block.
        setError('Customer saved, but couldn’t update reimbursable status. Try the Reimbursables page.')
      }
    }

    onSaved(data, isReimbursable)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--surface)] w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-6 shadow-xl slide-up max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold ">{isEdit ? 'Edit Customer' : 'New Customer'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center   rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="  text-sm rounded-xl px-4 py-3">{error}</div>}

          <div>
            <label className="block text-sm font-medium  mb-1.5">Customer / Company Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="e.g. Acme Corp" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium  mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="billing@company.com" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium  mb-1.5">Phone</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium  mb-1.5">GST Number</label>
            <input type="text" value={gst} onChange={e => setGst(e.target.value)}
              placeholder="22AAAAA0000A1Z5" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm font-mono" />
          </div>

          <div>
            <label className="block text-sm font-medium  mb-1.5">Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Street / Building / Area…" rows={2}
              className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium  mb-1.5">City</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                placeholder="e.g. Mumbai" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium  mb-1.5">Pincode</label>
              <input type="text" value={pincode} onChange={e => setPincode(e.target.value)}
                placeholder="400001" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium  mb-1.5">State</label>
              <input type="text" value={state} onChange={e => setState(e.target.value)}
                placeholder="e.g. Maharashtra" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium  mb-1.5">State Code</label>
              <input type="text" value={stateCode} onChange={e => setStateCode(e.target.value)}
                placeholder="e.g. 27" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium  mb-1.5">Country</label>
              <input type="text" value={country} onChange={e => setCountry(e.target.value)}
                placeholder="India" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium  mb-1.5">Billing currency</label>
              <select
                value={billingCurrency}
                onChange={e => setBillingCurrency(e.target.value)}
                className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm"
              >
                {['INR','EUR','USD','GBP','AED','SGD','AUD','CAD','JPY','CHF'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <p className="text-xs  mt-1">Used when billing this customer for reimbursable expenses.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium  mb-1.5">CSV Alias</label>
            <input type="text" value={csvAlias} onChange={e => setCsvAlias(e.target.value)}
              placeholder="e.g. SURIYAA KNITWEAR" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm font-mono" />
            <p className="text-xs  mt-1">
              Exact column header used in courier CSV files. Used to auto-match imports.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium  mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Internal notes…" className="w-full px-4 py-3  border border-[var(--border)] rounded-xl text-sm" />
          </div>

          {/* Commission flag — private, not visible to customer */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl  border border-[var(--border)]">
            <div>
              <p className="text-sm font-medium ">Pays commission</p>
              <p className="text-xs  mt-0.5">Private — only visible to you</p>
            </div>
            <button
              type="button"
              onClick={() => setPaysCommission(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${paysCommission ? 'bg-brand-500' : ''}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-[var(--surface)] shadow transition-all ${paysCommission ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Reimbursable flag — links a payee so a tab auto-opens under
              Reimbursables and any payee-tagged expense counts toward them. */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl  border border-[var(--border)]">
            <div>
              <p className="text-sm font-medium ">Reimbursable</p>
              <p className="text-xs  mt-0.5">
                {isReimbursable
                  ? 'A tab for this customer shows under Reimbursables.'
                  : 'Turn on to bill this customer for pass-through expenses.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsReimbursable(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${isReimbursable ? 'bg-brand-500' : ''}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-[var(--surface)] shadow transition-all ${isReimbursable ? 'right-0.5' : 'left-0.5'}`} />
            </button>
          </div>

          {/* Per-customer fixed monthly expenses. Only relevant when the
              customer is reimbursable — pre-populates the invoice builder so
              you don't retype rent/internet/etc every month. Amounts are
              stored and displayed in the customer's billing currency. */}
          {isReimbursable && (
            <div className="px-4 py-3 rounded-xl  border border-[var(--border)] space-y-3">
              <div>
                <p className="text-sm font-medium ">Fixed monthly expenses</p>
                <p className="text-xs  mt-0.5">
                  Templates seeded into every reimbursement invoice for this customer. Each row can override the customer&apos;s billing currency (default: {billingCurrency}). Editable per-invoice.
                </p>
              </div>
              <div className="space-y-2">
                {fixedExpenses.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={f.description}
                      onChange={e => setFixedExpenses(prev => prev.map((row, i) => i === idx ? { ...row, description: e.target.value } : row))}
                      placeholder="e.g. Office Rent"
                      className="flex-1 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      value={f.amount === 0 ? '' : f.amount}
                      onChange={e => setFixedExpenses(prev => prev.map((row, i) => i === idx ? { ...row, amount: parseFloat(e.target.value) || 0 } : row))}
                      placeholder="0.00"
                      className="w-24 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm text-right tabular-nums"
                    />
                    <select
                      value={f.currency ?? ''}
                      onChange={e => setFixedExpenses(prev => prev.map((row, i) => i === idx ? { ...row, currency: e.target.value || undefined } : row))}
                      className="w-24 px-2 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg text-sm"
                      title="Per-row currency. Blank = customer's billing currency."
                    >
                      <option value="">{billingCurrency}</option>
                      {['INR','EUR','USD','GBP','AED','SGD','AUD','CAD','JPY','CHF'].filter(c => c !== billingCurrency).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setFixedExpenses(prev => prev.filter((_, i) => i !== idx))}
                      className="w-9 h-9 flex items-center justify-center   rounded-lg"
                      title="Remove row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFixedExpenses(prev => [...prev, { description: '', amount: 0 }])}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium bg-[var(--surface)] border border-dashed border-[var(--border)]  "
                >
                  <Plus className="w-3.5 h-3.5" /> Add expense row
                </button>
              </div>
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-60">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
          </button>
        </form>
      </div>
    </div>
  )
}
