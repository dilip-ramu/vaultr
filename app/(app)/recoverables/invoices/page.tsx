import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Was the standalone /recoverables/invoices page. Merged into
 *  /customers/invoices as the Couriers tab (Deploy 4). Preserves
 *  ?customer= for the chip picker. */
export default async function RecoverablesInvoicesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(customer ? `/customers/invoices?customer=${customer}` : '/customers/invoices')
}
