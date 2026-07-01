import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Was the Reimbursables Expenses page. Content moved to
 *  /customers/invoices/reimbursables as a tab under the unified Invoices
 *  page (Deploy 4 restructure). Redirect preserves any ?customer= param. */
export default async function ReimbursableExpensesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(
    customer
      ? `/customers/invoices/reimbursables?customer=${customer}`
      : '/customers/invoices/reimbursables'
  )
}
