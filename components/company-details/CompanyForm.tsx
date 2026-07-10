'use client'

import { useState } from 'react'
import { X, Upload, Loader2, Trash2, Building2, Check } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { useFileDrop } from '@/components/shared/useFileDrop'
import ColorPicker from '@/components/shared/ColorPicker'
import SignatoriesManager from './SignatoriesManager'
import {
  INVOICE_TEMPLATES, ACCENT_PRESETS,
  DEFAULT_INVOICE_TEMPLATE, DEFAULT_INVOICE_ACCENT,
  type InvoiceTemplate,
} from '@/lib/companies/templates'

export interface Company {
  id: string
  user_id: string
  name: string
  is_default: boolean
  address: string | null
  gstin: string | null
  phone: string | null
  email: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  bank_name: string | null
  // v64 — SWIFT/BIC code for foreign-currency invoices (customers outside India)
  swift_code: string | null
  // v67 — when true, a mirror row in the customers table exists so this
  // company can be selected as a "Bill To" in invoice flows (cross-company
  // billing). Read from customers.mirrored_company_id back-reference by
  // the parent page; not stored on the companies row itself.
  is_available_as_customer?: boolean
  invoice_prefix: string
  next_invoice_number: number
  cgst_rate: number
  sgst_rate: number
  hsn_sac: string
  payment_terms: string
  terms_conditions: string | null
  logo_path: string | null
  // v89 — proprietorship | partnership (drives signatory labels)
  business_type?: 'proprietorship' | 'partnership'
  // v69 — per-company document look (Feature 1)
  invoice_template: InvoiceTemplate
  invoice_accent: string
  // v82 — directory card accent (hex). Null = per-directory default.
  color: string | null
  updated_at?: string
}

