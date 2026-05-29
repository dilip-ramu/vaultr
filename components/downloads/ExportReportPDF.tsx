import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

const origin = typeof window !== 'undefined' ? window.location.origin : ''
Font.register({
  family: 'LiberationSans',
  fonts: [
    { src: `${origin}/fonts/LiberationSans-Regular.ttf`, fontWeight: 'normal' },
    { src: `${origin}/fonts/LiberationSans-Bold.ttf`,    fontWeight: 'bold' },
  ],
})

const s = StyleSheet.create({
  page:        { padding: 36, fontSize: 8, fontFamily: 'LiberationSans', color: '#1a1a1a', backgroundColor: '#fff' },
  cover:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  coverTitle:  { fontSize: 24, fontWeight: 'bold', color: '#1a1a2e', marginBottom: 4 },
  coverSub:    { fontSize: 11, color: '#555' },
  coverMeta:   { fontSize: 9, color: '#888', marginTop: 12 },
  coverBox:    { marginTop: 20, padding: 16, backgroundColor: '#f8f8f8', borderRadius: 4, width: 300, alignItems: 'center' },
  coverDate:   { fontSize: 13, fontWeight: 'bold', color: '#1a1a2e' },
  sectionHead: { backgroundColor: '#1a1a2e', padding: 10, marginBottom: 6, borderRadius: 3 },
  sectionTitle:{ fontSize: 12, fontWeight: 'bold', color: '#fff' },
  sectionCount:{ fontSize: 8, color: '#aab', marginTop: 2 },
  thead:       { flexDirection: 'row', backgroundColor: '#e8eaf6', marginBottom: 1 },
  th:          { padding: '4 6', fontSize: 7, fontWeight: 'bold', color: '#333' },
  trow:        { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  trowAlt:     { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee', backgroundColor: '#fafafa' },
  td:          { padding: '3 6', fontSize: 7.5, color: '#222' },
  tdR:         { padding: '3 6', fontSize: 7.5, color: '#222', textAlign: 'right' },
  totalRow:    { flexDirection: 'row', justifyContent: 'flex-end', padding: '5 6', borderTopWidth: 1, borderTopColor: '#ccc', marginTop: 4 },
  totalLabel:  { fontSize: 8, fontWeight: 'bold', marginRight: 8 },
  totalVal:    { fontSize: 8, fontWeight: 'bold', color: '#1a1a2e' },
  noData:      { padding: 12, fontSize: 8, color: '#999', fontStyle: 'italic' },
  divider:     { marginVertical: 10, borderTopWidth: 0.5, borderTopColor: '#ddd' },
  pageNum:     { position: 'absolute', bottom: 16, right: 36, fontSize: 7, color: '#bbb' },
})

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return d.split('T')[0]
}
function fmtAmt(n: number | null | undefined, prefix = '') {
  if (n == null) return '—'
  return `${prefix}${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function col(flex: number) { return { flex } }

// ── Cover ────────────────────────────────────────────────────────────────────
function CoverPage({ meta }: { meta: { from: string; to: string; exported_at: string } }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.cover}>
        <Text style={s.coverTitle}>INEX Financial Export</Text>
        <Text style={s.coverSub}>Full data backup — all modules</Text>
        <View style={s.coverBox}>
          <Text style={{ fontSize: 8, color: '#888', marginBottom: 4 }}>DATE RANGE</Text>
          <Text style={s.coverDate}>{meta.from}  →  {meta.to}</Text>
        </View>
        <Text style={s.coverMeta}>Exported on {meta.exported_at.replace('T', ' ').split('.')[0]} UTC</Text>
        <Text style={[s.coverMeta, { marginTop: 4 }]}>
          Sections: Transactions · Accounts · Recoverable Invoices · Supplier Invoices ·{'\n'}
          Contrast Expenses · Contrast Invoices · Payroll · Staff · Bills
        </Text>
      </View>
      <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
    </Page>
  )
}

// ── Generic table section ─────────────────────────────────────────────────────
type ColDef = { label: string; flex: number; align?: 'right' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TableSection({ title, cols, rows }: { title: string; cols: ColDef[]; rows: (string | number | null)[][] }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionCount}>{rows.length} record{rows.length !== 1 ? 's' : ''}</Text>
      </View>
      {rows.length === 0 ? (
        <Text style={s.noData}>No records in this date range.</Text>
      ) : (
        <>
          <View style={s.thead}>
            {cols.map((c, i) => (
              <Text key={i} style={[s.th, col(c.flex), c.align === 'right' ? { textAlign: 'right' } : {}]}>
                {c.label}
              </Text>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={ri % 2 === 0 ? s.trow : s.trowAlt}>
              {cols.map((c, ci) => (
                <Text key={ci} style={[c.align === 'right' ? s.tdR : s.td, col(c.flex)]}>
                  {row[ci] == null ? '—' : String(row[ci])}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
      <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
    </Page>
  )
}

// ── Main document ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ExportReportPDF({ data }: { data: Record<string, any> }) {
  const { transactions = [], accounts = [], recoverable_invoices = [], supplier_invoices = [],
    contrast_expenses = [], contrast_invoices = [], payroll_entries = [], staff = [], bills = [], meta } = data

  return (
    <Document title="INEX Financial Export" author="INEX">
      <CoverPage meta={meta} />

      {/* Transactions */}
      <TableSection
        title="Transactions"
        cols={[
          { label: 'Date',        flex: 1.2 },
          { label: 'Type',        flex: 0.8 },
          { label: 'Description', flex: 3 },
          { label: 'Category',    flex: 1.5 },
          { label: 'Payee',       flex: 1.5 },
          { label: 'Account',     flex: 1.5 },
          { label: 'Amount',      flex: 1.2, align: 'right' },
        ]}
        rows={transactions.map((t: never & { date: string; type: string; name: string; category?: { name: string }; payee?: { name: string }; account?: { name: string }; amount: number; currency: string }) => [
          fmtDate(t.date),
          t.type,
          t.name ?? '—',
          t.category?.name ?? '—',
          t.payee?.name ?? '—',
          t.account?.name ?? '—',
          fmtAmt(t.amount, t.currency === 'INR' ? 'Rs.' : (t.currency + ' ')),
        ])}
      />

      {/* Bank Accounts */}
      <TableSection
        title="Bank Accounts"
        cols={[
          { label: 'Account Name',   flex: 2 },
          { label: 'Type',           flex: 1 },
          { label: 'Currency',       flex: 0.8 },
          { label: 'Account No.',    flex: 1.8 },
          { label: 'Bank',           flex: 2 },
          { label: 'Balance',        flex: 1.2, align: 'right' },
          { label: 'Active',         flex: 0.7 },
        ]}
        rows={accounts.map((a: never & { name: string; type: string; currency: string; account_number: string | null; bank_name: string | null; balance: number; is_active: boolean }) => [
          a.name,
          a.type,
          a.currency ?? 'INR',
          a.account_number ?? '—',
          a.bank_name ?? '—',
          fmtAmt(a.balance),
          a.is_active ? 'Yes' : 'No',
        ])}
      />

      {/* Recoverable Invoices */}
      <TableSection
        title="Recoverable Invoices (Customer)"
        cols={[
          { label: 'Invoice No.',  flex: 1.5 },
          { label: 'Customer',     flex: 2 },
          { label: 'Date',         flex: 1.2 },
          { label: 'Due Date',     flex: 1.2 },
          { label: 'Total',        flex: 1.2, align: 'right' },
          { label: 'Status',       flex: 1 },
          { label: 'Notes',        flex: 2 },
        ]}
        rows={recoverable_invoices.map((inv: never & { invoice_number: string; customer_name: string; invoice_date: string; due_date: string | null; total: number; status: string; notes: string | null }) => [
          inv.invoice_number,
          inv.customer_name,
          fmtDate(inv.invoice_date),
          fmtDate(inv.due_date),
          fmtAmt(inv.total, 'Rs.'),
          inv.status,
          inv.notes ?? '',
        ])}
      />

      {/* Supplier Invoices */}
      <TableSection
        title="Supplier Invoices"
        cols={[
          { label: 'Invoice No.',  flex: 1.5 },
          { label: 'Supplier',     flex: 2 },
          { label: 'Date',         flex: 1.2 },
          { label: 'Due Date',     flex: 1.2 },
          { label: 'Total',        flex: 1.2, align: 'right' },
          { label: 'Category',     flex: 1.5 },
          { label: 'Status',       flex: 1 },
        ]}
        rows={supplier_invoices.map((inv: never & { invoice_number: string; supplier?: { name: string }; invoice_date: string; due_date: string | null; total_amount: number; category: string | null; status: string }) => [
          inv.invoice_number,
          inv.supplier?.name ?? '—',
          fmtDate(inv.invoice_date),
          fmtDate(inv.due_date),
          fmtAmt(inv.total_amount, 'Rs.'),
          inv.category ?? '—',
          inv.status,
        ])}
      />

      {/* Contrast Expenses */}
      <TableSection
        title="Contrast Expenses"
        cols={[
          { label: 'Date',             flex: 1.2 },
          { label: 'Description',      flex: 3 },
          { label: 'Category',         flex: 1.5 },
          { label: 'Billing Category', flex: 2 },
          { label: 'Amount (INR)',      flex: 1.5, align: 'right' },
          { label: 'Notes',            flex: 2 },
        ]}
        rows={contrast_expenses.map((e: never & { date: string; name: string; category?: { name: string }; billing_category?: { name: string }; amount: number; notes: string | null }) => [
          fmtDate(e.date),
          e.name ?? '—',
          e.category?.name ?? '—',
          e.billing_category?.name ?? '—',
          fmtAmt(e.amount, 'Rs.'),
          e.notes ?? '',
        ])}
      />

      {/* Contrast Invoices */}
      <TableSection
        title="Contrast Invoices (Proforma)"
        cols={[
          { label: 'Invoice No.',  flex: 1.5 },
          { label: 'Month',        flex: 1.2 },
          { label: 'Date',         flex: 1.2 },
          { label: 'Subtotal',     flex: 1.2, align: 'right' },
          { label: 'GST (18%)',    flex: 1.2, align: 'right' },
          { label: 'Total',        flex: 1.2, align: 'right' },
          { label: 'Status',       flex: 1 },
        ]}
        rows={contrast_invoices.map((inv: never & { invoice_number: string; invoice_month: string; invoice_date: string; subtotal: number; gst_amount: number; total: number; status: string }) => [
          inv.invoice_number,
          inv.invoice_month,
          fmtDate(inv.invoice_date),
          fmtAmt(inv.subtotal, 'EUR '),
          fmtAmt(inv.gst_amount, 'EUR '),
          fmtAmt(inv.total, 'EUR '),
          inv.status,
        ])}
      />

      {/* Payroll */}
      <TableSection
        title="Payroll Entries"
        cols={[
          { label: 'Month',      flex: 1.2 },
          { label: 'Employee',   flex: 2 },
          { label: 'Salary EUR', flex: 1.2, align: 'right' },
          { label: 'Rate',       flex: 1, align: 'right' },
          { label: 'Salary INR', flex: 1.5, align: 'right' },
          { label: 'Adj.',       flex: 1, align: 'right' },
          { label: 'Net',        flex: 1.5, align: 'right' },
          { label: 'Paid',       flex: 0.7 },
        ]}
        rows={payroll_entries.map((e: never & { salary_euro: number; expended_rate: number; salary_inr: number; allowances: number; overtime: number; incentives: number; deductions: number; advance: number; final_payable: number; employee?: { name: string }; payroll_month?: { payroll_month: string; is_paid: boolean } }) => {
          const adj = (Number(e.allowances) + Number(e.overtime) + Number(e.incentives)) - (Number(e.deductions) + Number(e.advance))
          return [
            e.payroll_month?.payroll_month ?? '—',
            e.employee?.name ?? '—',
            fmtAmt(e.salary_euro, 'EUR '),
            e.expended_rate ? Number(e.expended_rate).toFixed(2) : '—',
            fmtAmt(e.salary_inr, 'Rs.'),
            adj >= 0 ? `+${fmtAmt(adj)}` : fmtAmt(adj),
            fmtAmt(e.final_payable, 'Rs.'),
            e.payroll_month?.is_paid ? 'Yes' : 'No',
          ]
        })}
      />

      {/* Staff */}
      <TableSection
        title="Staff Particulars"
        cols={[
          { label: 'Name',          flex: 2 },
          { label: 'Employee ID',   flex: 1.2 },
          { label: 'Designation',   flex: 1.8 },
          { label: 'Salary (EUR)',  flex: 1.2, align: 'right' },
          { label: 'Bank',          flex: 1.8 },
          { label: 'Account No.',   flex: 1.8 },
          { label: 'IFSC',          flex: 1.2 },
          { label: 'Active',        flex: 0.7 },
        ]}
        rows={staff.map((emp: never & { name: string; employee_id: string; designation: string | null; salary_euro: number; bank_name: string | null; account_number: string | null; ifsc: string | null; is_active: boolean }) => [
          emp.name,
          emp.employee_id,
          emp.designation ?? '—',
          fmtAmt(emp.salary_euro, 'EUR '),
          emp.bank_name ?? '—',
          emp.account_number ?? '—',
          emp.ifsc ?? '—',
          emp.is_active ? 'Yes' : 'No',
        ])}
      />

      {/* Bills */}
      <TableSection
        title="Bills & Subscriptions"
        cols={[
          { label: 'Name',       flex: 2.5 },
          { label: 'Direction',  flex: 1 },
          { label: 'Frequency',  flex: 1 },
          { label: 'Due Date',   flex: 1.2 },
          { label: 'Amount',     flex: 1.2, align: 'right' },
          { label: 'Status',     flex: 1 },
          { label: 'Notes',      flex: 2 },
        ]}
        rows={bills.map((b: never & { name: string; direction: string; frequency: string | null; due_date: string | null; amount: number; currency: string; status: string; notes: string | null }) => [
          b.name,
          b.direction,
          b.frequency ?? '—',
          fmtDate(b.due_date),
          fmtAmt(b.amount, (b.currency ?? 'INR') === 'INR' ? 'Rs.' : b.currency + ' '),
          b.status,
          b.notes ?? '',
        ])}
      />
    </Document>
  )
}
