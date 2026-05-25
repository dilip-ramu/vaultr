import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles } from './pdf-styles'
import type { SupplierInvoice, SupplierInvoiceLine } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'

function fmt(amount: number, currency = 'INR'): string {
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `
  const [int, dec] = amount.toFixed(2).split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sym}${intFormatted}.${dec}`
}

interface Props {
  invoice: SupplierInvoice & { customer: Customer; lines: SupplierInvoiceLine[] }
  companyName?: string
  companyAddress?: string
}

export default function SupplierInvoicePDF({
  invoice,
  companyName = 'Your Company',
  companyAddress = '',
}: Props) {
  const { customer, lines } = invoice
  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Document
      title={invoice.invoice_number}
      author={companyName}
      subject="Supplier Invoice"
    >
      <Page size="A4" style={styles.page}>

        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logoText}>VAULTR</Text>
            {companyName !== 'Your Company' && (
              <Text style={styles.companyName}>{companyName}</Text>
            )}
            {companyAddress ? (
              <Text style={styles.companyAddress}>{companyAddress}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>Invoice No:  </Text>
              <Text style={styles.invoiceMetaValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>Date:  </Text>
              <Text style={styles.invoiceMetaValue}>{invoice.invoice_date}</Text>
            </View>
            {invoice.due_date ? (
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Due:  </Text>
                <Text style={styles.invoiceMetaValue}>{invoice.due_date}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Bill To ─────────────────────────────────────────── */}
        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>Bill To</Text>
          <Text style={styles.billToName}>{customer.name}</Text>
          {customer.address ? (
            <Text style={styles.billToDetail}>{customer.address}</Text>
          ) : null}
          {customer.gst_number ? (
            <Text style={styles.billToDetail}>GST: {customer.gst_number}</Text>
          ) : null}
          {customer.email ? (
            <Text style={styles.billToDetail}>{customer.email}</Text>
          ) : null}
        </View>

        {/* ── Line Items ──────────────────────────────────────── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colNum]}>#</Text>
            <Text style={[styles.tableHeaderCell, styles.colAWB]}>AWB</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colPCS]}>PCS</Text>
            <Text style={[styles.tableHeaderCell, styles.colDest]}>Destination</Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>Amount</Text>
          </View>
          {lines.map((line, i) => (
            <View key={line.id} style={i % 2 === 0 ? styles.tableRowOdd : styles.tableRowEven}>
              <Text style={[styles.tableCellMuted, styles.colNum]}>{i + 1}</Text>
              <Text style={[styles.tableCell, styles.colAWB]}>{line.awb_number ?? '—'}</Text>
              <Text style={[styles.tableCell, styles.colDesc]}>{line.description}</Text>
              <Text style={[styles.tableCellMuted, styles.colPCS]}>{line.pieces ?? '—'}</Text>
              <Text style={[styles.tableCellMuted, styles.colDest]}>{line.destination ?? '—'}</Text>
              <Text style={[styles.tableCell, styles.colAmount]}>
                {fmt(line.line_total, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Totals ──────────────────────────────────────────── */}
        <View style={styles.totalsWrapper}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmt(invoice.subtotal, invoice.currency)}</Text>
          </View>
          {invoice.tax_amount > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {invoice.tax_rate ? `GST (${invoice.tax_rate}%)` : 'Tax'}
              </Text>
              <Text style={styles.totalsValue}>{fmt(invoice.tax_amount, invoice.currency)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsDivider} />
          <View style={styles.totalsFinalRow}>
            <Text style={styles.totalsFinalLabel}>Total</Text>
            <Text style={styles.totalsFinalValue}>{fmt(invoice.total_amount, invoice.currency)}</Text>
          </View>
        </View>

        {/* ── Notes / Payment Terms ───────────────────────────── */}
        {(invoice.payment_terms || invoice.notes) ? (
          <View style={styles.notesSection}>
            {invoice.payment_terms ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.notesLabel}>Payment Terms</Text>
                <Text style={styles.notesText}>{invoice.payment_terms}</Text>
              </View>
            ) : null}
            {invoice.notes ? (
              <View>
                <Text style={styles.notesLabel}>Notes</Text>
                <Text style={styles.notesText}>{invoice.notes}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Footer (fixed on every page) ────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated by Vaultr  •  {generatedDate}</Text>
          <Text style={styles.footerText}>{invoice.invoice_number}</Text>
        </View>

      </Page>
    </Document>
  )
}
