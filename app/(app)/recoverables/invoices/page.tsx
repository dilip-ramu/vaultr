import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Was the standalone invoices page, then the Couriers tab. Now the chooser.
 *  Kept as a redirect so bookmarks and old links still land somewhere useful. */
export default async function RecoverablesInvoicesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v)
  const extra = qs.toString()
  redirect(`/customers/invoices${extra ? ('/customers/invoices'.includes('?') ? '&' : '?') + extra : ''}`)
}
