import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Old reimbursement-invoice history page. Merged into the unified
 *  /customers/invoices/list (Deploy 4). Redirect preserves ?customer=. */
export default async function ReimbursementInvoicesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(
    customer
      ? `/customers/invoices/list?customer=${customer}`
      : '/customers/invoices/list'
  )
}
