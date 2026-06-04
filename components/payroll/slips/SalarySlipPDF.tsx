import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

// Register LiberationSans — supports ₹ (U+20B9), professional look.
// Browser: fetch from the site's /fonts/ folder.
// Server (emailing slips): read from public/fonts on disk — the files are
// bundled into the serverless function via outputFileTracingIncludes in
// next.config.ts, so no network fetch (Vercel deployment URLs are
// auth-protected and would 401).
function fontSrc(file: string): string {
  if (typeof window !== 'undefined') return `${window.location.origin}/fonts/${file}`
  return `${process.cwd()}/public/fonts/${file}`
}

Font.register({
  family: 'LiberationSans',
  fonts: [
    { src: fontSrc('LiberationSans-Regular.ttf'), fontWeight: 'normal', fontStyle: 'normal' },
    { src: fontSrc('LiberationSans-Bold.ttf'),    fontWeight: 'bold',   fontStyle: 'normal' },
    { src: fontSrc('LiberationSans-Italic.ttf'),  fontWeight: 'normal', fontStyle: 'italic' },
  ],
})

interface Props {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName?: string | null
  companyAddress?: string | null
}

const s = StyleSheet.create({
  page:        { padding: 36, fontSize: 9, fontFamily: 'LiberationSans', color: '#1a1a1a' },
  header:      { borderBottomWidth: 2, borderBottomColor: '#1a1a1a', paddingBottom: 8, marginBottom: 10, alignItems: 'center' },
  company:     { fontSize: 14, fontFamily: 'LiberationSans', fontWeight: 'bold' },
  title:       { fontSize: 11, marginTop: 4 },
  subtitle:    { fontSize: 9, color: '#555', marginTop: 2 },
  grid2:       { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  gridItem:    { width: '50%', marginBottom: 4 },
  label:       { color: '#777' },
  value:       { fontFamily: 'LiberationSans', fontWeight: 'bold' },
  table:       { borderWidth: 1, borderColor: '#ccc', marginBottom: 8 },
  thead:       { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  trow:        { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  tlastrow:    { flexDirection: 'row' },
  th:          { flex: 1, padding: 4, fontFamily: 'LiberationSans', fontWeight: 'bold', fontSize: 8 },
  td:          { flex: 1, padding: 4 },
  tdRight:     { flex: 1, padding: 4, textAlign: 'right' },
  thRight:     { flex: 1, padding: 4, fontFamily: 'LiberationSans', fontWeight: 'bold', fontSize: 8, textAlign: 'right' },
  totalBox:    { borderWidth: 2, borderColor: '#1a1a1a', padding: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  netLabel:    { fontSize: 8, color: '#777' },
  netAmount:   { fontSize: 16, fontFamily: 'LiberationSans', fontWeight: 'bold' },
  netWords:    { fontSize: 7, color: '#555', marginTop: 3, fontStyle: 'italic' },
  bankSection: { borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 8, marginTop: 4 },
  sectionHdr:  { fontFamily: 'LiberationSans', fontWeight: 'bold', fontSize: 8, marginBottom: 4 },
  footer:      { marginTop: 16, borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:  { fontSize: 7, color: '#aaa' },
})

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December']

// Locale-free number formatter with Indian grouping (1,00,000)
function fmtInr(n: number): string {
  const [intPart, decPart] = n.toFixed(2).split('.')
  const int = parseInt(intPart, 10)
  let s = ''
  if (int >= 1000) {
    s = ',' + String(int).slice(-3)
    let rem = Math.floor(int / 1000)
    while (rem >= 100) {
      s = ',' + String(rem).slice(-2) + s
      rem = Math.floor(rem / 100)
    }
    s = String(rem) + s
  } else {
    s = String(int)
  }
  return s + '.' + decPart
}

// Safe date formatter — no locale dependency
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

// Format "2025-05" → "May 2025"
function fmtMonth(m: string): string {
  if (!m || !m.includes('-')) return m ?? ''
  const [year, month] = m.split('-')
  const idx = parseInt(month, 10) - 1
  if (idx < 0 || idx > 11) return m
  return `${MONTHS_LONG[idx]} ${year}`
}

function amountToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function below100(n: number): string {
    return n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  }
  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 100) return below100(n)
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + below100(n % 100) : '')
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '')
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
  }
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let words = convert(rupees) || 'Zero'
  words += ' Rupees'
  if (paise > 0) words += ' and ' + convert(paise) + ' Paise'
  return words + ' Only'
}

const gross = (e: PayrollEntry) =>
  Number(e.salary_inr) + Number(e.allowances) + Number(e.overtime) + Number(e.incentives)
const totalDeductions = (e: PayrollEntry) =>
  Number(e.deductions) + Number(e.advance)

