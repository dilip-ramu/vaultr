'use client'

import { accentSoft } from '@/lib/companies/templates'
import type { DocumentSchema, Block, FieldDef } from '@/lib/templates/schema'
import type { ReimbursableInvoiceData, InvoiceItem } from '@/components/reimbursables/ReimbursableInvoicePDF'

interface Props {
  schema: DocumentSchema
  data: ReimbursableInvoiceData | null
  logoUrl?: string | null
  preview?: boolean
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function monthLabel(ym: string) { const [y, m] = (ym ?? '').split('-'); return m ? `${MONTHS[parseInt(m) - 1]} ${y}` : (ym ?? '') }
function fmtCur(n: number, cur: string) { return `${cur} ${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${n < 0 ? '' : ''}` }
function fmtInr(n: number) { const [i, d] = Math.abs(n).toFixed(2).split('.'); return `Rs. ${parseInt(i, 10).toLocaleString('en-IN')}.${d}` }
const S = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const B = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d)

/** Renders a reimbursable_invoice DocumentSchema + data to the scoped .vinv
 *  document. Mirrors the React-PDF proforma invoice; accent + variants come
 *  from the schema theme/blocks. */
export default function ReimbursableRenderer({ schema, data, logoUrl = null, preview = false }: Props) {
  const accent = schema.theme.accent || '#2A7A50'
  const fontFamily = schema.theme.font === 'serif' ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, sans-serif"
  const margin = schema.theme.pageMarginMm || 14
  const sheetStyle = {
    ['--accent' as string]: accent, ['--accent-soft' as string]: accentSoft(accent), fontFamily,
    ...(preview ? {} : { padding: `${margin}mm ${margin}mm` }),
  } as React.CSSProperties

  if (!data) return <div className="vinv"><div className={`sheet${preview ? ' sheet--preview' : ''}`} style={sheetStyle}>No data</div></div>

  const cur = data.currency ?? 'EUR'
  const from = data.bill_from ?? { name: data.company_name ?? 'Your Company' }
  const to = data.bill_to ?? { name: '—' }

  const rHeader = (p: Record<string, unknown>) => {
    const variant = S(p.variant, 'plain'); const title = S(p.title, 'Proforma Invoice'); const showLogo = B(p.showLogo, true); const showNumber = B(p.showNumber, true)
    if (variant === 'band') return (
      <div className="r-band" key="h">
        <div>{showLogo && from.logo_url && <img className="r-band-logo" src={from.logo_url} alt={from.name} />}<div className="r-band-name">{from.name}</div>{from.address && <div className="r-band-addr">{from.address}</div>}</div>
        <div style={{ textAlign: 'right' }}><div className="r-band-title">{title.toUpperCase()}</div>{showNumber && <div className="r-band-num">{data.invoice_number}</div>}</div>
      </div>
    )
    if (variant === 'minimal') return (
      <div className="r-top" key="h">
        <div>{showLogo && from.logo_url ? <img src={from.logo_url} style={{ height: '1cm', display: 'block' }} alt={from.name} /> : <span className="r-min-name">{from.name}</span>}{from.address && <div className="r-sub">{from.address}</div>}</div>
        <div style={{ textAlign: 'right' }}><div className="r-title-min">{title}</div>{showNumber && <div className="r-sub">{data.invoice_number}</div>}</div>
      </div>
    )
    return (
      <div className="r-top" key="h">
        <div>{showLogo && from.logo_url ? <img src={from.logo_url} style={{ height: '1.1cm', display: 'block' }} alt={from.name} /> : <span style={{ fontSize: 15, fontWeight: 700 }}>{from.name.toUpperCase()}</span>}{from.address && <div className="r-sub">{from.address}</div>}</div>
        <div style={{ textAlign: 'right' }}><div className="r-title">{title.toUpperCase()}</div>{showNumber && <div className="r-sub">{data.invoice_number}</div>}</div>
      </div>
    )
  }

  const rParties = (p: Record<string, unknown>) => (
    <div className="r-addr-row" key="p">
      {B(p.showFrom, true) && (
        <div className="r-box"><div className="r-box-label">{S(p.fromLabel, 'Bill From')}</div><div className="r-box-name">{from.name}</div>
          {from.email && <div className="r-box-line">E-mail: {from.email}</div>}{from.phone && <div className="r-box-line">Phone: {from.phone}</div>}</div>
      )}
      {B(p.showTo, true) && (
        <div className="r-box"><div className="r-box-label">{S(p.toLabel, 'Bill To')}</div><div className="r-box-name">{to.name}</div>
          {to.address && <div className="r-box-line">{to.address}</div>}{to.country && <div className="r-box-line">{to.country}</div>}</div>
      )}
      {B(p.showPayment, true) && (
        <div className="r-box"><div className="r-box-label">Payment Terms</div><div className="r-box-name" style={{ marginBottom: 4 }}>Telegraphic Transfer (TT)</div>
          <div className="r-box-label">For the Month of</div><div className="r-box-name">{monthLabel(data.invoice_month)}</div></div>
      )}
    </div>
  )

  const rMeta = (p: Record<string, unknown>) => {
    const fields = (Array.isArray(p.fields) ? p.fields : []) as FieldDef[]
    const val: Record<string, string | null> = {
      invoice_number: data.invoice_number, invoice_date: data.invoice_date, currency: cur,
      forex_rate: data.forex_rate ? fmtInr(data.forex_rate) : null,
    }
    return (
      <div className="r-meta-row" key="m">
        {fields.filter(f => f.visible && val[f.key] != null).map(f => (
          <div className="r-meta-box" key={f.key}><div className="r-meta-label">{f.label}</div><div className="r-meta-val">{val[f.key]}</div></div>
        ))}
      </div>
    )
  }

  const rLineItems = (p: Record<string, unknown>) => {
    const sections = (Array.isArray(p.sections) ? p.sections : []) as FieldDef[]
    const showInr = B(p.showInr, true); const hs = S(p.headerStyle, 'filled')
    const row = (it: InvoiceItem, i: number) => {
      const noInr = it.item_type === 'salary' || it.item_type === 'fixed_expense' || it.item_type === 'deduction'
      const ded = it.item_type === 'deduction'
      return (
        <tr key={i} className={i % 2 ? 'alt' : ''}>
          <td style={ded ? { color: '#c0392b' } : {}}>{it.description}</td>
          {showInr && <td className="right">{noInr ? '—' : (it.inr_source != null ? fmtInr(it.inr_source) : '—')}</td>}
          <td className="right" style={ded ? { color: '#c0392b' } : {}}>{fmtCur(it.amount_inr, cur)}</td>
        </tr>
      )
    }
    return (
      <table className={`r-table hs-${hs}`} key="li">
        <thead><tr><th>Description</th>{showInr && <th className="right">INR Amount</th>}<th className="right">Amount ({cur})</th></tr></thead>
        <tbody>
          {sections.filter(s => s.visible).flatMap(sec => {
            const items = data.items.filter(it => it.item_type === sec.key)
            if (!items.length) return []
            const label = sec.key === 'salary' ? `${sec.label} · ${monthLabel(data.invoice_month)}` : sec.label
            return [
              <tr key={`h-${sec.key}`} className="section"><td colSpan={showInr ? 3 : 2}>{label.toUpperCase()}</td></tr>,
              ...items.map((it, i) => row(it, i)),
            ]
          })}
        </tbody>
      </table>
    )
  }

  const rTotals = (p: Record<string, unknown>) => (
    <div className="r-totals" key="t">
      <div className="r-tot-box">
        {B(p.showSubtotal, true) && <div className="r-tot-row"><span>Sub Total</span><span>{fmtCur(data.subtotal, cur)}</span></div>}
        <div className="r-tot-row"><span>{S(p.gstLabel, 'GST @ 18%')}</span><span>{fmtCur(data.gst_amount, cur)}</span></div>
        {B(p.showGrand, true) && <div className="r-grand"><span>GRAND TOTAL</span><span>{fmtCur(data.total, cur)}</span></div>}
      </div>
    </div>
  )

  const rBank = (p: Record<string, unknown>) => {
    if (!(from.bank_account_number || from.bank_account_name || from.bank_ifsc || from.swift_code)) return null
    return (
      <div className="r-bank" key="b">
        <div className="r-bank-title">{S(p.title, 'Bank Details for Payment')}</div>
        <table className="r-bank-tbl"><tbody>
          {from.bank_account_name && <tr><td>Beneficiary Name</td><td>{from.bank_account_name}</td></tr>}
          {from.bank_account_number && <tr><td>Account Number</td><td>{from.bank_account_number}</td></tr>}
          {from.bank_name && <tr><td>Bank / Branch</td><td>{from.bank_name}</td></tr>}
          {from.bank_ifsc && <tr><td>IFSC Code</td><td>{from.bank_ifsc}</td></tr>}
          {from.swift_code && <tr><td>SWIFT Code</td><td>{from.swift_code}</td></tr>}
        </tbody></table>
      </div>
    )
  }

  const rSignature = (p: Record<string, unknown>) => (
    <div className="r-sign" key="s"><div className="r-sign-box">{S(p.label, 'Authorised Signature & Date')}</div></div>
  )

  const renderBlock = (block: Block): React.ReactNode => {
    if (!block.visible) return null
    const p = block.props ?? {}
    switch (block.type) {
      case 'rHeader': return rHeader(p)
      case 'rParties': return rParties(p)
      case 'rMeta': return rMeta(p)
      case 'rLineItems': return rLineItems(p)
      case 'rTotals': return rTotals(p)
      case 'rBank': return rBank(p)
      case 'rSignature': return rSignature(p)
      case 'text': return <div key={block.id} style={{ textAlign: (S(p.align, 'left') as 'left' | 'center' | 'right'), fontSize: Number(p.sizePt) || 10, fontWeight: B(p.bold) ? 700 : 400, margin: '6px 0', whiteSpace: 'pre-wrap' }}>{S(p.content)}</div>
      case 'divider': return <hr key={block.id} style={{ border: 'none', borderTop: '1px solid #ddd', margin: '10px 0' }} />
      case 'spacer': return <div key={block.id} style={{ height: Number(p.heightPx) || 16 }} />
      default: return null
    }
  }

  logoUrl // reserved (company logo already comes via from.logo_url)

  return (
    <div className="vinv">
      <style>{`
        .vinv *, .vinv *::before, .vinv *::after { box-sizing:border-box; }
        .vinv .sheet { background:#fff; width:210mm; min-height:297mm; margin:32px auto; padding:14mm; box-shadow:0 4px 24px rgba(0,0,0,.15); color:#1a1a1a; font-size:9px; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .vinv .sheet--preview { width:100%; min-height:auto; margin:0; box-shadow:none; padding:20px 22px; border-radius:10px; }
        .vinv .r-top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px; }
        .vinv .r-sub { font-size:8px; color:#666; margin-top:2px; }
        .vinv .r-title { font-size:18px; font-weight:700; color:var(--accent); }
        .vinv .r-title-min { font-size:15px; font-weight:700; color:var(--accent); }
        .vinv .r-min-name { font-size:15px; font-weight:700; color:var(--accent); border-bottom:2px solid var(--accent); padding-bottom:2px; }
        .vinv .r-band { background:var(--accent); color:#fff; border-radius:6px; padding:14px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-start; }
        .vinv .r-band-logo { height:34px; background:#fff; border-radius:3px; padding:3px; margin-bottom:4px; display:block; }
        .vinv .r-band-name { font-size:15px; font-weight:700; }
        .vinv .r-band-addr { font-size:8px; opacity:.9; margin-top:2px; }
        .vinv .r-band-title { font-size:16px; font-weight:700; }
        .vinv .r-band-num { font-size:9px; opacity:.95; margin-top:2px; }
        .vinv .r-addr-row { display:flex; gap:12px; margin-bottom:14px; }
        .vinv .r-box { flex:1; padding:10px; background:var(--accent-soft); border-radius:4px; }
        .vinv .r-box-label { font-size:7px; color:#888; font-weight:700; text-transform:uppercase; margin-bottom:3px; }
        .vinv .r-box-name { font-size:10px; font-weight:700; }
        .vinv .r-box-line { font-size:8px; color:#555; line-height:1.4; }
        .vinv .r-meta-row { display:flex; gap:8px; margin-bottom:14px; }
        .vinv .r-meta-box { flex:1; padding:8px; border:0.5px solid #ddd; border-radius:4px; }
        .vinv .r-meta-label { font-size:7px; color:#999; font-weight:700; margin-bottom:2px; }
        .vinv .r-meta-val { font-size:9px; font-weight:700; }
        .vinv .r-table { width:100%; border-collapse:collapse; border:0.5px solid #ccc; margin-bottom:10px; }
        .vinv .r-table th { padding:6px; font-size:8px; font-weight:700; text-align:left; }
        .vinv .r-table th.right, .vinv .r-table td.right { text-align:right; }
        .vinv .r-table td { padding:5px 6px; font-size:8px; border-bottom:0.5px solid #eee; }
        .vinv .r-table tr.alt td { background:#fafafa; }
        .vinv .r-table.hs-filled th { background:var(--accent); color:#fff; }
        .vinv .r-table.hs-grey th { background:#f0f0f0; }
        .vinv .r-table.hs-plain th { border-bottom:1.5px solid var(--accent); }
        .vinv .r-table tr.section td { background:var(--accent-soft); font-size:7px; font-weight:700; color:var(--accent); padding:4px 6px; text-transform:uppercase; }
        .vinv .r-totals { display:flex; justify-content:flex-end; margin-bottom:14px; }
        .vinv .r-tot-box { width:230px; }
        .vinv .r-tot-row { display:flex; justify-content:space-between; padding:5px; font-size:9px; border-bottom:0.5px solid #eee; }
        .vinv .r-grand { display:flex; justify-content:space-between; padding:7px; background:var(--accent); color:#fff; font-size:10px; font-weight:700; border-radius:0 0 4px 4px; }
        .vinv .r-bank { border-top:0.5px solid #ddd; padding-top:10px; margin-bottom:10px; }
        .vinv .r-bank-title { font-size:8px; font-weight:700; margin-bottom:5px; }
        .vinv .r-bank-tbl td { font-size:7px; padding:1.5px 0; }
        .vinv .r-bank-tbl td:first-child { color:#999; width:110px; }
        .vinv .r-bank-tbl td:last-child { font-weight:700; }
        .vinv .r-sign { display:flex; justify-content:flex-end; margin-top:16px; }
        .vinv .r-sign-box { width:150px; border-top:1px solid var(--accent); padding-top:4px; font-size:7px; color:#777; text-align:center; }
        @media print { .vinv .sheet { margin:0; box-shadow:none; width:100%; } }
      `}</style>
      <div className={`sheet${preview ? ' sheet--preview' : ''}`} style={sheetStyle}>
        {schema.blocks.map(b => <div key={b.id}>{renderBlock(b)}</div>)}
      </div>
    </div>
  )
}
