import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

/** Data a salary slip renders from (the app's own payroll data). */
export interface SalarySlipDocData {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName: string | null
  companyAddress: string | null
}
