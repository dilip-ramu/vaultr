'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Copy, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, ArrowLeft, Save } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { ACCENT_PRESETS } from '@/lib/companies/templates'
import {
  INVOICE_PRESETS, BLOCK_LABELS, ADDABLE_BLOCKS, blockId,
  type DocumentSchema, type Block, type ColumnDef, type FieldDef, type PresetId, type BlockType, type DocType,
} from '@/lib/templates/schema'
import DocumentRenderer from './DocumentRenderer'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import type { InvoiceDocSettings } from '@/components/recoverables/invoices/InvoiceDocument'
import type { ReimbursableInvoiceData } from '@/components/reimbursables/ReimbursableInvoicePDF'
import type { SalarySlipDocData } from './SalarySlipRenderer'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

export interface TemplateListItem { id: string; doc_type: string; name: string; updated_at: string }
export interface AssignmentRow { company_id: string | null; doc_type: string; template_id: string }
interface CompanyItem { id: string; name: string; accent: string }

interface Props {
  docType: DocType
  docLabel: string
  initialTemplates: TemplateListItem[]
  companies: CompanyItem[]
  initialAssignments: AssignmentRow[]
}

const inputCls = 'w-full px-2.5 py-1.5 rounded-lg text-sm border outline-none'
const inputStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' } as const

// ── Sample data for the live preview ────────────────────────────────────────
const SAMPLE_SETTINGS: InvoiceDocSettings = {
  company_name: 'Acme Exports', company_address: '12 Harbour Rd, Chennai 600001',
  company_gstin: '33AAAAA0000A1Z5', company_phone: '+91 44 5555 0100', company_email: 'billing@acme.in',
  bank_account_name: 'Acme Exports', bank_account_number: '50100XXXXXX', bank_ifsc: 'HDFC0000123',
  bank_name: 'HDFC Bank, Chennai', swift_code: 'HDFCINBB', terms_conditions: 'Payment due as per agreed terms.', hsn_sac: '996812',
}
function sampleInvoice(): RecoverableInvoice {
  return { invoice_number: 'INV-000123', invoice_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10), payment_terms: 'net_15',
    subtotal: 12300, cgst_amount: 1107, sgst_amount: 1107, total: 14514, balance_due: 14514, currency: 'INR',
    customer_name: 'Globex Pvt Ltd', customer_address: '4 Ring Road, Bengaluru 560001',
    customer_gstin: '29BBBBB1111B1Z2', customer_state: 'Karnataka' } as unknown as RecoverableInvoice
}
function sampleLines(): RecoverableInvoiceLine[] {
  const mk = (i: number, awb: string, d: string, q: number, r: number, a: number, t: number) => ({
    id: `s${i}`, line_number: i, awb, shipment_date: d, client_name: null, hsn_sac: '996812',
    qty: q, rate: r, amount: a, cgst_rate: 9, cgst_amount: t, sgst_rate: 9, sgst_amount: t })
  return [mk(1, '77120045', '2026-06-15', 5, 1200, 6000, 540), mk(2, '77130092', '2026-06-18', 3, 1500, 4500, 405),
    mk(3, '77190210', '2026-06-21', 2, 900, 1800, 162)] as unknown as RecoverableInvoiceLine[]
}
function sampleReimb(): ReimbursableInvoiceData {
  return {
    invoice_number: 'RB-2026-06', invoice_month: '2026-06', invoice_date: '2026-07-02', currency: 'EUR', forex_rate: 92.5,
    bill_from: { name: 'Acme Services', address: '12 Harbour Rd, Chennai', email: 'ops@acme.in', phone: '+91 44 5555 0100',
      bank_account_name: 'Acme Services', bank_account_number: '50100XXXXXX', bank_ifsc: 'HDFC0000123', bank_name: 'HDFC Bank, Chennai', swift_code: 'HDFCINBB' },
    bill_to: { name: 'Globex GmbH', address: 'Berlin, Germany', country: 'Germany' },
    items: [
      { item_type: 'salary', description: 'Asha Rao — Designer', amount_inr: 1200, inr_source: null, sort_order: 1 },
      { item_type: 'salary', description: 'Vik Menon — Developer', amount_inr: 1500, inr_source: null, sort_order: 2 },
      { item_type: 'courier', description: 'DHL — AWB 7712', amount_inr: 60, inr_source: 5550, forex_rate: 92.5, sort_order: 3 },
      { item_type: 'expense', description: 'Cloud hosting', amount_inr: 40, inr_source: 3700, forex_rate: 92.5, sort_order: 4 },
      { item_type: 'deduction', description: 'Advance adjustment', amount_inr: -50, inr_source: null, sort_order: 5 },
    ],
    subtotal: 2750, gst_amount: 495, total: 3245,
  } as ReimbursableInvoiceData
}
function sampleSlip(): SalarySlipDocData {
  return {
    entry: { salary_inr: 80000, allowances: 5000, overtime: 2000, incentives: 3000, deductions: 1500, advance: 5000, final_payable: 83500, salary_amount: 1000, expended_rate: 80 } as unknown as PayrollEntry,
    month: { payroll_month: '2026-06', payment_date: '2026-07-01', expended_rate: 80 } as unknown as PayrollMonth,
    employee: { name: 'Asha Rao', employee_id: 'EMP-014', designation: 'Designer', joining_date: '2024-04-01', pan_number: 'ABCDE1234F', bank_name: 'HDFC Bank', account_number: '50100XXXXXX', ifsc: 'HDFC0000123', branch: 'Chennai', salary_currency: 'EUR' } as unknown as Employee,
    companyName: 'Acme Exports', companyAddress: '12 Harbour Rd, Chennai 600001',
  }
}

