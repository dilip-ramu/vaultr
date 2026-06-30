// Reimbursables → Invoices tab. Re-exports the existing Contrast History page
// — it's a list of all reimbursable invoices for the customer (currently
// Contrast). When you click an invoice it opens the existing detail flow.
// (The "New invoice" CTA still lives at /contrast/invoice and is reachable
// from inside the existing ContrastHistoryClient.)
export { default, dynamic } from '@/app/(app)/contrast/history/page'
