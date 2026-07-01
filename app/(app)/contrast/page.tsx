import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Contrast Expenses lives at /customers/reimbursables now. Kept as a
 *  redirect so old bookmarks and iOS home-screen shortcuts still work. */
export default async function ContrastExpensesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>
}) {
  const { customer } = await searchParams
  redirect(customer ? `/customers/reimbursables?customer=${customer}` : '/customers/reimbursables')
}
