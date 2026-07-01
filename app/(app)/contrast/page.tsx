import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Contrast Expenses → Invoices → Reimbursables tab. */
export default async function ContrastExpensesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(customer ? `/customers/invoices/reimbursables?customer=${customer}` : '/customers/invoices/reimbursables')
}
