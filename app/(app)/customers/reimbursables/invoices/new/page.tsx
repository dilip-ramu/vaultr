import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** New-reimbursement-invoice builder moved to
 *  /customers/invoices/reimbursables/new under the unified Invoices tabs. */
export default async function NewReimbursementInvoiceRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(
    customer
      ? `/customers/invoices/reimbursables/new?customer=${customer}`
      : '/customers/invoices/reimbursables/new'
  )
}