export default function TemplateStudioClient({ docType, docLabel, initialTemplates, companies, initialAssignments }: Props) {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateListItem[]>(initialTemplates)
  const [assignments, setAssignments] = useState<AssignmentRow[]>(initialAssignments)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [schema, setSchema] = useState<DocumentSchema | null>(null)
  const [name, setName] = useState('')

  const defaultAccent = companies[0]?.accent ?? '#2A7A50'

  async function createFromPreset(preset: PresetId) {
    setBusy(true)
    try {
      const res = await fetch('/api/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, preset, accent: defaultAccent, name: `${preset[0].toUpperCase()}${preset.slice(1)} template` }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Create failed', 'error'); return }
      setTemplates(t => [data.template, ...t])
      openEditor(data.template.id)
    } finally { setBusy(false) }
  }

  async function duplicate(t: TemplateListItem) {
    setBusy(true)
    try {
      const full = await (await fetch(`/api/templates/${t.id}`)).json()
      const res = await fetch('/api/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_type: docType, name: `${t.name} copy`, schema: full.template.schema }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Duplicate failed', 'error'); return }
      setTemplates(list => [data.template, ...list])
    } finally { setBusy(false) }
  }

  async function remove(t: TemplateListItem) {
    if (!confirm(`Delete "${t.name}"? Any company using it falls back to the built-in layout.`)) return
    const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
    if (!res.ok) { notify('Delete failed', 'error'); return }
    setTemplates(list => list.filter(x => x.id !== t.id))
    setAssignments(a => a.filter(x => x.template_id !== t.id))
    notify('Template deleted', 'success')
  }

  async function openEditor(id: string) {
    setEditingId(id)
    setSchema(null)
    const data = await (await fetch(`/api/templates/${id}`)).json()
    setSchema(data.template.schema as DocumentSchema)
    setName(data.template.name as string)
  }

  async function save() {
    if (!editingId || !schema) return
    setBusy(true)
    try {
      const res = await fetch(`/api/templates/${editingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, schema }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error || 'Save failed', 'error'); return }
      setTemplates(list => list.map(t => t.id === editingId ? { ...t, name, updated_at: data.template.updated_at } : t))
      notify('Template saved', 'success')
    } finally { setBusy(false) }
  }

  async function setAssignment(companyId: string | null, templateId: string | null) {
    const res = await fetch('/api/templates/assignments', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, doc_type: docType, template_id: templateId }),
    })
    if (!res.ok) { notify('Could not update assignment', 'error'); return }
    setAssignments(a => {
      const rest = a.filter(x => x.company_id !== companyId)
      return templateId ? [...rest, { company_id: companyId, doc_type: docType, template_id: templateId }] : rest
    })
  }

  // ── Schema mutation helpers ────────────────────────────────────────────────
  const patchTheme = (patch: Partial<DocumentSchema['theme']>) =>
    setSchema(s => s ? { ...s, theme: { ...s.theme, ...patch } } : s)
  const patchBlock = (id: string, patch: Partial<Block>) =>
    setSchema(s => s ? { ...s, blocks: s.blocks.map(b => b.id === id ? { ...b, ...patch } : b) } : s)
  const patchProps = (id: string, patch: Record<string, unknown>) =>
    setSchema(s => s ? { ...s, blocks: s.blocks.map(b => b.id === id ? { ...b, props: { ...b.props, ...patch } } : b) } : s)
  const moveBlock = (idx: number, dir: -1 | 1) => setSchema(s => {
    if (!s) return s
    const j = idx + dir
    if (j < 0 || j >= s.blocks.length) return s
    const blocks = [...s.blocks];[blocks[idx], blocks[j]] = [blocks[j], blocks[idx]]
    return { ...s, blocks }
  })
  const addBlock = (type: BlockType) => setSchema(s => {
    if (!s) return s
    const props: Record<string, unknown> = type === 'text' ? { content: 'New text…', align: 'left', sizePt: 10.5 }
      : type === 'spacer' ? { heightPx: 16 } : {}
    return { ...s, blocks: [...s.blocks, { id: blockId(), type, visible: true, props }] }
  })
  const removeBlock = (id: string) => setSchema(s => s ? { ...s, blocks: s.blocks.filter(b => b.id !== id) } : s)

  // ── List view ──────────────────────────────────────────────────────────────
  if (!editingId) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Create a template</p>
          <div className="flex flex-wrap gap-2">
            {INVOICE_PRESETS.map(p => (
              <button key={p.id} onClick={() => createFromPreset(p.id)} disabled={busy}
                className="rounded-xl border px-3 py-2 text-left disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--text)' }}><Plus className="w-3.5 h-3.5" />{p.label}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Your {docLabel} templates</p>
          {templates.length === 0 ? (
            <div className="rounded-xl border text-center py-8 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              No custom templates yet — create one above. Until you assign one, invoices use the built-in layout.
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              {templates.map(t => (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => openEditor(t.id)} className="text-sm font-medium text-left" style={{ color: 'var(--text)' }}>{t.name}</button>
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEditor(t.id)} className="text-xs font-medium" style={{ color: 'var(--brand)' }}>Edit</button>
                    <button onClick={() => duplicate(t)} className="text-xs inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><Copy className="w-3.5 h-3.5" />Duplicate</button>
                    <button onClick={() => remove(t)} className="text-xs inline-flex items-center gap-1  hover:"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignment */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Which template each company uses ({docLabel})</p>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {[{ id: null as string | null, name: 'Personal / no company' }, ...companies].map(c => {
              const current = assignments.find(a => a.company_id === c.id)?.template_id ?? ''
              return (
                <div key={c.id ?? 'personal'} className="flex items-center justify-between px-4 py-2.5 gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{c.name}</span>
                  <select value={current} onChange={e => setAssignment(c.id, e.target.value || null)}
                    className="px-2.5 py-1.5 rounded-lg text-sm border outline-none" style={inputStyle}>
                    <option value="">Built-in layout (default)</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Editor view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={() => { setEditingId(null); setSchema(null) }} className="inline-flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <input value={name} onChange={e => setName(e.target.value)} className="flex-1 max-w-xs px-2.5 py-1.5 rounded-lg text-sm border outline-none" style={inputStyle} />
        <button onClick={save} disabled={busy || !schema} className="px-4 py-2 rounded-lg text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>

      {!schema ? (
        <div className="py-16 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Controls */}
          <div className="space-y-4">
            <ThemeControls schema={schema} onTheme={patchTheme} />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Blocks</p>
              {schema.blocks.map((b, i) => (
                <BlockEditor key={b.id} block={b} index={i} total={schema.blocks.length}
                  onMove={moveBlock} onToggle={() => patchBlock(b.id, { visible: !b.visible })}
                  onProps={patchProps} onRemove={removeBlock} />
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                {ADDABLE_BLOCKS[docType].map(t => (
                  <button key={t} onClick={() => addBlock(t)} className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
                    <Plus className="w-3 h-3" /> {BLOCK_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="lg:sticky lg:top-4 self-start">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>Live preview</p>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: '#e5e7eb', padding: 10 }}>
              {docType === 'reimbursable_invoice'
                ? <DocumentRenderer schema={schema} rdata={sampleReimb()} preview />
                : docType === 'salary_slip'
                ? <DocumentRenderer schema={schema} sdata={sampleSlip()} preview />
                : <DocumentRenderer schema={schema} invoice={sampleInvoice()} lines={sampleLines()} settings={SAMPLE_SETTINGS} preview />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Theme controls ──────────────────────────────────────────────────────────
function ThemeControls({ schema, onTheme }: { schema: DocumentSchema; onTheme: (p: Partial<DocumentSchema['theme']>) => void }) {
  return (
    <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Theme</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Accent</span>
        {ACCENT_PRESETS.map(a => (
          <button key={a.value} title={a.name} onClick={() => onTheme({ accent: a.value })}
            className="w-6 h-6 rounded-full" style={{ background: a.value, outline: schema.theme.accent.toLowerCase() === a.value.toLowerCase() ? '2px solid var(--text)' : 'none', outlineOffset: 2 }} />
        ))}
        <input type="color" value={schema.theme.accent} onChange={e => onTheme({ accent: e.target.value })} className="w-6 h-6 rounded-full border-0 bg-transparent cursor-pointer p-0" />
      </div>
      <div className="flex items-center gap-4">
        <label className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          Font
          <select value={schema.theme.font} onChange={e => onTheme({ font: e.target.value as 'sans' | 'serif' })} className="px-2 py-1 rounded-lg text-sm border" style={inputStyle}>
            <option value="sans">Sans</option><option value="serif">Serif</option>
          </select>
        </label>
        <label className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          Page margin (mm)
          <input type="number" min={5} max={25} value={schema.theme.pageMarginMm} onChange={e => onTheme({ pageMarginMm: Math.max(5, Math.min(25, Number(e.target.value))) })} className="w-16 px-2 py-1 rounded-lg text-sm border" style={inputStyle} />
        </label>
      </div>
    </div>
  )
}

// ── Per-block editor ──────────────────────────────────────────────────────────
function BlockEditor({ block, index, total, onMove, onToggle, onProps, onRemove }: {
  block: Block; index: number; total: number
  onMove: (i: number, d: -1 | 1) => void; onToggle: () => void
  onProps: (id: string, patch: Record<string, unknown>) => void; onRemove: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const p = block.props ?? {}
  const removable = block.type === 'text' || block.type === 'divider' || block.type === 'spacer'
  const editable = !['divider', 'supply', 'amountWords'].includes(block.type)

  return (
    <div className="rounded-lg border" style={{ borderColor: 'var(--border)', opacity: block.visible ? 1 : 0.55 }}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="flex flex-col">
          <button onClick={() => onMove(index, -1)} disabled={index === 0} className="disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>
          <button onClick={() => onMove(index, 1)} disabled={index === total - 1} className="disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <button onClick={() => editable && setOpen(o => !o)} className="flex-1 text-left text-sm font-medium" style={{ color: 'var(--text)' }}>
          {BLOCK_LABELS[block.type]}
        </button>
        <button onClick={onToggle} title={block.visible ? 'Hide' : 'Show'}>
          {block.visible ? <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <EyeOff className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
        </button>
        {removable && <button onClick={() => onRemove(block.id)}><Trash2 className="w-3.5 h-3.5 " /></button>}
      </div>

      {open && editable && (
        <div className="px-3 pb-3 space-y-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="pt-2" />
          {block.type === 'header' && (
            <>
              <Row label="Style">
                <select value={String(p.variant ?? 'plain')} onChange={e => onProps(block.id, { variant: e.target.value })} className={inputCls} style={inputStyle}>
                  <option value="plain">Classic (logo + rule)</option><option value="band">Band (accent)</option><option value="minimal">Minimal</option>
                </select>
              </Row>
              <Row label="Title"><input className={inputCls} style={inputStyle} value={String(p.title ?? '')} onChange={e => onProps(block.id, { title: e.target.value })} /></Row>
              <Check label="Show logo" v={p.showLogo !== false} on={v => onProps(block.id, { showLogo: v })} />
              <Check label="Show invoice number" v={p.showNumber !== false} on={v => onProps(block.id, { showNumber: v })} />
              <Check label="Show balance due" v={p.showBalanceDue !== false} on={v => onProps(block.id, { showBalanceDue: v })} />
            </>
          )}
          {block.type === 'companyInfo' && <Check label="Show balance due" v={p.showBalanceDue !== false} on={v => onProps(block.id, { showBalanceDue: v })} />}
          {block.type === 'billTo' && <Row label="Label"><input className={inputCls} style={inputStyle} value={String(p.label ?? 'Bill To')} onChange={e => onProps(block.id, { label: e.target.value })} /></Row>}
          {block.type === 'meta' && <FieldToggles fields={(p.fields as FieldDef[]) ?? []} onChange={f => onProps(block.id, { fields: f })} />}
          {block.type === 'lineItems' && (
            <>
              <Row label="Header style">
                <select value={String(p.headerStyle ?? 'grey')} onChange={e => onProps(block.id, { headerStyle: e.target.value })} className={inputCls} style={inputStyle}>
                  <option value="grey">Grey</option><option value="filled">Filled (accent)</option><option value="plain">Plain (accent rule)</option>
                </select>
              </Row>
              <Check label="Zebra striping" v={p.zebra !== false} on={v => onProps(block.id, { zebra: v })} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Columns</p>
              <ColumnToggles cols={(p.columns as ColumnDef[]) ?? []} onChange={c => onProps(block.id, { columns: c })} />
            </>
          )}
          {block.type === 'totals' && <FieldToggles fields={(p.rows as FieldDef[]) ?? []} onChange={f => onProps(block.id, { rows: f })} />}
          {block.type === 'bank' && <Row label="Title"><input className={inputCls} style={inputStyle} value={String(p.title ?? 'Bank Details')} onChange={e => onProps(block.id, { title: e.target.value })} /></Row>}
          {block.type === 'terms' && (
            <>
              <Row label="Title"><input className={inputCls} style={inputStyle} value={String(p.title ?? 'Terms & Conditions')} onChange={e => onProps(block.id, { title: e.target.value })} /></Row>
              <Row label="Override text"><textarea rows={2} className={inputCls} style={inputStyle} value={String(p.textOverride ?? '')} placeholder="Leave blank to use the company's terms" onChange={e => onProps(block.id, { textOverride: e.target.value })} /></Row>
            </>
          )}
          {block.type === 'signature' && (
            <>
              <Row label="Label"><input className={inputCls} style={inputStyle} value={String(p.label ?? 'Authorised Signature')} onChange={e => onProps(block.id, { label: e.target.value })} /></Row>
              <Check label="Show signature image" v={p.showImage !== false} on={v => onProps(block.id, { showImage: v })} />
            </>
          )}
          {block.type === 'rHeader' && (
            <>
              <Row label="Style">
                <select value={String(p.variant ?? 'plain')} onChange={e => onProps(block.id, { variant: e.target.value })} className={inputCls} style={inputStyle}>
                  <option value="plain">Classic</option><option value="band">Band (accent)</option><option value="minimal">Minimal</option>
                </select>
              </Row>
              <Row label="Title"><input className={inputCls} style={inputStyle} value={String(p.title ?? '')} onChange={e => onProps(block.id, { title: e.target.value })} /></Row>
              <Check label="Show logo" v={p.showLogo !== false} on={v => onProps(block.id, { showLogo: v })} />
              <Check label="Show invoice number" v={p.showNumber !== false} on={v => onProps(block.id, { showNumber: v })} />
            </>
          )}
          {block.type === 'rParties' && (
            <>
              <Check label="Show Bill From" v={p.showFrom !== false} on={v => onProps(block.id, { showFrom: v })} />
              <Check label="Show Bill To" v={p.showTo !== false} on={v => onProps(block.id, { showTo: v })} />
              <Check label="Show Payment box" v={p.showPayment !== false} on={v => onProps(block.id, { showPayment: v })} />
              <Row label="From label"><input className={inputCls} style={inputStyle} value={String(p.fromLabel ?? 'Bill From')} onChange={e => onProps(block.id, { fromLabel: e.target.value })} /></Row>
              <Row label="To label"><input className={inputCls} style={inputStyle} value={String(p.toLabel ?? 'Bill To')} onChange={e => onProps(block.id, { toLabel: e.target.value })} /></Row>
            </>
          )}
          {block.type === 'rMeta' && <FieldToggles fields={(p.fields as FieldDef[]) ?? []} onChange={f => onProps(block.id, { fields: f })} />}
          {block.type === 'rLineItems' && (
            <>
              <Row label="Header style">
                <select value={String(p.headerStyle ?? 'filled')} onChange={e => onProps(block.id, { headerStyle: e.target.value })} className={inputCls} style={inputStyle}>
                  <option value="grey">Grey</option><option value="filled">Filled (accent)</option><option value="plain">Plain (accent rule)</option>
                </select>
              </Row>
              <Check label="Show INR Amount column" v={p.showInr !== false} on={v => onProps(block.id, { showInr: v })} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Sections</p>
              <FieldToggles fields={(p.sections as FieldDef[]) ?? []} onChange={f => onProps(block.id, { sections: f })} />
            </>
          )}
          {block.type === 'rTotals' && (
            <>
              <Row label="GST label"><input className={inputCls} style={inputStyle} value={String(p.gstLabel ?? 'GST @ 18%')} onChange={e => onProps(block.id, { gstLabel: e.target.value })} /></Row>
              <Check label="Show sub total" v={p.showSubtotal !== false} on={v => onProps(block.id, { showSubtotal: v })} />
              <Check label="Show grand total" v={p.showGrand !== false} on={v => onProps(block.id, { showGrand: v })} />
            </>
          )}
          {block.type === 'rBank' && <Row label="Title"><input className={inputCls} style={inputStyle} value={String(p.title ?? 'Bank Details for Payment')} onChange={e => onProps(block.id, { title: e.target.value })} /></Row>}
          {block.type === 'rSignature' && <Row label="Label"><input className={inputCls} style={inputStyle} value={String(p.label ?? 'Authorised Signature & Date')} onChange={e => onProps(block.id, { label: e.target.value })} /></Row>}
          {block.type === 'sHeader' && (
            <>
              <Row label="Style">
                <select value={String(p.variant ?? 'plain')} onChange={e => onProps(block.id, { variant: e.target.value })} className={inputCls} style={inputStyle}>
                  <option value="plain">Classic (centered)</option><option value="band">Band (accent)</option><option value="minimal">Minimal</option>
                </select>
              </Row>
              <Row label="Title"><input className={inputCls} style={inputStyle} value={String(p.title ?? 'Salary Slip')} onChange={e => onProps(block.id, { title: e.target.value })} /></Row>
              <Check label="Show company address" v={p.showAddress !== false} on={v => onProps(block.id, { showAddress: v })} />
            </>
          )}
          {block.type === 'sEmployee' && <FieldToggles fields={(p.fields as FieldDef[]) ?? []} onChange={f => onProps(block.id, { fields: f })} />}
          {block.type === 'sEarnings' && (
            <>
              <Row label="Header style">
                <select value={String(p.headerStyle ?? 'grey')} onChange={e => onProps(block.id, { headerStyle: e.target.value })} className={inputCls} style={inputStyle}>
                  <option value="grey">Grey</option><option value="filled">Filled (accent)</option><option value="plain">Plain (accent rule)</option>
                </select>
              </Row>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Earnings rows</p>
              <FieldToggles fields={(p.earnings as FieldDef[]) ?? []} onChange={f => onProps(block.id, { earnings: f })} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Deduction rows</p>
              <FieldToggles fields={(p.deductions as FieldDef[]) ?? []} onChange={f => onProps(block.id, { deductions: f })} />
            </>
          )}
          {block.type === 'sNet' && (
            <>
              <Check label="Show amount in words" v={p.showWords !== false} on={v => onProps(block.id, { showWords: v })} />
              <Check label="Show forex (foreign salary)" v={p.showForex !== false} on={v => onProps(block.id, { showForex: v })} />
            </>
          )}
          {block.type === 'sBank' && <Row label="Title"><input className={inputCls} style={inputStyle} value={String(p.title ?? 'Bank Transfer Details')} onChange={e => onProps(block.id, { title: e.target.value })} /></Row>}
          {block.type === 'sFooter' && <Row label="Note"><input className={inputCls} style={inputStyle} value={String(p.note ?? '')} onChange={e => onProps(block.id, { note: e.target.value })} /></Row>}
          {block.type === 'text' && (
            <>
              <Row label="Content"><textarea rows={3} className={inputCls} style={inputStyle} value={String(p.content ?? '')} onChange={e => onProps(block.id, { content: e.target.value })} /></Row>
              <Row label="Align">
                <select value={String(p.align ?? 'left')} onChange={e => onProps(block.id, { align: e.target.value })} className={inputCls} style={inputStyle}>
                  <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                </select>
              </Row>
              <Check label="Bold" v={!!p.bold} on={v => onProps(block.id, { bold: v })} />
            </>
          )}
          {block.type === 'spacer' && <Row label="Height (px)"><input type="number" className={inputCls} style={inputStyle} value={Number(p.heightPx) || 16} onChange={e => onProps(block.id, { heightPx: Number(e.target.value) })} /></Row>}
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>{children}</label>
}
function Check({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}><input type="checkbox" checked={v} onChange={e => on(e.target.checked)} />{label}</label>
}
function FieldToggles({ fields, onChange }: { fields: FieldDef[]; onChange: (f: FieldDef[]) => void }) {
  return (
    <div className="space-y-1">
      {fields.map((f, i) => (
        <div key={f.key} className="flex items-center gap-2">
          <input type="checkbox" checked={f.visible} onChange={e => { const c = [...fields]; c[i] = { ...f, visible: e.target.checked }; onChange(c) }} />
          <input className="flex-1 px-2 py-1 rounded text-sm border" style={inputStyle} value={f.label} onChange={e => { const c = [...fields]; c[i] = { ...f, label: e.target.value }; onChange(c) }} />
        </div>
      ))}
    </div>
  )
}
function ColumnToggles({ cols, onChange }: { cols: ColumnDef[]; onChange: (c: ColumnDef[]) => void }) {
  return (
    <div className="space-y-1">
      {cols.map((c, i) => (
        <div key={c.key} className="flex items-center gap-2">
          <input type="checkbox" checked={c.visible} onChange={e => { const n = [...cols]; n[i] = { ...c, visible: e.target.checked }; onChange(n) }} />
          <input className="flex-1 px-2 py-1 rounded text-sm border" style={inputStyle} value={c.label} onChange={e => { const n = [...cols]; n[i] = { ...c, label: e.target.value }; onChange(n) }} />
        </div>
      ))}
    </div>
  )
}
