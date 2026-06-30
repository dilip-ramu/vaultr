// History tab inside /payroll/processing. Re-exports the existing
// /payroll/history page so the data and layout logic stays in one place.
// The original /payroll/history URL still works for any deep link.
export { default, dynamic } from '@/app/(app)/payroll/history/page'