const PAYMENT_TERMS = [
  { value: 'due_on_receipt', label: 'Due on Receipt' },
  { value: 'net_7',  label: 'Net 7' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_60', label: 'Net 60' },
  { value: 'net_90', label: 'Net 90' },
]

interface Props {
  company: Company | null
  existingLogoUrl?: string
  onSaved: (c: Company, newLogoUrl?: string) => void
  onClose: () => void
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' } as const

/** Tiny visual preview of a template, tinted with the chosen accent. */
function TemplateThumb({ id, accent }: { id: InvoiceTemplate; accent: string }) {
  const muted = 'var(--border-strong)'
  return (
    <svg viewBox="0 0 80 56" className="w-full h-auto rounded-md" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {id === 'classic' && (
        <>
          <rect x="8" y="8" width="16" height="7" rx="1.5" fill="var(--surface-1)" stroke="var(--border)" />
          <rect x="52" y="9" width="20" height="4" rx="1" fill={accent} />
          <line x1="8" y1="20" x2="72" y2="20" stroke={muted} />
          <rect x="8" y="26" width="64" height="6" fill="var(--border)" opacity="0.5" />
          <line x1="8" y1="37" x2="72" y2="37" stroke={muted} />
          <line x1="8" y1="43" x2="72" y2="43" stroke={muted} />
          <rect x="48" y="47" width="24" height="4" rx="1" fill={accent} opacity="0.8" />
        </>
      )}
      {id === 'modern' && (
        <>
          <rect x="0" y="0" width="80" height="16" fill={accent} />
          <rect x="8" y="6" width="26" height="4" rx="1" fill="#fff" opacity="0.95" />
          <rect x="8" y="24" width="64" height="6" rx="1" fill={accent} opacity="0.9" />
          <line x1="8" y1="37" x2="72" y2="37" stroke={muted} />
          <line x1="8" y1="43" x2="72" y2="43" stroke={muted} />
          <rect x="48" y="47" width="24" height="4" rx="1" fill={accent} />
        </>
      )}
      {id === 'minimal' && (
        <>
          <rect x="8" y="9" width="22" height="4" rx="1" fill={accent} />
          <rect x="8" y="15" width="10" height="2" rx="1" fill={accent} />
          <line x1="8" y1="28" x2="72" y2="28" stroke={accent} strokeWidth="1.2" />
          <line x1="8" y1="38" x2="72" y2="38" stroke={muted} />
          <line x1="8" y1="45" x2="72" y2="45" stroke={muted} />
          <rect x="52" y="49" width="20" height="3" rx="1" fill={accent} />
        </>
      )}
    </svg>
  )
}

export default function CompanyForm({ company, existingLogoUrl, onSaved, onClose }: Props) {
  const isEdit = !!company
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name,    setName]    = useState(company?.name ?? '')
  const [isDefault, setIsDefault] = useState(company?.is_default ?? false)
  const [address, setAddress] = useState(company?.address ?? '')
  const [gstin,   setGstin]   = useState(company?.gstin ?? '')
  const [phone,   setPhone]   = useState(company?.phone ?? '')
  const [email,   setEmail]   = useState(company?.email ?? '')
  const [bankAcctName, setBankAcctName] = useState(company?.bank_account_name ?? '')
  const [bankAcctNum,  setBankAcctNum]  = useState(company?.bank_account_number ?? '')
  const [bankIfsc,     setBankIfsc]     = useState(company?.bank_ifsc ?? '')
  const [bankName,     setBankName]     = useState(company?.bank_name ?? '')
  const [swiftCode,    setSwiftCode]    = useState(company?.swift_code ?? '')
  /** v67 — cross-company billing toggle. Persists a mirror customer row so
   *  this company appears in every "Bill To" picker. Initial value comes
   *  from the parent page (checked against customers.mirrored_company_id). */
  const [availableAsCustomer, setAvailableAsCustomer] = useState<boolean>(company?.is_available_as_customer ?? false)
  const [invoicePrefix, setInvoicePrefix] = useState(company?.invoice_prefix ?? 'INV-')
  const [cgstRate, setCgstRate] = useState(String(company?.cgst_rate ?? 9))
  const [sgstRate, setSgstRate] = useState(String(company?.sgst_rate ?? 9))
  const [hsnSac,   setHsnSac]   = useState(company?.hsn_sac ?? '996812')
  const [paymentTerms, setPaymentTerms] = useState(company?.payment_terms ?? 'due_on_receipt')
  const [terms,        setTerms]        = useState(company?.terms_conditions ?? '')
  const [logoUrl, setLogoUrl] = useState<string | undefined>(existingLogoUrl)
  const [logoBusy, setLogoBusy] = useState(false)
  const logoDrop = useFileDrop(f => { if (f[0]) void handleLogoUpload(f[0]) }, { disabled: logoBusy })
  // v69 — document look
  const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplate>(company?.invoice_template ?? DEFAULT_INVOICE_TEMPLATE)
  const [invoiceAccent,   setInvoiceAccent]   = useState<string>(company?.invoice_accent ?? DEFAULT_INVOICE_ACCENT)
  const [color,           setColor]           = useState<string | null>(company?.color ?? null)
  const [businessType,    setBusinessType]    = useState<'proprietorship' | 'partnership'>(company?.business_type ?? 'proprietorship')

  async function handleSave() {
    if (!name.trim()) { setError('Company name is required'); return }
    setError(null); setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        is_default: isDefault,
        address: address.trim() || null,
        gstin: gstin.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        bank_account_name: bankAcctName.trim() || null,
        bank_account_number: bankAcctNum.trim() || null,
        bank_ifsc: bankIfsc.trim() || null,
        bank_name: bankName.trim() || null,
        swift_code: swiftCode.trim().toUpperCase() || null,
        // v67 — flag flows to the API which syncs the customers mirror.
        is_available_as_customer: availableAsCustomer,
        invoice_prefix: invoicePrefix.trim() || 'INV-',
        cgst_rate: parseFloat(cgstRate) || 9,
        sgst_rate: parseFloat(sgstRate) || 9,
        hsn_sac: hsnSac.trim() || '996812',
        payment_terms: paymentTerms,
        terms_conditions: terms.trim() || null,
        invoice_template: invoiceTemplate,
        invoice_accent: invoiceAccent,
        color: color || null,
        business_type: businessType,
      }
      const url = isEdit ? `/api/companies/${company!.id}` : '/api/companies'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      onSaved(data.company as Company, logoUrl)
    } finally { setBusy(false) }
  }

  async function handleLogoUpload(file: File) {
    if (!company) { notify('Save the company first, then add a logo', 'info'); return }
    setLogoBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/companies/${company.id}/logo`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Logo upload failed', 'error'); return }
      setLogoUrl(data.publicUrl)
      notify('Logo updated', 'success')
    } finally { setLogoBusy(false) }
  }

  async function handleLogoRemove() {
    if (!company || !logoUrl) return
    setLogoBusy(true)
    try {
      const res = await fetch(`/api/companies/${company.id}/logo`, { method: 'DELETE' })
      if (!res.ok) { notify('Could not remove logo', 'error'); return }
      setLogoUrl(undefined)
    } finally { setLogoBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92dvh]" style={{ background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>{isEdit ? `Edit ${company!.name}` : 'New company'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Logo */}
          <div>
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Logo</label>
            <div className="mt-2 flex items-center gap-3">
              <div {...logoDrop.dropProps} className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 transition-all" style={{ background: logoDrop.dragOver ? 'var(--brand-light)' : 'var(--surface-2)', border: logoDrop.dragOver ? '1px dashed var(--brand)' : '1px solid var(--border)' }}>
                {logoUrl && !logoDrop.dragOver
                  ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  : <Building2 className="w-7 h-7" style={{ color: logoDrop.dragOver ? 'var(--brand)' : 'var(--text-muted)' }} />
                }
              </div>
              <div className="space-y-1.5">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                  {logoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {logoBusy ? 'Uploading…' : (logoUrl ? 'Replace logo' : 'Attach logo')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f) }}
                  />
                </label>
                {logoUrl && (
                  <button onClick={handleLogoRemove} disabled={logoBusy} className="inline-flex items-center gap-1 text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                )}
                <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
                  PNG, JPG, WEBP, or SVG. Printed ~5.5&nbsp;cm wide on documents (adjustable per template).
                </p>
                {!isEdit && <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Save the company first, then attach a logo.</p>}
              </div>
            </div>
          </div>

          {/* Directory card colour */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Directory card colour</label>
            <ColorPicker value={color} onChange={setColor} label="" />
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>Colours this company&apos;s card on the Companies page. Separate from the invoice accent.</p>
          </div>

          {/* Name + default */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Company name</label>
            <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Contrast" />
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              Use as default when creating invoices
            </label>
            {/* v67 — cross-company billing toggle */}
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text)' }}>
              <input
                type="checkbox"
                checked={availableAsCustomer}
                onChange={e => setAvailableAsCustomer(e.target.checked)}
              />
              <span>
                Available as a customer
                <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
                  — lets you bill this company from another of your own companies
                </span>
              </span>
            </label>
          </div>

          {/* Company contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>GSTIN</span>
              <input className={inputCls} style={inputStyle} value={gstin} onChange={e => setGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Phone</span>
              <input className={inputCls} style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Email</span>
              <input className={inputCls} style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Address</span>
              <textarea className={inputCls} style={inputStyle} rows={2} value={address} onChange={e => setAddress(e.target.value)} />
            </label>
          </div>

          {/* Bank details */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Bank details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={inputCls} style={inputStyle} value={bankAcctName} onChange={e => setBankAcctName(e.target.value)} placeholder="Account name" />
              <input className={inputCls} style={inputStyle} value={bankAcctNum}  onChange={e => setBankAcctNum(e.target.value)}  placeholder="Account number" />
              <input className={inputCls} style={inputStyle} value={bankIfsc}     onChange={e => setBankIfsc(e.target.value)}     placeholder="IFSC code" />
              <input className={inputCls} style={inputStyle} value={bankName}     onChange={e => setBankName(e.target.value)}     placeholder="Bank name & branch" />
              <input className={inputCls} style={inputStyle} value={swiftCode}    onChange={e => setSwiftCode(e.target.value)}    placeholder="SWIFT / BIC code (foreign transfers)" />
            </div>
          </div>

          {/* Invoice defaults */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Invoice defaults</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Prefix</span>
                <input className={inputCls} style={inputStyle} value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>CGST %</span>
                <input type="number" className={inputCls} style={inputStyle} value={cgstRate} onChange={e => setCgstRate(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>SGST %</span>
                <input type="number" className={inputCls} style={inputStyle} value={sgstRate} onChange={e => setSgstRate(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>HSN/SAC</span>
                <input className={inputCls} style={inputStyle} value={hsnSac} onChange={e => setHsnSac(e.target.value)} />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Default payment terms</span>
              <select className={inputCls} style={inputStyle} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
                {PAYMENT_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Terms &amp; conditions</span>
              <textarea className={inputCls} style={inputStyle} rows={3} value={terms} onChange={e => setTerms(e.target.value)} />
            </label>
          </div>

          {/* Invoice appearance (v69) — layout + accent, per company */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Invoice appearance</p>

            <div className="grid grid-cols-3 gap-2">
              {INVOICE_TEMPLATES.map(t => {
                const active = invoiceTemplate === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setInvoiceTemplate(t.id)}
                    className="text-left rounded-xl border p-2.5 relative"
                    style={{
                      borderColor: active ? invoiceAccent : 'var(--border)',
                      background: active ? 'var(--surface-2)' : 'var(--surface)',
                      boxShadow: active ? `inset 0 0 0 1px ${invoiceAccent}` : 'none',
                    }}
                  >
                    <TemplateThumb id={t.id} accent={invoiceAccent} />
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{t.label}</span>
                      {active && <Check className="w-3 h-3" style={{ color: invoiceAccent }} />}
                    </div>
                    <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.blurb}</p>
                  </button>
                )
              })}
            </div>

            <div className="space-y-1.5">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Accent colour</span>
              <div className="flex items-center gap-2 flex-wrap">
                {ACCENT_PRESETS.map(a => {
                  const active = invoiceAccent.toLowerCase() === a.value.toLowerCase()
                  return (
                    <button
                      key={a.value}
                      type="button"
                      title={a.name}
                      onClick={() => setInvoiceAccent(a.value)}
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: a.value, outline: active ? `2px solid var(--text)` : 'none', outlineOffset: '2px' }}
                    >
                      {active && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  )
                })}
                {(() => {
                  const isPreset = ACCENT_PRESETS.some(a => a.value.toLowerCase() === invoiceAccent.toLowerCase())
                  return (
                    <label className="w-7 h-7 rounded-full relative cursor-pointer flex items-center justify-center overflow-hidden shrink-0" title="Custom colour"
                      style={{ background: isPreset ? 'conic-gradient(from 0deg, #ef4444, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ef4444)' : invoiceAccent, boxShadow: '0 0 0 1px var(--border)' }}>
                      <input type="color" value={invoiceAccent} onChange={e => setInvoiceAccent(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                      {!isPreset && <Check className="w-3.5 h-3.5 text-white" />}
                    </label>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Authorised signatories (v89) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Authorised signatories</p>
            <div className="flex items-center gap-2">
              {(['proprietorship', 'partnership'] as const).map(t => {
                const active = businessType === t
                return (
                  <button key={t} type="button" onClick={() => setBusinessType(t)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize"
                    style={{ borderColor: active ? 'var(--brand)' : 'var(--border)', background: active ? 'var(--brand-light)' : 'var(--surface-2)', color: active ? 'var(--brand)' : 'var(--text-muted)' }}>
                    {t}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
              {businessType === 'partnership'
                ? 'Add each partner and their signature. Choose who signed when you create an invoice or document.'
                : 'Add the proprietor and their signature. It appears on invoices and documents you issue.'}
            </p>
            <SignatoriesManager companyId={company?.id ?? null} businessType={businessType} />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl text-sm" style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)' }}>{error}</div>
          )}
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
          <button onClick={handleSave} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Saving…' : (isEdit ? 'Save changes' : 'Add company')}
          </button>
        </div>
      </div>
    </div>
  )
}
