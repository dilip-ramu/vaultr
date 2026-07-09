'use client'

import { useState } from 'react'
import { Save, Loader2, Upload, Trash2, Building2, Check } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { useFileDrop } from '@/components/shared/useFileDrop'
import type { Company } from './CompanyForm'
import {
  INVOICE_TEMPLATES, ACCENT_PRESETS,
  DEFAULT_INVOICE_TEMPLATE, DEFAULT_INVOICE_ACCENT,
  type InvoiceTemplate,
} from '@/lib/companies/templates'
import InvoiceDocument, { type InvoiceDocSettings } from '@/components/recoverables/invoices/InvoiceDocument'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'

interface Props {
  initialCompanies: Company[]
  logoUrls: Record<string, string>
}

const inputCls = 'w-full px-3 py-2 rounded-lg text-sm border outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' } as const

// ── Sample data so the preview always renders, using the edited branding ────
function sampleInvoice(): RecoverableInvoice {
  return {
    invoice_number: 'INV-000123',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
    payment_terms: 'net_15',
    subtotal: 12300, cgst_amount: 1107, sgst_amount: 1107,
    total: 14514, balance_due: 14514, currency: 'INR',
    customer_name: 'Globex Pvt Ltd',
    customer_address: '4 Ring Road, Bengaluru 560001',
    customer_gstin: '29BBBBB1111B1Z2',
    customer_state: 'Karnataka',
  } as unknown as RecoverableInvoice
}
function sampleLines(): RecoverableInvoiceLine[] {
  const mk = (i: number, awb: string, date: string, qty: number, rate: number, amount: number, tax: number) => ({
    id: `s${i}`, line_number: i, awb, shipment_date: date, client_name: null,
    hsn_sac: '996812', qty, rate, amount,
    cgst_rate: 9, cgst_amount: tax, sgst_rate: 9, sgst_amount: tax,
  })
  return [
    mk(1, '77120045', '2026-06-15', 5, 1200, 6000, 540),
    mk(2, '77130092', '2026-06-18', 3, 1500, 4500, 405),
    mk(3, '77190210', '2026-06-21', 2, 900, 1800, 162),
  ] as unknown as RecoverableInvoiceLine[]
}

