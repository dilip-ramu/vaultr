// Reimbursables → Expenses tab. Re-exports the existing Contrast Expenses
// page server-component verbatim so the data-fetching logic lives in one place.
// `dynamic` must be declared directly here — Next can't statically parse it
// from a re-export.
export const dynamic = 'force-dynamic'
export { default } from '@/app/(app)/contrast/page'
