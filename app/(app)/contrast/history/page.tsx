import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Redirect: /contrast/history → /customers/invoices/list. */
export default async function ContrastHistoryRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(customer ? `/customers/invoices/list?customer=${customer}` : '/customers/invoices/list')
}
