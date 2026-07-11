'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import LayoutEditor from './LayoutEditor'
import { defaultLayout, type DocLayout } from '@/lib/documents/layout'
import { sampleContext } from '@/lib/documents/layoutContext'

const TITLES: Record<string, string> = {
  tax_invoice: 'TAX INVOICE', quotation: 'QUOTATION', proforma_gst: 'PROFORMA INVOICE', sales_order: 'SALES ORDER',
  delivery_challan: 'DELIVERY CHALLAN', credit_note: 'CREDIT NOTE', purchase_order: 'PURCHASE ORDER', debit_note: 'DEBIT NOTE', salary_slip: 'SALARY SLIP',
}

interface CompanyOpt { id: string; name: string; accent: string }

export default function TemplateDesigner({ format, companies }: { format: string; companies: CompanyOpt[] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [layout, setLayout] = useState<DocLayout | null>(null)
  const company = companies.find(c => c.id === companyId)
  const accent = company?.accent || '#1F5C3A'
  const ctx = sampleContext(format, accent)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setLayout(null)
    fetch(`/api/document-layouts?company=${companyId}&format=${format}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setLayout((d.schema as DocLayout | null) ?? defaultLayout(format, TITLES[format] ?? 'DOCUMENT')) })
      .catch(() => { if (!cancelled) setLayout(defaultLayout(format, TITLES[format] ?? 'DOCUMENT')) })
    return () => { cancelled = true }
  }, [companyId, format])

  if (companies.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add a company first — templates are designed per company.</p>
  }

  return (
    <div className="space-y-4">
      <label className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
        Company
        <select value={companyId} onChange={e => setCompanyId(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      {layout && companyId
        ? <LayoutEditor key={companyId + format} format={format} companyId={companyId} initial={layout} ctx={ctx} />
        : <div className="flex items-center gap-2 text-sm py-10" style={{ color: 'var(--text-muted)' }}><Loader2 className="w-4 h-4 animate-spin" /> Loading template…</div>}
    </div>
  )
}
