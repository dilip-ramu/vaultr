// Reimbursables → Expenses tab. Re-exports the existing Contrast Expenses
// page server-component verbatim so the data-fetching logic lives in one place.
// When we later generalise to "any customer with a payee linked", the source
// /contrast/page.tsx evolves and this tab follows automatically.
export { default, dynamic } from '@/app/(app)/contrast/page'
