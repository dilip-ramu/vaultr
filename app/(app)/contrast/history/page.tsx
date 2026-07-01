import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Redirect: /contrast/history → /customers/reimbursables/invoices. */
export default async function ContrastHistoryRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(customer
    ? `/customers/reimbursables/invoices?customer=${customer}`
    : '/customers/reimbursables/invoices')
}
