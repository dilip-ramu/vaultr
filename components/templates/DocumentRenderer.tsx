'use client'

import { amountToWords } from '@/lib/recoverables/invoices/words'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import type { InvoiceDocSettings } from '@/components/recoverables/invoices/InvoiceDocument'
import { accentSoft } from '@/lib/companies/templates'
import type { DocumentSchema, Block, ColumnDef, FieldDef } from '@/lib/templates/schema'
import ReimbursableRenderer from './ReimbursableRenderer'
import type { ReimbursableInvoiceData } from '@/components/reimbursables/ReimbursableInvoicePDF'

interface Props {
  schema: DocumentSchema
  invoice?: RecoverableInvoice
  lines?: RecoverableInvoiceLine[]
  settings?: InvoiceDocSettings | null
  logoUrl?: string | null
  signatureUrl?: string | null
  preview?: boolean
  /** Data for reimbursable_invoice schemas. */
  rdata?: ReimbursableInvoiceData | null
}

function fmtInr(n: number, dp = 2) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)
}
function fmtDate(d: string | null) { return d ?? '—' }
function fmtDateLong(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const paymentTermsLabel: Record<string, string> = {
  net_7: 'Net 7', net_15: 'Net 15', net_30: 'Net 30', net_60: 'Net 60', net_90: 'Net 90', due_on_receipt: 'Due on Receipt',
}

const S = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const B = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d)

/** Renders any invoice DocumentSchema to the scoped .vinv document. Shared by
 *  the live editor preview and the print route, so they never drift. */
