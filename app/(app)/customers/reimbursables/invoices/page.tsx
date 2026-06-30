// Reimbursables → Invoices tab. Re-exports the existing Contrast History page
// — it's a list of all reimbursable invoices for the customer (currently
// Contrast). (The "New invoice" CTA still lives at /contrast/invoice and is
// reachable from inside the existing ContrastHistoryClient.)
// `dynamic` must be declared directly here, not re-exported.
export const dynamic = 'force-dynamic'
export { default } from '@/app/(app)/contrast/history/page'
