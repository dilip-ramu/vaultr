import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Redirect: /contrast/invoice → /customers/invoices/reimbursables/new. */
export default async function ContrastNewInvoiceRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(customer ? `/customers/invoices/reimbursables/new?customer=${customer}` : '/customers/invoices/reimbursables/new')
}
