// History tab inside /payroll/processing. Re-exports the existing
// /payroll/history page so the data and layout logic stays in one place.
// The original /payroll/history URL still works for any deep link.
// `dynamic` must be declared directly here, not re-exported.
export const dynamic = 'force-dynamic'
export { default } from '@/app/(app)/payroll/history/page'