export default function DocumentRenderer({
  schema, invoice, lines, settings = null, logoUrl = null, signatureUrl = null, preview = false, rdata = null,
}: Props) {
  if (schema.docType === 'reimbursable_invoice') {
    return <ReimbursableRenderer schema={schema} data={rdata} logoUrl={logoUrl} preview={preview} />
  }
  if (!invoice || !lines) return null

  const accent = schema.theme.accent || '#2A7A50'
  const companyName = settings?.company_name ?? 'Your Company'
  const balanceDue = invoice.balance_due
  const termsLabel = paymentTermsLabel[invoice.payment_terms ?? ''] ?? (invoice.payment_terms ?? '—')
  const stateDisplay = invoice.customer_state || null
  const uniformCgst = lines.length > 0 && lines.every(l => l.cgst_rate === lines[0].cgst_rate)
  const uniformSgst = lines.length > 0 && lines.every(l => l.sgst_rate === lines[0].sgst_rate)

  const fontFamily = schema.theme.font === 'serif'
    ? "Georgia, 'Times New Roman', serif"
    : "system-ui, -apple-system, sans-serif"
  const margin = schema.theme.pageMarginMm || 12

  const sheetStyle = {
    ['--accent' as string]: accent,
    ['--accent-soft' as string]: accentSoft(accent),
    fontFamily,
    ...(preview ? {} : { padding: `${margin}mm ${margin + 2}mm` }),
  } as React.CSSProperties

  // ── Block renderers ────────────────────────────────────────────────────────
  const renderHeader = (p: Record<string, unknown>) => {
    const variant = S(p.variant, 'plain')
    const title = S(p.title, 'Tax Invoice')
    const showLogo = B(p.showLogo, true)
    const showNumber = B(p.showNumber, true)
    const showBal = B(p.showBalanceDue, true)
    if (variant === 'band') {
      return (
        <div className="brand-band" key="header">
          <div>
            {showLogo && logoUrl && <img className="bn-logo" src={logoUrl} alt={companyName} />}
            <div className="bn-name">{companyName}</div>
          </div>
          <div className="bn-right">
            <div className="bn-title">{title.toUpperCase()}</div>
            {showNumber && <div className="bn-num"># {invoice.invoice_number}</div>}
            {showBal && <><div className="bn-bal-label">Balance Due</div><div className="bn-bal">₹{fmtInr(balanceDue)}</div></>}
          </div>
        </div>
      )
    }
    if (variant === 'minimal') {
      return (
        <div className="minimal-head" key="header">
          <div>
            <span className="minimal-name">{companyName}</span>
            <div className="minimal-sub">
              {settings?.company_address && <div style={{ whiteSpace: 'pre-wrap' }}>{settings.company_address}</div>}
              {settings?.company_gstin && <div>GSTIN: {settings.company_gstin}</div>}
              {settings?.company_email && <div>{settings.company_email}</div>}
            </div>
          </div>
          <div className="minimal-right">
            <div className="mr-title">{title}</div>
            {showNumber && <div className="mr-num"># {invoice.invoice_number}</div>}
            {showBal && <><div className="mr-num" style={{ marginTop: 6 }}>Balance Due</div><div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>₹{fmtInr(balanceDue)}</div></>}
          </div>
        </div>
      )
    }
    return (
      <div className="header" key="header">
        {showLogo && logoUrl
          ? <img src={logoUrl} alt={companyName} style={{ height: '1.5cm', width: 'auto', display: 'block' }} />
          : <div style={{ height: '1.5cm' }} />}
        <div className="tax-invoice-block">
          <h2>{title}</h2>
          {showNumber && <div className="invoice-number"># {invoice.invoice_number}</div>}
        </div>
      </div>
    )
  }

  const renderCompanyInfo = (p: Record<string, unknown>) => (
    <div className="subheader" key="companyInfo">
      <div className="company-info">
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{companyName}</div>
        {settings?.company_address && <div style={{ whiteSpace: 'pre-wrap' }}>{settings.company_address}</div>}
        {settings?.company_gstin && <div>GSTIN: {settings.company_gstin}</div>}
        {settings?.company_phone && <div>Phone: {settings.company_phone}</div>}
        {settings?.company_email && <div>Email: {settings.company_email}</div>}
      </div>
      {B(p.showBalanceDue, true) && (
        <div className="balance-block">
          <div className="balance-label">Balance Due</div>
          <div className="balance-amount">₹{fmtInr(balanceDue)}</div>
        </div>
      )}
    </div>
  )

  const metaTable = (p: Record<string, unknown>) => {
    const fields = (Array.isArray(p.fields) ? p.fields : []) as FieldDef[]
    const val: Record<string, string> = {
      invoice_date: fmtDateLong(invoice.invoice_date), terms: termsLabel, due_date: fmtDateLong(invoice.due_date),
    }
    return (
      <table className="meta-table"><tbody>
        {fields.filter(f => f.visible).map(f => (
          <tr key={f.key}><td>{f.label}</td><td>{val[f.key] ?? ''}</td></tr>
        ))}
      </tbody></table>
    )
  }

  const renderBillTo = (p: Record<string, unknown>, meta?: Record<string, unknown>) => (
    <div className="parties-row" key="billTo">
      <div className="bill-to-block">
        <div className="section-label">{S(p.label, 'Bill To')}</div>
        <div className="customer-name">{invoice.customer_name}</div>
        {invoice.customer_address && <div className="customer-address">{invoice.customer_address}</div>}
        {invoice.customer_gstin && <div className="customer-gstin">GSTIN: {invoice.customer_gstin}</div>}
      </div>
      {meta && metaTable(meta)}
    </div>
  )

  const renderLineItems = (p: Record<string, unknown>) => {
    const columns = (Array.isArray(p.columns) ? p.columns : []) as ColumnDef[]
    const vis = columns.filter(c => c.visible)
    const headerStyle = S(p.headerStyle, 'grey')
    const zebra = B(p.zebra, true)
    const cell = (l: RecoverableInvoiceLine, key: string) => {
      switch (key) {
        case 'sno': return l.line_number
        case 'item': return (
          <>
            <div>{fmtDate(l.shipment_date)}</div>
            {l.client_name && <div style={{ fontWeight: 600 }}>Consignee: {l.client_name}</div>}
            <div className="awb-cell">AWB: {l.awb}</div>
          </>
        )
        case 'hsn': return l.hsn_sac ?? settings?.hsn_sac ?? '996812'
        case 'qty': return l.qty
        case 'rate': return fmtInr(l.rate, 2)
        case 'cgst': return <><div>{fmtInr(l.qty > 0 ? l.cgst_amount / l.qty : 0)}</div><div style={{ color: '#6b7280', fontSize: 9 }}>{l.cgst_rate}%</div></>
        case 'sgst': return <><div>{fmtInr(l.qty > 0 ? l.sgst_amount / l.qty : 0)}</div><div style={{ color: '#6b7280', fontSize: 9 }}>{l.sgst_rate}%</div></>
        case 'amount': return fmtInr(l.amount)
        default: return ''
      }
    }
    return (
      <table className={`items-table hs-${headerStyle}${zebra ? ' zebra' : ''}`} key="lineItems">
        <thead><tr>{vis.map(c => <th key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {lines.map(l => (
            <tr key={l.id}>{vis.map(c => <td key={c.key} className={c.align === 'right' ? 'right' : ''}>{cell(l, c.key)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    )
  }

  const renderTotals = (p: Record<string, unknown>) => {
    const rows = (Array.isArray(p.rows) ? p.rows : []) as FieldDef[]
    const label = (key: string, base: string) =>
      key === 'cgst' ? `${base}${uniformCgst ? ` (${lines[0].cgst_rate}%)` : ''}`
      : key === 'sgst' ? `${base}${uniformSgst ? ` (${lines[0].sgst_rate}%)` : ''}` : base
    const val: Record<string, string> = {
      subtotal: fmtInr(invoice.subtotal), cgst: fmtInr(invoice.cgst_amount), sgst: fmtInr(invoice.sgst_amount),
      total: `₹${fmtInr(invoice.total)}`, balance: `₹${fmtInr(balanceDue)}`,
    }
    return (
      <div className="totals-section" key="totals">
        <table className="totals-table"><tbody>
          {rows.filter(r => r.visible).map(r => (
            <tr key={r.key} className={r.key === 'total' ? 'total-row' : r.key === 'balance' ? 'balance-row' : ''}>
              <td>{label(r.key, r.label)}</td><td>{val[r.key] ?? ''}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    )
  }

  const renderBank = (p: Record<string, unknown>) => {
    if (!(settings?.bank_account_number || settings?.bank_account_name)) return null
    return (
      <div className="bank-block" key="bank" style={{ marginTop: 12 }}>
        <h4>{S(p.title, 'Bank Details')}</h4>
        <table className="bank-table"><tbody>
          {settings.bank_account_name && <tr><td>Account Name</td><td>{settings.bank_account_name}</td></tr>}
          {settings.bank_account_number && <tr><td>Account Number</td><td>{settings.bank_account_number}</td></tr>}
          {settings.bank_ifsc && <tr><td>IFSC Code</td><td>{settings.bank_ifsc}</td></tr>}
          {settings.swift_code && <tr><td>SWIFT / BIC</td><td>{settings.swift_code}</td></tr>}
          {settings.bank_name && <tr><td>Bank Name</td><td>{settings.bank_name}</td></tr>}
        </tbody></table>
      </div>
    )
  }

  const renderTerms = (p: Record<string, unknown>) => {
    const text = S(p.textOverride) || settings?.terms_conditions
    if (!text) return null
    return <div className="terms-block" key="terms" style={{ marginTop: 12 }}><h4>{S(p.title, 'Terms & Conditions')}</h4>{text}</div>
  }

  const renderSignature = (p: Record<string, unknown>) => (
    <div key="signature" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
      <div style={{ textAlign: 'right' }}>
        {B(p.showImage, true) && signatureUrl
          ? <img src={signatureUrl} alt="Signature" style={{ height: '3cm', width: 'auto', display: 'block', marginLeft: 'auto' }} />
          : <div style={{ height: '3cm', width: '5cm', borderBottom: '1px solid #999', marginLeft: 'auto' }} />}
        <div style={{ fontSize: 10.5, marginTop: 4 }}>{S(p.label, 'Authorised Signature')}</div>
      </div>
    </div>
  )

  const renderBlock = (block: Block, i: number): React.ReactNode => {
    if (!block.visible) return null
    const p = block.props ?? {}
    switch (block.type) {
      case 'header': return renderHeader(p)
      case 'companyInfo': return renderCompanyInfo(p)
      case 'billTo': {
        // Pull the immediately-following meta block into the same row, if visible.
        const next = schema.blocks[i + 1]
        if (next && next.type === 'meta' && next.visible) return renderBillTo(p, next.props ?? {})
        return renderBillTo(p)
      }
      case 'meta': {
        const prev = schema.blocks[i - 1]
        if (prev && prev.type === 'billTo' && prev.visible) return null // already rendered inside billTo
        return <div className="parties-row" key={block.id}><div style={{ flex: 1 }} />{metaTable(p)}</div>
      }
      case 'supply':
        if (!(invoice.customer_gstin || stateDisplay)) return null
        return (
          <div className="supply-line" key={block.id}>
            {invoice.customer_gstin && <span>Ship To GSTIN: {invoice.customer_gstin}&nbsp;&nbsp;</span>}
            {stateDisplay && <span>Place Of Supply: {stateDisplay}</span>}
          </div>
        )
      case 'lineItems': return renderLineItems(p)
      case 'totals': return renderTotals(p)
      case 'amountWords':
        return <div className="words-row" key={block.id}>Total In Words: <span>{amountToWords(invoice.total, invoice.currency ?? 'INR')}</span></div>
      case 'bank': return renderBank(p)
      case 'terms': return renderTerms(p)
      case 'signature': return renderSignature(p)
      case 'text':
        return <div key={block.id} style={{ textAlign: (S(p.align, 'left') as 'left' | 'center' | 'right'), fontSize: Number(p.sizePt) || 10.5, fontWeight: B(p.bold) ? 700 : 400, margin: '6px 0', whiteSpace: 'pre-wrap' }}>{S(p.content)}</div>
      case 'divider':
        return <hr key={block.id} style={{ border: 'none', borderTop: '1px solid #d1d5db', margin: '10px 0' }} />
      case 'spacer':
        return <div key={block.id} style={{ height: Number(p.heightPx) || 16 }} />
      default: return null
    }
  }

  // bank + terms sit side by side when both present; render row wrapper.
  const bankIdx = schema.blocks.findIndex(b => b.type === 'bank' && b.visible)
  const termsIdx = schema.blocks.findIndex(b => b.type === 'terms' && b.visible)
  const pairFooter = bankIdx >= 0 && termsIdx >= 0

  return (
    <div className="vinv">
      <style>{`
        .vinv *, .vinv *::before, .vinv *::after { box-sizing: border-box; }
        .vinv .sheet { background:#fff; width:210mm; min-height:297mm; margin:32px auto; padding:12mm 14mm; box-shadow:0 4px 24px rgba(0,0,0,.15); color:#000; font-size:11px; line-height:1.4; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .vinv .sheet--preview { width:100%; min-height:auto; margin:0; box-shadow:none; padding:20px 22px; border-radius:10px; }
        .vinv .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; }
        .vinv .tax-invoice-block { text-align:right; }
        .vinv .tax-invoice-block h2 { font-size:16px; font-weight:700; margin:0 0 2px; color:var(--accent); }
        .vinv .invoice-number { font-size:13px; font-weight:600; color:#374151; }
        .vinv .subheader { display:flex; justify-content:space-between; align-items:flex-start; padding:6px 0 8px; border-top:1px solid #000; border-bottom:1px solid #000; margin-bottom:10px; }
        .vinv .company-info { font-size:10.5px; line-height:1.5; }
        .vinv .balance-block { text-align:right; }
        .vinv .balance-label { font-size:10px; color:#6b7280; margin-bottom:2px; }
        .vinv .balance-amount { font-size:22px; font-weight:700; color:var(--accent); }
        .vinv .parties-row { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; gap:16px; }
        .vinv .bill-to-block { flex:1; }
        .vinv .section-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; margin-bottom:3px; }
        .vinv .customer-name { font-size:13px; font-weight:700; }
        .vinv .customer-address { font-size:10px; color:#374151; margin-top:2px; white-space:pre-wrap; }
        .vinv .customer-gstin { font-size:10px; margin-top:3px; }
        .vinv .meta-table { font-size:10.5px; border-collapse:collapse; }
        .vinv .meta-table td { padding:2px 4px; }
        .vinv .meta-table td:first-child { color:#6b7280; white-space:nowrap; padding-right:12px; }
        .vinv .meta-table td:last-child { font-weight:600; text-align:right; }
        .vinv .supply-line { font-size:10.5px; margin-bottom:10px; padding:4px 0; border-top:1px solid #d1d5db; border-bottom:1px solid #d1d5db; }
        .vinv .brand-band { background:var(--accent); color:#fff; border-radius:6px; padding:12px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:flex-start; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .vinv .brand-band .bn-name { font-size:18px; font-weight:700; }
        .vinv .brand-band .bn-logo { height:1.2cm; width:auto; background:#fff; border-radius:4px; padding:3px 5px; margin-bottom:6px; display:block; }
        .vinv .brand-band .bn-right { text-align:right; }
        .vinv .brand-band .bn-title { font-size:14px; font-weight:700; letter-spacing:.04em; }
        .vinv .brand-band .bn-num { font-size:11px; opacity:.95; }
        .vinv .brand-band .bn-bal-label { font-size:9px; opacity:.85; margin-top:6px; }
        .vinv .brand-band .bn-bal { font-size:16px; font-weight:700; }
        .vinv .minimal-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; }
        .vinv .minimal-name { font-size:18px; font-weight:700; color:var(--accent); display:inline-block; border-bottom:2px solid var(--accent); padding-bottom:2px; }
        .vinv .minimal-sub { font-size:10px; color:#374151; margin-top:6px; line-height:1.5; }
        .vinv .minimal-right { text-align:right; }
        .vinv .minimal-right .mr-title { font-size:13px; font-weight:700; color:var(--accent); }
        .vinv .minimal-right .mr-num { font-size:11px; color:#6b7280; margin-top:2px; }
        .vinv .items-table { width:100%; border-collapse:collapse; font-size:10.5px; }
        .vinv .items-table th { font-weight:700; padding:5px 6px; text-align:left; border:1px solid #d1d5db; }
        .vinv .items-table th.right, .vinv .items-table td.right { text-align:right; }
        .vinv .items-table td { padding:4px 6px; border:1px solid #d1d5db; vertical-align:top; }
        .vinv .items-table.hs-grey th { background:#f3f4f6; }
        .vinv .items-table.hs-filled th { background:var(--accent); color:#fff; border-color:var(--accent); }
        .vinv .items-table.hs-plain th { background:transparent; border-left:none; border-right:none; border-top:none; border-bottom:1.5px solid var(--accent); }
        .vinv .items-table.hs-plain td { border-left:none; border-right:none; }
        .vinv .items-table.zebra tr:nth-child(even) td { background:#f9fafb; }
        .vinv .items-table.hs-plain.zebra tr:nth-child(even) td { background:transparent; }
        .vinv .awb-cell { font-family:monospace; font-size:9.5px; color:#374151; }
        .vinv .totals-section { display:flex; justify-content:flex-end; border-left:1px solid #d1d5db; border-right:1px solid #d1d5db; border-bottom:1px solid #d1d5db; }
        .vinv .totals-table { font-size:10.5px; border-collapse:collapse; min-width:200px; }
        .vinv .totals-table td { padding:3px 8px; }
        .vinv .totals-table td:first-child { color:#374151; }
        .vinv .totals-table td:last-child { text-align:right; font-weight:500; min-width:80px; }
        .vinv .totals-table tr.total-row td { font-weight:700; font-size:12px; border-top:1px solid #000; padding-top:5px; }
        .vinv .totals-table tr.total-row td:last-child { color:var(--accent); }
        .vinv .totals-table tr.balance-row td { font-weight:700; font-size:14px; }
        .vinv .totals-table tr.balance-row td:last-child { color:var(--accent); }
        .vinv .words-row { border:1px solid #d1d5db; border-top:none; padding:5px 8px; font-size:10px; }
        .vinv .words-row span { font-weight:600; }
        .vinv .footer-row { display:flex; justify-content:space-between; align-items:flex-start; margin-top:12px; gap:16px; }
        .vinv .bank-block { flex:1; }
        .vinv .bank-block h4, .vinv .terms-block h4 { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#6b7280; margin:0 0 4px; }
        .vinv .bank-table { font-size:10.5px; border-collapse:collapse; }
        .vinv .bank-table td { padding:1.5px 0; }
        .vinv .bank-table td:first-child { color:#6b7280; min-width:110px; }
        .vinv .terms-block { flex:1; font-size:10px; line-height:1.5; white-space:pre-wrap; }
        @media print { .vinv .sheet { margin:0; box-shadow:none; width:100%; } }
      `}</style>

      <div className={`sheet${preview ? ' sheet--preview' : ''}`} style={sheetStyle}>
        {schema.blocks.map((block, i) => {
          // Render bank + terms as a paired footer row when both are present.
          if (pairFooter && block.type === 'terms') return null
          if (pairFooter && block.type === 'bank' && block.visible) {
            const termsBlock = schema.blocks[termsIdx]
            return (
              <div className="footer-row" key={block.id}>
                {renderBank(block.props ?? {})}
                {renderTerms(termsBlock.props ?? {})}
              </div>
            )
          }
          return <div key={block.id}>{renderBlock(block, i)}</div>
        })}
      </div>
    </div>
  )
}
