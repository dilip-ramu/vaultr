import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Redirect: /contrast/invoice → /customers/reimbursables/invoices/new. */
export default async function ContrastNewInvoiceRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(customer
    ? `/customers/reimbursables/invoices/new?customer=${customer}`
    : '/customers/reimbursables/invoices/new')
}