export function SalarySlipDocument({ entry, month, employee, companyName, companyAddress }: Props) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.company}>{companyName ?? 'Company Name'}</Text>
          {companyAddress ? <Text style={s.subtitle}>{companyAddress}</Text> : null}
          <Text style={s.title}>SALARY SLIP</Text>
          <Text style={s.subtitle}>For the month of {fmtMonth(month.payroll_month)}</Text>
        </View>

        {/* Employee details */}
        <View style={s.grid2}>
          <View style={s.gridItem}><Text><Text style={s.label}>Employee Name: </Text><Text style={s.value}>{employee.name}</Text></Text></View>
          <View style={s.gridItem}><Text><Text style={s.label}>Employee ID: </Text><Text style={s.value}>{employee.employee_id}</Text></Text></View>
          <View style={s.gridItem}><Text><Text style={s.label}>Designation: </Text><Text style={s.value}>{employee.designation ?? '—'}</Text></Text></View>
          {month.payment_date ? <View style={s.gridItem}><Text><Text style={s.label}>Date of Payment: </Text><Text style={s.value}>{fmtDate(month.payment_date)}</Text></Text></View> : null}
          {employee.pan_number ? <View style={s.gridItem}><Text><Text style={s.label}>PAN: </Text><Text style={s.value}>{employee.pan_number}</Text></Text></View> : null}
        </View>

        {/* Earnings / Deductions table */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={s.th}>EARNINGS</Text>
            <Text style={s.thRight}>AMOUNT (Rs.)</Text>
            <Text style={s.th}>DEDUCTIONS</Text>
            <Text style={s.thRight}>AMOUNT (Rs.)</Text>
          </View>
          <View style={s.trow}>
            <Text style={s.td}>Basic Salary</Text>
            <Text style={s.tdRight}>{fmtInr(Number(entry.salary_inr))}</Text>
            <Text style={s.td}>Deductions</Text>
            <Text style={s.tdRight}>{Number(entry.deductions) > 0 ? fmtInr(Number(entry.deductions)) : '—'}</Text>
          </View>
          <View style={s.trow}>
            <Text style={s.td}>Allowances</Text>
            <Text style={s.tdRight}>{Number(entry.allowances) > 0 ? fmtInr(Number(entry.allowances)) : '—'}</Text>
            <Text style={s.td}>Advance Recovery</Text>
            <Text style={s.tdRight}>{Number(entry.advance) > 0 ? fmtInr(Number(entry.advance)) : '—'}</Text>
          </View>
          <View style={s.trow}>
            <Text style={s.td}>Overtime</Text>
            <Text style={s.tdRight}>{Number(entry.overtime) > 0 ? fmtInr(Number(entry.overtime)) : '—'}</Text>
            <Text style={s.td}></Text>
            <Text style={s.tdRight}></Text>
          </View>
          <View style={s.tlastrow}>
            <Text style={s.td}>Incentives</Text>
            <Text style={s.tdRight}>{Number(entry.incentives) > 0 ? fmtInr(Number(entry.incentives)) : '—'}</Text>
            <Text style={s.td}></Text>
            <Text style={s.tdRight}></Text>
          </View>
          <View style={[s.trow, { backgroundColor: '#f8f8f8' }]}>
            <Text style={[s.td, { fontFamily: 'LiberationSans', fontWeight: 'bold' }]}>Gross Earnings</Text>
            <Text style={[s.tdRight, { fontFamily: 'LiberationSans', fontWeight: 'bold' }]}>{fmtInr(gross(entry))}</Text>
            <Text style={[s.td, { fontFamily: 'LiberationSans', fontWeight: 'bold' }]}>Total Deductions</Text>
            <Text style={[s.tdRight, { fontFamily: 'LiberationSans', fontWeight: 'bold' }]}>{fmtInr(totalDeductions(entry))}</Text>
          </View>
        </View>

        {/* Net payable */}
        <View style={s.totalBox}>
          <View>
            <Text style={s.netLabel}>Net Salary Payable</Text>
            <Text style={s.netAmount}>Rs. {fmtInr(Number(entry.final_payable))}</Text>
            <Text style={s.netWords}>{amountToWords(Number(entry.final_payable))}</Text>
          </View>
          {Number(entry.expended_rate) > 0 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 8, color: '#666' }}>Salary (EUR): {fmtInr(Number(entry.salary_euro))} EUR</Text>
              <Text style={{ fontSize: 8, color: '#666' }}>Exchange Rate: Rs. {fmtInr(Number(entry.expended_rate))} / EUR</Text>
            </View>
          ) : null}
        </View>

        {/* Bank details */}
        {(employee.bank_name || employee.account_number) ? (
          <View style={s.bankSection}>
            <Text style={s.sectionHdr}>Bank Transfer Details</Text>
            <View style={s.grid2}>
              {employee.bank_name ? <View style={s.gridItem}><Text><Text style={s.label}>Bank: </Text>{employee.bank_name}</Text></View> : null}
              {employee.account_number ? <View style={s.gridItem}><Text><Text style={s.label}>Account: </Text>{employee.account_number}</Text></View> : null}
              {employee.ifsc ? <View style={s.gridItem}><Text><Text style={s.label}>IFSC: </Text>{employee.ifsc}</Text></View> : null}
              {employee.branch ? <View style={s.gridItem}><Text><Text style={s.label}>Branch: </Text>{employee.branch}</Text></View> : null}
            </View>
          </View>
        ) : null}

        {entry.notes ? (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 8, color: '#555' }}><Text style={{ fontFamily: 'LiberationSans', fontWeight: 'bold' }}>Note: </Text>{entry.notes}</Text>
          </View>
        ) : null}

        <View style={s.footer}>
          <Text style={s.footerText}>This is a computer-generated salary slip.</Text>
          <Text style={s.footerText}>{companyName ?? ''}</Text>
        </View>
      </Page>
    </Document>
  )
}
