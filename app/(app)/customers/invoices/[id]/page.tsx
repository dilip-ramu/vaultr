// An invoice, under Customers where it belongs.
//
// Invoice detail lived at /recoverables/invoices/<id> — a word that appears
// nowhere in the interface. Opening an invoice from the Customers section
// therefore dropped you out of it: the hub tabs vanished, because that URL is
// not part of the Customers hub, and there was no way back except the browser.
//
// The old address still works and redirects here, so nothing anybody has
// bookmarked or linked breaks.

import InvoiceDetailPage from '@/app/(app)/recoverables/invoices/[id]/page'

export const dynamic = 'force-dynamic'

export default InvoiceDetailPage
