'use client'

import { useState, useEffect } from 'react'
import CurrencySelect from '@/components/shared/CurrencySelect'
import { X } from 'lucide-react'
import type { Supplier, PaymentTerms } from '@/lib/suppliers/types'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/suppliers/types'
import ColorPicker from '@/components/shared/ColorPicker'

interface Category { id: string; name: string; color: string }

interface Props {
  supplier: Supplier | null
  onSaved: (s: Supplier) => void
  onClose: () => void
}

const EMPTY: Omit<Supplier, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  supplier_code: '',
  name: '',
  contact_person: '',
  mobile: '',
  email: '',
  address: '',
  gst_number: '',
  pan_number: '',
  bank_name: '',
  account_number: '',
  ifsc_swift: '',
  payment_terms: '30',
  custom_terms_days: null,
  currency: 'INR',
  notes: '',
  is_active: true,
  default_category_id: null,
  color: null,
}


export default function SupplierForm({ supplier, onSaved, onClose }: Props) {
  const [form, setForm] = useState(supplier
    ? { ...EMPTY, ...supplier }
    : { ...EMPTY }
  )
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    fetch('/api/categories?type=expense')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then((d: { categories?: Category[] }) => setCategories(d.categories ?? []))
      .catch(() => {})
  }, [])

  const set = (k: keyof typeof EMPTY, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Supplier name is required'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        supplier_code: form.supplier_code || null,
        contact_person: form.contact_person || null,
        mobile: form.mobile || null,
        email: form.email || null,
        address: form.address || null,
        gst_number: form.gst_number || null,
        pan_number: form.pan_number || null,
        bank_name: form.bank_name || null,
        account_number: form.account_number || null,
        ifsc_swift: form.ifsc_swift || null,
        notes: form.notes || null,
        custom_terms_days: form.payment_terms === 'custom' ? Number(form.custom_terms_days) : null,
      }
      const url = supplier ? `/api/suppliers/${supplier.id}` : '/api/suppliers'
      const method = supplier ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      onSaved(data.supplier)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
        style={{ backgroundColor: 'var(--surface)', maxHeight: '92dvh' }}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {supplier ? 'Edit Supplier' : 'New Supplier'}
          </h2>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl" style={{ color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">

        <form id="supplier-form" onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="px-4 py-3 rounded-xl text-sm   border border-[var(--border)]">{error}</div>
          )}

          {/* Basic info */}
          <Section title="Basic Information">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Supplier Name *" className="col-span-2">
                <Input value={form.name} onChange={v => set('name', v)} placeholder="e.g. DHL Express" />
              </Field>
              <Field label="Supplier Code">
                <Input value={form.supplier_code ?? ''} onChange={v => set('supplier_code', v)} placeholder="e.g. DHL-001" />
              </Field>
              <Field label="Contact Person">
                <Input value={form.contact_person ?? ''} onChange={v => set('contact_person', v)} placeholder="Name" />
              </Field>
              <Field label="Mobile">
                <Input value={form.mobile ?? ''} onChange={v => set('mobile', v)} placeholder="+91 98765 43210" />
              </Field>
              <Field label="Email">
                <Input value={form.email ?? ''} onChange={v => set('email', v)} type="email" placeholder="accounts@supplier.com" />
              </Field>
              <Field label="Address" className="col-span-2">
                <textarea
                  value={form.address ?? ''}
                  onChange={e => set('address', e.target.value)}
                  placeholder="Full address"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
                  style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </Field>
            </div>
          </Section>

          {/* Tax info */}
          <Section title="Tax & Registration">
            <div className="grid grid-cols-2 gap-4">
              <Field label="GST Number">
                <Input value={form.gst_number ?? ''} onChange={v => set('gst_number', v)} placeholder="22AAAAA0000A1Z5" />
              </Field>
              <Field label="PAN Number">
                <Input value={form.pan_number ?? ''} onChange={v => set('pan_number', v)} placeholder="AAAAA0000A" />
              </Field>
            </div>
          </Section>

          {/* Payment & Banking */}
          <Section title="Payment & Banking">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Payment Terms">
                <select
                  value={form.payment_terms}
                  onChange={e => set('payment_terms', e.target.value as PaymentTerms)}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  {PAYMENT_TERMS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              {form.payment_terms === 'custom' && (
                <Field label="Custom Days">
                  <Input
                    value={String(form.custom_terms_days ?? '')}
                    onChange={v => set('custom_terms_days', v ? parseInt(v) : null)}
                    type="number"
                    placeholder="e.g. 90"
                  />
                </Field>
              )}
              <Field label="Currency">
                <CurrencySelect
                  value={form.currency ?? 'INR'}
                  onChange={v => set('currency', v)}
                  preferred={['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD']}
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </Field>
              <Field label="Bank Name">
                <Input value={form.bank_name ?? ''} onChange={v => set('bank_name', v)} placeholder="HDFC Bank" />
              </Field>
              <Field label="Account Number">
                <Input value={form.account_number ?? ''} onChange={v => set('account_number', v)} placeholder="Account number" />
              </Field>
              <Field label="IFSC / SWIFT">
                <Input value={form.ifsc_swift ?? ''} onChange={v => set('ifsc_swift', v)} placeholder="HDFC0001234" />
              </Field>
            </div>
          </Section>

          {/* Default category */}
          <Section title="Transaction Defaults">
            <Field label="Default Expense Category">
              <div className="flex items-center gap-2">
                {form.default_category_id && (() => {
                  const cat = categories.find(c => c.id === form.default_category_id)
                  return cat ? <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} /> : null
                })()}
                <select
                  value={form.default_category_id ?? ''}
                  onChange={e => set('default_category_id', e.target.value || null)}
                  className="flex-1 px-3 py-2.5 rounded-xl border text-sm outline-none"
                  style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
                >
                  <option value="">— Not set —</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Auto-applied to transactions when marking invoices as paid
              </p>
            </Field>
          </Section>

          {/* Card colour */}
          <Section title="Directory card">
            <ColorPicker value={form.color} onChange={v => set('color', v)} label="Card colour" />
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>Sets the gradient on this supplier&apos;s directory card. Leave unset for an auto colour.</p>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <textarea
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              placeholder="Any notes about this supplier…"
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          </Section>

        </form>
        </div>{/* end scroll area */}

        {/* Sticky footer */}
        <div className="flex gap-3 px-6 py-4 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Cancel
          </button>
          <button
            type="submit"
            form="supplier-form"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {saving ? 'Saving…' : supplier ? 'Save Changes' : 'Add Supplier'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
      style={{ backgroundColor: 'var(--surface-2, var(--bg))', borderColor: 'var(--border)', color: 'var(--text)' }}
    />
  )
}