export default function TemplatesClient({ initialCompanies, logoUrls }: Props) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies)
  const [selectedId, setSelectedId] = useState<string>(initialCompanies[0]?.id ?? '')
  const [logos, setLogos] = useState<Record<string, string>>(logoUrls)

  const selected = companies.find(c => c.id === selectedId) ?? null

  function onSaved(updated: Company) {
    setCompanies(prev => prev.map(c => (c.id === updated.id ? { ...c, ...updated } : c)))
  }
  function onLogo(id: string, url: string | null) {
    setLogos(prev => {
      const next = { ...prev }
      if (url) next[id] = url; else delete next[id]
      return next
    })
  }

  if (!selected) {
    return (
      <div className="card text-center py-10">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Add a company first, then choose its invoice template here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {companies.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {companies.map(c => {
            const active = c.id === selectedId
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                style={{
                  background: active ? 'var(--surface-2)' : 'transparent',
                  borderColor: active ? (c.invoice_accent || 'var(--brand)') : 'var(--border)',
                  color: 'var(--text)',
                }}
              >
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      <Editor
        key={selected.id}
        company={selected}
        logoUrl={logos[selected.id] ?? null}
        onSaved={onSaved}
        onLogo={onLogo}
      />
    </div>
  )
}

// ── Per-company editor + live preview ───────────────────────────────────────

function Editor({
  company, logoUrl, onSaved, onLogo,
}: {
  company: Company
  logoUrl: string | null
  onSaved: (c: Company) => void
  onLogo: (id: string, url: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const logoDrop = useFileDrop(f => { if (f[0]) void handleLogoUpload(f[0]) }, { disabled: logoBusy })
  const [logo, setLogo] = useState<string | null>(logoUrl)

  const [template, setTemplate] = useState<InvoiceTemplate>(company.invoice_template ?? DEFAULT_INVOICE_TEMPLATE)
  const [accent, setAccent]     = useState<string>(company.invoice_accent ?? DEFAULT_INVOICE_ACCENT)

  const [name,    setName]    = useState(company.name ?? '')
  const [address, setAddress] = useState(company.address ?? '')
  const [gstin,   setGstin]   = useState(company.gstin ?? '')
  const [phone,   setPhone]   = useState(company.phone ?? '')
  const [email,   setEmail]   = useState(company.email ?? '')
  const [hsnSac,  setHsnSac]  = useState(company.hsn_sac ?? '996812')
  const [bankAcctName, setBankAcctName] = useState(company.bank_account_name ?? '')
  const [bankAcctNum,  setBankAcctNum]  = useState(company.bank_account_number ?? '')
  const [bankIfsc,     setBankIfsc]     = useState(company.bank_ifsc ?? '')
  const [bankName,     setBankName]     = useState(company.bank_name ?? '')
  const [swiftCode,    setSwiftCode]    = useState(company.swift_code ?? '')
  const [terms,        setTerms]        = useState(company.terms_conditions ?? '')

  const settings: InvoiceDocSettings = {
    company_name: name || null,
    company_address: address || null,
    company_gstin: gstin || null,
    company_phone: phone || null,
    company_email: email || null,
    bank_account_name: bankAcctName || null,
    bank_account_number: bankAcctNum || null,
    bank_ifsc: bankIfsc || null,
    bank_name: bankName || null,
    swift_code: swiftCode || null,
    terms_conditions: terms || null,
    hsn_sac: hsnSac || null,
  }

  async function handleSave() {
    if (!name.trim()) { notify('Company name is required', 'error'); return }
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        gstin: gstin.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        hsn_sac: hsnSac.trim() || '996812',
        bank_account_name: bankAcctName.trim() || null,
        bank_account_number: bankAcctNum.trim() || null,
        bank_ifsc: bankIfsc.trim() || null,
        bank_name: bankName.trim() || null,
        swift_code: swiftCode.trim().toUpperCase() || null,
        terms_conditions: terms.trim() || null,
        invoice_template: template,
        invoice_accent: accent,
      }
      const res = await fetch(`/api/companies/${company.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Save failed', 'error'); return }
      onSaved(data.company as Company)
      notify('Template saved', 'success')
    } finally { setBusy(false) }
  }

  async function handleLogoUpload(file: File) {
    setLogoBusy(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`/api/companies/${company.id}/logo`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Logo upload failed', 'error'); return }
      setLogo(data.publicUrl); onLogo(company.id, data.publicUrl)
      notify('Logo updated', 'success')
    } finally { setLogoBusy(false) }
  }
  async function handleLogoRemove() {
    if (!logo) return
    setLogoBusy(true)
    try {
      const res = await fetch(`/api/companies/${company.id}/logo`, { method: 'DELETE' })
      if (!res.ok) { notify('Could not remove logo', 'error'); return }
      setLogo(null); onLogo(company.id, null)
    } finally { setLogoBusy(false) }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* ── Editor ── */}
      <div className="space-y-5">
        {/* Template */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Layout</p>
          <div className="grid grid-cols-3 gap-2">
            {INVOICE_TEMPLATES.map(t => {
              const active = template === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className="text-left rounded-xl border p-2.5"
                  style={{
                    borderColor: active ? accent : 'var(--border)',
                    background: active ? 'var(--surface-2)' : 'var(--surface)',
                    boxShadow: active ? `inset 0 0 0 1px ${accent}` : 'none',
                  }}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{t.label}</span>
                    {active && <Check className="w-3 h-3" style={{ color: accent }} />}
                  </div>
                  <p className="text-[10px] leading-tight mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.blurb}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Accent */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Accent colour</p>
          <div className="flex items-center gap-2 flex-wrap">
            {ACCENT_PRESETS.map(a => {
              const active = accent.toLowerCase() === a.value.toLowerCase()
              return (
                <button
                  key={a.value}
                  title={a.name}
                  onClick={() => setAccent(a.value)}
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: a.value, outline: active ? '2px solid var(--text)' : 'none', outlineOffset: '2px' }}
                >
                  {active && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              )
            })}
            <label className="inline-flex items-center gap-1.5 ml-1 cursor-pointer" title="Custom colour">
              <input type="color" value={accent} onChange={e => setAccent(e.target.value)} className="w-7 h-7 rounded-full border-0 bg-transparent cursor-pointer p-0" />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Custom</span>
            </label>
          </div>
        </div>

        {/* Logo */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Logo</p>
          <div className="flex items-center gap-3">
            <div {...logoDrop.dropProps} className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center shrink-0 transition-all" style={{ background: logoDrop.dragOver ? 'var(--brand-light)' : 'var(--surface-2)', border: logoDrop.dragOver ? '1px dashed var(--brand)' : '1px solid var(--border)' }}>
              {logo && !logoDrop.dragOver ? <img src={logo} alt="Logo" className="w-full h-full object-contain" /> : <Building2 className="w-6 h-6" style={{ color: logoDrop.dragOver ? 'var(--brand)' : 'var(--text-muted)' }} />}
            </div>
            <div className="space-y-1.5">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                {logoBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {logoBusy ? 'Uploading…' : (logo ? 'Replace' : 'Attach logo')}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f) }} />
              </label>
              {logo && (
                <button onClick={handleLogoRemove} disabled={logoBusy} className="inline-flex items-center gap-1 text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Details on the invoice</p>
          <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Company name" />
          <textarea className={inputCls} style={inputStyle} rows={2} value={address} onChange={e => setAddress(e.target.value)} placeholder="Address" />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} style={inputStyle} value={gstin} onChange={e => setGstin(e.target.value)} placeholder="GSTIN" />
            <input className={inputCls} style={inputStyle} value={hsnSac} onChange={e => setHsnSac(e.target.value)} placeholder="Default HSN/SAC" />
            <input className={inputCls} style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" />
            <input className={inputCls} style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
          </div>
        </div>

        {/* Bank */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Bank details</p>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} style={inputStyle} value={bankAcctName} onChange={e => setBankAcctName(e.target.value)} placeholder="Account name" />
            <input className={inputCls} style={inputStyle} value={bankAcctNum} onChange={e => setBankAcctNum(e.target.value)} placeholder="Account number" />
            <input className={inputCls} style={inputStyle} value={bankIfsc} onChange={e => setBankIfsc(e.target.value)} placeholder="IFSC" />
            <input className={inputCls} style={inputStyle} value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Bank name & branch" />
            <input className={`${inputCls} col-span-2`} style={inputStyle} value={swiftCode} onChange={e => setSwiftCode(e.target.value)} placeholder="SWIFT / BIC" />
          </div>
        </div>

        {/* Terms */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Terms &amp; conditions</p>
          <textarea className={inputCls} style={inputStyle} rows={3} value={terms} onChange={e => setTerms(e.target.value)} placeholder="Payment terms, notes…" />
        </div>

        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ background: accent }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {busy ? 'Saving…' : 'Save template'}
        </button>
      </div>

      {/* ── Live preview ── */}
      <div className="lg:sticky lg:top-4 self-start">
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Live preview</p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#e5e7eb', padding: '10px' }}>
          <InvoiceDocument
            invoice={sampleInvoice()}
            lines={sampleLines()}
            settings={settings}
            logoUrl={logo}
            template={template}
            accent={accent}
            preview
          />
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
          Sample data shown. Real invoices use this company's live details.
        </p>
      </div>
    </div>
  )
}
