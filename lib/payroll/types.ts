export interface Employee {
  id: string
  user_id: string
  employee_id: string
  name: string
  designation: string | null
  salary_euro: number
  account_number: string | null
  account_type: string | null
  ifsc: string | null
  bank_name: string | null
  branch: string | null
  pan_number: string | null
  upi_id: string | null
  joining_date: string | null
  date_of_birth: string | null
  address: string | null
  phone: string | null
  whatsapp_number: string | null
  email: string | null
  is_active: boolean
  created_at: string
}

export interface PayrollMonth {
  id: string
  user_id: string
  payroll_month: string       // "2024-05"
  payment_date: string | null
  billed_euros: number
  received_inr: number
  bank_charges: number
  effective_rate: number
  expended_rate: number
  description: string | null
  is_finalized: boolean
  finalized_at: string | null
  is_paid: boolean
  paid_at: string | null
  payment_account_id: string | null
  income_transaction_id: string | null
  forex_transaction_id: string | null
  created_at: string
}

export interface PayrollEntry {
  id: string
  user_id: string
  payroll_month_id: string
  employee_id: string
  salary_euro: number
  expended_rate: number
  salary_inr: number
  allowances: number
  overtime: number
  incentives: number
  deductions: number
  advance: number
  final_payable: number
  notes: string | null
  transaction_id: string | null
  created_at: string
  // joined from employees table
  employee?: Employee
}

export interface SalarySlip {
  id: string
  user_id: string
  payroll_entry_id: string
  generated_at: string
}

// ── Calculation helpers ─────────────────────────────────────────────────────

export function calcEffectiveRate(receivedInr: number, bankCharges: number, billedEuros: number): number {
  if (billedEuros <= 0) return 0
  return Math.round(((receivedInr - bankCharges) / billedEuros) * 10000) / 10000
}

export function calcSalaryInr(salaryEuro: number, expendedRate: number): number {
  return Math.round(salaryEuro * expendedRate * 100) / 100
}

export function calcFinalPayable(
  salaryInr: number,
  allowances: number,
  overtime: number,
  incentives: number,
  deductions: number,
  advance: number,
): number {
  return Math.round((salaryInr + allowances + overtime + incentives - deductions - advance) * 100) / 100
}

// Stage 2: Bank CSV export row shape (reserved — not yet implemented)
// export interface BankCsvRow {
//   employee_id: string
//   name: string
//   bank_name: string
//   account_number: string
//   ifsc: string
//   amount: number
// }
