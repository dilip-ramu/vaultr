import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Was the courier invoice creator. Now step 2 of the Courier invoice flow.
 *  Kept as a redirect so bookmarks and old links still land somewhere useful. */
export default async function RecoverablesNewInvoiceRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v)
  const extra = qs.toString()
  redirect(`/customers/invoices/courier?step=build${extra ? ('/customers/invoices/courier?step=build'.includes('?') ? '&' : '?') + extra : ''}`)
}
