'use client'

import { amountToWords } from '@/lib/recoverables/invoices/words'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'

interface InvoiceSettings {
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
  hsn_sac: string | null
}

interface Props {
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  settings: InvoiceSettings | null
}

function fmtInr(n: number, dp = 2) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  // Convert ISO yyyy-mm-dd back to dd/mm/yy for display
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(2)}`
  return d
}

function fmtDateLong(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const paymentTermsLabel: Record<string, string> = {
  net_7: 'Net 7', net_15: 'Net 15', net_30: 'Net 30',
  net_60: 'Net 60', net_90: 'Net 90', due_on_receipt: 'Due on Receipt',
}

export default function InvoicePrintView({ invoice, lines, settings }: Props) {
  const companyName  = settings?.company_name  ?? 'Your Company'
  const balanceDue   = invoice.balance_due
  const termsLabel   = paymentTermsLabel[invoice.payment_terms ?? ''] ?? (invoice.payment_terms ?? '—')

  const stateDisplay = invoice.customer_state
    ? invoice.customer_state
    : null

  return (
    <>
      {/* Print + screen styles — inline so the page is self-contained */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }

        .print-btn {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 100;
          background: #1d4ed8;
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .print-btn:hover { background: #1e40af; }

        .sheet {
          background: #fff;
          width: 210mm;
          min-height: 297mm;
          margin: 32px auto;
          padding: 12mm 14mm;
          box-shadow: 0 4px 24px rgba(0,0,0,.15);
          color: #000;
          font-size: 11px;
          line-height: 1.4;
        }

        /* ── Header ── */
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .company-name { font-size: 20px; font-weight: 700; }
        .tax-invoice-block { text-align: right; }
        .tax-invoice-block h2 { font-size: 16px; font-weight: 700; margin: 0 0 2px; }
        .invoice-number { font-size: 13px; font-weight: 600; color: #374151; }

        /* ── Sub-header (company info + balance due) ── */
        .subheader { display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0 8px; border-top: 1px solid #000; border-bottom: 1px solid #000; margin-bottom: 10px; }
        .company-info { font-size: 10.5px; line-height: 1.5; }
        .balance-block { text-align: right; }
        .balance-label { font-size: 10px; color: #6b7280; margin-bottom: 2px; }
        .balance-amount { font-size: 22px; font-weight: 700; }

        /* ── Bill To / metadata row ── */
        .parties-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
        .bill-to-block { flex: 1; }
        .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 3px; }
        .customer-name { font-size: 13px; font-weight: 700; }
        .customer-address { font-size: 10px; color: #374151; margin-top: 2px; white-space: pre-wrap; }
        .customer-gstin { font-size: 10px; margin-top: 3px; }

        .meta-table { font-size: 10.5px; border-collapse: collapse; }
        .meta-table td { padding: 2px 4px; }
        .meta-table td:first-child { color: #6b7280; white-space: nowrap; padding-right: 12px; }
        .meta-table td:last-child { font-weight: 600; text-align: right; }

        /* ── Supply line ── */
        .supply-line { font-size: 10.5px; margin-bottom: 10px; padding: 4px 0; border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }

        /* ── Line items table ── */
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 10.5px; }
        .items-table th { background: #f3f4f6; font-weight: 700; padding: 5px 6px; text-align: left; border: 1px solid #d1d5db; }
        .items-table th.right, .items-table td.right { text-align: right; }
        .items-table td { padding: 4px 6px; border: 1px solid #d1d5db; vertical-align: top; }
        .items-table tr:nth-child(even) td { background: #f9fafb; }
        .awb-cell { font-family: monospace; font-size: 9.5px; color: #374151; }

        /* ── Totals ── */
        .totals-section { display: flex; justify-content: flex-end; margin-top: 0; border-left: 1px solid #d1d5db; border-right: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }
        .totals-table { font-size: 10.5px; border-collapse: collapse; min-width: 200px; }
        .totals-table td { padding: 3px 8px; }
        .totals-table td:first-child { color: #374151; }
        .totals-table td:last-child { text-align: right; font-weight: 500; min-width: 80px; }
        .totals-table tr.total-row td { font-weight: 700; font-size: 12px; border-top: 1px solid #000; padding-top: 5px; }
        .totals-table tr.balance-row td { font-weight: 700; font-size: 14px; }

        /* ── Words row ── */
        .words-row { border: 1px solid #d1d5db; border-top: none; padding: 5px 8px; font-size: 10px; }
        .words-row span { font-weight: 600; }

        /* ── Bank + terms ── */
        .footer-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px; gap: 16px; }
        .bank-block { flex: 1; }
        .bank-block h4, .terms-block h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 0 0 4px; }
        .bank-table { font-size: 10.5px; border-collapse: collapse; }
        .bank-table td { padding: 1.5px 0; }
        .bank-table td:first-child { color: #6b7280; min-width: 110px; }
        .terms-block { flex: 1; font-size: 10px; line-height: 1.5; white-space: pre-wrap; }

        /* ── Signature ── */
        .signature-block { margin-top: 24px; text-align: right; font-size: 10.5px; }
        .signature-block .for { font-weight: 700; }
        .signature-block .sig-lines { margin-top: 36px; color: #6b7280; }

        @media print {
          .print-btn { display: none !important; }
          body { background: #fff; }
          .sheet { margin: 0; box-shadow: none; width: 100%; padding: 10mm 12mm; }
        }
      `}</style>

      <button className="print-btn" onClick={() => window.print()}>
        Print / Download PDF
      </button>

      <div className="sheet">

        {/* 1 — Header */}
        <div className="header">
          <img src="/Contrast.png" alt={companyName} style={{ height: '1.5cm', width: 'auto', display: 'block' }} />
          <div className="tax-invoice-block">
            <h2>Tax Invoice</h2>
            <div className="invoice-number"># {invoice.invoice_number}</div>
          </div>
        </div>

        {/* 2 — Company info + Balance Due */}
        <div className="subheader">
          <div className="company-info">
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{companyName}</div>
            {settings?.company_address && <div style={{ whiteSpace: 'pre-wrap' }}>{settings.company_address}</div>}
            {settings?.company_gstin   && <div>GSTIN: {settings.company_gstin}</div>}
            {settings?.company_phone   && <div>Phone: {settings.company_phone}</div>}
            {settings?.company_email   && <div>Email: {settings.company_email}</div>}
          </div>
          <div className="balance-block">
            <div className="balance-label">Balance Due</div>
            <div className="balance-amount">₹{fmtInr(balanceDue)}</div>
          </div>
        </div>

        {/* 3 + 4 — Bill To + metadata */}
        <div className="parties-row">
          <div className="bill-to-block">
            <div className="section-label">Bill To</div>
            <div className="customer-name">{invoice.customer_name}</div>
            {invoice.customer_address && (
              <div className="customer-address">{invoice.customer_address}</div>
            )}
            {invoice.customer_gstin && (
              <div className="customer-gstin">GSTIN: {invoice.customer_gstin}</div>
            )}
          </div>
          <table className="meta-table">
            <tbody>
              <tr>
                <td>Invoice Date</td>
                <td>{fmtDateLong(invoice.invoice_date)}</td>
              </tr>
              <tr>
                <td>Terms</td>
                <td>{termsLabel}</td>
              </tr>
              <tr>
                <td>Due Date</td>
                <td>{fmtDateLong(invoice.due_date)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 5 + 6 — GSTIN / Place of supply */}
        {(invoice.customer_gstin || stateDisplay) && (
          <div className="supply-line">
            {invoice.customer_gstin && <span>Ship To GSTIN: {invoice.customer_gstin}&nbsp;&nbsp;</span>}
            {stateDisplay && <span>Place Of Supply: {stateDisplay}</span>}
          </div>
        )}

        {/* 7 — Line items */}
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: '28px' }}>#</th>
              <th>Item &amp; Description</th>
              <th style={{ width: '52px' }}>HSN/SAC</th>
              <th className="right" style={{ width: '36px' }}>Qty</th>
              <th className="right" style={{ width: '62px' }}>Rate</th>
              <th className="right" style={{ width: '64px' }}>CGST</th>
              <th className="right" style={{ width: '64px' }}>SGST</th>
              <th className="right" style={{ width: '72px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.id}>
                <td>{line.line_number}</td>
                <td>
                  <div>{fmtDate(line.shipment_date)}</div>
                  {line.client_name && (
                    <div style={{ fontWeight: 600 }}>{line.client_name}</div>
                  )}
                  <div className="awb-cell">{line.awb}</div>
                </td>
                <td>{line.hsn_sac ?? settings?.hsn_sac ?? '996812'}</td>
                <td className="right">{line.qty}</td>
                <td className="right">{fmtInr(line.rate, 2)}</td>
                <td className="right">
                  <div>{fmtInr(line.qty > 0 ? line.cgst_amount / line.qty : 0)}</div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>{line.cgst_rate}%</div>
                </td>
                <td className="right">
                  <div>{fmtInr(line.qty > 0 ? line.sgst_amount / line.qty : 0)}</div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>{line.sgst_rate}%</div>
                </td>
                <td className="right">{fmtInr(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 8 — Totals */}
        <div className="totals-section">
          <table className="totals-table">
            <tbody>
              <tr>
                <td>Sub Total</td>
                <td>{fmtInr(invoice.subtotal)}</td>
              </tr>
              <tr>
                <td>CGST ({invoice.cgst_rate}%)</td>
                <td>{fmtInr(invoice.cgst_amount)}</td>
              </tr>
              <tr>
                <td>SGST ({invoice.sgst_rate}%)</td>
                <td>{fmtInr(invoice.sgst_amount)}</td>
              </tr>
              <tr className="total-row">
                <td>Total</td>
                <td>₹{fmtInr(invoice.total)}</td>
              </tr>
              <tr className="balance-row">
                <td>Balance Due</td>
                <td>₹{fmtInr(balanceDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 9 — Amount in words */}
        <div className="words-row">
          Total In Words: <span>{amountToWords(invoice.total, invoice.currency ?? 'INR')}</span>
        </div>

        {/* 10 + 11 — Bank details + Terms */}
        {(settings?.bank_account_number || settings?.terms_conditions) && (
          <div className="footer-row">
            {settings?.bank_account_number && (
              <div className="bank-block">
                <h4>Bank Details</h4>
                <table className="bank-table">
                  <tbody>
                    {settings.bank_account_name   && <tr><td>Account Name</td><td>{settings.bank_account_name}</td></tr>}
                    {settings.bank_account_number && <tr><td>Account Number</td><td>{settings.bank_account_number}</td></tr>}
                    {settings.bank_ifsc           && <tr><td>IFSC Code</td><td>{settings.bank_ifsc}</td></tr>}
                    {settings.bank_name           && <tr><td>Bank Name</td><td>{settings.bank_name}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {settings?.terms_conditions && (
              <div className="terms-block">
                <h4>Terms &amp; Conditions</h4>
                {settings.terms_conditions}
              </div>
            )}
          </div>
        )}

        {/* 12 — Signature */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <div style={{ textAlign: 'right' }}>
            <img src="/signedcopy.png" alt="Authorised Signature" style={{ height: '3cm', width: 'auto', display: 'block', marginLeft: 'auto' }} />
            <div style={{ fontSize: '10.5px', marginTop: '4px' }}>Authorised Signature</div>
          </div>
        </div>

      </div>
    </>
  )
}
