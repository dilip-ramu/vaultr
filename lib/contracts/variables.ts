import type { Employee } from '@/lib/payroll/types'

// ── Contract template variables (Feature 3) ─────────────────────────────────
// The data object fed to docxtemplater. Templates reference these with
// {{employee.name}}, {{company.name}}, {{joining_date}}, etc.

export interface ContractCompany {
  name: string | null
  address: string | null
  gstin: string | null
  email: string | null
  phone: string | null
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null) return ''
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Build the docxtemplater data object from an employee + their company.
 *  `jobDescription` is resolved per designation (with optional company
 *  override) and injected into {{job_description}}. */
export function buildContractData(employee: Employee, company: ContractCompany | null, jobDescription = '') {
  const salaryCurrency = employee.salary_currency || 'INR'
  const salaryAmount   = fmtNumber(employee.salary_amount)

  const emp = {
    name:            employee.name ?? '',
    employee_id:     employee.employee_id ?? '',
    designation:     employee.designation ?? '',
    salary_amount:   salaryAmount,
    salary_currency: salaryCurrency,
    salary:          salaryAmount ? `${salaryCurrency} ${salaryAmount}` : '',
    joining_date:    fmtDate(employee.joining_date),
    date_of_birth:   fmtDate(employee.date_of_birth),
    pan_number:      employee.pan_number ?? '',
    address:         employee.address ?? '',
    reporting_manager:  employee.reporting_manager ?? '',
    employment_country: employee.employment_country ?? '',
    employment_city:    employee.employment_city ?? '',
    phone:           employee.phone ?? '',
    email:           employee.email ?? '',
    bank_name:       employee.bank_name ?? '',
    account_number:  employee.account_number ?? '',
    ifsc:            employee.ifsc ?? '',
    branch:          employee.branch ?? '',
    upi_id:          employee.upi_id ?? '',
  }

  const co = {
    name:    company?.name ?? '',
    address: company?.address ?? '',
    gstin:   company?.gstin ?? '',
    email:   company?.email ?? '',
    phone:   company?.phone ?? '',
  }

  // docxtemplater's default parser does NOT traverse nested objects — a tag
  // like {{employee.name}} is looked up as a single flat key. So we emit flat
  // dotted keys (plus bare aliases) rather than nested objects.
  return {
    'employee.name':            emp.name,
    'employee.employee_id':     emp.employee_id,
    'employee.designation':     emp.designation,
    'employee.salary':          emp.salary,
    'employee.salary_amount':   emp.salary_amount,
    'employee.salary_currency': emp.salary_currency,
    'employee.joining_date':    emp.joining_date,
    'employee.date_of_birth':   emp.date_of_birth,
    'employee.pan_number':      emp.pan_number,
    'employee.address':         emp.address,
    'employee.phone':           emp.phone,
    'employee.email':           emp.email,
    'employee.bank_name':       emp.bank_name,
    'employee.account_number':  emp.account_number,
    'employee.ifsc':            emp.ifsc,
    'employee.branch':          emp.branch,
    'employee.upi_id':          emp.upi_id,
    'company.name':             co.name,
    'company.address':          co.address,
    'company.gstin':            co.gstin,
    'company.email':            co.email,
    'company.phone':            co.phone,
    today: fmtDate(new Date().toISOString()),
    // Job description for the employee's designation (matched automatically).
    job_description: jobDescription ?? '',
    // Bare aliases so {{joining_date}}, {{designation}}, etc. also work.
    joining_date:  emp.joining_date,
    designation:   emp.designation,
    employee_name: emp.name,
    company_name:  co.name,
    salary:        emp.salary,
    salary_amount: emp.salary_amount,
  }
}

/** Catalog shown in the UI so the user knows which placeholders to use. */
export const CONTRACT_PLACEHOLDERS: { tag: string; label: string }[] = [
  { tag: '{{employee.name}}',           label: 'Employee full name' },
  { tag: '{{employee.employee_id}}',    label: 'Employee ID' },
  { tag: '{{employee.designation}}',    label: 'Designation' },
  { tag: '{{job_description}}',          label: 'Job description (matched to the designation)' },
  { tag: '{{employee.salary}}',         label: 'Salary with currency (e.g. EUR 1,200.00)' },
  { tag: '{{employee.salary_amount}}',  label: 'Salary amount only' },
  { tag: '{{employee.salary_currency}}',label: 'Salary currency' },
  { tag: '{{employee.joining_date}}',   label: 'Joining date' },
  { tag: '{{employee.date_of_birth}}',  label: 'Date of birth' },
  { tag: '{{employee.pan_number}}',     label: 'PAN' },
  { tag: '{{employee.address}}',        label: 'Address' },
  { tag: '{{employee.reporting_manager}}',  label: 'Reporting manager' },
  { tag: '{{employee.employment_country}}', label: 'Country of employment' },
  { tag: '{{employee.employment_city}}',    label: 'City of employment' },
  { tag: '{{employee.phone}}',          label: 'Phone' },
  { tag: '{{employee.email}}',          label: 'Email' },
  { tag: '{{employee.bank_name}}',      label: 'Bank name' },
  { tag: '{{employee.account_number}}', label: 'Bank account number' },
  { tag: '{{employee.ifsc}}',           label: 'IFSC' },
  { tag: '{{company.name}}',            label: 'Company name' },
  { tag: '{{company.address}}',         label: 'Company address' },
  { tag: '{{company.gstin}}',           label: 'Company GSTIN' },
  { tag: '{{company.email}}',           label: 'Company email' },
  { tag: '{{company.phone}}',           label: 'Company phone' },
  { tag: '{{today}}',                   label: "Today's date" },
]
