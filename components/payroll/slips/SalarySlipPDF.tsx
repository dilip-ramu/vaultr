import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

interface Props {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName?: string | null
  companyAddress?: string | null
}

const s = StyleSheet.create({
  page:        { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#1a1a1a' },
  header:      { borderBottomWidth: 2, borderBottomColor: '#1a1a1a', paddingBottom: 8, marginBottom: 10, alignItems: 'center' },
  company:     { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  title:       { fontSize: 11, marginTop: 4 },
  subtitle:    { fontSize: 9, color: '#555', marginTop: 2 },
  grid2:       { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  gridItem:    { width: '50%', marginBottom: 4 },
  label:       { color: '#777' },
  value:       { fontFamily: 'Helvetica-Bold' },
  table:       { borderWidth: 1, borderColor: '#ccc', marginBottom: 8 },
  thead:       { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#ccc' },
  trow:        { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  tlastrow:    { flexDirection: 'row' },
  th:          { flex: 1, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  td:          { flex: 1, padding: 4 },
  tdRight:     { flex: 1, padding: 4, textAlign: 'right' },
  thRight:     { flex: 1, padding: 4, fontFamily: 'Helvetica-Bold', fontSize: 8, textAlign: 'right' },
  totalBox:    { borderWidth: 2, borderColor: '#1a1a1a', padding: 10, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  netLabel:    { fontSize: 8, color: '#777' },
  netAmount:   { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  netWords:    { fontSize: 7, color: '#555', marginTop: 3, fontStyle: 'italic' },
  bankSection: { borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 8, marginTop: 4 },
  sectionHdr:  { fontFamily: 'Helvetica-Bold', fontSize: 8, marginBottom: 4 },
  footer:      { marginTop: 16, borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText:  { fontSize: 7, color: '#aaa' },
})

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMonth(m: string) {
  const [year, month] = m.split('-')
  return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
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
          <View style={s.gridItem}><Text><Text style={s.label}>Date of Joining: </Text><Text style={s.value}>{fmtDate(employee.joining_date)}</Text></Text></View>
          {employee.pan_number ? <View style={s.gridItem}><Text><Text style={s.label}>PAN: </Text><Text style={s.value}>{employee.pan_number}</Text></Text></View> : null}
          {month.payment_date ? <View style={s.gridItem}><Text><Text style={s.label}>Payment Date: </Text><Text style={s.value}>{fmtDate(month.payment_date)}</Text></Text></View> : null}
        </View>

        {/* Earnings / Deductions table */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={s.th}>EARNINGS</Text>
            <Text style={s.thRight}>AMOUNT (₹)</Text>
            <Text style={s.th}>DEDUCTIONS</Text>
            <Text style={s.thRight}>AMOUNT (₹)</Text>
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
            <Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>Gross Earnings</Text>
            <Text style={[s.tdRight, { fontFamily: 'Helvetica-Bold' }]}>{fmtInr(gross(entry))}</Text>
            <Text style={[s.td, { fontFamily: 'Helvetica-Bold' }]}>Total Deductions</Text>
            <Text style={[s.tdRight, { fontFamily: 'Helvetica-Bold' }]}>{fmtInr(totalDeductions(entry))}</Text>
          </View>
        </View>

        {/* Net payable */}
        <View style={s.totalBox}>
          <View>
            <Text style={s.netLabel}>Net Salary Payable</Text>
            <Text style={s.netAmount}>₹{fmtInr(Number(entry.final_payable))}</Text>
            <Text style={s.netWords}>{amountToWords(Number(entry.final_payable))}</Text>
          </View>
          {Number(entry.expended_rate) > 0 ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 8, color: '#666' }}>Salary (€): €{Number(entry.salary_euro).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              <Text style={{ fontSize: 8, color: '#666' }}>Exchange Rate: ₹{Number(entry.expended_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / €</Text>
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
            <Text style={{ fontSize: 8, color: '#555' }}><Text style={{ fontFamily: 'Helvetica-Bold' }}>Note: </Text>{entry.notes}</Text>
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
