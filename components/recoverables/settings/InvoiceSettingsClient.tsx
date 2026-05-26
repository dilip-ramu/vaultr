'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useToast } from '@/components/shared/Toast'

interface Settings {
  invoice_prefix: string
  next_invoice_number: number
  cgst_rate: number
  sgst_rate: number
  hsn_sac: string
  payment_terms: string
  company_name: string | null
  company_address: string | null
  company_gstin: string | null
  company_phone: string | null
  company_email: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  bank_name: string | null
  terms_conditions: string | null
}

interface Props {
  settings: Settings | null
}

const PAYMENT_TERMS = [
  { value: 'due_on_receipt', label: 'Due on Receipt' },
  { value: 'net_7',          label: 'Net 7' },
  { value: 'net_15',         label: 'Net 15' },
  { value: 'net_30',         label: 'Net 30' },
  { value: 'net_60',         label: 'Net 60' },
  { value: 'net_90',         label: 'Net 90' },
]

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-sm font-semibold uppercase tracking-wide pt-2 pb-1"
      style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
    >
      {children}
    </h2>
  )
}

function Field({
  label, children, hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none transition-colors'
const inputStyle = {
  background: 'var(--surface-2)',
  borderColor: 'var(--border)',
  color: 'var(--text)',
}

export default function InvoiceSettingsClient({ settings }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const [saving, setSaving] = useState(false)

  const s = settings

  const [prefix,         setPrefix]         = useState(s?.invoice_prefix       ?? 'INV-')
  const [cgstRate,       setCgstRate]       = useState(String(s?.cgst_rate       ?? 9))
  const [sgstRate,       setSgstRate]       = useState(String(s?.sgst_rate       ?? 9))
  const [hsnSac,         setHsnSac]         = useState(s?.hsn_sac               ?? '996812')
  const [paymentTerms,   setPaymentTerms]   = useState(s?.payment_terms         ?? 'due_on_receipt')
  const [companyName,    setCompanyName]    = useState(s?.company_name          ?? '')
  const [companyAddress, setCompanyAddress] = useState(s?.company_address       ?? '')
  const [companyGstin,   setCompanyGstin]   = useState(s?.company_gstin         ?? '')
  const [companyPhone,   setCompanyPhone]   = useState(s?.company_phone         ?? '')
  const [companyEmail,   setCompanyEmail]   = useState(s?.company_email         ?? '')
  const [bankAcctName,   setBankAcctName]   = useState(s?.bank_account_name     ?? '')
  const [bankAcctNum,    setBankAcctNum]    = useState(s?.bank_account_number   ?? '')
  const [bankIfsc,       setBankIfsc]       = useState(s?.bank_ifsc             ?? '')
  const [bankName,       setBankName]       = useState(s?.bank_name             ?? '')
  const [terms,          setTerms]          = useState(s?.terms_conditions      ?? '')

  const nextNum    = s?.next_invoice_number ?? 1
  const previewNum = prefix + String(nextNum).padStart(6, '0')

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/recoverables/invoice-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_prefix:      prefix.trim() || 'INV-',
          cgst_rate:           parseFloat(cgstRate) || 9,
          sgst_rate:           parseFloat(sgstRate) || 9,
          hsn_sac:             hsnSac.trim() || '996812',
          payment_terms:       paymentTerms,
          company_name:        companyName.trim()    || null,
          company_address:     companyAddress.trim() || null,
          company_gstin:       companyGstin.trim()   || null,
          company_phone:       companyPhone.trim()   || null,
          company_email:       companyEmail.trim()   || null,
          bank_account_name:   bankAcctName.trim()   || null,
          bank_account_number: bankAcctNum.trim()    || null,
          bank_ifsc:           bankIfsc.trim()       || null,
          bank_name:           bankName.trim()       || null,
          terms_conditions:    terms.trim()          || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json() as { error?: string }
        throw new Error(j.error ?? 'Save failed')
      }
      showToast('Settings saved', 'success')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Invoice Settings</h1>
      </div>

      <div className="card space-y-5">

        {/* ── 1. Company Details ───────────────────────────── */}
        <SectionHeading>Company Details</SectionHeading>

        <Field label="Company Name">
          <input
            className={inputCls}
            style={inputStyle}
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Your company name"
          />
        </Field>

        <Field label="Address">
          <textarea
            className={inputCls}
            style={inputStyle}
            rows={3}
            value={companyAddress}
            onChange={e => setCompanyAddress(e.target.value)}
            placeholder="Full address"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="GSTIN">
            <input
              className={inputCls}
              style={inputStyle}
              value={companyGstin}
              onChange={e => setCompanyGstin(e.target.value)}
              placeholder="22AAAAA0000A1Z5"
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputCls}
              style={inputStyle}
              value={companyPhone}
              onChange={e => setCompanyPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </Field>
        </div>

        <Field label="Email">
          <input
            type="email"
            className={inputCls}
            style={inputStyle}
            value={companyEmail}
            onChange={e => setCompanyEmail(e.target.value)}
            placeholder="billing@yourcompany.com"
          />
        </Field>

        {/* ── 2. Invoice Defaults ──────────────────────────── */}
        <SectionHeading>Invoice Defaults</SectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Invoice Prefix"
            hint={`Next invoice: ${previewNum}`}
          >
            <input
              className={inputCls}
              style={inputStyle}
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              placeholder="INV-"
            />
          </Field>
          <Field label="Next Invoice Number">
            <input
              className={inputCls}
              style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }}
              value={nextNum}
              readOnly
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field label="CGST Rate (%)">
            <input
              type="number"
              min="0"
              max="28"
              step="0.5"
              className={inputCls}
              style={inputStyle}
              value={cgstRate}
              onChange={e => setCgstRate(e.target.value)}
            />
          </Field>
          <Field label="SGST Rate (%)">
            <input
              type="number"
              min="0"
              max="28"
              step="0.5"
              className={inputCls}
              style={inputStyle}
              value={sgstRate}
              onChange={e => setSgstRate(e.target.value)}
            />
          </Field>
          <Field label="HSN/SAC Code">
            <input
              className={inputCls}
              style={inputStyle}
              value={hsnSac}
              onChange={e => setHsnSac(e.target.value)}
              placeholder="996812"
            />
          </Field>
        </div>

        <Field label="Default Payment Terms">
          <select
            className={inputCls}
            style={inputStyle}
            value={paymentTerms}
            onChange={e => setPaymentTerms(e.target.value)}
          >
            {PAYMENT_TERMS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>

        {/* ── 3. Bank Details ──────────────────────────────── */}
        <SectionHeading>Bank Details</SectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Account Name">
            <input
              className={inputCls}
              style={inputStyle}
              value={bankAcctName}
              onChange={e => setBankAcctName(e.target.value)}
              placeholder="Name on account"
            />
          </Field>
          <Field label="Account Number">
            <input
              className={inputCls}
              style={inputStyle}
              value={bankAcctNum}
              onChange={e => setBankAcctNum(e.target.value)}
              placeholder="0000000000"
            />
          </Field>
          <Field label="IFSC Code">
            <input
              className={inputCls}
              style={inputStyle}
              value={bankIfsc}
              onChange={e => setBankIfsc(e.target.value)}
              placeholder="SBIN0001234"
            />
          </Field>
          <Field label="Bank Name & Branch">
            <input
              className={inputCls}
              style={inputStyle}
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              placeholder="SBI, Chennai Main Branch"
            />
          </Field>
        </div>

        {/* ── 4. Terms & Conditions ────────────────────────── */}
        <SectionHeading>Terms &amp; Conditions</SectionHeading>

        <Field label="Terms & Conditions" hint="Printed at the bottom of every invoice.">
          <textarea
            className={inputCls}
            style={inputStyle}
            rows={4}
            value={terms}
            onChange={e => setTerms(e.target.value)}
            placeholder="e.g. Payment due within the specified terms. Goods once sold cannot be returned."
          />
        </Field>

        {/* Save */}
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
            style={{ background: 'var(--brand)', color: '#fff' }}
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}
